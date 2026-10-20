/**
 * Fully synthesised engine / tyre / wind audio — no assets.
 * WebAudio needs a user gesture, so start() is called on the first click/key.
 */
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineGain = null;
  let oscA = null, oscB = null, sub = null;
  let lp = null;
  let noiseGain = null, noiseFilter = null;
  let windGain = null;
  let started = false;
  let muted = false;

  function makeNoiseBuffer() {
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;        // brown-ish noise
      data[i] = last * 3.2;
    }
    return buf;
  }

  function start() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    started = true;

    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);

    // ---- engine: two detuned saws + a sine sub, through a lowpass that opens with throttle
    lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 3.5;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    lp.connect(engineGain).connect(master);

    oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscB = ctx.createOscillator();
    oscB.type = 'square';
    sub = ctx.createOscillator();
    sub.type = 'sine';
    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;

    oscA.connect(lp);
    oscB.connect(lp);
    sub.connect(subGain).connect(engineGain);

    for (const o of [oscA, oscB, sub]) { o.frequency.value = 60; o.start(); }

    // ---- tyre squeal
    const noise = ctx.createBufferSource();
    noise.buffer = makeNoiseBuffer();
    noise.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2400;
    noiseFilter.Q.value = 6;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    // ---- wind
    const wind = ctx.createBufferSource();
    wind.buffer = noise.buffer;
    wind.loop = true;
    const windLP = ctx.createBiquadFilter();
    windLP.type = 'lowpass';
    windLP.frequency.value = 520;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windLP).connect(windGain).connect(master);
    wind.start();
  }

  function update({ rpm, throttle, speed, slip, onRoad, handbrake }) {
    if (!started) return;
    const t = ctx.currentTime;
    const norm = Math.min(rpm / 8200, 1.05);
    const base = 42 + norm * 150;
    oscA.frequency.setTargetAtTime(base, t, 0.03);
    oscB.frequency.setTargetAtTime(base * 0.502, t, 0.03);
    sub.frequency.setTargetAtTime(base * 0.5, t, 0.05);
    lp.frequency.setTargetAtTime(360 + norm * 2600 + throttle * 900, t, 0.05);

    const load = 0.05 + throttle * 0.16 + norm * 0.1;
    engineGain.gain.setTargetAtTime(load, t, 0.06);

    const squeal = Math.min(Math.max(slip, 0) / 14, 1) * (onRoad ? 0.28 : 0.06);
    noiseGain.gain.setTargetAtTime(squeal + (handbrake ? 0.06 : 0), t, 0.05);
    noiseFilter.frequency.setTargetAtTime(1900 + slip * 60, t, 0.05);

    windGain.gain.setTargetAtTime(Math.min(speed / 90, 1) * 0.1, t, 0.1);
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.05);
    return muted;
  }

  return { start, update, toggleMute, get muted() { return muted; } };
}
