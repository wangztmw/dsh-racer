import { formatTime, clamp } from '../util/index.js';

export function createHUD(track) {
  const $ = (id) => document.getElementById(id);
  const els = {
    lapNo: $('lapNo'), lapCur: $('lapCur'), lapBest: $('lapBest'), lapLast: $('lapLast'),
    raceTotal: $('raceTotal'), spdVal: $('spdVal'), spdArc: $('spdArc'), gearVal: $('gearVal'),
    count: $('count'), drift: $('drift'), driftVal: $('driftVal'), driftCombo: $('driftCombo'), toast: $('toast'),
    results: $('results'), resTotal: $('resTotal'), resSub: $('resSub'), resLaps: $('resLaps'),
    speedo: $('speedo'),
  };

  /* ---------------- minimap ---------------- */
  const mapCanvas = $('minimap');
  const mctx = mapCanvas.getContext('2d');
  const W = mapCanvas.width, H = mapCanvas.height;

  const pts = track.samples.map((s) => s.p);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 34;
  const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const toMap = (p) => [W / 2 + (p.x - cx) * scale, H / 2 + (p.z - cz) * scale];

  const base = document.createElement('canvas');
  base.width = W; base.height = H;
  const bctx = base.getContext('2d');
  bctx.lineJoin = 'round';
  bctx.lineCap = 'round';
  const path = new Path2D();
  pts.forEach((p, i) => {
    const [x, y] = toMap(p);
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  });
  path.closePath();
  bctx.strokeStyle = 'rgba(140,175,215,.18)';
  bctx.lineWidth = 26;
  bctx.stroke(path);
  bctx.strokeStyle = 'rgba(190,225,255,.55)';
  bctx.lineWidth = 9;
  bctx.stroke(path);

  // start line
  const [sx, sy] = toMap(pts[0]);
  bctx.save();
  bctx.translate(sx, sy);
  const t0 = track.samples[0].t;
  bctx.rotate(Math.atan2(t0.z, t0.x));
  bctx.fillStyle = '#ff2d55';
  bctx.fillRect(-2, -16, 4, 32);
  bctx.restore();

  let lastSpeedShown = -1;

  const api = {
    track,

    update(dt, sim, race) {
      const kmh = Math.round(Math.abs(sim.speed) * 3.6);
      if (kmh !== lastSpeedShown) {
        els.spdVal.textContent = kmh;
        lastSpeedShown = kmh;
      }
      const C = 2 * Math.PI * 88;
      const frac = clamp(Math.abs(sim.speed) / 84, 0, 1);
      els.spdArc.setAttribute('stroke-dasharray', `${(frac * C * 0.75).toFixed(1)} ${C.toFixed(1)}`);
      els.gearVal.textContent = sim.gear === 0 ? 'R' : sim.gear;

      els.lapNo.textContent = `${Math.min(race.lap, race.laps)} / ${race.laps}`;
      els.lapCur.textContent = formatTime(race.lapTime);
      els.lapBest.textContent = formatTime(race.best);
      els.lapLast.textContent = formatTime(race.last);
      els.raceTotal.textContent = formatTime(race.total);

      const drifting = Math.abs(sim.slip) > 3.2 && sim.speed > 6;
      els.drift.classList.toggle('on', drifting);
      if (drifting) {
        race.driftScore += Math.abs(sim.slip) * dt * 10;
        els.driftVal.textContent = Math.round(race.driftScore);
        els.driftCombo.textContent = sim.slip > 0 ? '▶' : '◀';
      } else {
        race.driftScore *= Math.exp(-1.2 * dt);
        els.driftVal.textContent = Math.round(race.driftScore);
      }

      // minimap
      mctx.clearRect(0, 0, W, H);
      mctx.drawImage(base, 0, 0);
      const [px, py] = toMap(sim.pos);
      const ang = -sim.heading;
      mctx.save();
      mctx.translate(px, py);
      mctx.rotate(ang);
      mctx.fillStyle = '#ff2d55';
      mctx.beginPath();
      mctx.moveTo(11, 0);
      mctx.lineTo(-7, 7);
      mctx.lineTo(-4, 0);
      mctx.lineTo(-7, -7);
      mctx.closePath();
      mctx.fill();
      mctx.strokeStyle = 'rgba(255,255,255,.85)';
      mctx.lineWidth = 1.5;
      mctx.stroke();
      mctx.restore();
    },

    count(text) {
      if (!text) { els.count.textContent = ''; els.count.classList.remove('pop'); return; }
      els.count.textContent = text;
      els.count.classList.remove('pop');
      void els.count.offsetWidth;
      els.count.classList.add('pop');
    },

    toast(text, ms = 1600) {
      els.toast.textContent = text;
      els.toast.classList.add('on');
      clearTimeout(api._toastT);
      api._toastT = setTimeout(() => els.toast.classList.remove('on'), ms);
    },

    showResults({ laps, total, best }) {
      els.resTotal.textContent = formatTime(total);
      els.resSub.textContent = `${laps.length} LAPS · BEST ${formatTime(best)}`;
      els.resLaps.innerHTML = laps.map((t, i) =>
        `<li class="${t === best ? 'best' : ''}"><span>LAP ${i + 1}</span><span>${formatTime(t)}</span></li>`,
      ).join('');
      els.results.classList.add('show');
    },

    hideResults() { els.results.classList.remove('show'); },
  };

  return api;
}
