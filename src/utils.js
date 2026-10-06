// Utilidades matemáticas y de ruido compartidas.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(a, b, x) {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// Interpolación exponencial independiente del framerate.
export function damp(current, target, lambda, dt) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Rayo (origen o, dirección d unitaria) contra una cápsula (segmento a-b, radio r).
// Devuelve la distancia a lo largo del rayo o -1 si no la toca antes de maxT.
export function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r, maxT) {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = ox - ax; const wy = oy - ay; const wz = oz - az;
  const a = 1; const b = dx * ux + dy * uy + dz * uz; const c = ux * ux + uy * uy + uz * uz;
  const d = dx * wx + dy * wy + dz * wz; const e = ux * wx + uy * wy + uz * wz;
  const den = a * c - b * b;
  let s = den > 1e-6 ? clamp((a * e - b * d) / den, 0, 1) : 0;
  let t = b * s - d;
  if (t < 0) { t = 0; s = clamp(e / c, 0, 1); }
  if (t > maxT) return -1;
  const px = ox + dx * t - (ax + ux * s); const py = oy + dy * t - (ay + uy * s); const pz = oz + dz * t - (az + uz * s);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}

// RNG determinista (mulberry32) para que el mapa sea siempre el mismo.
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randSign = () => (Math.random() < 0.5 ? -1 : 1);

// ---------- Ruido de valor 2D (CPU, para generar texturas) ----------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ruido periódico (tilea cada `period` celdas) para texturas repetibles.
export function valueNoise(x, y, period = 0, seed = 1) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const wrap = (v) => (period > 0 ? ((v % period) + period) % period : v);
  const a = hash2(wrap(x0), wrap(y0), seed);
  const b = hash2(wrap(x0 + 1), wrap(y0), seed);
  const c = hash2(wrap(x0), wrap(y0 + 1), seed);
  const d = hash2(wrap(x0 + 1), wrap(y0 + 1), seed);
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, octaves = 4, period = 0, seed = 1) {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x, y, p, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    x *= 2;
    y *= 2;
    p *= 2;
  }
  return sum / norm;
}
