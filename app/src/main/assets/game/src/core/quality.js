/**
 * Adaptive quality controller.
 *
 * The goal is steady perceived smoothness, not a high average framerate: a
 * single long frame is more noticeable than a slightly lower resolution. The
 * controller therefore looks at the *upper percentiles* of frame time, reacts
 * fast to sustained jank and recovers slowly, so it never oscillates.
 *
 * Budget is derived from the display's refresh interval (the smallest frame
 * delta actually observed), which makes the thresholds work on 60 Hz as well
 * as 120 Hz panels.
 */

const WINDOW_MS = 600;          // decision window length
const DOWN_STREAK = 2;          // consecutive bad windows before stepping down
const UP_STREAK = 6;            // consecutive good windows before stepping up
const COOLDOWN_DOWN = 1200;     // ms between downscale steps
const UP_HOLD = 8000;           // ms of stability before trying a higher rung
const JANK_RATIO = 1.32;        // p90 above 1.32x budget counts as jank
const GOOD_RATIO = 1.10;        // p95 under 1.10x budget counts as good
const PANIC_RATIO = 2.0;        // p90 above 2x budget: drop two rungs at once
const MIN_SAMPLES = 4;          // enough to make a call even at low framerates

export function createQualityController({ renderer, maxDpr, onDegrade }) {
  const rungs = [];
  for (const v of [maxDpr, 1.75, 1.5, 1.25, 1.0]) {
    if (v <= maxDpr + 1e-6 && !rungs.some((r) => Math.abs(r - v) < 0.01)) rungs.push(v);
  }

  let rung = 0;
  try {
    const saved = Number(localStorage.getItem('racer.dpr'));
    const idx = rungs.findIndex((r) => Math.abs(r - saved) < 0.01);
    if (idx >= 0) rung = idx;
  } catch { /* storage unavailable */ }

  renderer.setPixelRatio(rungs[rung]);

  let dts = [];
  let windowStart = performance.now();
  // shader compilation and texture uploads make the first second meaningless
  let warmUntil = performance.now() + 1500;
  let budget = 1 / 60;          // estimated vsync interval (never above 1/60)
  let badStreak = 0;
  let goodStreak = 0;
  let lastChange = performance.now();
  let degraded = false;
  let stats = { dpr: rungs[rung], median: 0, p90: 0, p95: 0, fps: 0, budget, steps: 0, degraded };

  const setRung = (next) => {
    if (next === rung) return;
    rung = Math.max(0, Math.min(rungs.length - 1, next));
    renderer.setPixelRatio(rungs[rung]);
    lastChange = performance.now();
    stats.steps++;
    try { localStorage.setItem('racer.dpr', rungs[rung].toFixed(2)); } catch { /* ignore */ }
  };

  return {
    get dpr() { return rungs[rung]; },
    get stats() { return stats; },

    /** Call after a heavy one-off event (track rebuild) so it is not misread as jank. */
    reset() {
      dts = [];
      windowStart = performance.now();
      warmUntil = performance.now() + 800;
      badStreak = 0;
      goodStreak = 0;
    },

    /** Feed one frame's raw (unclamped) delta time in seconds. */
    sample(dt) {
      // ignore stalls from tab switches, GC pauses or first-frame shader compiles
      if (typeof document !== 'undefined' && document.hidden) { dts.length = 0; return; }
      if (!(dt > 0) || dt > 0.5) { dts.length = 0; windowStart = performance.now(); return; }
      if (performance.now() < warmUntil) { dts.length = 0; windowStart = performance.now(); return; }

      dts.push(dt);
      budget = Math.max(1 / 240, Math.min(budget, dt));   // converge on the real vsync interval

      const elapsed = performance.now() - windowStart;
      // short windows let a 10 fps machine adapt in well under a second
      if (elapsed < WINDOW_MS || dts.length < MIN_SAMPLES) return;
      windowStart = performance.now();

      const sorted = [...dts].sort((a, b) => a - b);
      const median = sorted[sorted.length >> 1];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      dts = [];

      const now = performance.now();
      const sinceChange = now - lastChange;
      // aim for at least 60 fps even on 120/144 Hz panels
      const target = Math.max(budget, 1 / 60);
      const jank = p90 > target * JANK_RATIO;
      const clean = p95 < target * GOOD_RATIO;

      badStreak = jank ? badStreak + 1 : 0;
      goodStreak = clean ? goodStreak + 1 : 0;

      if (badStreak >= DOWN_STREAK && sinceChange > COOLDOWN_DOWN && rung < rungs.length - 1) {
        const drop = p90 > target * PANIC_RATIO ? 2 : 1;
        setRung(rung + drop);
        badStreak = 0;
        goodStreak = 0;
      } else if (goodStreak >= UP_STREAK && sinceChange > UP_HOLD && rung > 0) {
        setRung(rung - 1);
        goodStreak = 0;
      } else if (rung === rungs.length - 1 && badStreak >= DOWN_STREAK + 2 && !degraded && onDegrade) {
        // already at the lowest resolution: shed something else
        degraded = true;
        onDegrade();
        badStreak = 0;
      }

      stats = {
        dpr: rungs[rung],
        median,
        p90,
        p95,
        fps: 1 / median,
        budget: target,
        steps: stats.steps,
        degraded,
      };
    },
  };
}
