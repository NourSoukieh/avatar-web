// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();
let avatarRoot;

// ——— BRIGHT THREE-POINT LIGHTING ———
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.0));
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
const camera = new THREE.PerspectiveCamera(
  25,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.4, 3.0);
camera.lookAt(0, 1.3, 0);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— LOAD & FRAME AVATAR ———
const loader = new GLTFLoader();
let mixer, morphDict, avatarMesh;
loader.load(
  `./FinalAvatarCoach.glb?cb=${Date.now()}`,
  gltf => {
    console.log('✅ FinalAvatarCoach.glb loaded');
    avatarRoot = gltf.scene;
    const avatar = avatarRoot;

    // compute bounding box
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());

    // center pivot & position
    avatar.position.sub(center);
    avatar.position.y -= minY;       
    avatar.position.y += size.y * 0.15;

    // cache mesh & dict, drop arms
    avatar.traverse(obj => {
      if (obj.isMesh && obj.morphTargetDictionary) {
        avatarMesh = obj;
        morphDict  = obj.morphTargetDictionary;
      }
      if (obj.isBone && obj.name.toLowerCase().includes('upperarm')) {
        obj.rotation.z = obj.name.toLowerCase().includes('right')
          ? -Math.PI / 2
          :  Math.PI / 2;
      }
    });

    // add to scene & start mixer
    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);
    startBlinking();

    // delayed sanity-check so first frame is rendered
    setTimeout(() => {
      console.log('🔧 Running delayed sanity test...');
      setExpression('eyeBlinkLeft',  1.0, 2000);
      setExpression('eyeBlinkRight', 1.0, 2000);
      setTimeout(() => setExpression('mouthOpen', 1.0, 2000), 2500);
    }, 500);
  },
  undefined,
  e => console.error('❌ GLB load error:', e)
);

// ——— RENDER LOOP ———
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);

  // idle: gentle side-to-side sway
  if (avatarRoot) {
    const t = clock.getElapsedTime();
    avatarRoot.rotation.y = Math.sin(t * 0.5) * 0.2;
  }

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

// expose helpers for console testing
window.setExpression    = setExpression;
window.resetAll         = resetAll;
window.startBlinking    = startBlinking;

// ——— FLUTTER BRIDGE ———
window.receiveFromFlutter = async ({ text, audioBase64 }) => {
  console.log('▶️ receiveFromFlutter called with', text, audioBase64?.slice(0,30) + '...');
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft',  1, 800);
    setExpression('browOuterUpRight', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  if (audioBase64) {
    return new Promise(resolve => {
      const audio = new Audio('data:audio/mp3;base64,' + audioBase64);
      console.log('▶️ playing audio…');
      audio.onplay = () => {
        console.log('▶️ audio.onplay');
        const vis = morphDict['viseme_O'] ?? morphDict['viseme_aa'] ?? 0;
        avatarMesh.morphTargetInfluences[vis] = 1;
      };
      audio.onended = () => {
        console.log('▶️ audio.onended');
        resetAll();
        resolve();
      };
      audio.play().catch(err => {
        console.error('❌ audio.play() failed:', err);
        resolve();
      });
    });
  }

  return Promise.resolve();
};
