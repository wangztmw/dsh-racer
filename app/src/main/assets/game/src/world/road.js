import * as THREE from 'three';
import { buildRibbon } from '../util/index.js';

/* Road surface, kerbs, grass verge, guard rails and the start/finish furniture. */

export function buildRoad(ctx) {
  const { S, samples, N, ROAD_HALF, WALL_OFFSET, rand, grassY, offsetPoint, textures } = ctx;

const road = new THREE.Mesh(
  buildRibbon(samples.map((s) => [offsetPoint(s, -ROAD_HALF), offsetPoint(s, ROAD_HALF)]), { uvScale: 9 }),
  new THREE.MeshStandardMaterial({
    map: textures.asphalt, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide,
  }),
);
road.receiveShadow = true;
S.add(road);

const curbMat = new THREE.MeshStandardMaterial({ map: textures.curb, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide });
for (const side of [-1, 1]) {
  const pairs = samples.map((s) => [
    offsetPoint(s, side * ROAD_HALF, 0.02),
    offsetPoint(s, side * (ROAD_HALF + 1.35), 0.06),
  ]);
  const m = new THREE.Mesh(buildRibbon(pairs, { uvScale: 3.2 }), curbMat);
  m.receiveShadow = true;
  S.add(m);
}

/* ---------- verge + embankment down to the grass ---------- */
const vergeMat = new THREE.MeshStandardMaterial({ color: 0x4d6b3c, roughness: 1, side: THREE.DoubleSide });

for (const side of [-1, 1]) {
  const inner = samples.map((s) => offsetPoint(s, side * (ROAD_HALF + 1.35), 0.03));
  const mid = samples.map((s) => {
    const q = offsetPoint(s, side * (ROAD_HALF + 4.2), 0);
    q.y = Math.max(grassY + 0.35, s.p.y - 0.75);
    return q;
  });
  const outer = samples.map((s) => {
    const q = offsetPoint(s, side * (ROAD_HALF + 11), 0);
    q.y = grassY + 0.05;
    return q;
  });
  S.add(new THREE.Mesh(buildRibbon(samples.map((s, i) => [inner[i], mid[i]]), { uvScale: 6 }), vergeMat));
  S.add(new THREE.Mesh(buildRibbon(samples.map((s, i) => [mid[i], outer[i]]), { uvScale: 6 }), vergeMat));
}

/* ---------- guard rail ---------- */
const railMat = new THREE.MeshStandardMaterial({
  color: 0xdde4ee, metalness: 0.3, roughness: 0.55,
  emissive: 0x1c222b, emissiveIntensity: 0.55, side: THREE.DoubleSide,
});
const postGeo = new THREE.BoxGeometry(0.14, 0.9, 0.14);
const postMat = new THREE.MeshStandardMaterial({ color: 0x6f7884, metalness: 0.7, roughness: 0.5 });
for (const side of [-1, 1]) {
  const pairs = samples.map((s) => [
    offsetPoint(s, side * WALL_OFFSET, 0.15),
    offsetPoint(s, side * WALL_OFFSET, 0.78),
  ]);
  const rail = new THREE.Mesh(buildRibbon(pairs, { uvScale: 4 }), railMat);
  rail.castShadow = true;
  rail.receiveShadow = true;
  S.add(rail);

  const step = 7;
  const count = Math.floor(N / step);
  const posts = new THREE.InstancedMesh(postGeo, postMat, count);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const s = samples[i * step];
    const q = offsetPoint(s, side * WALL_OFFSET, 0.0);
    m4.makeTranslation(q.x, q.y + 0.35, q.z);
    posts.setMatrixAt(i, m4);
  }
  posts.instanceMatrix.needsUpdate = true;
  posts.computeBoundingSphere?.();
  posts.castShadow = true;
  S.add(posts);
}
}

export function buildStartFurniture(ctx) {
  const { S, samples, ROAD_HALF, WALL_OFFSET, offsetPoint, textures } = ctx;

const start = samples[0];
const startHeading = Math.atan2(-start.t.z, start.t.x);

// the timing line itself: painted on the asphalt, nothing hanging over the road
const line = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_HALF * 2 - 0.4, 2.4),
  new THREE.MeshStandardMaterial({ map: textures.checker, roughness: 0.75 }),
);
line.rotation.x = -Math.PI / 2;
line.rotation.z = startHeading + Math.PI / 2;   // width must run across the track
line.position.copy(start.p).y += 0.035;
S.add(line);

const steelMat = new THREE.MeshStandardMaterial({ color: 0x2a3240, metalness: 0.55, roughness: 0.5 });
const trimMat = new THREE.MeshStandardMaterial({ color: 0xd8dee8, roughness: 0.7 });

// low boards either side mark the line without blocking the view
const startBoardMat = new THREE.MeshStandardMaterial({
  map: textures.startBoard,
  side: THREE.FrontSide, roughness: 0.6, emissive: 0x1a2333, emissiveIntensity: 0.25,
});
for (const side of [-1, 1]) {
  const pos = offsetPoint(start, side * (WALL_OFFSET + 2.6), 1.15);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), startBoardMat);
  board.position.copy(pos);
  board.rotation.y = startHeading - Math.PI / 2;
  board.castShadow = true;
  S.add(board);
  for (const dx of [-2.1, 2.1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.3, 0.14), steelMat);
    leg.position.copy(pos);
    leg.position.x += Math.cos(board.rotation.y) * dx;
    leg.position.z += -Math.sin(board.rotation.y) * dx;
    leg.position.y -= 1.15;
    S.add(leg);
  }
  // slim flag pole, tall but far from the racing line
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 7.4, 8), trimMat);
  const polePos = offsetPoint(start, side * (WALL_OFFSET + 4.6), 0);
  pole.position.copy(polePos);
  pole.position.y = polePos.y + 3.7;
  pole.castShadow = true;
  S.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.9),
    new THREE.MeshStandardMaterial({ color: 0xe5223a, side: THREE.DoubleSide, roughness: 0.8 }),
  );
  flag.position.copy(polePos);
  flag.position.y = polePos.y + 6.9;
  flag.position.x += Math.cos(startHeading) * 0.85;
  flag.position.z += -Math.sin(startHeading) * 0.85;
  flag.rotation.y = startHeading;
  S.add(flag);
}

  ctx.steelMat = steelMat;
}
