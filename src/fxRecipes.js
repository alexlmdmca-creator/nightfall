// Recetas de efectos: impactos por tipo de superficie, trazadoras, fogonazos, explosiones y fuego.
import { FRAME } from './sprites.js';
import { rand, randSign } from './utils.js';

const TAU = Math.PI * 2;

// Vector aleatorio en el hemisferio de la normal (mezcla normal + ruido).
function scatter(nx, ny, nz, spread, speed, out) {
  let x = nx + rand(-spread, spread);
  let y = ny + rand(-spread, spread);
  let z = nz + rand(-spread, spread);
  const l = Math.hypot(x, y, z) || 1;
  out[0] = (x / l) * speed; out[1] = (y / l) * speed; out[2] = (z / l) * speed;
  return out;
}
const _v = [0, 0, 0];

export function sparks(fx, x, y, z, nx, ny, nz, count = 12, power = 1) {
  for (let i = 0; i < count; i++) {
    scatter(nx, ny, nz, 0.85, rand(2.5, 11) * power, _v);
    const hot = rand(0.6, 1);
    fx.add.emit({
      x, y, z, vx: _v[0], vy: _v[1] + 1.2, vz: _v[2], life: rand(0.22, 0.75), size: rand(0.012, 0.024),
      frame: FRAME.STREAK, mode: 1, stretch: 0.045, r: 9 * hot, g: 4.6 * hot * hot, b: 1.2 * hot * hot * hot,
      gravity: 11, drag: 0.9, bounce: true, fadeK: 3,
    });
  }
  fx.add.emit({ x: x + nx * 0.03, y: y + ny * 0.03, z: z + nz * 0.03, life: 0.07, size: 0.22 * power, sizeEnd: 0.5 * power, r: 7, g: 4, b: 1.6, frame: FRAME.GLOW });
}

export function dust(fx, x, y, z, nx, ny, nz, count, r, g, b, scale = 1, alpha = 0.5) {
  const c = fx.lit(x, y, z, r, g, b, 2.2);
  for (let i = 0; i < count; i++) {
    scatter(nx, ny, nz, 0.55, rand(0.5, 2.6) * scale, _v);
    fx.alpha.emit({
      x: x + nx * 0.05, y: y + ny * 0.05, z: z + nz * 0.05, vx: _v[0], vy: _v[1] + 0.25, vz: _v[2],
      life: rand(0.6, 1.5), size: rand(0.08, 0.16) * scale, sizeEnd: rand(0.5, 0.95) * scale, rot: rand(TAU), rotV: rand(-1.2, 1.2),
      frame: Math.random() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B, r: c[0], g: c[1], b: c[2], alpha, drag: 3.2, gravity: -0.15, fadeIn: 0.05,
    });
  }
}

export function chunks(fx, x, y, z, nx, ny, nz, count, r, g, b, size = 0.03) {
  const c = fx.lit(x, y, z, r, g, b, 2.5);
  for (let i = 0; i < count; i++) {
    scatter(nx, ny, nz, 0.8, rand(1.5, 5.5), _v);
    fx.alpha.emit({
      x, y, z, vx: _v[0], vy: _v[1] + 1.4, vz: _v[2], life: rand(0.5, 1.1), size: rand(0.5, 1.5) * size, rot: rand(TAU), rotV: rand(-18, 18),
      frame: FRAME.CHUNK, r: c[0], g: c[1], b: c[2], gravity: 11, bounce: true, fadeK: 4,
    });
  }
}

