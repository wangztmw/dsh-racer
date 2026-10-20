import * as THREE from 'three';
import { makeCanvas } from '../util/index.js';

/* Tyre marks: a ring buffer of soft quads laid under the rear axle while drifting. */

export function createSkids(scene) {
  const SKID_MAX = 900;
  const skidTex = (() => {
    const { canvas, ctx } = makeCanvas(64, 64);
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = 'rgba(10,10,12,0.95)';
    // soft band across the texture's Y axis → soft edges across the tyre width
    ctx.fillRect(0, 13, 64, 38);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const skidMesh = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1.25, 0.3),
    new THREE.MeshBasicMaterial({
      map: skidTex, transparent: true, opacity: 0.62, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    SKID_MAX,
  );
  skidMesh.frustumCulled = false;
  {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SKID_MAX; i++) skidMesh.setMatrixAt(i, zero);
    skidMesh.instanceMatrix.needsUpdate = true;
  }
  scene.add(skidMesh);

  const skidDummy = new THREE.Object3D();
  const skidEuler = new THREE.Euler(-Math.PI / 2, 0, 0);
  const skidYaw = new THREE.Quaternion();
  const skidUp = new THREE.Vector3(0, 1, 0);
  const skidLast = new THREE.Vector3(1e9, 0, 0);
  const skidFwd = new THREE.Vector3();
  const skidRight = new THREE.Vector3();
  let skidHead = 0;

  function update(dt, sim, car) {
    const slipping = sim.onRoad && Math.abs(sim.slip) > 2.4 && Math.abs(sim.speed) > 5;
    if (!slipping) { skidLast.set(1e9, 0, 0); return; }

    const h = sim.heading;
    skidFwd.set(Math.cos(h), 0, -Math.sin(h));
    skidRight.set(Math.sin(h), 0, Math.cos(h));
    const rear = sim.pos.clone().addScaledVector(skidFwd, car.rearAxle);
    if (rear.distanceTo(skidLast) < 0.3) return;
    skidLast.copy(rear);

    skidYaw.setFromAxisAngle(skidUp, h);
    skidDummy.quaternion.setFromEuler(skidEuler).premultiply(skidYaw);
    skidDummy.scale.set(1, 1, 1);
    for (const side of [-1, 1]) {
      skidDummy.position.copy(rear).addScaledVector(skidRight, side * car.wheelZ);
      skidDummy.position.y = sim.groundY + 0.035;
      skidDummy.updateMatrix();
      skidMesh.setMatrixAt(skidHead, skidDummy.matrix);
      skidHead = (skidHead + 1) % SKID_MAX;
    }
    skidMesh.instanceMatrix.needsUpdate = true;
  }

  function clear() {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < SKID_MAX; i++) skidMesh.setMatrixAt(i, zero);
    skidMesh.instanceMatrix.needsUpdate = true;
    skidHead = 0;
    skidLast.set(1e9, 0, 0);
  }

    return { update, clear };
}
