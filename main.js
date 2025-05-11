// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas   = document.getElementById('avatar');
const scene    = new THREE.Scene();       // no lights added
const sun = new THREE.DirectionalLight(0xffffff, 0.4);
sun.position.set(1, 2, 3);
scene.add(sun);
const camera   = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });

camera.position.set(0, 1.2, 4);
camera.lookAt(0, 1, 0);

renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Load & Position Avatar (no arm-pose edits) ----
const loader     = new GLTFLoader();
let mixer, morphDict, avatarMesh;

loader.load(
  './FinalAvatarLight.glb',
  gltf => {
    console.log('✅ FinalAvatarLight.glb loaded');
    const avatar = gltf.scene;

    // center & vertical position
    const box    = new THREE.Box3().setFromObject(avatar);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());

    avatar.position.sub(center);  // center pivot
    avatar.position.y -= minY;    // feet at y=0
    avatar.position.y += size.y * 0.20; // lift by 20%

    // grab the skinned mesh & its morph targets
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
// Helpers

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
// Flutter bridge

window.receiveFromFlutter = async ({ text }) => {
  // 1) Emotional cue
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft',  1, 800);
    setExpression('browOuterUpRight', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  // 2) Speak + primitive lip-sync
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';

    u.onboundary = () => {
      if (!morphDict || !avatarMesh) return;
      // try a common vowel viseme
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
        // reset everything
        Object.values(morphDict).forEach(i => {
          avatarMesh.morphTargetInfluences[i] = 0;
        });
      }
      res();
    };

    speechSynthesis.speak(u);
  });
};