export function splash(fx, x, z, scale = 1) {
  const c = fx.lit(x, 0.1, z, 0.75, 0.85, 1.0, 5);
  const y = 0.02;
  fx.alpha.emit({ x, y, z, life: 0.55, size: 0.18 * scale, sizeEnd: 1.25 * scale, frame: FRAME.RING, mode: 2, r: c[0], g: c[1], b: c[2], alpha: 0.55 });
  fx.alpha.emit({ x, y, z, life: 0.8, size: 0.1 * scale, sizeEnd: 1.9 * scale, frame: FRAME.RING, mode: 2, r: c[0], g: c[1], b: c[2], alpha: 0.3 });
  for (let i = 0; i < 10 * scale; i++) {
    scatter(0, 1, 0, 0.55, rand(1.6, 4.6) * Math.sqrt(scale), _v);
    fx.alpha.emit({
      x, y: y + 0.03, z, vx: _v[0], vy: _v[1], vz: _v[2], life: rand(0.3, 0.6), size: rand(0.012, 0.03), frame: FRAME.STREAK, mode: 1, stretch: 0.05,
      r: c[0] * 1.6, g: c[1] * 1.6, b: c[2] * 1.6, alpha: 0.75, gravity: 11, fadeK: 3,
    });
  }
  fx.alpha.emit({ x, y: y + 0.12, z, vy: 1.2, life: 0.4, size: 0.2 * scale, sizeEnd: 0.6 * scale, frame: FRAME.SPRAY, r: c[0], g: c[1], b: c[2], alpha: 0.6, rot: rand(TAU), gravity: 4 });
}

export function blood(fx, x, y, z, nx, ny, nz) {
  const c = fx.lit(x, y, z, 0.5, 0.02, 0.015, 3);
  for (let i = 0; i < 5; i++) {
    scatter(nx, ny, nz, 0.5, rand(0.4, 1.8), _v);
    fx.alpha.emit({
      x, y, z, vx: _v[0], vy: _v[1], vz: _v[2], life: rand(0.3, 0.6), size: 0.06, sizeEnd: rand(0.3, 0.5), rot: rand(TAU),
      frame: FRAME.SMOKE_A, r: c[0] + 0.02, g: c[1], b: c[2], alpha: 0.6, drag: 4, gravity: 1.5,
    });
  }
  chunks(fx, x, y, z, nx, ny, nz, 4, 0.35, 0.01, 0.01, 0.018);
}

// Impacto de bala según superficie. Devuelve el tipo de sonido.
export function impact(fx, surface, x, y, z, nx, ny, nz, big = false) {
  const k = big ? 1.5 : 1;
  switch (surface) {
    case 'metal':
      sparks(fx, x, y, z, nx, ny, nz, 14 * k, 1);
      dust(fx, x, y, z, nx, ny, nz, 2, 0.5, 0.5, 0.52, 0.6, 0.3);
      fx.decals.add(x, y, z, nx, ny, nz, rand(0.07, 0.1), 1);
      break;
    case 'water':
      splash(fx, x, z, rand(0.8, 1.2) * k);
      break;
    case 'wood':
      dust(fx, x, y, z, nx, ny, nz, 4, 0.55, 0.42, 0.3, 0.8, 0.45);
      chunks(fx, x, y, z, nx, ny, nz, 7, 0.6, 0.45, 0.28, 0.035);
      fx.decals.add(x, y, z, nx, ny, nz, rand(0.08, 0.12), 0);
      break;
    case 'glass':
      for (let i = 0; i < 10; i++) {
        scatter(nx, ny, nz, 0.8, rand(1, 5), _v);
        fx.add.emit({ x, y, z, vx: _v[0], vy: _v[1], vz: _v[2], life: rand(0.3, 0.7), size: rand(0.015, 0.035), frame: FRAME.GLOW, r: 1.6, g: 2, b: 2.4, gravity: 10, bounce: true, fadeK: 3 });
      }
      fx.decals.add(x, y, z, nx, ny, nz, rand(0.22, 0.34), 3);
      break;
    case 'flesh':
      blood(fx, x, y, z, nx, ny, nz);
      break;
    case 'dirt':
    case 'sand':
      dust(fx, x, y, z, nx, ny, nz, 6 * k, 0.5, 0.4, 0.28, 1.2, 0.55);
      chunks(fx, x, y, z, nx, ny, nz, 6, 0.3, 0.24, 0.16, 0.03);
      break;
    case 'rubber':
      dust(fx, x, y, z, nx, ny, nz, 3, 0.2, 0.2, 0.2, 0.7, 0.4);
      fx.decals.add(x, y, z, nx, ny, nz, 0.07, 0);
      break;
    default: // hormigón / asfalto
      dust(fx, x, y, z, nx, ny, nz, 6 * k, 0.62, 0.6, 0.56, 1, 0.5);
      chunks(fx, x, y, z, nx, ny, nz, 6, 0.4, 0.4, 0.38, 0.028);
      if (Math.random() < 0.45) sparks(fx, x, y, z, nx, ny, nz, 3, 0.6);
      fx.decals.add(x, y, z, nx, ny, nz, rand(0.1, 0.16), 0);
  }
}

