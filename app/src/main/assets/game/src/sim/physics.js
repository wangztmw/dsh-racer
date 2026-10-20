import * as THREE from 'three';
import { clamp, damp } from '../util/index.js';

const MAX_ROAD_SPEED = 84;   // m/s ≈ 302 km/h
const MAX_GRASS_SPEED = 26;

export class CarSim {
  constructor(track) {
    this.track = track;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.speed = 0;        // signed longitudinal speed, m/s
    this.slip = 0;         // lateral speed, m/s
    this.accelLong = 0;
    this.gear = 1;
    this.rpm = 900;
    this.wheelAngle = 0;
    this.onRoad = true;
    this.groundY = 0;
    this.hint = 0;
    this.lateral = 0;
    this.u = 0;
    this.hitWall = 0;
    this.driftAngle = 0;
    this.reset();
  }

  reset() {
    // sit on the grid ~12 m before the line so the start gantry frames the shot
    const back = Math.max(1, Math.round(12 / (this.track.len / this.track.N)));
    const idx = (this.track.N - back) % this.track.N;
    const s = this.track.samples[idx];
    this.pos.copy(s.p);
    this.heading = Math.atan2(-s.t.z, s.t.x);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.slip = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.accelLong = 0;
    this.gear = 1;
    this.rpm = 900;
    this.hint = idx;
    this.u = idx / this.track.N;
    this.hitWall = 0;
    this.onRoad = true;
    this.groundY = s.p.y;
  }

  /** Put the car back on the centreline at the current progress, keeping race state. */
  respawn() {
    const s = this.track.samples[this.hint];
    this.pos.copy(s.p);
    this.heading = Math.atan2(-s.t.z, s.t.x);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.slip = 0;
    this.steer = 0;
    this.yawRate = 0;
    this.groundY = s.p.y;
    this.lateral = 0;
    this.onRoad = true;
    this.hitWall = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  right(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  step(dt, input) {
    const track = this.track;
    const fwd = this.forward(_f);
    const rgt = this.right(_r);

    // ---- surface
    let near = track.nearest(this.pos, this.hint);
    this.hint = near.idx;
    this.lateral = near.lateral;
    this.onRoad = Math.abs(near.lateral) < track.halfWidth + 0.35;
    this.groundY = near.y;

    // ---- longitudinal
    let f = this.vel.dot(fwd);
    let l = this.vel.dot(rgt);
    const speedAbs = Math.abs(f);
    const maxSpeed = this.onRoad ? MAX_ROAD_SPEED : MAX_GRASS_SPEED;

    let accel = 0;
    if (input.throttle > 0) {
      accel += input.throttle * (this.onRoad ? 18 : 8.5) * Math.max(0.04, 1 - speedAbs / 150);
    }
    if (input.brake > 0.01) {
      if (f > 0.6) accel -= input.brake * (this.onRoad ? 32 : 20);
      else if (f > -8) accel -= input.brake * 6.5;      // reverse
    }
    accel -= Math.sign(f) * (this.onRoad ? 0.55 : 2.4);   // rolling resistance
    accel -= 0.00085 * f * speedAbs;                      // aero drag
    if (input.handbrake && this.onRoad) accel -= Math.sign(f) * 5.0;

    f += accel * dt;
    f = clamp(f, -9, maxSpeed);
    this.accelLong = accel;

    // ---- steering
    this.steer = damp(this.steer, input.steer, 8.5, dt);
    const authority = THREE.MathUtils.lerp(2.95, 0.78, clamp(speedAbs / 78, 0, 1));
    let yaw = -this.steer * authority * clamp(speedAbs / 2.5, 0, 1);
    if (f < -0.2) yaw = -yaw * 0.6;
    if (input.handbrake) yaw *= 1.65;
    this.yawRate = damp(this.yawRate, yaw, 13, dt);

    // ---- grip / slip: rotate the chassis, then bleed lateral velocity
    let grip = this.onRoad ? 7.4 : 3.1;
    if (input.handbrake) grip = this.onRoad ? 1.85 : 2.4;
    this.heading += this.yawRate * dt;
    const nf = this.forward(_f2);
    const nr = this.right(_r2);
    // re-decompose the (unrotated) world velocity in the new chassis frame
    const fRot = f * Math.cos(this.yawRate * dt) - l * Math.sin(this.yawRate * dt);
    const lRot = f * Math.sin(this.yawRate * dt) + l * Math.cos(this.yawRate * dt);
    const lGrip = lRot * Math.exp(-grip * dt);
    this.vel.copy(nf).multiplyScalar(fRot).addScaledVector(nr, lGrip);
    this.pos.addScaledVector(this.vel, dt);

    this.speed = fRot;
    this.slip = lGrip;
    this.driftAngle = Math.atan2(Math.abs(lGrip), Math.max(Math.abs(fRot), 0.001)) * 180 / Math.PI;

    // ---- walls
    near = track.nearest(this.pos, this.hint);
    this.hint = near.idx;
    const limit = track.wallOffset - 0.55;
    if (Math.abs(near.lateral) > limit) {
      const dir = Math.sign(near.lateral);
      const excess = Math.abs(near.lateral) - limit;
      this.pos.addScaledVector(near.sample.r, -excess * dir);
      const nx = near.sample.r.x * dir;
      const nz = near.sample.r.z * dir;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) {
        this.vel.x -= 1.3 * vn * nx;
        this.vel.z -= 1.3 * vn * nz;
      }
      this.vel.multiplyScalar(0.74);
      this.hitWall = Math.min(1, this.hitWall + Math.min(0.9, Math.abs(vn) * 0.08));
      const cf = this.forward(_f);
      const cr = this.right(_r);
      this.speed = this.vel.dot(cf);
      this.slip = this.vel.dot(cr);
    }

    // ---- place on the road surface
    this.lateral = near.lateral;
    this.pos.y = near.y;
    this.onRoad = Math.abs(near.lateral) < track.halfWidth + 0.35;
    this.u = near.idx / track.N;

    // ---- drivetrain readouts
    const kmh = Math.abs(this.speed) * 3.6;
    const th = [0, 62, 108, 152, 196, 240, 999];
    let g = 1;
    while (g < th.length - 1 && kmh > th[g]) g++;
    this.gear = this.speed < -0.2 ? 0 : g;
    const lo = th[g - 1], hi = th[g];
    this.rpm = 1100 + clamp((kmh - lo) / (hi - lo), 0, 1) * 6800;

    this.wheelAngle += this.speed / 0.355 * dt;
    this.hitWall *= Math.exp(-6 * dt);
  }
}

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _f2 = new THREE.Vector3();
const _r2 = new THREE.Vector3();
