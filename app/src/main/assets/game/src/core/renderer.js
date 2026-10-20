import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* Renderer, scene and camera — the pieces every other module needs. */

const canvas = document.getElementById('app');

// On a retina display the render target is already supersampled, so MSAA buys
// little there and costs a lot of fill rate.
export const maxDpr = Math.min(window.devicePixelRatio || 1, 2);
const useAA = maxDpr < 1.5;

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: useAA, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);                 // the quality controller owns this
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// shadows are re-rendered on demand (see updateShadows) instead of every frame
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.outputColorSpace = THREE.SRGBColorSpace;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 2600);

// studio-ish reflections for the car paint (kept dim so the sun still defines the lighting)
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;


/** Scale how much the environment map contributes to a subtree. */
export function setEnvIntensity(root, value) {
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if ('envMapIntensity' in m) m.envMapIntensity = value;
  });
}

/**
 * The sun only follows the car, so a one-frame-old shadow map is invisible —
 * refreshing it every other frame halves the cost of the shadow pass.
 */
let shadowFrame = 0;
export function updateShadows() {
  shadowFrame++;
  if (shadowFrame % 2 === 0) renderer.shadowMap.needsUpdate = true;
}

/** Force a shadow refresh after a world rebuild. */
export function invalidateShadows() {
  renderer.shadowMap.needsUpdate = true;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
