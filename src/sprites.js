// Atlas de sprites para partículas y calcomanías, generados píxel a píxel (sin canvas, para no
// perder precisión con el alfa premultiplicado).
import * as THREE from 'three';
import { fbm, smoothstep, saturate } from './utils.js';

const CELL = 128;

function makeAtlas(cols, rows, painters) {
  const W = cols * CELL; const H = rows * CELL;
  const data = new Uint8Array(W * H * 4);
  painters.forEach((paint, idx) => {
    const cx = idx % cols; const cy = Math.floor(idx / cols);
    for (let y = 0; y < CELL; y++) {
      for (let x = 0; x < CELL; x++) {
        const u = ((x + 0.5) / CELL) * 2 - 1;
        const v = ((y + 0.5) / CELL) * 2 - 1;
        const [r, g, b, a] = paint(u, v, Math.hypot(u, v), Math.atan2(v, u));
        // Borde de celda siempre transparente para evitar sangrado entre sprites.
        const edge = Math.min(1, (1 - Math.max(Math.abs(u), Math.abs(v))) * 10);
        const i = ((cy * CELL + y) * W + cx * CELL + x) * 4;
        data[i] = saturate(r) * 255; data[i + 1] = saturate(g) * 255; data[i + 2] = saturate(b) * 255;
        data[i + 3] = saturate(a * edge) * 255;
      }
    }
  });
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

const smoke = (seed) => (u, v, r) => {
  const n = fbm(u * 1.9 + seed, v * 1.9 + seed * 1.7, 4, 0, seed);
  const n2 = fbm(u * 4.5 - seed, v * 4.5 + seed, 3, 0, seed + 5);
  const a = smoothstep(1.0, 0.15, r + (n - 0.5) * 1.1) * (0.45 + 0.55 * n2);
  const shade = 0.55 + 0.45 * n;
  return [shade, shade, shade, a];
};

// Marco 0: brillo suave · 1,2: humo · 3: estela · 4: fogonazo · 5: anillo · 6: esquirla · 7: salpicadura
export const FRAME = { GLOW: 0, SMOKE_A: 1, SMOKE_B: 2, STREAK: 3, FLASH: 4, RING: 5, CHUNK: 6, SPRAY: 7 };
export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 2;

export function particleAtlas() {
  return makeAtlas(ATLAS_COLS, ATLAS_ROWS, [
    (u, v, r) => [1, 1, 1, Math.exp(-r * r * 5.0)],
    smoke(3),
    smoke(11),
    (u, v) => { const a = Math.exp(-v * v * 70) * smoothstep(1, 0.55, Math.abs(u)); const c = Math.exp(-v * v * 400); return [1, 1, 1, a * (0.6 + c)]; },
    (u, v, r, th) => {
      const spikes = Math.pow(Math.abs(Math.cos(th * 2.5 + 0.4)), 10) + 0.5 * Math.pow(Math.abs(Math.cos(th * 3.5 + 1.3)), 14);
      const n = fbm(u * 5 + 9, v * 5 + 2, 3, 0, 21);
      const a = Math.exp(-r * 5.2) * 1.6 + spikes * Math.exp(-r * 2.6) * (0.5 + n) + Math.exp(-r * r * 9) * 0.5 * n;
      return [1, 0.82 + 0.18 * Math.exp(-r * 6), 0.5 + 0.5 * Math.exp(-r * 7), a * smoothstep(1, 0.7, r)];
    },
    (u, v, r) => { const d = (r - 0.7) * 9; return [1, 1, 1, Math.exp(-d * d) * 0.95]; },
    (u, v, r, th) => { const n = fbm(Math.cos(th) * 1.5 + 4, Math.sin(th) * 1.5 + 4, 3, 0, 31); return [1, 1, 1, r < 0.35 + n * 0.5 ? 1 : 0]; },
    (u, v) => {
      let a = 0;
      for (let i = 0; i < 9; i++) {
        const px = Math.sin(i * 12.9898) * 0.62; const py = Math.cos(i * 78.233) * 0.62; const s = 0.05 + (i % 3) * 0.035;
        const d = Math.hypot(u - px, v - py) / s; a += Math.exp(-d * d);
      }
      return [1, 1, 1, a];
    },
  ]);
}

// Calcomanías: 0 agujero en hormigón · 1 agujero en metal · 2 quemadura · 3 cristal astillado
export function decalAtlas() {
  return makeAtlas(2, 2, [
    (u, v, r, th) => {
      const n = fbm(Math.cos(th) * 2 + 3, Math.sin(th) * 2 + 3, 3, 0, 41);
      const rim = 0.3 + n * 0.5;
      const hole = smoothstep(0.2, 0.12, r);
      const chip = smoothstep(rim, rim * 0.55, r);
      const c = 0.03 + (1 - hole) * 0.16 * (0.6 + n);
      return [c * 1.15, c * 1.08, c, Math.max(hole, chip * 0.85)];
    },
    (u, v, r, th) => {
      const hole = smoothstep(0.2, 0.14, r);
      const ringD = (r - 0.27) * 11;
      const ring = Math.exp(-ringD * ringD);
      const scr = Math.pow(Math.abs(Math.cos(th * 4 + 0.7)), 16) * smoothstep(0.75, 0.25, r) * 0.45;
      const c = hole > 0.5 ? 0.01 : 0.5 * ring + scr * 0.5;
      return [c, c, c * 1.04, Math.max(hole, ring * 0.9, scr)];
    },
    (u, v, r) => {
      const n = fbm(u * 2.4 + 6, v * 2.4 + 1, 4, 0, 51);
      const a = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.9);
      return [0.012, 0.01, 0.009, a * 0.93];
    },
    (u, v, r, th) => {
      const cracks = Math.pow(Math.abs(Math.cos(th * 5.5 + Math.sin(r * 9) * 0.35)), 60) * smoothstep(1, 0.2, r);
      const hole = smoothstep(0.16, 0.1, r);
      const frost = Math.exp(-r * r * 14) * 0.55;
      return [0.75, 0.82, 0.85, Math.max(hole * 0.9, cracks * 0.8, frost)];
    },
  ]);
}
