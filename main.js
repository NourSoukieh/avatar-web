// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();           // transparent background

// ---- Camera ----
const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.5, 3);
camera.lookAt(0, 0, 0);

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

// ---- Studio-style Lighting ----
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

// ---- Load & Pose Avatar ----
const loader = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(
  './avatar.glb',
  gltf => {
    console.log('✅ avatar.glb loaded');
    const avatar = gltf.scene;

    // Center & frame the model
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    avatar.position.sub(center);          // move pivot to center
    avatar.position.y += size.y * 0.4;       // lift so feet sit on ground

    // Lower the arms: rotate upper-arm bones
    avatar.traverse(obj => {
      if (obj.isBone) {
        if (obj.name.includes('LeftArm') || obj.name.includes('RightArm')) {
          obj.rotation.x = -Math.PI / 4;  // rotate downward 45°
        }
      }
      // cache the skinned mesh for morphs
      if (obj.isMesh && obj.morphTargetDictionary) {
        avatarMesh = obj;
        morphDict  = obj.morphTargetDictionary;
      }
    });

    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);

    // start natural blinking
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

// set/reset blend-shape by name
function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict || !avatarMesh) return;
  const idx = morphDict[name];
  if (idx === undefined) return;
  avatarMesh.morphTargetInfluences[idx] = weight;
  setTimeout(() => avatarMesh.morphTargetInfluences[idx] = 0, duration);
}

// blinking at 3–6s intervals
function startBlinking() {
  function blink() {
    setExpression('blink', 1.0, 150);
    setTimeout(blink, 3000 + Math.random() * 3000);
  }
  blink();
}

//--------------------------------------------------------------------
// Entry point for Flutter/WebView

window.receiveFromFlutter = async ({ text }) => {
  // 1) Emotional cue
  if (/[!?]$/.test(text.trim())) {
    setExpression('browRaise', 1.0, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('frown', 0.8, 800);
  } else {
    setExpression('smile', 0.6, 800);
  }

  // 2) Speak + lip-sync
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';

    utter.onboundary = () => {
      if (!morphDict || !avatarMesh) return;
      const viseme = morphDict['viseme_O'] 
                  ?? morphDict['viseme_A'] 
                  ?? 0;
      avatarMesh.morphTargetInfluences[viseme] = 1;
      setTimeout(() => avatarMesh.morphTargetInfluences[viseme] = 0, 100);
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
