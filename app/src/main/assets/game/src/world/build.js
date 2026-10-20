import * as THREE from 'three';
import { mulberry32 } from '../util/index.js';
import { TRACKS } from './catalog.js';
import { THEMES } from './themes.js';
import {
  asphaltTexture, curbTexture, grassTexture, checkerTexture, textTexture,
} from './textures.js';
import { buildRoad, buildStartFurniture } from './road.js';
import { buildGrandstand } from './grandstand.js';
import { buildSponsorBoards, buildForests, buildTyreStacks } from './scenery.js';
import { buildMountains, buildGround } from './terrain.js';
import { buildSky, buildLighting } from './sky.js';

const GRASS_Y = -3.1;

/**
 * Build one circuit into its own group so it can be disposed and rebuilt when
 * the player switches tracks. Returns the sampling data physics and the camera
 * need, plus a handle to free every GPU resource the track owns.
 */
export function buildWorld(scene, def = TRACKS[0]) {
  const rand = mulberry32(def.seed || 20261017);
  const group = new THREE.Group();
  scene.add(group);
  const S = group;

  const ROAD_HALF = def.halfWidth ?? 6.9;
  const WALL_OFFSET = ROAD_HALF + 2.4;
  const theme = THEMES[def.theme] || THEMES.day;

  /* ---------- circuit spline ---------- */
  // centre the layout on the origin so ground, hills and fog stay symmetric
  const raw = def.points;
  const cx0 = raw.reduce((a, p) => a + p[0], 0) / raw.length;
  const cz0 = raw.reduce((a, p) => a + p[2], 0) / raw.length;
  const pts = raw.map(([x, y, z]) => new THREE.Vector3(x - cx0, y, z - cz0));
  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
  const len = curve.getLength();

  const N = Math.max(700, Math.min(2800, Math.round(len / 0.45)));
  const up = new THREE.Vector3(0, 1, 0);
  const samples = [];
  for (let i = 0; i < N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u).normalize();
    const r = new THREE.Vector3().crossVectors(t, up).normalize();
    samples.push({ p, t, r, u, idx: i });
  }

  let extent = 0;
  for (const s of samples) extent = Math.max(extent, Math.hypot(s.p.x, s.p.z));
  extent = Math.max(extent, 60);

  const offsetPoint = (s, off, dy = 0) => {
    const q = s.p.clone().addScaledVector(s.r, off);
    q.y += dy;
    return q;
  };

  // every track-specific texture is built once and handed to the modules that need it
  const textures = {
    asphalt: asphaltTexture(rand),
    curb: curbTexture(),
    grass: grassTexture(rand, theme.grass),
    checker: checkerTexture(),
    startBoard: textTexture('START / FINISH', { w: 1024, h: 200, size: 92, bg: '#0b0f18', fg: '#ffffff' }),
  };

  const ctx = {
    scene, S, samples, N, len, extent, ROAD_HALF, WALL_OFFSET,
    rand, theme, grassY: GRASS_Y, up, offsetPoint, textures,
  };

  /* ---------- build ---------- */
  buildRoad(ctx);
  buildStartFurniture(ctx);
  buildGrandstand(ctx);
  buildSponsorBoards(ctx);
  buildForests(ctx);
  buildTyreStacks(ctx);
  buildMountains(ctx);
  buildGround(ctx);
  buildSky(ctx);
  buildLighting(ctx);

  /* ---------- helpers used by physics / camera ---------- */
  const nearest = (pos, hint = 0) => {
    let best = Infinity;
    let bi = 0;
    const span = 90;
    for (let k = -span; k <= span; k++) {
      const i = (hint + k + N * 2) % N;
      const s = samples[i];
      const dx = s.p.x - pos.x, dz = s.p.z - pos.z;
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; bi = i; }
    }
    // safety net: if we somehow drifted far away, do a coarse global scan
    if (best > 3600) {
      for (let i = 0; i < N; i += 4) {
        const s = samples[i];
        const dx = s.p.x - pos.x, dz = s.p.z - pos.z;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; bi = i; }
      }
    }
    const s = samples[bi];
    const dx = pos.x - s.p.x, dz = pos.z - s.p.z;
    const lateral = dx * s.r.x + dz * s.r.z;
    return { idx: bi, sample: s, lateral, y: s.p.y, dist: Math.sqrt(best) };
  };

  return {
    curve, samples, N, len, nearest,
    sun: ctx.sun, sunDir: ctx.sunDir, grassY: GRASS_Y, extent,
    halfWidth: ROAD_HALF, wallOffset: WALL_OFFSET,
    startHeading: Math.atan2(-samples[0].t.z, samples[0].t.x),
    def,
    stand: ctx.standSpot,
    dispose() {
      group.traverse((o) => {
        if (!o.geometry) return;
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) m[k]?.dispose?.();
          m.dispose?.();
        }
      });
      scene.remove(group);
    },
  };
}
