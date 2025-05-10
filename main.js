// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();  // transparent background

// ---- Camera ----
// Lowered and pulled back so full figure fits
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
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

const groundLight = new THREE.PointLight(0xffffff, 0.3, 10);
groundLight.position.set(0, 0.5, 0);
scene.add(groundLight);

// ---- Load & Pose Avatar ----
const loader = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(
  './avatar.glb',
  gltf => {
    console.log('✅ avatar.glb loaded');
    const avatar = gltf.scene;

    // 1) Compute bounding‐box
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());

    // 2) Center horizontally
    avatar.position.sub(center);

    // 3) Place feet at y=0, then lower whole model by 30% of its height
    avatar.position.y -= minY;
    avatar.position.y -= size.y * 0.30;

    // 4) Rotate arms down and cache mesh for morphs
    avatar.traverse(obj => {
      if (obj.isBone &&
          (obj.name.includes('LeftArm') || obj.name.includes('RightArm'))) {
        obj.rotation.x = -Math.PI / 4;  // lower arms 45°
      }
      if (obj.isMesh && obj.morphTargetDictionary) {
        avatarMesh = obj;
        morphDict  = obj.morphTargetDictionary;
      }
    });

    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);

    // Start blinking
    startBlinking();
  },
  undefined,
  err => console.error('❌ GLB load error:', err)
);

// ---- Render Loop ----
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  if (mixer) mixer.update(clock.getDelta());
  renderer.render(scene, camera);
}
animate();

//--------------------------------------------------------------------
// Helpers

// Blend‐shape expression helper
function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict || !avatarMesh) return;
  const idx = morphDict[name];
  if (idx === undefined) return;
  avatarMesh.morphTargetInfluences[idx] = weight;
  setTimeout(() => {
    avatarMesh.morphTargetInfluences[idx] = 0;
  }, duration);
}

// Natural blinking at 3–6s intervals
function startBlinking() {
  (function blink() {
    setExpression('blink', 1.0, 150);
    setTimeout(blink, 3000 + Math.random() * 3000);
  })();
}

//--------------------------------------------------------------------
// Entry point for Flutter/WebView

window.receiveFromFlutter = async ({ text }) => {
  // 1) Expression based on content
  if (/[!?]$/.test(text.trim())) {
    setExpression('browRaise', 1.0, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('frown', 0.8, 800);
  } else {
    setExpression('smile', 0.6, 800);
  }

  // 2) Speak + lip-sync via Web Speech API
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';

    utter.onboundary = () => {
      if (!morphDict || !avatarMesh) return;
      const viseme = morphDict['viseme_O'] 
                  ?? morphDict['viseme_A'] 
                  ?? 0;
      avatarMesh.morphTargetInfluences[viseme] = 1;
      setTimeout(() => {
        avatarMesh.morphTargetInfluences[viseme] = 0;
      }, 100);
    };

    utter.onend = () => {
      if (morphDict && avatarMesh) {
        Object.values(morphDict).forEach(i => {
          avatarMesh.morphTargetInfluences[i] = 0;
        });
      }
      resolve();
    };

    speechSynthesis.speak(utter);
  });
};
