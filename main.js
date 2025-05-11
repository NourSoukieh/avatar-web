// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas   = document.getElementById('avatar');
const scene    = new THREE.Scene();

// ——— BRIGHT THREE-POINT LIGHTING ———
// Key light
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(5, 10, 5);
scene.add(keyLight);

// Fill light
const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
fillLight.position.set(-5, 5, 5);
scene.add(fillLight);

// Rim light (back light)
const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(0, 5, -5);
scene.add(rimLight);

// Ambient to soften shadows
const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);

// ——— CAMERA & RENDERER ———
const camera   = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.2, 4);
camera.lookAt(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Load & Position Avatar ----
const loader     = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(
  `./FinalAvatarCoach.glb?cachebuster=${Date.now()}`,
  gltf => {
    console.log('✅ FinalAvatarCoach.glb loaded');
    const avatar = gltf.scene;

    // center & vertical position
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());

    avatar.position.sub(center);
    avatar.position.y -= minY;
    avatar.position.y += size.y * 0.20;

    // grab skinned mesh for morph targets
    avatar.traverse(obj => {
      if (obj.isMesh && obj.morphTargetDictionary) {
        avatarMesh = obj;
        morphDict  = obj.morphTargetDictionary;
      }
    });

    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);
    startBlinking();
  },
  undefined,
  err => console.error('❌ GLB load error:', err)
);

// ---- Animation Loop ----
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);
  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
})();

//--------------------------------------------------------------------
// Helpers (expressions & blinking)

function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict || !avatarMesh) return;
  const idx = morphDict[name];
  if (idx === undefined) return;
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

//--------------------------------------------------------------------
// Flutter bridge (facial cues & lip-sync)

window.receiveFromFlutter = async ({ text }) => {
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft',  1, 800);
    setExpression('browOuterUpRight', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';

    u.onboundary = () => {
      if (!morphDict || !avatarMesh) return;
      const idx = morphDict['viseme_O'] ?? morphDict['viseme_aa'];
      if (idx !== undefined) {
        avatarMesh.morphTargetInfluences[idx] = 1;
        setTimeout(() => {
          avatarMesh.morphTargetInfluences[idx] = 0;
        }, 100);
      }
    };

    u.onend = () => {
      if (morphDict && avatarMesh) {
        Object.values(morphDict).forEach(i => {
          avatarMesh.morphTargetInfluences[i] = 0;
        });
      }
      res();
    };

    speechSynthesis.speak(u);
  });
};