export function tracer(fx, x0, y0, z0, x1, y1, z1, r = 6, g = 4.2, b = 1.6, speed = 230) {
  const dx = x1 - x0; const dy = y1 - y0; const dz = z1 - z0;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 2.5) return;
  const len = Math.min(4.2, dist * 0.45);
  const ux = dx / dist; const uy = dy / dist; const uz = dz / dist;
  const start = len * 0.5 + 0.9;
  fx.add.emit({
    x: x0 + ux * start, y: y0 + uy * start, z: z0 + uz * start, vx: ux * speed, vy: uy * speed, vz: uz * speed,
    life: Math.max(0.03, (dist - start - len * 0.5) / speed), size: 0.045, frame: FRAME.STREAK, mode: 1, len, r, g, b, fadeK: 8,
  });
}

// Fogonazo de un arma en el mundo (enemigos).
export function muzzleWorld(fx, x, y, z, dx, dy, dz) {
  fx.add.emit({ x: x + dx * 0.15, y: y + dy * 0.15, z: z + dz * 0.15, life: 0.05, size: rand(0.4, 0.6), rot: rand(TAU), frame: FRAME.FLASH, r: 5, g: 3.2, b: 1.3 });
  fx.add.emit({ x, y, z, life: 0.06, size: 1.1, frame: FRAME.GLOW, r: 1.0, g: 0.6, b: 0.22 });
  fx.flash(1, x, y, z, 0xffb060, 120, 0.07);
  const c = fx.lit(x, y, z, 0.7, 0.7, 0.72, 3);
  fx.alpha.emit({ x: x + dx * 0.3, y: y + dy * 0.3, z: z + dz * 0.3, vx: dx * 1.5, vy: 0.4, vz: dz * 1.5, life: 0.9, size: 0.15, sizeEnd: 0.7, rot: rand(TAU), frame: FRAME.SMOKE_B, r: c[0], g: c[1], b: c[2], alpha: 0.22, drag: 2.5, fadeIn: 0.1 });
}

export function explosion(fx, x, y, z, scale = 1) {
  const A = fx.add; const B = fx.alpha;
  A.emit({ x, y: y + 0.6, z, life: 0.14, size: 3 * scale, sizeEnd: 8 * scale, frame: FRAME.GLOW, r: 7, g: 3.8, b: 1.4 });
  A.emit({ x, y: 0.06, z, life: 0.4, size: 1, sizeEnd: 12 * scale, frame: FRAME.RING, mode: 2, r: 3, g: 1.8, b: 0.8, alpha: 0.6 });
  for (let i = 0; i < 14; i++) {
    scatter(0, 1, 0, 1.0, rand(1.5, 6) * scale, _v);
    A.emit({
      x: x + rand(-0.4, 0.4), y: y + rand(0.2, 0.9), z: z + rand(-0.4, 0.4), vx: _v[0], vy: Math.abs(_v[1]) * 0.9, vz: _v[2],
      life: rand(0.35, 0.75), size: rand(0.9, 1.5) * scale, sizeEnd: rand(2.4, 3.6) * scale, rot: rand(TAU), rotV: rand(-2, 2),
      frame: i % 2 ? FRAME.SMOKE_A : FRAME.SMOKE_B, r: 4.5, g: 1.7, b: 0.35, drag: 2.2, fadeK: 1.4,
    });
  }
  for (let i = 0; i < 16; i++) {
    scatter(0, 1, 0, 0.9, rand(0.8, 4) * scale, _v);
    B.emit({
      x: x + rand(-0.6, 0.6), y: y + rand(0.3, 1.2), z: z + rand(-0.6, 0.6), vx: _v[0], vy: Math.abs(_v[1]) + 1.2, vz: _v[2],
      life: rand(2.6, 5), size: rand(1, 1.6) * scale, sizeEnd: rand(4, 6.5) * scale, rot: rand(TAU), rotV: rand(-0.6, 0.6),
      frame: i % 2 ? FRAME.SMOKE_A : FRAME.SMOKE_B, r: 0.035, g: 0.032, b: 0.03, alpha: 0.82, drag: 1.3, gravity: -0.5, fadeIn: 0.08,
    });
  }
  sparks(fx, x, y + 0.5, z, 0, 1, 0, 60, 2.2);
  for (let i = 0; i < 26; i++) {
    scatter(0, 1, 0, 1, rand(2, 9) * scale, _v);
    A.emit({ x, y: y + 0.5, z, vx: _v[0], vy: Math.abs(_v[1]) + 2, vz: _v[2], life: rand(1.4, 3.2), size: rand(0.03, 0.06), frame: FRAME.GLOW, r: 8, g: 3, b: 0.6, gravity: 3.5, drag: 1.1, bounce: true, fadeK: 2 });
  }
  chunks(fx, x, y + 0.4, z, 0, 1, 0, 22, 0.1, 0.09, 0.08, 0.09);
  fx.decals.add(x, 0.012, z, 0, 1, 0, 5.2 * scale, 2);
  fx.flash(2, x, y + 1.6, z, 0xff8a3c, 1300 * scale, 0.8);
}

