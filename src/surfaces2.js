// Superficies de props: metal pintado, bidones, madera, saco terrero, neumático, lona y cristal mojado.
import { makeRng, TAU } from './utils.js';
import { TexSet, sharedNoise, gray, rgba, roughCol, makeCanvas, heightToNormal, tex, blend } from './textures.js';

function scratches(s, R, count, maxLen) {
  for (let i = 0; i < count; i++) {
    const x = R() * s.w; const y = R() * s.h;
    const a = R.range(0, TAU); const len = R.range(6, maxLen);
    const bend = R.range(-0.3, 0.3);
    s.each((ctx, ch) => {
      ctx.strokeStyle = ch === 'a' ? gray(R.range(150, 230), R.range(0.25, 0.7)) : ch === 'h' ? gray(60, 0.5) : roughCol(0.28, 0.8, 1);
      ctx.lineWidth = R.range(0.5, 1.5);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    });
  }
}

// Desconchones con halo de óxido.
function chips(s, R, count, rMax) {
  for (let i = 0; i < count; i++) {
    const x = R() * s.w; const y = R() * s.h; const r = R.range(1.5, rMax);
    const pts = [];
    const nP = R.int(5, 9);
    for (let k = 0; k < nP; k++) { const a = (k / nP) * TAU; const rr = r * R.range(0.5, 1.2); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); }
    const path = (ctx, grow) => {
      ctx.beginPath();
      pts.forEach(([px, py], k) => { const gx = x + (px - x) * grow; const gy = y + (py - y) * grow; k ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy); });
      ctx.closePath();
    };
    s.a.fillStyle = 'rgba(105,54,22,0.55)'; path(s.a, 1.7); s.a.fill();
    s.a.fillStyle = rgba(R.range(40, 70), R.range(26, 40), 18, 0.95); path(s.a, 1); s.a.fill();
    s.hh.fillStyle = gray(70, 0.9); path(s.hh, 1); s.hh.fill();
    s.o.fillStyle = roughCol(0.95, 0.95, 0.1); path(s.o, 1.5); s.o.fill();
  }
}

// ---------- Metal pintado genérico (se tiñe con material.color) ----------
export function metalPaint({ seed = 606, wear = 1, rough = 0.48, metal = 0.25 } = {}) {
  const n = sharedNoise();
  const R = makeRng(seed);
  const S = 512;
  const s = new TexSet(S).base('#c8c8c8', rough, metal);
  s.noise(n.lo, 2, 0.55, 0.1, 0.5).noise(n.mid, 2, 0.3, 0.08, 0.35).noise(n.hi, 1, 0.12, 0.1, 0.2);
  scratches(s, R, 90 * wear, 90);
  chips(s, R, 46 * wear, 9);
  blend(s.a, n.lo, 'multiply', 0.35, 1);
  s.noise(n.grain, 1, 0.1, 0.12, 0.08);
  return s.build({ normalStrength: 1.6 });
}

// ---------- Bidón de 200 L (u: perímetro, v: altura) ----------
export function drum(hazard = false) {
  const n = sharedNoise();
  const R = makeRng(hazard ? 717 : 707);
  const S = 512;
  const s = new TexSet(S).base('#c4c4c4', 0.5, 0.35);
  // Aros de refuerzo.
  for (const v of [0.02, 0.34, 0.66, 0.98]) {
    const y = v * S;
    const g = s.hh.createLinearGradient(0, y - 12, 0, y + 12);
    g.addColorStop(0, gray(128)); g.addColorStop(0.5, gray(255)); g.addColorStop(1, gray(128));
    s.hh.fillStyle = g; s.hh.fillRect(0, y - 12, S, 24);
    s.a.fillStyle = 'rgba(0,0,0,0.22)'; s.a.fillRect(0, y + 8, S, 7);
  }
  s.noise(n.lo, 2, 0.55, 0.14, 0.5).noise(n.mid, 2, 0.35, 0.08, 0.3);
  scratches(s, R, 70, 110);
  chips(s, R, 60, 12);
  // Óxido acumulado arriba y abajo.
  s.a.save(); s.a.globalCompositeOperation = 'multiply';
  for (const [y0, y1] of [[0, 70], [S, S - 90]]) {
    const g = s.a.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(92,46,18,0.9)'); g.addColorStop(1, 'rgba(92,46,18,0)');
    s.a.fillStyle = g; s.a.fillRect(0, Math.min(y0, y1), S, Math.abs(y1 - y0));
  }
  s.a.restore();
  if (hazard) {
    // Rombo de peligro inflamable + franja.
    for (const cx of [128, 384]) {
      s.a.save();
      s.a.translate(cx, 250); s.a.rotate(Math.PI / 4);
      s.a.fillStyle = '#e8e4d8'; s.a.fillRect(-52, -52, 104, 104);
      s.a.strokeStyle = '#101010'; s.a.lineWidth = 5; s.a.strokeRect(-46, -46, 92, 92);
      s.a.rotate(-Math.PI / 4);
      s.a.fillStyle = '#101010';
      s.a.beginPath(); // llama estilizada
      s.a.moveTo(0, -34); s.a.bezierCurveTo(26, -8, 22, 22, 0, 26); s.a.bezierCurveTo(-22, 22, -26, -2, -8, -12);
      s.a.bezierCurveTo(-6, -2, 2, -4, 0, -34); s.a.fill();
      s.a.font = 'bold 15px Arial'; s.a.textAlign = 'center'; s.a.fillText('INFLAMABLE', 0, 46);
      s.a.restore();
    }
    blend(s.a, n.mid, 'multiply', 0.3, 2);
  }
  s.noise(n.grain, 1, 0.1, 0.1, 0.08);
  return s.build({ normalStrength: 2.4 });
}

