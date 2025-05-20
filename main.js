// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();

// ——— BRIGHT THREE-POINT LIGHTING ———
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.0));  // bright fill
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(3, 10, 5);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
fillLight.position.set(-3, 5, 5);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
rimLight.position.set(0, 5, -5);
scene.add(rimLight);
const groundLight = new THREE.PointLight(0xffffff, 0.5, 10);
groundLight.position.set(0, 0.3, 0);
scene.add(groundLight);

// ——— CAMERA & RENDERER ———
// tighter FOV + closer for a zoomed-in view
const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 100);

// Pull the camera in closer on Z, and raise it slightly on Y
camera.position.set(0, 1.4, 3.0);

// Aim a little above the model's origin—towards the head
camera.lookAt(0, 1.3, 0);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— LOAD & FRAME AVATAR ———
const loader = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(`./FinalAvatarCoach.glb?cb=${Date.now()}`, gltf => {
  console.log('✅ FinalAvatarCoach.glb loaded');
  const avatar = gltf.scene;

  // compute bounding box
  const box  = new THREE.Box3().setFromObject(avatar);
  const size = box.getSize(new THREE.Vector3());
  const minY = box.min.y;
  const center = box.getCenter(new THREE.Vector3());

  // center pivot & position
  avatar.position.sub(center);
  avatar.position.y -= minY;                 // feet at y=0
  avatar.position.y += size.y * 0.15;        // lift head into view

  // cache mesh & dict, drop arms
  avatar.traverse(obj => {
    if (obj.isMesh && obj.morphTargetDictionary) {
      avatarMesh = obj;
      morphDict  = obj.morphTargetDictionary;
    }
    if (obj.isBone && obj.name.toLowerCase().includes('upperarm')) {
      if (obj.name.toLowerCase().includes('right')) {
        obj.rotation.z = -Math.PI / 2;
      } else {
        obj.rotation.z = Math.PI / 2;
      }
    }
  });

    // inspect morph targets:
  console.log('🔍 Morph target keys:', Object.keys(morphDict || {}));
  
  // inspect any glTF animation clips:
  console.log('🔍 gltf.animations:', gltf.animations.map(a => a.name));

  scene.add(avatar);
  mixer = new THREE.AnimationMixer(avatar);
  startBlinking();
}, undefined, e => console.error('❌ GLB load error:', e));

// ——— RENDER LOOP ———
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
})();

// ——— HELPERS ———
function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict || !avatarMesh) return;
  const idx = morphDict[name];
  if (idx == null) return;
  avatarMesh.morphTargetInfluences[idx] = weight;
  setTimeout(() => {
    avatarMesh.morphTargetInfluences[idx] = 0;
  }, duration);
}

function startBlinking() {
  (function blink() {
    setExpression('eyeBlinkLeft',  1.0, 150);
    setExpression('eyeBlinkRight', 1.0, 150);
    setTimeout(blink, 3000 + Math.random() * 3000);
  })();
}

function resetAll() {
  if (!morphDict || !avatarMesh) return;
  Object.values(morphDict).forEach(i => {
    avatarMesh.morphTargetInfluences[i] = 0;
  });
}

// ——— FLUTTER BRIDGE ———
window.receiveFromFlutter = async ({ text, audioBase64 }) => {
  console.log('▶️ receiveFromFlutter called with', text, audioBase64?.slice(0,30));
  // 1) Facial cues
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft', 1, 800);
    setExpression('browOuterUpRight',1, 800);
  } else if (text.toLowerCase().contains('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  // 2) Play Flutter-generated audio
  if (audioBase64) {
    return new Promise(resolve => {
      const audio = new Audio('data:audio/mp3;base64,' + audioBase64);
      audio.onplay = () => {
        const vis = morphDict['viseme_O'] ?? morphDict['viseme_A'] ?? 0;
        avatarMesh.morphTargetInfluences[vis] = 1;
      };
      audio.onended = () => {
        resetAll();
        resolve();
      };
      audio.play();
    });
  }

  // no fallback
  return Promise.resolve();
};
