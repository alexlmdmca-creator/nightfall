// Superficies grandes: asfalto, hormigón (suelo y muro), bloque y chapa ondulada.
import { makeRng, TAU } from './utils.js';
import { TexSet, sharedNoise, gray, rgba, roughCol, crack, makeCanvas, blend } from './textures.js';

function dots(set, R, count, rMin, rMax, style) {
  const ctxs = [set.a, set.hh, set.o];
  const keys = ['a', 'h', 'o'];
  for (let i = 0; i < count; i++) {
    const x = R() * set.w;
    const y = R() * set.h;
    const r = R.range(rMin, rMax);
    for (let k = 0; k < 3; k++) {
      const st = style(keys[k], R);
      if (!st) continue;
      const ctx = ctxs[k];
      ctx.fillStyle = st;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }
}

// Mancha suave (gradiente radial) en un canal.
function blotch(ctx, x, y, r, color, alpha, op = 'source-over', squash = 1) {
  ctx.save();
  ctx.globalCompositeOperation = op;
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, color.replace('ALPHA', alpha));
  g.addColorStop(0.6, color.replace('ALPHA', alpha * 0.55));
  g.addColorStop(1, color.replace('ALPHA', 0));
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

// ---------- Asfalto (tile de 5 m) ----------
export function asphalt() {
  const n = sharedNoise();
  const R = makeRng(101);
  const S = 1024;
  const s = new TexSet(S).base('#2b2c2f', 0.88);
  s.noise(n.lo, 4, 0.6, 0.4, 0.3).noise(n.mid, 4, 0.35, 0.3, 0.2);

  // Árido: miles de piedrecitas de tono variable.
  dots(s, R, 24000, 0.6, 2.4, (ch, r) => {
    if (ch === 'a') { const g = r.range(36, 118); const w = r.range(-7, 9); return rgba(g + w, g, g - w, 0.9); }
    if (ch === 'h') return gray(r.range(150, 240), 0.85);
    return roughCol(r.range(0.55, 0.82), 0.7);
  });
  s.noise(n.grain, 1, 0.3, 0.5, 0.15);

  // Parches de alquitrán: más oscuros y lisos.
  for (let i = 0; i < 5; i++) {
    const x = R() * S; const y = R() * S; const r = R.range(60, 150);
    blotch(s.a, x, y, r, 'rgba(8,8,10,ALPHA)', 0.55, 'source-over', R.range(0.4, 1));
    blotch(s.o, x, y, r, 'rgba(255,120,0,ALPHA)', 0.6, 'source-over', R.range(0.4, 1));
  }
  for (let i = 0; i < 10; i++) crack(s, R, R() * S, R() * S, R.int(14, 44), R.range(1.2, 2.8));
  return s.build({ normalStrength: 3.2 });
}

// ---------- Hormigón de suelo (tile de 4 m, juntas cada 2 m) ----------
export function concreteFloor() {
  const n = sharedNoise();
  const R = makeRng(202);
  const S = 1024;
  const s = new TexSet(S).base('#7b7973', 0.9);
  s.noise(n.lo, 4, 0.3, 0.3, 0.3).noise(n.mid, 2, 0.2, 0.25, 0.25).noise(n.hi, 2, 0.16, 0.3, 0.2);

  dots(s, R, 6000, 0.5, 1.9, (ch, r) => {
    if (ch === 'a') return gray(r.range(20, 60), 0.6);
    if (ch === 'h') return gray(r.range(0, 60), 0.8);
    return roughCol(0.98, 0.5, 0, 0.6);
  });

  // Manchas de humedad y óxido.
  for (let i = 0; i < 16; i++) {
    const rust = R() < 0.25;
    blotch(s.a, R() * S, R() * S, R.range(40, 190), rust ? 'rgba(96,52,22,ALPHA)' : 'rgba(18,18,20,ALPHA)', R.range(0.18, 0.5), 'multiply', R.range(0.3, 1));
  }
  // Rodadas de neumático.
  s.a.save();
  s.a.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 5; i++) {
    s.a.strokeStyle = gray(40, R.range(0.1, 0.25));
    s.a.lineWidth = R.range(18, 34);
    s.a.beginPath();
    const y0 = R() * S;
    s.a.moveTo(-50, y0);
    s.a.bezierCurveTo(S * 0.3, y0 + R.range(-200, 200), S * 0.7, y0 + R.range(-200, 200), S + 50, y0 + R.range(-120, 120));
    s.a.stroke();
  }
  s.a.restore();

  // Juntas de dilatación.
  s.each((ctx, ch) => {
    ctx.fillStyle = ch === 'a' ? 'rgba(14,14,15,0.9)' : ch === 'h' ? gray(0, 0.95) : roughCol(1, 0.9, 0, 0.25);
    for (const p of [0, S / 2]) {
      ctx.fillRect(p - 3, 0, 6, S);
      ctx.fillRect(0, p - 3, S, 6);
    }
    ctx.fillRect(S - 3, 0, 3, S);
    ctx.fillRect(0, S - 3, S, 3);
  });
  for (let i = 0; i < 6; i++) crack(s, R, R() * S, R() * S, R.int(10, 36), R.range(1, 2.2));
  s.noise(n.grain, 1, 0.22, 0.35, 0.1);
  return s.build({ normalStrength: 2.4 });
}

