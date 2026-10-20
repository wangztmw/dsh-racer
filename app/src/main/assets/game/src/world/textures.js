import * as THREE from 'three';
import { canvasTexture, makeCanvas } from '../util/index.js';

export function asphaltTexture(rand) {
  const { canvas, ctx } = makeCanvas(512, 512);
  ctx.fillStyle = '#33363d';
  ctx.fillRect(0, 0, 512, 512);
  const img = ctx.getImageData(0, 0, 512, 512);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // subtle rubber lines
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rand() > 0.5 ? '#000' : '#6b7280';
    ctx.fillRect(rand() * 512, 0, 1 + rand() * 6, 512);
  }
  ctx.globalAlpha = 1;

  // edge lines (u = across the road)
  ctx.fillStyle = 'rgba(238,242,248,.92)';
  ctx.fillRect(8, 0, 6, 512);
  ctx.fillRect(498, 0, 6, 512);

  // dashed centre line (v = along the road, one tile = 9 m)
  ctx.fillStyle = 'rgba(240,244,250,.8)';
  for (let y = 0; y < 512; y += 128) ctx.fillRect(253, y, 6, 62);

  const tex = canvasTexture(canvas, { repeat: [1, 1], aniso: 16 });
  return tex;
}

export function curbTexture() {
  const { canvas, ctx } = makeCanvas(64, 128);
  ctx.fillStyle = '#e9edf2';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#d8202f';
  ctx.fillRect(0, 0, 64, 64);
  return canvasTexture(canvas, { repeat: [1, 1] });
}

export function grassTexture(rand, base = '#415c33') {
  const { canvas, ctx } = makeCanvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const baseC = new THREE.Color(base);
  for (let i = 0; i < 46; i++) {
    const g = 70 + rand() * 45;
    ctx.fillStyle = `rgba(${(baseC.r * 255 * (0.85 + rand() * 0.4)) | 0},${(baseC.g * 255 * (0.85 + rand() * 0.4)) | 0},${(baseC.b * 255 * (0.85 + rand() * 0.4)) | 0},${0.12 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 12 + rand() * 46, 10 + rand() * 34, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5200; i++) {
    const g = 60 + rand() * 80;
    ctx.fillStyle = `rgba(${(baseC.r * 255 * (0.7 + rand() * 0.7)) | 0},${(baseC.g * 255 * (0.7 + rand() * 0.7)) | 0},${(baseC.b * 255 * (0.7 + rand() * 0.7)) | 0},${0.2 + rand() * 0.45})`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  return canvasTexture(canvas, { repeat: [64, 64] });
}

export function textTexture(text, { w = 1024, h = 256, bg = '#0b0f18', fg = '#ffffff', size = 120, sub = null } = {}) {
  const { canvas, ctx } = makeCanvas(w, h);
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, bg);
  grad.addColorStop(0.5, '#161d2c');
  grad.addColorStop(1, bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,.14)';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${size}px "SF Mono", ui-monospace, Menlo, monospace`;
  ctx.fillText(text, w / 2, sub ? h / 2 - 18 : h / 2);
  if (sub) {
    ctx.font = '600 34px "SF Mono", ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillText(sub, w / 2, h / 2 + 62);
  }
  return canvasTexture(canvas);
}

export function checkerTexture() {
  const { canvas, ctx } = makeCanvas(256, 64);
  const c = 32;
  for (let y = 0; y < 64; y += c) {
    for (let x = 0; x < 256; x += c) {
      ctx.fillStyle = ((x / c + y / c) % 2) ? '#12151c' : '#f2f5fa';
      ctx.fillRect(x, y, c, c);
    }
  }
  return canvasTexture(canvas, { repeat: [6, 1] });
}


/**
 * One texture holding every sponsor board face, so all boards on a circuit can
 * be merged into a single draw call. Returns the atlas plus per-cell UV rects.
 */
export function brandAtlas(brands, { cols = 4, cellW = 512, cellH = 200 } = {}) {
  const rows = Math.ceil(brands.length / cols);
  const { canvas, ctx } = makeCanvas(cols * cellW, rows * cellH);
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  brands.forEach(([text, bg, fg], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW;
    const y = row * cellH;
    const grad = ctx.createLinearGradient(x, y, x + cellW, y);
    grad.addColorStop(0, bg);
    grad.addColorStop(0.5, '#161d2c');
    grad.addColorStop(1, bg);
    ctx.fillStyle = grad;
    ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 8, y + 8, cellW - 16, cellH - 16);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 92;
    ctx.font = `800 ${size}px "SF Mono", ui-monospace, Menlo, monospace`;
    while (ctx.measureText(text).width > cellW - 60 && size > 20) {
      size -= 4;
      ctx.font = `800 ${size}px "SF Mono", ui-monospace, Menlo, monospace`;
    }
    ctx.fillText(text, x + cellW / 2, y + cellH / 2);
  });

  const uvRect = (i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const u0 = col / cols;
    const u1 = (col + 1) / cols;
    const v0 = 1 - (row + 1) / rows;
    const v1 = 1 - row / rows;
    return [u0, v0, u1, v1];
  };

  return { texture: canvasTexture(canvas, { repeat: [1, 1] }), uvRect };
}

export function remapUv(geo, [u0, v0, u1, v1]) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  uv.needsUpdate = true;
  return geo;
}
