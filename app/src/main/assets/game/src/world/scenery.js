import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clamp, mergeGroupByMaterial } from '../util/index.js';
import { brandAtlas, remapUv } from './textures.js';

/* Trackside scenery: sponsor boards (one atlas + one merged mesh), forests,
   bushes and the tyre stacks that line the corner exits. */

export function buildSponsorBoards(ctx) {
  const { S, samples, N, len, offsetPoint, WALL_OFFSET, rand, steelMat } = ctx;

  const brands = [
    ['DEEPSEEK', '#0b1220', '#7cc6ff'],
    ['V4.1 FLASH', '#101418', '#ff7d94'],
    ['DEEP SWE', '#0a0f16', '#79f0d0'],
    ['TERMINAL-BENCH', '#0e1218', '#ffd479'],
    ['MINI-SWE', '#0b1018', '#c9a8ff'],
    ['GRAND PRIX', '#0a0e14', '#ffffff'],
  ];
  const atlas = brandAtlas(brands);
  const boardMat = new THREE.MeshStandardMaterial({
    map: atlas.texture, side: THREE.FrontSide, roughness: 0.55,
    emissive: 0x111820, emissiveIntensity: 0.2,
  });

  const boardGeos = [];
  const legGeos = [];
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const basePlane = new THREE.PlaneGeometry(11, 2.1);

  const boardCount = clamp(Math.round(len / 45), 8, 44);
  for (let i = 0; i < boardCount; i++) {
    const s = samples[Math.floor((i / boardCount) * N + N * 0.03) % N];
    const side = i % 2 === 0 ? 1 : -1;
    const brandIndex = i % brands.length;

    const at = offsetPoint(s, side * (WALL_OFFSET + 2.6), 1.15);
    const yaw = Math.atan2(-s.t.z, s.t.x) - Math.PI / 2;
    pos.copy(at);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    matrix.compose(pos, quat, one);
    boardGeos.push(remapUv(basePlane.clone().applyMatrix4(matrix), atlas.uvRect(brandIndex)));

    for (const dx of [-4.6, 4.6]) {
      const leg = new THREE.BoxGeometry(0.16, 2.3, 0.16);
      const lp = new THREE.Vector3(
        at.x + Math.cos(yaw) * dx,
        at.y - 1.15,
        at.z - Math.sin(yaw) * dx,
      );
      legGeos.push(leg.applyMatrix4(new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z)));
    }
  }

  const boards = new THREE.Mesh(mergeGeometries(boardGeos, false), boardMat);
  boards.castShadow = true;
  S.add(boards);

  const legs = new THREE.Mesh(mergeGeometries(legGeos, false), steelMat);
  legs.castShadow = true;
  S.add(legs);
}

export function buildForests(ctx) {
  const { S, samples, N, len, ROAD_HALF, rand, theme, grassY, up, standCenter } = ctx;

const sampleDist = (x, z, every = 8) => {
  let near = 1e9;
  for (let i = 0; i < N; i += every) {
    const s = samples[i];
    const dx = s.p.x - x, dz = s.p.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < near) near = d;
  }
  return near;
};

const treeSpots = [];
// grow small clumps instead of confetti
const clusters = clamp(Math.round(len / 40), 8, 44);
for (let c = 0; c < clusters; c++) {
  let cx = 0, cz = 0, tries = 0;
  do {
    const a = rand() * Math.PI * 2;
    const r = 60 + rand() * 260;
    cx = Math.cos(a) * r;
    cz = Math.sin(a) * r;
  } while (sampleDist(cx, cz) < 40 && tries++ < 40);

  const count = 10 + Math.floor(rand() * 20);
  for (let i = 0; i < count; i++) {
    const spread = 12 + rand() * 30;
    const a = rand() * Math.PI * 2;
    const rr = Math.pow(rand(), 0.6) * spread;
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    if (sampleDist(x, z) < 30) continue;
    if (standCenter && Math.hypot(x - standCenter.x, z - standCenter.z) < 20) continue;
    treeSpots.push({ x, z, h: 0.7 + Math.pow(rand(), 1.5) * 1.5, rot: rand() * 6.28 });
  }
}
// dense band along the circuit so the road is framed by trees
const bandCount = clamp(Math.round(len / 2.1), 140, 760);
for (let i = 0; i < bandCount; i++) {
  const s = samples[Math.floor(rand() * N)];
  const side = rand() > 0.5 ? 1 : -1;
  const off = 27 + Math.pow(rand(), 0.8) * 26;
  const q = s.p.clone().addScaledVector(s.r, side * off);
  // a tree can sit far from its own section yet on top of another one — check globally
  if (sampleDist(q.x, q.z) < 14) continue;
  if (standCenter && Math.hypot(q.x - standCenter.x, q.z - standCenter.z) < 20) continue;
  treeSpots.push({ x: q.x, z: q.z, h: 0.55 + Math.pow(rand(), 1.5) * 1.1, rot: rand() * 6.28 });
}

