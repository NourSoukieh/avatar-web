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
