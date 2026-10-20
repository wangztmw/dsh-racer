import * as THREE from 'three';
import { clamp, makeCanvas } from '../util/index.js';

/* Soft round sprite used by both particle systems. */
function softBlob(size = 64, hardness = 0.0) {
  const { canvas, ctx } = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35 + hardness, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * GPU-light particle pool: one THREE.Points, per-particle size + life in attributes,
 * so smoke and flames cost one draw call each.
 */
function createPool(scene, { count, color, additive, texture, opacity }) {
  const positions = new Float32Array(count * 3);
  const lives = new Float32Array(count);
  const sizes = new Float32Array(count);
  const vel = new Float32Array(count * 3);
  const maxLife = new Float32Array(count);
  const startSize = new Float32Array(count);
  const growth = new Float32Array(count);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uScale: { value: 600 },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      attribute float aLife;
      attribute float aSize;
      varying float vLife;
      uniform float uScale;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vLife;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(uColor, a * vLife * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let head = 0;

  return {
    material: mat,
    emit(x, y, z, vx, vy, vz, life, size, grow) {
      const i = head;
      head = (head + 1) % count;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      vel[i * 3] = vx;
      vel[i * 3 + 1] = vy;
      vel[i * 3 + 2] = vz;
      lives[i] = 1;
      maxLife[i] = life;
      startSize[i] = size;
      growth[i] = grow;
      sizes[i] = size;
    },
    update(dt, drag, lift) {
      for (let i = 0; i < count; i++) {
        if (lives[i] <= 0) { sizes[i] = 0; continue; }
        lives[i] -= dt / Math.max(maxLife[i], 0.001);
        if (lives[i] <= 0) { lives[i] = 0; sizes[i] = 0; continue; }
        const damp = Math.exp(-drag * dt);
        const k = i * 3;
        vel[k] *= damp;
        vel[k + 1] = vel[k + 1] * damp + lift * dt;
        vel[k + 2] *= damp;
        positions[k] += vel[k] * dt;
        positions[k + 1] += vel[k + 1] * dt;
        positions[k + 2] += vel[k + 2] * dt;
        sizes[i] = startSize[i] * (1 + growth[i] * (1 - lives[i]));
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
    clear() {
      lives.fill(0);
      sizes.fill(0);
      geo.attributes.aLife.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
    },
  };
}

export function createExhaustFX(scene) {
  const smokeTex = softBlob(64, 0.0);
  const flameTex = softBlob(64, 0.25);

  const smoke = createPool(scene, {
    count: 320, color: 0xdde2ea, additive: false, texture: smokeTex, opacity: 0.3,
  });
  const flame = createPool(scene, {
    count: 160, color: 0xff4800, additive: true, texture: flameTex, opacity: 0.5,
  });

  // hot exhaust glow: two additive billboards that pulse with load
  const glowTex = softBlob(64, 0.15);
  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xff8a3c, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, opacity: 0,
  });
  const glows = [new THREE.Sprite(glowMat), new THREE.Sprite(glowMat)];
  for (const g of glows) { g.visible = false; scene.add(g); }

  const tips = [{ x: -2.2, y: 0.4, z: 0.2 }, { x: -2.2, y: 0.4, z: -0.2 }];
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let smokeAcc = 0;
  let flameAcc = 0;
  let prevGear = 1;
  let prevThrottle = 0;
  let load = 0;      // sustained-throttle charge, 0..1
  let clock = 0;

  return {
    update(dt, sim, car, ctrl, camScale) {
      smoke.material.uniforms.uScale.value = camScale;
      flame.material.uniforms.uScale.value = camScale;

      const h = sim.heading;
      forward.set(Math.cos(h), 0, -Math.sin(h));
      right.set(Math.sin(h), 0, Math.cos(h));
      const speed = Math.abs(sim.speed);
      const speedRatio = clamp(speed / 84, 0, 1);
      const throttle = ctrl.throttle;
      clock += dt;

      // how hard the car is being pushed right now: sustained throttle + current acceleration
      if (throttle > 0.45) load = Math.min(1, load + dt / 1.1);
      else load = Math.max(0, load - dt / 0.55);
      const accel = clamp(sim.accelLong / 14, 0, 1);
      const pump = clamp(load * 0.72 + accel * 0.45, 0, 1);
      const flicker = 0.86 + 0.14 * Math.sin(clock * 9.0);

      // ---- exhaust tips in world space (the car decides how many)
      const pipes = (car && car.exhausts && car.exhausts.length) ? car.exhausts : tips;
      const tipWorld = pipes.map((t) => ({
        x: sim.pos.x + forward.x * t.x + right.x * (t.z || 0),
        y: sim.pos.y + t.y,
        z: sim.pos.z + forward.z * t.x + right.z * (t.z || 0),
      }));
      const camFwd = forward;

      // ---- smoke: always a little, a lot under load
      const rate = (2 + 20 * pump) * (0.3 + 0.7 * speedRatio) * flicker;
      smokeAcc += rate * dt;
      const puffs = Math.min(Math.floor(smokeAcc), 6);
      smokeAcc -= puffs;
      for (let n = 0; n < puffs; n++) {
        for (const t of tipWorld) {
          const jx = (Math.random() - 0.5) * 0.15;
          const jy = (Math.random() - 0.5) * 0.12;
          const jz = (Math.random() - 0.5) * 0.15;
          smoke.emit(
            t.x + jx,
            t.y + 0.02 + jy,
            t.z + jz,
            camFwd.x * (sim.speed * 0.82 - 2.4) + right.x * (Math.random() - 0.5) * 0.6,
            0.7 + Math.random() * 0.8,
            camFwd.z * (sim.speed * 0.82 - 2.4) + right.z * (Math.random() - 0.5) * 0.6,
            0.8 + Math.random() * 0.6,
            0.16 + 0.3 * pump + Math.random() * 0.06,
            2.2 + 1.8 * pump,
          );
        }
      }

      // ---- flames: hard acceleration at speed, plus pops on shifts / lift-off
      const blowing = pump > 0.5;
      const burst = (n, lifeBase, sizeBase) => {
        for (let i = 0; i < n; i++) {
          const t = tipWorld[i % tipWorld.length];
          const back = 9 + Math.random() * 7;
          flame.emit(
            t.x,
            t.y,
            t.z,
            forward.x * (sim.speed * 0.55 - back) + right.x * (Math.random() - 0.5) * 2.4,
            (Math.random() - 0.5) * 1.2,
            forward.z * (sim.speed * 0.55 - back) + right.z * (Math.random() - 0.5) * 2.4,
            lifeBase * (0.7 + Math.random() * 0.6),
            sizeBase * (0.7 + Math.random() * 0.7),
            0.35,
          );
        }
      };

      if (blowing) {
        const flameRate = (16 + 200 * (pump - 0.5)) * flicker;
        flameAcc += flameRate * dt;
        const n = Math.min(Math.floor(flameAcc), 6);
        flameAcc -= n;
        if (n > 0) burst(n, 0.07, 0.12 + 0.24 * pump);
      } else {
        flameAcc = 0;
      }

      // exhaust glow billboards
      const glowOn = pump > 0.42;
      glowMat.opacity = glowOn ? (0.14 + 0.42 * pump) * flicker : 0;
      for (let i = 0; i < glows.length; i++) {
        const g = glows[i];
        g.visible = glowOn && i < tipWorld.length;
        if (!glowOn) continue;
        const t = tipWorld[i % tipWorld.length];
        g.position.set(t.x, t.y, t.z);
        const sc = 0.18 + 0.4 * pump + Math.random() * 0.1;
        g.scale.set(sc, sc, 1);
      }
      if (sim.gear > prevGear && speed > 12) burst(12, 0.11, 0.2);
      if (prevThrottle > 0.55 && throttle < 0.15 && speed > 22) burst(16, 0.14, 0.24);
      prevGear = sim.gear;
      prevThrottle = throttle;

      smoke.update(dt, 1.3, 0.9 + 0.9 * pump);
      flame.update(dt, 5.5, 0.4);
    },

    clear() { smoke.clear(); flame.clear(); },
  };
}