// Chorretones verticales desde arriba (suciedad, agua, óxido).
function drips(ctx, R, w, h, count, color, maxLen, y0 = 0) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < count; i++) {
    const x = R() * w;
    const dw = R.range(4, 34);
    const len = R.range(0.15, 1) * maxLen;
    const g = ctx.createLinearGradient(0, y0, 0, y0 + len);
    const a = R.range(0.2, 0.65);
    g.addColorStop(0, color.replace('ALPHA', a));
    g.addColorStop(1, color.replace('ALPHA', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - dw / 2, y0, dw, len);
    if (x < dw) ctx.fillRect(x - dw / 2 + w, y0, dw, len);
  }
  ctx.restore();
}

// Suciedad baja y sombra alta: oclusión ambiental "horneada" en muros (v cubre toda la altura).
function wallAO(ctx, w, h, bottom = 0.22, top = 0.06, strength = 0.75) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  let g = ctx.createLinearGradient(0, h, 0, h * (1 - bottom));
  g.addColorStop(0, gray(255 * (1 - strength)));
  g.addColorStop(0.35, gray(255 * (1 - strength * 0.45)));
  g.addColorStop(1, gray(255));
  ctx.fillStyle = g;
  ctx.fillRect(0, h * (1 - bottom), w, h * bottom);
  g = ctx.createLinearGradient(0, 0, 0, h * top);
  g.addColorStop(0, gray(255 * (1 - strength * 0.7)));
  g.addColorStop(1, gray(255));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h * top);
  ctx.restore();
}

// ---------- Muro de hormigón encofrado (u: 4 m, v: altura completa) ----------
export function concreteWall() {
  const n = sharedNoise();
  const R = makeRng(303);
  const S = 1024;
  const s = new TexSet(S).base('#74726c', 0.88);
  s.noise(n.lo, 4, 0.3, 0.3, 0.3).noise(n.mid, 2, 0.2, 0.25, 0.2).noise(n.hi, 2, 0.14, 0.3, 0.15);

  dots(s, R, 3500, 0.5, 1.7, (ch, r) => (ch === 'a' ? gray(r.range(20, 60), 0.55) : ch === 'h' ? gray(r.range(0, 50), 0.8) : null));

  // Líneas de encofrado y agujeros de anclaje.
  s.each((ctx, ch) => {
    ctx.fillStyle = ch === 'a' ? 'rgba(20,20,22,0.55)' : ch === 'h' ? gray(30, 0.9) : roughCol(0.98, 0.5, 0, 0.5);
    for (let x = 0; x < S; x += 256) ctx.fillRect(x - 1.5, 0, 3, S);
    for (let y = 0; y < S; y += 341) ctx.fillRect(0, y - 1.5, S, 3);
    ctx.fillStyle = ch === 'a' ? 'rgba(10,10,12,0.8)' : ch === 'h' ? gray(0, 1) : roughCol(1, 0.6, 0, 0.3);
    for (let x = 0; x < S; x += 256) {
      for (let y = 0; y < S; y += 341) {
        for (const [ox, oy] of [[40, 50], [216, 50], [40, 290], [216, 290]]) {
          ctx.beginPath(); ctx.arc(x + ox, y + oy, 5, 0, TAU); ctx.fill();
        }
      }
    }
  });
  drips(s.a, R, S, S, 46, 'rgba(22,22,24,ALPHA)', 620);
  drips(s.a, R, S, S, 10, 'rgba(92,50,22,ALPHA)', 420);
  drips(s.o, R, S, S, 30, 'rgba(255,150,0,ALPHA)', 620); // los chorretones mojados brillan más
  for (let i = 0; i < 4; i++) crack(s, R, R() * S, R() * S, R.int(10, 30), R.range(1, 2));
  wallAO(s.a, S, S);
  s.noise(n.grain, 1, 0.2, 0.3, 0.1);
  return s.build({ normalStrength: 2.2 });
}