// Emisor continuo de fuego + humo (bidón ardiendo, restos de explosión).
export function fireEmitter(x, y, z, scale = 1, temp = false) {
  return {
    x, y, z, rate: 34, temp,
    emit(fx, e) {
      const s = scale;
      fx.add.emit({
        x: e.x + rand(-0.14, 0.14) * s, y: e.y + rand(0, 0.12), z: e.z + rand(-0.14, 0.14) * s, vx: rand(-0.25, 0.25), vy: rand(1.1, 2.3) * s, vz: rand(-0.25, 0.25),
        life: rand(0.35, 0.7), size: rand(0.3, 0.46) * s, sizeEnd: 0.08 * s, rot: rand(TAU), rotV: rand(-3, 3),
        frame: Math.random() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B, r: 6.5, g: 2.6, b: 0.5, fadeIn: 0.15, fadeK: 1.6, drag: 0.6,
      });
      if (Math.random() < 0.22) {
        fx.alpha.emit({
          x: e.x + rand(-0.1, 0.1), y: e.y + 0.7 * s, z: e.z + rand(-0.1, 0.1), vx: rand(-0.2, 0.5), vy: rand(1.1, 1.9), vz: rand(-0.2, 0.3),
          life: rand(2.5, 4.5), size: 0.35 * s, sizeEnd: rand(1.6, 2.6) * s, rot: rand(TAU), rotV: rand(-0.5, 0.5),
          frame: FRAME.SMOKE_B, r: 0.06, g: 0.05, b: 0.045, alpha: 0.5, drag: 0.5, gravity: -0.25, fadeIn: 0.2,
        });
      }
      if (Math.random() < 0.1) {
        fx.add.emit({ x: e.x, y: e.y + 0.3, z: e.z, vx: rand(-0.8, 0.8), vy: rand(1.5, 3.5), vz: rand(-0.8, 0.8), life: rand(0.8, 1.8), size: 0.03, frame: FRAME.GLOW, r: 8, g: 3, b: 0.5, gravity: -0.6, drag: 0.8, fadeK: 2 });
      }
    },
  };
}

// Emisor de vapor/humo tenue (tubos de escape, rejillas).
export function steamEmitter(x, y, z, rate = 5, dirX = 0, dirZ = 0, tint = [0.6, 0.62, 0.66]) {
  return {
    x, y, z, rate,
    emit(fx, e) {
      const c = fx.lit(e.x, e.y, e.z, tint[0], tint[1], tint[2], 3);
      fx.alpha.emit({
        x: e.x, y: e.y, z: e.z, vx: dirX + rand(-0.15, 0.15), vy: rand(0.5, 1.1), vz: dirZ + rand(-0.15, 0.15),
        life: rand(2.2, 3.8), size: 0.2, sizeEnd: rand(1.4, 2.4), rot: rand(TAU), rotV: rand(-0.4, 0.4) * randSign(),
        frame: Math.random() < 0.5 ? FRAME.SMOKE_A : FRAME.SMOKE_B, r: c[0], g: c[1], b: c[2], alpha: 0.2, drag: 0.4, gravity: -0.1, fadeIn: 0.25,
      });
    },
  };
}