// ---------- Caja de madera (una cara completa) ----------
export function woodCrate(label = 'MUNICIÓN 5.56', seed = 808) {
  const n = sharedNoise();
  const R = makeRng(seed);
  const S = 512;
  const s = new TexSet(S).base('#5e4a33', 0.82);
  const plank = (x, y, w, h, vertical) => {
    const t = R.range(-14, 14);
    s.a.fillStyle = rgba(94 + t, 74 + t * 0.8, 51 + t * 0.6); s.a.fillRect(x, y, w, h);
    s.hh.fillStyle = gray(140 + R.range(-10, 10)); s.hh.fillRect(x, y, w, h);
    // Veta.
    const lines = Math.round((vertical ? w : h) / 2.2);
    for (let i = 0; i < lines; i++) {
      const dark = R() < 0.6;
      const st = dark ? rgba(30, 20, 10, R.range(0.1, 0.4)) : rgba(190, 160, 120, R.range(0.05, 0.18));
      const off = R() * (vertical ? w : h);
      const wob = R.range(-3, 3);
      for (const [ctx, style] of [[s.a, st], [s.hh, gray(dark ? 60 : 200, 0.25)]]) {
        ctx.strokeStyle = style; ctx.lineWidth = R.range(0.5, 1.6);
        ctx.beginPath();
        if (vertical) { ctx.moveTo(x + off, y); ctx.quadraticCurveTo(x + off + wob, y + h / 2, x + off, y + h); }
        else { ctx.moveTo(x, y + off); ctx.quadraticCurveTo(x + w / 2, y + off + wob, x + w, y + off); }
        ctx.stroke();
      }
    }
    // Borde hundido entre tablas y clavos.
    for (const [ctx, style] of [[s.a, 'rgba(8,6,4,0.85)'], [s.hh, gray(0)], [s.o, roughCol(1, 1, 0, 0.35)]]) {
      ctx.strokeStyle = style; ctx.lineWidth = 3; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    const nails = vertical ? [[x + w / 2, y + 12], [x + w / 2, y + h - 12]] : [[x + 12, y + h / 2], [x + w - 12, y + h / 2]];
    for (const [nx, ny] of nails) {
      s.a.fillStyle = '#1c1a18'; s.a.beginPath(); s.a.arc(nx, ny, 2.6, 0, TAU); s.a.fill();
      s.o.fillStyle = roughCol(0.4, 1, 1); s.o.beginPath(); s.o.arc(nx, ny, 2.6, 0, TAU); s.o.fill();
    }
  };
  for (let i = 0; i < 6; i++) plank(0, (i * S) / 6, S, S / 6, false);
  // Marco y travesaño (sobresalen).
  const F = 62;
  s.hh.fillStyle = gray(60, 0.55); s.hh.fillRect(F - 6, F - 6, S - 2 * F + 12, S - 2 * F + 12); // sombra interior
  plank(0, 0, S, F, false); plank(0, S - F, S, F, false); plank(0, F, F, S - 2 * F, true); plank(S - F, F, F, S - 2 * F, true);
  for (const c of [s.hh]) { c.globalCompositeOperation = 'lighter'; c.fillStyle = gray(70); c.fillRect(0, 0, S, F); c.fillRect(0, S - F, S, F); c.fillRect(0, F, F, S - 2 * F); c.fillRect(S - F, F, F, S - 2 * F); c.globalCompositeOperation = 'source-over'; }
  // Plantilla pintada.
  s.a.save();
  s.a.fillStyle = 'rgba(12,12,10,0.8)'; s.a.textAlign = 'center';
  s.a.font = 'bold 44px "Arial Narrow", Arial'; s.a.fillText(label, S / 2, S / 2 - 6);
  s.a.font = 'bold 22px Arial'; s.a.fillText(`LOT ${R.int(1000, 9999)} · ${R.int(12, 48)} KG`, S / 2, S / 2 + 30);
  s.a.restore();
  s.noise(n.lo, 2, 0.5, 0.1, 0.3).noise(n.mid, 2, 0.3, 0.1, 0.2).noise(n.grain, 1, 0.2, 0.25, 0.1);
  blend(s.a, n.lo, 'multiply', 0.4, 2);
  return s.build({ normalStrength: 3 });
}

// ---------- Saco terrero (arpillera) ----------
export function sandbag() {
  const n = sharedNoise();
  const S = 256;
  const s = new TexSet(S).base('#6a5f47', 0.96);
  s.each((ctx, ch) => {
    for (let i = 0; i < S; i += 4) {
      ctx.fillStyle = ch === 'a' ? 'rgba(20,16,8,0.35)' : ch === 'h' ? gray(40, 0.7) : null;
      if (!ctx.fillStyle || ch === 'o') continue;
      ctx.fillRect(i, 0, 1.5, S); ctx.fillRect(0, i, S, 1.5);
    }
  });
  s.noise(n.lo, 1, 0.6, 0.5, 0.2).noise(n.mid, 1, 0.4, 0.3, 0.1).noise(n.grain, 1, 0.3, 0.4, 0);
  blend(s.a, n.lo, 'multiply', 0.5, 1);
  return s.build({ normalStrength: 2.5 });
}

// ---------- Banda de rodadura de neumático ----------
export function tire() {
  const S = 256;
  const s = new TexSet(S).base('#141414', 0.92);
  s.hh.fillStyle = gray(60); s.hh.fillRect(0, 0, S, S);
  s.hh.fillStyle = gray(230);
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 64) {
      const off = (y / 32) % 2 ? 32 : 0;
      s.hh.save(); s.hh.translate(x + off + 26, y + 16); s.hh.transform(1, 0, 0.5, 1, 0, 0);
      s.hh.fillRect(-22, -11, 44, 22); s.hh.restore();
    }
  }
  s.noise(sharedNoise().grain, 1, 0.2, 0.2, 0.1);
  return s.build({ normalStrength: 4 });
}

