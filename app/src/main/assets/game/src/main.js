import * as THREE from 'three';
import {
  renderer, scene, camera, setEnvIntensity, maxDpr, createQualityController,
  updateShadows, invalidateShadows,
} from './core/index.js';
import { buildWorld, TRACKS } from './world/index.js';
import { createPicker } from './ui/index.js';
import { createCar } from './car/index.js';
import { CarSim } from './sim/index.js';
import { createCameraRig, createHUD, createExhaustFX, createSkids } from './view/index.js';
import { createInput } from './input/index.js';
import { createAudio } from './audio/index.js';
import { clamp, damp, makeCanvas } from './util/index.js';

const params = new URLSearchParams(location.search);
const AUTOPILOT = params.has('demo') || params.has('shot');
const SHOT = params.has('shot');
const FREEZE = params.has('freeze');
const CAM = params.get('cam');
const PRE = params.has('pre') ? Number(params.get('pre')) : 0;

// surface runtime errors on screen instead of failing silently
window.addEventListener('error', (e) => {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:0;top:0;z-index:99;color:#ff8a8a;background:rgba(0,0,0,.88);padding:12px;font:12px/1.5 monospace;white-space:pre-wrap;max-width:100vw;margin:0';
  box.textContent = `ERROR: ${e.message}\n${e.error && e.error.stack ? e.error.stack : ''}`;
  document.body.appendChild(box);
});

/* ------------------------------------------------------------------ renderer */

/* ------------------------------------------------------------------ world */

let currentTrack = TRACKS[0];
let world = buildWorld(scene, currentTrack);
renderer.compile(scene, camera);

const car = createCar();
scene.add(car.root);

// the PMREM studio env is only used for reflections — keep it from flattening the sun
setEnvIntensity(scene, 0.4);
setEnvIntensity(car.root, 1.25);

const fx = createExhaustFX(scene);
let sim = new CarSim(world);
const camRig = createCameraRig(camera);
let hud = createHUD(world);
const input = createInput();
const audio = createAudio();

/* ---------------- adaptive quality ---------------- */
const quality = createQualityController({
  renderer,
  maxDpr,
  onDegrade: () => {
    // already at the lowest render scale: cheaper shadows are the next lever
    if (world.sun) {
      world.sun.shadow.mapSize.set(1024, 1024);
      if (world.sun.shadow.map) {
        world.sun.shadow.map.dispose();
        world.sun.shadow.map = null;
      }
    }
    hud.toast('PERFORMANCE MODE · LIGHTER SHADOWS', 2200);
  },
});

camRig.set('orbit');

/* ------------------------------------------------------------------ skid marks */

const skids = createSkids(scene);
/* ------------------------------------------------------------------ race state */

const race = {
  state: 'intro',
  lap: 1,
  laps: 3,
  lapTime: 0,
  total: 0,
  last: 0,
  best: Infinity,
  lapTimes: [],
  driftScore: 0,
  prevU: 0,
  armed: false,
  countdown: 0,
  lastCount: null,
};

const splash = document.getElementById('splash');
const hudEl = document.getElementById('hud');

/* ---------------- track picker ---------------- */

function selectTrack(def, index) { /* selection is owned by the picker */ }

const picker = createPicker({ listEl: document.getElementById('tracks'), splash, onSelect: selectTrack });

function loadTrack(def) {
  if (currentTrack && currentTrack.id === def.id) return;
  world.dispose();
  world = buildWorld(scene, def);
  sim = new CarSim(world);
  hud = createHUD(world);
  currentTrack = def;
  race.laps = def.laps ?? 3;
  renderer.compile(scene, camera);
  invalidateShadows();
  quality.reset();
  skids.clear();
  fx.clear();
  car.root.position.copy(sim.pos);
  car.root.rotation.y = sim.heading;
  camRig.snapTo(car);
}

function resetRace(withCountdown = true) {
  sim.reset();
  car.root.position.copy(sim.pos);
  car.root.rotation.y = sim.heading;
  car.shell.rotation.set(0, 0, 0);
  race.lap = 1;
  race.laps = currentTrack.laps ?? 3;
  race.lapTime = 0;
  race.total = 0;
  race.last = 0;
  race.best = Infinity;
  race.lapTimes = [];
  race.driftScore = 0;
  race.prevU = sim.u;
  race.armed = false;
  race.state = withCountdown ? 'countdown' : 'race';
  race.countdown = 4.0;
  race.lastCount = null;
  hud.hideResults();
  fx.clear();
  quality.reset();
  camRig.set(withCountdown ? 'chase' : 'orbit');
  if (withCountdown) { race.lastCount = 3; hud.count('3'); }
}

function startRace() {
  splash.classList.add('hide');
  audio.start();
  loadTrack(picker.track);
  resetRace(true);
}

function finishRace() {
  race.state = 'finish';
  hud.showResults({ laps: race.lapTimes, total: race.total, best: race.best });
  hud.count('');
}

