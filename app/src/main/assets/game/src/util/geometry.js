import * as THREE from 'three';

/* Geometry builders: lofted hulls and ribbon strips. */

export function buildLoft(rawStations, radialSegments = 30) {
  const pos = [];
  const idx = [];
  const rings = [];
  // accept either { x, y, hw, hh, n } or the compact [x, y, hw, hh, n] form
  const stations = rawStations.map((st) => (Array.isArray(st)
    ? { x: st[0], y: st[1], hw: st[2], hh: st[3], n: st[4] ?? 4 }
    : st));

  for (const st of stations) {
    const ring = [];
    const n = st.n ?? 4;
    for (let i = 0; i < radialSegments; i++) {
      const t = (i / radialSegments) * Math.PI * 2;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const w = Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * st.hw;
      const h = Math.sign(s) * Math.pow(Math.abs(s), 2 / n) * st.hh;
      ring.push([st.x, st.y + h, w]);
    }
    rings.push(ring);
  }

  // hull
  for (let i = 0; i < rings.length; i++) {
    for (let j = 0; j < radialSegments; j++) pos.push(...rings[i][j]);
  }
  const row = radialSegments;
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * row + j;
      const b = i * row + ((j + 1) % radialSegments);
      const c = (i + 1) * row + ((j + 1) % radialSegments);
      const d = (i + 1) * row + j;
      idx.push(a, b, c, a, c, d);
    }
  }

  // caps (duplicated verts → flat normals, no smearing into the hull)
  for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
    const ring = rings[ri];
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= ring.length; cy /= ring.length; cz /= ring.length;
    const base = pos.length / 3;
    pos.push(cx, cy, cz);
    for (const p of ring) pos.push(...p);
    for (let j = 0; j < radialSegments; j++) {
      const a = base + 1 + j;
      const b = base + 1 + ((j + 1) % radialSegments);
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  }

  // the loft is generated clockwise seen from outside — flip so faces point outwards
  idx.reverse();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // a placeholder uv keeps the loft mergeable with box/cylinder primitives
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Build a ribbon surface from paired left/right edge points along a path. */
export function buildRibbon(pairs, { closed = true, uvScale = 1 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    if (i > 0) dist += a.distanceTo(pairs[i - 1][0]);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    uv.push(0, dist / uvScale, 1, dist / uvScale);
  }
  const n = pairs.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const i0 = i * 2;
    const i1 = ((i + 1) % n) * 2;
    idx.push(i0, i1, i1 + 1, i0, i1 + 1, i0 + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}


/**
 * Collapse every static mesh in a group into one mesh per material.
 * Instanced meshes and nested groups are left alone. Big draw-call saver:
 * the car and most trackside props are built from dozens of small boxes.
 */
