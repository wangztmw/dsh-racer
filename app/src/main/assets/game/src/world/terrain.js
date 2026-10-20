import * as THREE from 'three';
import { clamp } from '../util/index.js';

/* Terrain: the distant mountain band and the ground plane. */

export function buildMountains(ctx) {
  const { S, extent, rand, grassY } = ctx;

const ridgeMat = new THREE.MeshStandardMaterial({ color: 0x54708c, roughness: 1, flatShading: true });
const hillCount = clamp(Math.round(extent / 12), 20, 64);
for (let i = 0; i < hillCount; i++) {
  const a = (i / hillCount) * Math.PI * 2 + rand() * 0.12;
  const r = extent + 220 + rand() * (extent * 0.5 + 120);
  const w = 110 + rand() * 120;
  const h = 30 + rand() * 62;
  const hill = new THREE.Mesh(new THREE.ConeGeometry(w, h, 5, 1), ridgeMat);
  hill.position.set(Math.cos(a) * r, grassY + h / 2 - 26, Math.sin(a) * r);
  hill.rotation.y = rand() * Math.PI;
  hill.scale.z = 0.55 + rand() * 0.5;
  S.add(hill);
}
}

export function buildGround(ctx) {
  const { S, extent, grassY, textures } = ctx;

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(extent + 320, 64),
  new THREE.MeshStandardMaterial({ map: textures.grass, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = grassY;
ground.receiveShadow = true;
S.add(ground);
}