document.getElementById('go').addEventListener('click', startRace);
document.getElementById('again').addEventListener('click', () => { splash.classList.remove('hide'); startRace(); });
document.getElementById('changeTrack').addEventListener('click', () => {
  race.state = 'intro';
  hud.hideResults();
  splash.classList.remove('hide');
});

/* ------------------------------------------------------------------ autopilot (demo / verification) */

const BOOST = params.has('boost');

function autopilot() {
  const speed = Math.abs(sim.speed);
  const look = Math.round(16 + speed * 1.15);
  const s = world.samples[(sim.hint + look) % world.N];
  // aim at the centreline ahead: this both follows the track and pulls the car back from the grass
  const target = Math.atan2(-(s.p.z - sim.pos.z), s.p.x - sim.pos.x);
  let err = target - sim.heading;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const steer = clamp(-(err * 2.6), -1, 1);
  const offRoad = Math.abs(sim.lateral) > world.halfWidth;
  return {
    throttle: offRoad ? 0.5 : (BOOST || speed < 46) ? 1 : 0.45,
    brake: offRoad && speed > 16 ? 0.35 : 0,
    steer,
    handbrake: false,
  };
}

/* ------------------------------------------------------------------ simulation tick */

const clock = new THREE.Clock();
let hudAccum = 0;
let elapsed = 0;
let frames = 0;

