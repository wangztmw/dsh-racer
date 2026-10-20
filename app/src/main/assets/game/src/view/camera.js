import * as THREE from 'three';
import { clamp, damp, lerp } from '../util/index.js';

const MODES = ['chase', 'hood', 'orbit'];

export function createCameraRig(camera) {
  let pos = new THREE.Vector3(0, 12, -20);
  let look = new THREE.Vector3();
  let shake = 0;
  let mode = 0;
  let orbitAngle = 0;
  let orbitRadius = 9.5;

  const tmpV = new THREE.Vector3();
  const tmpL = new THREE.Vector3();
  const offset = new THREE.Vector3(-6, 2.2, 0);

  return {
    get mode() { return MODES[mode]; },

    next() {
      mode = (mode + 1) % MODES.length;
      return MODES[mode];
    },

    set(name) {
      const i = MODES.indexOf(name);
      if (i >= 0) mode = i;
      return MODES[mode];
    },

    snapTo(car) {
      pos.copy(car.root.position).addScaledVector(car.forward, -8.2);
      pos.y += 2.9;
      look.copy(car.root.position).addScaledVector(car.forward, 8);
      look.y += 1.1;
      camera.position.copy(pos);
      camera.lookAt(look);
    },

    orbit(angle, radius = 9.5) {
      orbitAngle = angle;
      orbitRadius = radius;
    },

    update(dt, car, speedRatio, slip = 0) {
      const fwd = car.forward;
      shake = Math.max(shake * Math.exp(-4 * dt), 0);

      if (mode === 0) {
        const back = 4.9 + speedRatio * 1.3;
        const up = 1.55 + speedRatio * 0.45;
        // damp only the offset, never the absolute position: otherwise the camera
        // lags behind by v/lambda at speed and the car shrinks into the distance
        tmpV.copy(fwd).multiplyScalar(-back);
        tmpV.y += up;
        tmpV.y = Math.max(tmpV.y, car.groundY + 1.0 - car.root.position.y);
        offset.x = damp(offset.x, tmpV.x, 7.5, dt);
        offset.y = damp(offset.y, tmpV.y, 6.0, dt);
        offset.z = damp(offset.z, tmpV.z, 7.5, dt);
        pos.copy(car.root.position).add(offset);

        look.copy(car.root.position).addScaledVector(fwd, 9.5);
        look.y += 0.55;
      } else if (mode === 1) {
        tmpV.copy(car.root.position).addScaledVector(fwd, 0.15);
        tmpV.y += 1.02;
        pos.copy(tmpV);
        tmpL.copy(car.root.position).addScaledVector(fwd, 24);
        tmpL.y += 0.85;
        look.copy(tmpL);
      } else {
        orbitAngle += dt * 0.35;
        const r = orbitRadius;
        tmpV.set(
          car.root.position.x + Math.cos(orbitAngle) * r,
          car.root.position.y + 3.4,
          car.root.position.z + Math.sin(orbitAngle) * r,
        );
        pos.x = damp(pos.x, tmpV.x, 3, dt);
        pos.y = damp(pos.y, tmpV.y, 3, dt);
        pos.z = damp(pos.z, tmpV.z, 3, dt);
        tmpL.copy(car.root.position);
        tmpL.y += 0.75;
        look.lerp(tmpL, 1 - Math.exp(-6 * dt));
      }

      camera.position.copy(pos);
      if (shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake * 0.7;
      }
      camera.lookAt(look);

      // bank the view a touch while drifting, widen FOV with speed
      camera.rotation.z += clamp(slip * 0.012, -0.05, 0.05);
      const targetFov = 60 + speedRatio * 15;
      camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-3 * dt));
      camera.updateProjectionMatrix();
    },

    addShake(amount) { shake = Math.min(0.55, shake + amount); },
  };
}
