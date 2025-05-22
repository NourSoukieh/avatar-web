// main.js
console.log('✅ main.js loaded');

import * as THREE     from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar');
const scene  = new THREE.Scene();
let avatarRoot, mixer;

// ——— LIGHTING ———
scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
keyLight.position.set(3, 10, 5); scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 1.0);
fillLight.position.set(-3, 5, 5); scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
rimLight.position.set(0, 5, -5); scene.add(rimLight);
const groundLight = new THREE.PointLight(0xffffff, 0.5, 10);
groundLight.position.set(0, 0.3, 0); scene.add(groundLight);

// ——— CAMERA & RENDERER ———
// Zoom in on the head: tighter FOV + higher Y focus
const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 1.8, 1.7);  // raise camera, pull in
camera.lookAt(0, 1.5, 0);          // look slightly above origin

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— LOAD & PREPARE AVATAR ———
const loader = new GLTFLoader();
const morphMeshes = [];

loader.load(
  `./FinalAvatarCoach.glb?cb=${Date.now()}`,
  gltf => {
    console.log('✅ FinalAvatarCoach.glb loaded');
    avatarRoot = gltf.scene;

    // Frame & center whole avatar
    const box    = new THREE.Box3().setFromObject(avatarRoot);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());
    avatarRoot.position.sub(center);
    avatarRoot.position.y -= minY;
    avatarRoot.position.y += size.y * 0.1;  // lift so head is centered

    // Traverse to collect all morph‐target meshes & drop arms
    avatarRoot.traverse(obj => {
      if (obj.isMesh && obj.morphTargetDictionary) {
        // Force-enable morphs on the material if missing
        if (!obj.material.morphTargets) {
          console.warn(`🔧 Enabling morphTargets on material ${obj.name}`);
          obj.material.morphTargets = true;
          obj.material.needsUpdate  = true;
        }
        // Log geometry data
        console.log(
          `🔍 [${obj.name}] morphAttrib count:`,
          obj.geometry.morphAttributes.position?.length,
          'relative?', obj.geometry.morphTargetsRelative
        );
        morphMeshes.push({
          mesh: obj,
          dict: obj.morphTargetDictionary
        });
      }
      if (obj.isBone && obj.name.toLowerCase().includes('upperarm')) {
        obj.rotation.z = obj.name.toLowerCase().includes('right')
          ? -Math.PI/2
          :  Math.PI/2;
      }
    });

    console.log(`✅ Found ${morphMeshes.length} meshes with morph targets`);
    if (morphMeshes.length === 0) {
      console.error('❌ No morph-target meshes detected! Check your export.');
    } else {
      console.log('🔍 Example morph keys:', Object.keys(morphMeshes[0].dict).slice(0,8));
    }

    scene.add(avatarRoot);
    mixer = new THREE.AnimationMixer(avatarRoot);
    startBlinking();

    // Delayed sanity‐check blink + mouthOpen
    setTimeout(() => {
      console.log('🔧 Sanity test: blinking + mouthOpen');
      setExpression('eyeBlinkLeft',  1.0, 1500);
      setExpression('eyeBlinkRight', 1.0, 1500);
      setTimeout(() => setExpression('mouthOpen', 1.0, 1500), 1800);
    }, 800);
  },
  undefined,
  err => console.error('❌ GLB load error:', err)
);

// ——— RENDER LOOP ———
const clock = new THREE.Clock();
(function animate() {
  requestAnimationFrame(animate);

  // gentle idle sway
  if (avatarRoot) {
    const t = clock.getElapsedTime();
    avatarRoot.rotation.y = Math.sin(t * 0.3) * 0.15;
  }

  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
})();

// ——— HELPERS ———
function setExpression(name, weight=1, duration=300) {
  morphMeshes.forEach(({ mesh, dict }) => {
    const idx = dict[name];
    if (idx != null) mesh.morphTargetInfluences[idx] = weight;
  });
  if (duration > 0) setTimeout(resetAll, duration);
}

function startBlinking() {
  (function blink(){
    setExpression('eyeBlinkLeft',  1.0, 150);
    setExpression('eyeBlinkRight', 1.0, 150);
    setTimeout(blink, 3000 + Math.random()*3000);
  })();
}

function resetAll() {
  morphMeshes.forEach(({ mesh }) => {
    mesh.morphTargetInfluences.fill(0);
  });
}

// expose for manual console testing
window.setExpression = setExpression;
window.resetAll      = resetAll;
window.startBlinking = startBlinking;

// ——— FLUTTER BRIDGE ———
window.receiveFromFlutter = async ({ text }) => {
  console.log('▶️ receiveFromFlutter:', text);

  // Facial emotion cues
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft',  1, 800);
    setExpression('browOuterUpRight', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  // Lip-sync via Web Speech API
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';

    utter.onboundary = () => {
      const visNames = ['viseme_O','viseme_aa','mouthOpen'];
      morphMeshes.forEach(({ mesh, dict }) => {
        const key = visNames.find(n => dict[n] != null);
        const idx = dict[key] ?? 0;
        mesh.morphTargetInfluences[idx] = 1;
      });
      setTimeout(resetAll, 100);
    };

    utter.onend = () => {
      resetAll();
      resolve();
    };

    speechSynthesis.speak(utter);
  });
};
