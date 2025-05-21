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
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ——— LOAD & FRAME AVATAR ———
const loader = new GLTFLoader();
// Will hold { mesh, dict } entries for _every_ morph-target mesh:
const morphMeshes = [];

loader.load(
  `./FinalAvatarCoach.glb?cb=${Date.now()}`,
  gltf => {
    console.log('✅ FinalAvatarCoach.glb loaded');
    avatarRoot = gltf.scene;

    // Frame & position the avatar
    const box    = new THREE.Box3().setFromObject(avatarRoot);
    const size   = box.getSize(new THREE.Vector3());
    const minY   = box.min.y;
    const center = box.getCenter(new THREE.Vector3());
    avatarRoot.position.sub(center);
    avatarRoot.position.y -= minY;
    avatarRoot.position.y += size.y * 0.15;

    // Traverse once: collect all morph meshes & drop arms
    avatarRoot.traverse(obj => {
      if (obj.isMesh && obj.morphTargetDictionary) {
        morphMeshes.push({ mesh: obj, dict: obj.morphTargetDictionary });
      }
      if (obj.isBone && obj.name.toLowerCase().includes('upperarm')) {
        obj.rotation.z = obj.name.toLowerCase().includes('right')
          ? -Math.PI / 2
          :  Math.PI / 2;
      }
    });

    console.log(`🔍 Collected ${morphMeshes.length} morph meshes`);
    console.log('🔍 Example keys:', Object.keys(morphMeshes[0].dict).slice(0,10));

    scene.add(avatarRoot);
    mixer = new THREE.AnimationMixer(avatarRoot);
    startBlinking();

    // delayed sanity-check so you actually see it:
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

  // subtle idle sway
  if (avatarRoot) {
    const t = clock.getElapsedTime();
    avatarRoot.rotation.y = Math.sin(t * 0.5) * 0.2;
  }

  mixer?.update(clock.getDelta());
  renderer.render(scene, camera);
})();

// ——— HELPERS ———
function setExpression(name, weight = 1, duration = 300) {
  morphMeshes.forEach(({ mesh, dict }) => {
    const idx = dict[name];
    if (idx != null) mesh.morphTargetInfluences[idx] = weight;
  });
  setTimeout(() => resetAll(), duration);
}

function startBlinking() {
  (function blink() {
    setExpression('eyeBlinkLeft',  1.0, 150);
    setExpression('eyeBlinkRight', 1.0, 150);
    setTimeout(blink, 3000 + Math.random() * 3000);
  })();
}

function resetAll() {
  morphMeshes.forEach(({ mesh }) => {
    for (let i = 0; i < mesh.morphTargetInfluences.length; i++) {
      mesh.morphTargetInfluences[i] = 0;
    }
  });
}

// expose for console-testing
window.setExpression = setExpression;
window.resetAll      = resetAll;
window.startBlinking = startBlinking;

// ——— FLUTTER BRIDGE ———
window.receiveFromFlutter = async ({ text }) => {
  console.log('▶️ receiveFromFlutter:', text);

  // 1) Facial cues
  if (/[!?]$/.test(text.trim())) {
    setExpression('browOuterUpLeft',  1, 800);
    setExpression('browOuterUpRight', 1, 800);
  } else if (text.toLowerCase().includes('sorry')) {
    setExpression('mouthFrownLeft',  0.8, 800);
    setExpression('mouthFrownRight', 0.8, 800);
  } else {
    setExpression('mouthSmile', 0.6, 800);
  }

  // 2) Speak & lip-sync via Web Speech API
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-US';

    utter.onboundary = () => {
      // choose a viseme or fallback to mouthOpen
      const visNames = ['viseme_O','viseme_aa','mouthOpen'];
      // apply to all meshes
      morphMeshes.forEach(({ mesh, dict }) => {
        const idx = dict[visNames.find(n => dict[n]!=null)] ?? 0;
        mesh.morphTargetInfluences[idx] = 1;
      });
      setTimeout(() => resetAll(), 100);
    };

    utter.onend = () => {
      resetAll();
      resolve();
    };

    speechSynthesis.speak(utter);
  });
};
