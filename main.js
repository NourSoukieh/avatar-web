// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();  // transparent background

// ---- Camera ----
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
// lowered slightly, pulled back
camera.position.set(0, 1.2, 4);
camera.lookAt(0, 1, 0);

// ---- Renderer ----
const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Studio‐style Lighting ----
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(3, 5, 3);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
fillLight.position.set(-3, 2, -2);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
rimLight.position.set(0, 4, -5);
scene.add(rimLight);
scene.add(new THREE.PointLight(0xffffff, 0.3, 10).set(0,0.5,0));  // ground‐bounce

// ---- Load & Pose Avatar ----
const loader = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(
  './avatar.glb',
  gltf => {
    console.log('✅ avatar.glb loaded');
    const avatar = gltf.scene;

    // --- center & vertical position ---
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());

    avatar.position.sub(center);      // center pivot
    avatar.position.y -= minY;        // feet to y=0
    avatar.position.y -= size.y * 0.20; // lower only 20% of height

    // --- drop arms and cache mesh for morphs ---
    avatar.traverse(obj => {
      if (obj.isBone) {
        // rotate T‐pose arms down
        if (obj.name.includes('LeftArm')) {
          obj.rotation.set(0, 0, -Math.PI / 2);
        }
        if (obj.name.includes('RightArm')) {
          obj.rotation.set(0, 0,  Math.PI / 2);
        }
      }
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
// Helpers

function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict || !avatarMesh) return;
  const idx = morphDict[name];
  if (idx === undefined) return;
  avatarMesh.morphTargetInfluences[idx] = weight;
  setTimeout(() => avatarMesh.morphTargetInfluences[idx] = 0, duration);
}

function startBlinking() {
  (function blink() {
    setExpression('blink', 1.0, 150);
    setTimeout(blink, 3000 + Math.random()*3000);
  })();
}

//--------------------------------------------------------------------
// Flutter bridge

window.receiveFromFlutter = async ({ text }) => {
  // emotion
  if (/[!?]$/.test(text.trim())) {
    setExpression('browRaise', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('frown', 0.8, 800);
  } else {
    setExpression('smile', 0.6, 800);
  }

  // speak + lip-sync
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.onboundary = () => {
      if (!morphDict || !avatarMesh) return;
      const vis = morphDict['viseme_O'] ?? morphDict['viseme_A'] ?? 0;
      avatarMesh.morphTargetInfluences[vis] = 1;
      setTimeout(() => avatarMesh.morphTargetInfluences[vis] = 0, 100);
    };
    u.onend = () => {
      if (morphDict && avatarMesh) {
        Object.values(morphDict).forEach(i => avatarMesh.morphTargetInfluences[i] = 0);
      }
      res();
    };
    speechSynthesis.speak(u);
  });
};