function tick(dt) {
  elapsed += dt;

  const keys = input.consume();
  for (const code of keys) {
    if (code === 'KeyC') hud.toast(`CAMERA · ${camRig.next().toUpperCase()}`);
    if (code === 'KeyM') hud.toast(audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON');
    if (code === 'KeyR' && race.state !== 'intro') { sim.respawn(); car.root.position.copy(sim.pos); camRig.snapTo(car); hud.toast('BACK ON TRACK'); }
    if (code === 'Enter' && (race.state === 'intro' || race.state === 'finish')) startRace();
    if (code === 'KeyN' && race.state !== 'intro') { resetRace(true); hud.toast('RESTART'); }
  }

  const driving = race.state === 'race' || race.state === 'finish';
  let ctrl = input.read();
  if (AUTOPILOT && driving) ctrl = autopilot();

  if (race.state === 'countdown') {
    race.countdown -= dt;
    const n = Math.ceil(race.countdown - 1);   // 3 → 2 → 1 → GO
    if (n !== race.lastCount) {
      race.lastCount = n;
      hud.count(n >= 1 ? String(n) : 'GO!');
    }
    if (race.countdown <= 0) {
      race.state = 'race';
      race.lapTime = 0;
      race.total = 0;
      race.prevU = sim.u;
      hud.count('');
    }
    sim.step(dt, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  } else if (driving) {
    if (!FREEZE) sim.step(dt, ctrl);
    if (race.state === 'race') race.total += dt * 1000;

    if (!FREEZE && race.state === 'race') {
      race.lapTime += dt * 1000;
      if (race.prevU > 0.7 && sim.u < 0.3) {
        if (!race.armed) {
          // first launch across the line only arms the timer
          race.armed = true;
          race.lapTime = 0;
          race.total = 0;
          race.prevU = sim.u;
          return;
        }
        const t = race.lapTime;
        race.lapTimes.push(t);
        race.last = t;
        if (t < race.best) {
          race.best = t;
          hud.toast(`NEW BEST · ${(t / 1000).toFixed(2)}s`);
        }
        race.lapTime = 0;
        race.lap += 1;
        if (race.lap > race.laps) finishRace();
      }
      race.prevU = sim.u;
    }
  } else {
    sim.step(dt, { throttle: 0, brake: 0, steer: 0, handbrake: false });
  }

  // ---- car visuals
  car.root.position.copy(sim.pos);
  car.root.rotation.y = sim.heading;
  car.forward.set(Math.cos(sim.heading), 0, -Math.sin(sim.heading));
  car.groundY = sim.groundY;
  car.setSteer(-sim.steer * 0.42);
  car.spinWheels(dt, sim.speed, Math.abs(sim.slip));
  car.setBrake(ctrl.brake > 0.1);
  car.shell.rotation.x = damp(car.shell.rotation.x, clamp(sim.yawRate * Math.abs(sim.speed) * 0.0025, -0.085, 0.085), 7, dt);
  car.shell.rotation.z = damp(car.shell.rotation.z, clamp(sim.accelLong * 0.0032, -0.055, 0.055), 7, dt);

  // exhaust: smoke always, flames when the throttle is pinned at speed
  const camScale = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  fx.update(dt, sim, car, ctrl, camScale);

  // ---- sun follows the car so shadow resolution stays high
  world.sun.position.copy(sim.pos).addScaledVector(world.sunDir, 85);
  world.sun.target.position.copy(sim.pos);
  world.sun.target.updateMatrixWorld();

  // ---- camera
  if (race.state === 'intro') {
    // hero shot on the grid: three-quarter front, low, slow drift
    const h = sim.heading;
    const fx = Math.cos(h), fz = -Math.sin(h);
    const rx = Math.sin(h), rz = Math.cos(h);
    const drift = Math.sin(elapsed * 0.35) * 0.7;
    camera.position.set(
      sim.pos.x + fx * 10.5 + rx * (-4.4 + drift),
      sim.pos.y + 2.35,
      sim.pos.z + fz * 10.5 + rz * (-4.4 + drift),
    );
    camera.lookAt(sim.pos.x + fx * 0.4, sim.pos.y + 0.55, sim.pos.z + fz * 0.4);
  } else {
    camRig.update(dt, car, Math.abs(sim.speed) / 84, sim.slip);
  }
  if (sim.hitWall > 0.05) camRig.addShake(sim.hitWall * 0.3);

  skids.update(dt, sim, car);
  hudEl.classList.toggle('dim', race.state === 'intro');
  hudAccum += dt;
  if (hudAccum >= 0.05) {
    hud.update(hudAccum, sim, race);
    hudAccum = 0;
  }
  audio.update({
    rpm: sim.rpm,
    throttle: ctrl.throttle,
    speed: Math.abs(sim.speed),
    slip: Math.abs(sim.slip),
    onRoad: sim.onRoad,
    handbrake: ctrl.handbrake,
  });
}

/* ------------------------------------------------------------------ boot */

// deep link: ?track=grand|valley
{
  const wanted = params.get('track');
  if (wanted) {
    const idx = TRACKS.findIndex((t) => t.id === wanted);
    if (idx > 0) {
      picker.select(idx);
      loadTrack(TRACKS[idx]);
    }
  }
}

if (SHOT) {
  splash.classList.add('hide');
  resetRace(false);
  const s = world.samples[Math.floor(world.N * 0.145)];
  sim.pos.copy(s.p);
  sim.hint = s.idx;
  sim.heading = Math.atan2(-s.t.z, s.t.x);
  sim.vel.copy(sim.forward()).multiplyScalar(42);
  sim.speed = 42;
  car.root.position.copy(sim.pos);
  car.root.rotation.y = sim.heading;
  race.prevU = s.u;
  camRig.set(CAM || 'chase');
  camRig.snapTo(car);
  // deterministic pre-roll so captures don't depend on headless frame rate
  const pre = PRE || 6;
  for (let i = 0; i < pre * 60; i++) tick(1 / 60);
  hud.count('');
} else if (AUTOPILOT) {
  startRace();
}

function frame() {
  const raw = clock.getDelta();
  const dt = Math.min(raw, 1 / 20);
  tick(dt);
  renderer.render(scene, camera);
  quality.sample(raw);
  updateStats(raw);
  frames++;
  if (params.has('debug') && frames === 3) {
    console.log('[diag]', JSON.stringify({
      camNaN: camera.matrixWorld.elements.some((v) => !Number.isFinite(v)),
      cam: camera.position.toArray().map((n) => +n.toFixed(1)),
      state: race.state, lap: race.lap, laps: race.lapTimes.length,
      speed: +sim.speed.toFixed(1), u: +sim.u.toFixed(3),
      calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    }));
  }
}

// dev handle for automated inspection
window.__dbg = {
  THREE, scene, renderer, camera, race, tick, fx, car, quality,
  get sim() { return sim; },
  get world() { return world; },
};

/* ---------------- optional performance overlay (?stats=1) ---------------- */
let statsEl = null;
let statsFrames = 0;
let statsTime = 0;
if (params.has('stats')) {
  statsEl = document.createElement('div');
  statsEl.id = 'stats';
  statsEl.style.cssText = 'position:fixed;right:14px;top:14px;z-index:60;font:11px/1.6 ui-monospace,monospace;'
    + 'color:#9fe8d6;background:rgba(0,0,0,.62);padding:8px 10px;border-radius:8px;white-space:pre;pointer-events:none';
  document.body.appendChild(statsEl);
}
function updateStats(raw) {
  if (!statsEl) return;
  statsFrames++;
  statsTime += raw;
  if (statsTime < 1) return;
  const fps = statsFrames / statsTime;
  const i = renderer.info.render;
  const q = quality.stats;
  statsEl.textContent =
    `${fps.toFixed(0)} fps   ${(statsTime / statsFrames * 1000).toFixed(1)} ms\n`
    + `median ${(q.median * 1000).toFixed(1)}  p90 ${(q.p90 * 1000).toFixed(1)}  p95 ${(q.p95 * 1000).toFixed(1)} ms\n`
    + `budget ${(q.budget * 1000).toFixed(1)} ms   dpr ${q.dpr.toFixed(2)}   steps ${q.steps}\n`
    + `draw calls ${i.calls}   tris ${(i.triangles / 1000).toFixed(0)}k`;
  statsFrames = 0;
  statsTime = 0;
}

renderer.setAnimationLoop(frame);

