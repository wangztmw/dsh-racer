import * as THREE from 'three';
import { buildLoft, canvasTexture, makeCanvas, mergeGroupByMaterial } from '../util/index.js';

/* ---- formula car dimensions (metres, +x forward, +y up, +z left) ---- */
const FRONT_R = 0.33;
const REAR_R = 0.36;
const TRACK_F = 0.79;
const TRACK_R = 0.76;
const AXLE_F = 1.55;
const AXLE_R = -1.55;
const WHEEL_W_F = 0.30;
const WHEEL_W_R = 0.40;

/* closed lofts, tail → nose: [x, centre y, half width, half height, exponent] */
const TUB = [
  [-0.98, 0.40, 0.26, 0.20, 4.0],
  [-0.55, 0.39, 0.33, 0.23, 4.0],
  [0.00, 0.38, 0.36, 0.24, 4.0],
  [0.55, 0.38, 0.36, 0.24, 4.0],
  [0.95, 0.40, 0.33, 0.22, 4.0],
  [1.25, 0.43, 0.29, 0.19, 4.0],
];

const NOSE = [
  [1.25, 0.43, 0.29, 0.19, 4.0],
  [1.60, 0.40, 0.23, 0.15, 3.8],
  [1.95, 0.36, 0.17, 0.11, 3.4],
  [2.30, 0.32, 0.10, 0.075, 3.1],
  [2.56, 0.30, 0.045, 0.04, 3.0],
];

const COVER = [
  [-2.32, 0.47, 0.05, 0.04, 3.5],
  [-2.18, 0.48, 0.10, 0.075, 3.6],
  [-1.85, 0.46, 0.17, 0.13, 4.0],
  [-1.40, 0.45, 0.24, 0.17, 4.0],
  [-0.98, 0.44, 0.28, 0.19, 4.0],
];

const POD = [
  [-1.08, 0.35, 0.11, 0.09, 4.0],
  [-0.80, 0.34, 0.19, 0.15, 4.0],
  [-0.30, 0.33, 0.25, 0.18, 4.0],
  [0.22, 0.34, 0.24, 0.18, 4.0],
  [0.58, 0.36, 0.16, 0.13, 4.0],
];

const AIRBOX = [
  [-0.98, 0.78, 0.05, 0.04, 3.0],
  [-0.78, 0.80, 0.11, 0.10, 3.2],
  [-0.52, 0.79, 0.14, 0.12, 3.4],
  [-0.28, 0.72, 0.12, 0.10, 3.4],
  [-0.16, 0.66, 0.08, 0.07, 3.4],
];

function numberDecal(num = '07') {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = '#f2f5fa';
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,24,32,.35)';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#12161d';
  ctx.font = '800 150px "SF Mono", ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 128, 132);
  const tex = canvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function buildWheel(mats, radius, width) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);

  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 32, 1), mats.rubber);
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  spin.add(tire);

  for (const z of [-width / 2, width / 2]) {
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.985, radius * 0.9, 0.02, 28, 1),
      mats.rubberDark,
    );
    wall.rotation.x = Math.PI / 2;
    wall.position.z = z;
    spin.add(wall);
  }

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.66, radius * 0.66, width + 0.01, 24, 1), mats.rim);
  rim.rotation.x = Math.PI / 2;
  spin.add(rim);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, width + 0.03, 12, 1), mats.chrome);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.038, radius * 0.52, 0.028), mats.rim);
      spoke.rotation.z = a;
      spoke.position.set(
        -Math.sin(a) * radius * 0.32,
        Math.cos(a) * radius * 0.32,
        side * (width / 2 - 0.012),
      );
      spin.add(spoke);
    }
  }

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, 0.032, 22, 1), mats.disc);
  disc.rotation.x = Math.PI / 2;
  spin.add(disc);

  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.06), mats.caliper);
  caliper.position.set(-radius * 0.42, radius * 0.32, 0.05);
  pivot.add(caliper);

  return { pivot, spin };
}

