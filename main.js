// confirm the module is running
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas   = document.getElementById('avatar');
const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.5, 3);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// add some lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
hemi.position.set(0, 2, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 7.5);
scene.add(dir);

// load your avatar
const loader = new GLTFLoader();
let mixer, morphDict;
loader.load(
  './avatar.glb',
  gltf => {
    console.log('✅ avatar.glb loaded');
    const avatar = gltf.scene;
    scene.add(avatar);
    mixer = new THREE.AnimationMixer(avatar);
    avatar.traverse(obj => {
      if (obj.morphTargetDictionary) morphDict = obj.morphTargetDictionary;
    });
  },
  undefined,
  err => console.error('❌ GLB load error:', err)
);

// quick test cube
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1,1,1),
  new THREE.MeshNormalMaterial()
);
scene.add(box);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  box.rotation.y += 0.01;
  if (mixer) mixer.update(clock.getDelta());
  renderer.render(scene, camera);
}
animate();

// --- Helpers: set/reset any blend-shape by name ---
function setExpression(name, weight = 1, duration = 300) {
  if (!morphDict) return;
  const idx = morphDict[name];
  if (idx === undefined) return;
  // set it on
  avatarMesh.morphTargetInfluences[idx] = weight;
  // then clear after `duration` ms
  setTimeout(() => {
    avatarMesh.morphTargetInfluences[idx] = 0;
  }, duration);
}

// --- Blinking: every 3–6 seconds ---
function startBlinking() {
  function blink() {
    setExpression('blink', 1.0, 150);
    // schedule next blink
    setTimeout(blink, 3000 + Math.random()*3000);
  }
  blink();
}

// start blinking as soon as the avatar loads
startBlinking();


// --- The main entrypoint from Flutter/WebView ---
window.receiveFromFlutter = async ({ text }) => {
  // 1) Emotional expression based on punctuation
  if (/[!?]$/.test(text.trim())) {
    // surprise or excitement
    setExpression('browRaise', 1.0, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    // sympathetic
    setExpression('frown', 0.8, 800);
  } else {
    // default mild smile
    setExpression('smile', 0.6, 800);
  }

  // 2) Speak via Web Speech API + lip-sync
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';

    utter.onboundary = ev => {
      // on each word boundary, flick a small mouth-open viseme
      const mouthIdx = morphDict['viseme_O'] ?? morphDict['viseme_A'] ?? 0;
      avatarMesh.morphTargetInfluences[mouthIdx] = 1;
      setTimeout(() => {
        avatarMesh.morphTargetInfluences[mouthIdx] = 0;
      }, 100);
    };

    utter.onend = () => {
      // reset all visemes & expressions
      Object.values(morphDict).forEach(i => {
        avatarMesh.morphTargetInfluences[i] = 0;
      });
      resolve();
    };

    speechSynthesis.speak(utter);
  });
};
