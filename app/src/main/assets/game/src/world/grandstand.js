import * as THREE from 'three';
import { clamp, mergeGroupByMaterial } from '../util/index.js';

/* Grandstand: a solid terraced structure that searches for a clear spot. */

export function buildGrandstand(ctx) {
  const { S, samples, N, ROAD_HALF, WALL_OFFSET, rand, grassY, offsetPoint, steelMat } = ctx;

let standSpot = { idx: 0, side: -1 };
let standCenter = null;
{
  // pick the spot near the line that is actually clear of the circuit on both sides
  const clearanceAt = (x, z) => {
    let near = Infinity;
    for (let i = 0; i < N; i += 6) {
      const dx = samples[i].p.x - x, dz = samples[i].p.z - z;
      const d = dx * dx + dz * dz;
      if (d < near) near = d;
    }
    return Math.sqrt(near);
  };

  let bestSpot = null;
  const candidateU = [];
  for (let k = -6; k <= 6; k++) candidateU.push(((1 + k * 0.009) % 1 + 1) % 1);
  for (const candSide of [-1, 1]) {
    for (const u of candidateU) {
      const idx = Math.round(u * N) % N;
      const cs = samples[idx];
      let clear = Infinity;
      for (const along of [-15, 0, 15]) {
        for (const out of [ROAD_HALF + 9.5, ROAD_HALF + 16, ROAD_HALF + 23]) {
          const px = cs.p.x + cs.t.x * along + cs.r.x * candSide * out;
          const pz = cs.p.z + cs.t.z * along + cs.r.z * candSide * out;
          clear = Math.min(clear, clearanceAt(px, pz));
        }
      }
      const dLine = Math.min(u, 1 - u);
      const score = clear - dLine * 60;
      if (!bestSpot || score > bestSpot.score) bestSpot = { score, side: candSide, idx };
    }
  }

  standSpot = { idx: bestSpot.idx, side: bestSpot.side };
  const s = samples[bestSpot.idx];
  const side = bestSpot.side;
  const standHeading = Math.atan2(-s.t.z, s.t.x);
  const gs = new THREE.Group();
  const base = offsetPoint(s, side * (ROAD_HALF + 9.5));
  standCenter = base.clone().addScaledVector(s.r, side * 6.5);
  const groundY = grassY + 0.08;
  const plinthH = Math.max(1.4, s.p.y - groundY);   // terrace wall down to the grass
  const TIERS = 6;
  const RISE = 0.85;
  const DEPTH = 2.0;

  const concrete = new THREE.MeshStandardMaterial({ color: 0xb2bcc9, roughness: 0.9 });
  const concreteDark = new THREE.MeshStandardMaterial({ color: 0x7d8794, roughness: 0.95 });

  // solid terrace: the structure meets the ground, nothing floats
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(32, plinthH, TIERS * DEPTH + 6), concreteDark);
  plinth.position.set(0, plinthH / 2, TIERS * DEPTH * 0.5 - 1.2);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  gs.add(plinth);

  for (let i = 0; i < TIERS; i++) {
    const w = 30 - i * 0.45;
    const h = (i + 1) * RISE;
    // each tier is a solid block sitting on the terrace, not a hovering slab
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, DEPTH), concrete);
    tier.position.set(0, plinthH + h / 2, i * DEPTH + 0.6);
    tier.castShadow = true;
    tier.receiveShadow = true;
    gs.add(tier);

    const cols = Math.floor(w / 0.62);
    const rows = 2;
    const people = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.3, 0.52, 0.3),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      cols * rows,
    );
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        m4.makeTranslation(
          -w / 2 + 0.6 + c * 0.62 + (rand() - 0.5) * 0.1,
          0.26,
          -0.45 + r * 0.62 + (rand() - 0.5) * 0.1,
        );
        people.setMatrixAt(n, m4);
        col.setHSL(rand(), 0.12 + rand() * 0.18, 0.26 + rand() * 0.16, THREE.SRGBColorSpace);
        people.setColorAt(n, col);
        n++;
      }
    }
    people.instanceMatrix.needsUpdate = true;
    people.computeBoundingSphere?.();
    if (people.instanceColor) people.instanceColor.needsUpdate = true;
    people.position.set(0, plinthH + h, i * DEPTH + 0.6);
    gs.add(people);
  }

  const topY = plinthH + TIERS * RISE;
  const backZ = (TIERS - 1) * DEPTH + 0.6;

  // rear wall + a low front safety wall
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(30.5, topY + 0.6, 0.5), concreteDark);
  backWall.position.set(0, (topY + 0.6) / 2, backZ + DEPTH * 0.5);
  backWall.castShadow = true;
  gs.add(backWall);

  const frontWall = new THREE.Mesh(new THREE.BoxGeometry(30, 1.15, 0.35), concrete);
  frontWall.position.set(0, plinthH + 0.575, -DEPTH * 0.5 + 0.6);
  frontWall.castShadow = true;
  gs.add(frontWall);

  // roof on columns
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b475c, metalness: 0.3, roughness: 0.6 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(32, 0.18, 16), roofMat);
  roof.position.set(0, topY + 2.5, backZ * 0.5 + 0.4);
  roof.rotation.x = 0.045;
  roof.castShadow = true;
  gs.add(roof);

  const fascia = new THREE.Mesh(new THREE.BoxGeometry(32, 0.55, 0.16), roofMat);
  fascia.position.set(0, topY + 2.3, -1.0);
  gs.add(fascia);

  for (const zz of [-0.6, backZ + 0.4]) {
    for (const xx of [-14.4, 14.4]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.3, topY + 2.5 - plinthH, 0.3), steelMat);
      col.position.set(xx, plinthH + (topY + 2.5 - plinthH) / 2, zz);
      col.castShadow = true;
      gs.add(col);
    }
  }

  gs.position.copy(base);
  gs.position.y = groundY;
  // long axis along the track, seating steps sloping away from it
  gs.rotation.y = standHeading + (side < 0 ? Math.PI : 0);
  S.add(gs);
}

  ctx.standSpot = standSpot;
  ctx.standCenter = standCenter;
}