export function createCar() {
  const root = new THREE.Group();
  const shell = new THREE.Group();
  root.add(shell);

  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xd0142c, metalness: 0.35, roughness: 0.28,
    clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x121419, metalness: 0.45, roughness: 0.42 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0e11, roughness: 0.95 });
  const rubberDark = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
  const rim = new THREE.MeshStandardMaterial({ color: 0xb9c4d2, metalness: 1, roughness: 0.3 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe3e9f2, metalness: 1, roughness: 0.16 });
  const disc = new THREE.MeshStandardMaterial({ color: 0x4b5058, metalness: 0.9, roughness: 0.5 });
  const caliper = new THREE.MeshStandardMaterial({ color: 0xffb300, metalness: 0.5, roughness: 0.4 });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x4a070e, emissive: 0xff1e37, emissiveIntensity: 1.0, roughness: 0.35,
  });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 0.35, metalness: 0.1 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x0b0f16, metalness: 0.9, roughness: 0.1 });

  const add = (geo, mat, x, y, z, rot = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.castShadow = true;
    shell.add(m);
    return m;
  };

  /* ---------------- closed bodywork ---------------- */
  for (const [stations, seg] of [[TUB, 40], [NOSE, 32], [COVER, 30], [AIRBOX, 22]]) {
    const mesh = new THREE.Mesh(buildLoft(stations, seg), paint);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    shell.add(mesh);
  }

  // sidepods, mirrored
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(buildLoft(POD, 28), paint);
    pod.position.z = side * 0.52;
    pod.castShadow = true;
    pod.receiveShadow = true;
    shell.add(pod);
  }

  /* ---------------- cockpit ---------------- */
  add(new THREE.BoxGeometry(0.86, 0.16, 0.44), matte, 0.02, 0.6, 0);
  add(new THREE.BoxGeometry(0.6, 0.1, 0.38), carbon, -0.42, 0.62, 0);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), helmet);
  lid.position.set(-0.02, 0.69, 0);
  lid.scale.set(1.0, 0.95, 0.92);
  lid.castShadow = true;
  shell.add(lid);
  const viz = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.28), visor);
  viz.position.set(0.08, 0.7, 0);
  shell.add(viz);

  // halo
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.032, 8, 22, Math.PI), carbon);
  halo.rotation.y = Math.PI / 2;
  halo.position.set(0.1, 0.66, 0);
  halo.castShadow = true;
  shell.add(halo);
  add(new THREE.BoxGeometry(0.62, 0.03, 0.03), carbon, 0.36, 0.6, 0, [0, 0, -0.32]);

  /* ---------------- front wing ---------------- */
  add(new THREE.BoxGeometry(0.52, 0.045, 1.94), carbon, 2.32, 0.115, 0);
  add(new THREE.BoxGeometry(0.34, 0.04, 1.9), carbon, 2.5, 0.2, 0, [0, 0, -0.18]);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.56, 0.3, 0.04), carbon, 2.4, 0.2, side * 0.97);
    add(new THREE.BoxGeometry(0.06, 0.2, 0.04), carbon, 2.36, 0.24, side * 0.62);
  }
  add(new THREE.BoxGeometry(0.34, 0.06, 0.1), carbon, 2.3, 0.24, 0);

  /* ---------------- floor + diffuser ---------------- */
  const floor = add(new THREE.BoxGeometry(3.1, 0.05, 1.44), carbon, -0.35, 0.075, 0);
  floor.receiveShadow = true;
  add(new THREE.BoxGeometry(0.42, 0.22, 1.44), carbon, -2.02, 0.16, 0);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.46, 0.28, 0.03), carbon, -2.0, 0.17, side * 0.6);
    add(new THREE.BoxGeometry(0.44, 0.03, 1.2), carbon, -2.1, 0.06, 0);
  }

  /* ---------------- rear wing ---------------- */
  add(new THREE.BoxGeometry(0.4, 0.045, 1.1), carbon, -2.3, 0.94, 0, [0, 0, 0.1]);
  add(new THREE.BoxGeometry(0.3, 0.04, 1.1), carbon, -2.44, 1.03, 0, [0, 0, 0.34]);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.62, 0.44, 0.035), carbon, -2.36, 0.98, side * 0.56);
    add(new THREE.BoxGeometry(0.07, 0.5, 0.07), carbon, -2.22, 0.72, side * 0.42);
  }
  add(new THREE.BoxGeometry(0.05, 0.05, 0.86), carbon, -2.3, 0.84, 0);

  /* ---------------- suspension ---------------- */
  const armGeo = new THREE.BoxGeometry(0.44, 0.035, 0.05);
  for (const [x, z] of [
    [AXLE_F, TRACK_F], [AXLE_F, -TRACK_F], [AXLE_R, TRACK_R], [AXLE_R, -TRACK_R],
  ]) {
    for (const y of [0.26, 0.46]) {
      const arm = new THREE.Mesh(armGeo, carbon);
      arm.position.set(x, y, z * 0.66);
      arm.rotation.y = z > 0 ? -0.35 : 0.35;
      arm.castShadow = true;
      shell.add(arm);
    }
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.06), matte);
    upright.position.set(x, 0.36, z * 0.94);
    shell.add(upright);
  }

  /* ---------------- livery ---------------- */
  const decalMat = new THREE.MeshStandardMaterial({
    map: numberDecal('07'), transparent: true, roughness: 0.6, depthWrite: false,
  });
  for (const side of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), decalMat);
    d.position.set(0.62, 0.46, side * 0.375);
    d.rotation.y = side * Math.PI / 2;
    shell.add(d);
  }
  add(new THREE.BoxGeometry(0.03, 0.06, 0.9), tailMat, -2.3, 0.68, 0);
  add(new THREE.BoxGeometry(0.16, 0.05, 0.05), tailMat, -2.28, 0.55, 0.3);
  add(new THREE.BoxGeometry(0.16, 0.05, 0.05), tailMat, -2.28, 0.55, -0.3);

  // exhaust: single central pipe
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.2, 16, 1, true), chrome);
  ex.rotation.z = Math.PI / 2;
  ex.position.set(-2.28, 0.5, 0);
  shell.add(ex);
  const exInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: 0x14161a, metalness: 0.8, roughness: 0.6 }),
  );
  exInner.rotation.z = Math.PI / 2;
  exInner.position.set(-2.3, 0.5, 0);
  shell.add(exInner);

  /* ---------------- wheels ---------------- */
  const wheelMats = { rubber, rubberDark, rim, chrome, disc, caliper };
  const wheels = [];
  for (const [x, z, radius, width, front] of [
    [AXLE_F, TRACK_F, FRONT_R, WHEEL_W_F, true],
    [AXLE_F, -TRACK_F, FRONT_R, WHEEL_W_F, true],
    [AXLE_R, TRACK_R, REAR_R, WHEEL_W_R, false],
    [AXLE_R, -TRACK_R, REAR_R, WHEEL_W_R, false],
  ]) {
    const w = buildWheel(wheelMats, radius, width);
    w.pivot.position.set(x, radius, z);
    root.add(w.pivot);
    wheels.push({ ...w, front, radius, spinAngle: 0 });
  }

  for (const w of wheels) mergeGroupByMaterial(w.spin);
  mergeGroupByMaterial(shell);

  return {
    root, shell, wheels, tailMat,
    wheelRadius: REAR_R,
    rearAxle: AXLE_R,
    wheelZ: TRACK_R,
    exhausts: [{ x: -2.34, y: 0.5, z: 0 }],
    forward: new THREE.Vector3(1, 0, 0),
    groundY: 0,

    setSteer(angle) {
      for (const w of wheels) if (w.front) w.pivot.rotation.y = angle;
    },

    spinWheels(dt, speed, slip) {
      for (const w of wheels) {
        w.spinAngle -= (speed / w.radius) * dt * 1.35;
        if (!w.front && slip > 0.5) w.spinAngle -= slip * dt * 0.5;
        w.spin.rotation.z = w.spinAngle;
      }
    },

    setBrake(on) {
      this.tailMat.emissiveIntensity = on ? 4.0 : 1.0;
    },
  };
}