// ---------- Lona militar ----------
export function tarp() {
  const n = sharedNoise();
  const S = 512;
  const s = new TexSet(S).base('#4a5238', 0.7);
  s.noise(n.lo, 2, 0.6, 0.9, 0.4).noise(n.mid, 2, 0.35, 0.5, 0.3).noise(n.grain, 1, 0.25, 0.2, 0.1);
  blend(s.a, n.lo, 'multiply', 0.45, 2);
  s.each((ctx, ch) => { // costuras
    ctx.fillStyle = ch === 'a' ? 'rgba(10,12,6,0.6)' : ch === 'h' ? gray(20, 0.8) : null;
    if (ch === 'o') return;
    for (let x = 0; x < S; x += 128) ctx.fillRect(x, 0, 3, S);
  });
  return s.build({ normalStrength: 2.2 });
}

// ---------- Normales de gotas sobre cristal ----------
export function glassDrops() {
  const R = makeRng(909);
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = gray(90); ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const x = R() * S; const y = R() * S; const r = R.range(1.5, 6.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, gray(255, 0.95)); g.addColorStop(1, gray(90, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (R() < 0.3) { ctx.fillStyle = gray(190, 0.35); ctx.fillRect(x - r * 0.4, y, r * 0.8, R.range(10, 60)); } // reguero
  }
  return tex(heightToNormal(c, 2.5), {});
}