// a few solitary trees for variety
const solitary = clamp(Math.round(len / 14), 20, 140);
for (let i = 0; i < solitary; i++) {
  const a = rand() * Math.PI * 2;
  const r = 70 + rand() * (70 + len * 0.3);
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (sampleDist(x, z) < 34) continue;
  if (standCenter && Math.hypot(x - standCenter.x, z - standCenter.z) < 20) continue;
  treeSpots.push({ x, z, h: 0.6 + rand() * 1.1, rot: rand() * 6.28 });
}

const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();
const pv = new THREE.Vector3();
const col = new THREE.Color();

const instanced = (geo, mat, list, cfg, shadow = true) => {
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((sp, i) => {
    q.setFromAxisAngle(up, sp.rot);
    const dim = cfg.scale(sp);
    sc.set(dim[0], dim[1], dim[2]);
    m4.compose(cfg.pos(sp), q, sc);
    mesh.setMatrixAt(i, m4);
    col.setHSL(cfg.hue(sp), cfg.sat(sp), cfg.light(sp), THREE.SRGBColorSpace);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere?.();
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  S.add(mesh);
  return mesh;
};

const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 2.4, 5).translate(0, 1.2, 0);
const tier1 = new THREE.ConeGeometry(1.5, 2.4, 7).translate(0, 2.6, 0);
const tier2 = new THREE.ConeGeometry(1.05, 1.9, 7).translate(0, 4.0, 0);
const pineGeo = mergeGeometries([trunkGeo, tier1, tier2]);

instanced(pineGeo,
  new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }),
  treeSpots,
  {
    pos: (sp) => pv.set(sp.x, grassY, sp.z),
    scale: (sp) => [sp.h * (0.85 + rand() * 0.3), sp.h * (0.95 + rand() * 0.45), sp.h * (0.85 + rand() * 0.3)],
    hue: (sp) => theme.foliageHue + sp.h * 0.012, sat: () => theme.foliageSat * 0.6 + rand() * 0.2, light: () => theme.foliageLight * 0.85 + rand() * 0.1,
  });

// low shrubs hugging the barrier
const vergeBushes = [];
const bushCount = clamp(Math.round(len / 4), 80, 420);
for (let i = 0; i < bushCount; i++) {
  const s = samples[Math.floor(rand() * N)];
  const side = rand() > 0.5 ? 1 : -1;
  const q2 = s.p.clone().addScaledVector(s.r, side * (ROAD_HALF + 1.9 + rand() * 1.0));
  vergeBushes.push({ x: q2.x, z: q2.z, y: q2.y + 0.2, h: 0.28 + rand() * 0.3, rot: rand() * 6.28 });
}
instanced(new THREE.IcosahedronGeometry(0.7, 0),
  new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
  vergeBushes,
  {
    pos: (sp) => pv.set(sp.x, sp.y, sp.z),
    scale: (sp) => [sp.h * 1.5, sp.h, sp.h * 1.5],
    hue: () => theme.foliageHue - 0.01, sat: () => theme.foliageSat, light: () => theme.foliageLight,
  });
}

export function buildTyreStacks(ctx) {
  const { S, samples, N, len, ROAD_HALF, rand, grassY } = ctx;

const tyreMat = new THREE.MeshStandardMaterial({ color: 0x17191f, roughness: 0.92 });
const tyreGeo = new THREE.TorusGeometry(0.42, 0.15, 7, 12);
// height of the grass verge at a lateral offset, matching the shoulder geometry above
const vergeY = (s, off) => {
  const a = ROAD_HALF + 1.35, b = ROAD_HALF + 4.2;
  const t = clamp((off - a) / (b - a), 0, 1);
  const low = Math.max(grassY + 0.35, s.p.y - 0.75);
  return s.p.y + 0.03 + (low - s.p.y - 0.03) * t;
};

const tyreSpots = [];
const stackU = [];
const stackCount = clamp(Math.round(len / 55), 8, 40);
for (let k = 0; k < stackCount; k++) stackU.push((k + 0.45) / stackCount);
for (const u of stackU) {
  const i = Math.floor(u * N) % N;
  const j = (i + 10) % N;
  const turn = Math.sign(samples[i].t.x * samples[j].t.z - samples[i].t.z * samples[j].t.x) || 1;
  const s = samples[i];
  const off = ROAD_HALF + 2.55;
  const baseY = vergeY(s, off);
  for (const along of [-1.15, 0, 1.15]) {
    const q = s.p.clone().addScaledVector(s.r, -turn * off).addScaledVector(s.t, along);
    for (let k = 0; k < 3; k++) tyreSpots.push({ x: q.x, y: baseY + 0.14 + k * 0.25, z: q.z });
  }
}
{
  const mesh = new THREE.InstancedMesh(tyreGeo, tyreMat, tyreSpots.length);
  const m4 = new THREE.Matrix4();
  const qq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const one = new THREE.Vector3(1, 1, 1);
  const pv = new THREE.Vector3();
  tyreSpots.forEach((p, i) => {
    m4.compose(pv.set(p.x, p.y, p.z), qq, one);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere?.();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  S.add(mesh);
}
}