// ---------- Bloque de hormigón pintado (tile 1.6 m) ----------
export function cinderBlock() {
  const n = sharedNoise();
  const R = makeRng(404);
  const S = 512;
  const BW = 128;
  const BH = 64;
  const s = new TexSet(S).base('#8b8a84', 0.86);
  for (let row = 0; row < S / BH; row++) {
    for (let col = -1; col < S / BW; col++) {
      const x = col * BW + (row % 2 ? BW / 2 : 0);
      const t = R.range(-16, 16);
      s.a.fillStyle = rgba(139 + t, 138 + t, 132 + t);
      s.a.fillRect(x + 3, row * BH + 3, BW - 6, BH - 6);
      s.hh.fillStyle = gray(150 + R.range(-12, 12));
      s.hh.fillRect(x + 3, row * BH + 3, BW - 6, BH - 6);
      if (x + BW > S) { // envoltura horizontal
        s.a.fillRect(x - S + 3, row * BH + 3, BW - 6, BH - 6);
        s.hh.fillRect(x - S + 3, row * BH + 3, BW - 6, BH - 6);
      }
    }
  }
  s.noise(n.mid, 2, 0.45, 0.3, 0.3).noise(n.hi, 2, 0.3, 0.4, 0.2).noise(n.grain, 1, 0.25, 0.5, 0.1);
  for (let i = 0; i < 12; i++) blotch(s.a, R() * S, R() * S, R.range(30, 110), 'rgba(24,22,20,ALPHA)', R.range(0.2, 0.5), 'multiply', R.range(0.5, 2));
  return s.build({ normalStrength: 2.6 });
}

// ---------- Chapa ondulada (u: 4 m, v: altura completa). Se tiñe con material.color ----------
export function corrugated({ seed = 505, rust = 1, period = 32, metal = 0.75, rough = 0.42 } = {}) {
  const n = sharedNoise();
  const R = makeRng(seed);
  const S = 1024;
  const s = new TexSet(S).base('#c9cdd0', rough, metal);

  // Perfil de la onda como patrón 1D.
  const rib = makeCanvas(period, 1);
  const rc = rib.getContext('2d');
  const g = rc.createLinearGradient(0, 0, period, 0);
  g.addColorStop(0, gray(40)); g.addColorStop(0.22, gray(215)); g.addColorStop(0.5, gray(235));
  g.addColorStop(0.78, gray(215)); g.addColorStop(1, gray(40));
  rc.fillStyle = g; rc.fillRect(0, 0, period, 1);
  blend(s.hh, rib, 'source-over', 1);
  blend(s.a, rib, 'multiply', 0.5);
  // AO en los valles: patrón que sólo oscurece el canal R del ORM.
  const ribAO = makeCanvas(period, 1);
  const ac = ribAO.getContext('2d');
  const ga = ac.createLinearGradient(0, 0, period, 0);
  ga.addColorStop(0, rgba(110, 255, 255)); ga.addColorStop(0.3, rgba(255, 255, 255));
  ga.addColorStop(0.7, rgba(255, 255, 255)); ga.addColorStop(1, rgba(110, 255, 255));
  ac.fillStyle = ga; ac.fillRect(0, 0, period, 1);
  blend(s.o, ribAO, 'multiply', 1);

  s.noise(n.lo, 4, 0.5, 0.12, 0.45).noise(n.mid, 3, 0.3, 0.06, 0.35);

  // Solapes de chapa con tornillos.
  for (let y = 256; y < S; y += 256) {
    s.each((ctx, ch) => {
      ctx.fillStyle = ch === 'a' ? 'rgba(15,15,18,0.5)' : ch === 'h' ? gray(0, 0.6) : roughCol(0.9, 0.5, 0.2, 0.5);
      ctx.fillRect(0, y - 2, S, 4);
      ctx.fillStyle = ch === 'a' ? 'rgba(60,60,64,0.9)' : ch === 'h' ? gray(255, 1) : roughCol(0.5, 0.9, 1);
      for (let x = period / 2; x < S; x += period * 2) { ctx.beginPath(); ctx.arc(x, y - 8, 2.6, 0, TAU); ctx.fill(); }
    });
  }
  // Óxido: chorretones desde solapes y manchas.
  if (rust > 0) {
    for (let y = 0; y < S; y += 256) drips(s.a, R, S, S, Math.round(14 * rust), 'rgba(110,52,20,ALPHA)', 240, y);
    s.o.save(); s.o.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26 * rust; i++) {
      const x = R() * S; const y = R() * S; const r = R.range(10, 70);
      blotch(s.a, x, y, r, 'rgba(96,44,16,ALPHA)', R.range(0.3, 0.75), 'multiply', R.range(0.6, 2.4));
      blotch(s.o, x, y, r, 'rgba(255,240,20,ALPHA)', 0.7, 'source-over', R.range(0.6, 2.4));
    }
    s.o.restore();
  }
  drips(s.a, R, S, S, 34, 'rgba(26,26,30,ALPHA)', 560);
  wallAO(s.a, S, S, 0.16, 0.05, 0.7);
  s.noise(n.grain, 1, 0.14, 0.1, 0.08);
  return s.build({ normalStrength: 3.0 });
}
