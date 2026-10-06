// Texturas PBR procedurales (albedo + normal + ORM) generadas en canvas 2D. Sin assets externos.
import * as THREE from 'three';
import { fbm, makeRng, saturate, TAU } from './utils.js';

let maxAniso = 8;
export function setAnisotropy(v) { maxAniso = Math.min(16, v); }

export function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export const gray = (v, a = 1) => `rgba(${v | 0},${v | 0},${v | 0},${a})`;
export const rgba = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// Canvas -> textura three.js.
export function tex(canvas, { srgb = false, repeat = null, wrap = true, aniso = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (aniso) t.anisotropy = maxAniso;
  return t;
}

// Ruido fBm tileable en escala de grises.
export function noiseCanvas(size, period, octaves, seed, contrast = 1) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  let i = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = fbm((x / size) * period, (y / size) * period, octaves, period, seed);
      v = saturate((v - 0.5) * contrast + 0.5);
      const g = (v * 255) | 0;
      d[i++] = g; d[i++] = g; d[i++] = g; d[i++] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Grano de alta frecuencia (un valor aleatorio por píxel).
export function grainCanvas(size, seed) {
  const R = makeRng(seed);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = (R() * 255) | 0;
    d[i] = d[i + 1] = d[i + 2] = g;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Rellena `ctx` con `src` repetido usando un modo de fusión.
export function blend(ctx, src, op, alpha = 1, scale = 1, x = 0, y = 0, w = ctx.canvas.width, h = ctx.canvas.height) {
  const p = ctx.createPattern(src, 'repeat');
  p.setTransform(new DOMMatrix().scale(scale));
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

// Mapa de alturas (gris) -> mapa de normales tangente (convención OpenGL).
export function heightToNormal(heightCanvas, strength = 2, wrap = true) {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const out = makeCanvas(w, h);
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  const d = img.data;
  const k = strength / 255;
  for (let y = 0; y < h; y++) {
    const yu = y > 0 ? y - 1 : wrap ? h - 1 : 0;
    const yd = y < h - 1 ? y + 1 : wrap ? 0 : h - 1;
    for (let x = 0; x < w; x++) {
      const xl = x > 0 ? x - 1 : wrap ? w - 1 : 0;
      const xr = x < w - 1 ? x + 1 : wrap ? 0 : w - 1;
      const nx = (src[(y * w + xl) * 4] - src[(y * w + xr) * 4]) * k;
      const ny = (src[(yd * w + x) * 4] - src[(yu * w + x) * 4]) * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * w + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

// Ruidos base compartidos (se generan una sola vez).
let _shared = null;
export function sharedNoise() {
  if (!_shared) {
    _shared = {
      lo: noiseCanvas(256, 4, 5, 11, 1.6),
      mid: noiseCanvas(256, 12, 4, 23, 1.8),
      hi: noiseCanvas(256, 40, 3, 37, 2.0),
      grain: grainCanvas(256, 5),
    };
  }
  return _shared;
}

// Conjunto de tres lienzos (albedo, altura, ORM) con el mismo tamaño.
export class TexSet {
  constructor(w, h = w) {
    this.w = w; this.h = h;
    this.albC = makeCanvas(w, h); this.hgtC = makeCanvas(w, h); this.ormC = makeCanvas(w, h);
    this.a = this.albC.getContext('2d');
    this.hh = this.hgtC.getContext('2d');
    this.o = this.ormC.getContext('2d');
  }

  // Color base, altura media y ORM (ao, rugosidad, metalicidad en 0..1).
  base(color, rough, metal = 0, height = 128) {
    this.a.fillStyle = color; this.a.fillRect(0, 0, this.w, this.h);
    this.hh.fillStyle = gray(height); this.hh.fillRect(0, 0, this.w, this.h);
    this.o.fillStyle = rgba(255, rough * 255, metal * 255); this.o.fillRect(0, 0, this.w, this.h);
    return this;
  }

  // Aplica ruido a los tres canales con intensidades independientes.
  noise(src, scale, aAlb, aHgt, aRgh, op = 'overlay') {
    if (aAlb) blend(this.a, src, op, aAlb, scale);
    if (aHgt) blend(this.hh, src, 'overlay', aHgt, scale);
    if (aRgh) blend(this.o, src, 'overlay', aRgh, scale);
    return this;
  }

  // Dibuja con la misma función en los tres lienzos: fn(ctx, canal) con canal 'a' | 'h' | 'o'.
  each(fn) { fn(this.a, 'a'); fn(this.hh, 'h'); fn(this.o, 'o'); return this; }

  build({ normalStrength = 2, repeat = null, wrapNormal = true } = {}) {
    return {
      map: tex(this.albC, { srgb: true, repeat }),
      normalMap: tex(heightToNormal(this.hgtC, normalStrength, wrapNormal), { repeat }),
      ormMap: tex(this.ormC, { repeat }),
      canvases: { albedo: this.albC, height: this.hgtC, orm: this.ormC },
    };
  }
}

// Color de rugosidad para el lienzo ORM (canal G), conservando AO y metal.
export const roughCol = (r, a = 1, metal = 0, ao = 1) => rgba(ao * 255, r * 255, metal * 255, a);

// Grieta por camino aleatorio (con envoltura para que tilee).
export function crack(set, R, x, y, len, width = 1.4) {
  let ang = R.range(0, TAU);
  const pts = [[x, y]];
  for (let i = 0; i < len; i++) {
    ang += R.range(-0.7, 0.7);
    x += Math.cos(ang) * R.range(4, 11);
    y += Math.sin(ang) * R.range(4, 11);
    pts.push([x, y]);
  }
  set.each((ctx, ch) => {
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = ch === 'a' ? 'rgba(4,4,5,0.85)' : ch === 'h' ? 'rgba(0,0,0,0.9)' : roughCol(0.95, 0.8, 0, 0.3);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + ox * set.w, py + oy * set.h) : ctx.moveTo(px + ox * set.w, py + oy * set.h)));
        ctx.stroke();
      }
    }
    ctx.restore();
  });
}
