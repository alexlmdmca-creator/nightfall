// Props reutilizables: farolas, vallas, barreras, sacos terreros, cajas, bidones, palés, neumáticos y conos.
import * as THREE from 'three';
import { boxUV, cylUV, xform, instanced } from '../geo.js';
import { makeCanvas, tex } from '../textures.js';
import { wetPatch } from '../materials.js';

const TAU = Math.PI * 2;

// ---------- Farola de brazo ----------
export function lampPost(ctx, x, z, dirX, dirZ, o = {}) {
  const { color = 0xffa040, intensity = 620, h = 7.6, shadow = false, flicker = 0, arm = 1.7, range = 27, coneK = 0.3 } = o;
  const M = ctx.M;
  const yaw = Math.atan2(dirX, dirZ);
  ctx.box(M.concrete, x, 0, z, 0.55, 0.3, 0.55, { tile: 1.5 });
  ctx.cyl(M.darkSteel, x, 0.3, z, 0.1, h - 0.3, { rTop: 0.065, seg: 10 });
  ctx.add(boxUV(0.07, 0.07, arm + 0.1, 1), M.darkSteel, xform(x + (dirX * arm) / 2, h - 0.08, z + (dirZ * arm) / 2, -0.09, yaw, 0));
  const hx = x + dirX * arm; const hz = z + dirZ * arm;
  ctx.add(boxUV(0.34, 0.11, 0.86, 1), M.darkSteel, xform(hx, h + 0.02, hz, 0, yaw, 0));
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.7), new THREE.MeshBasicMaterial());
  bulb.material.color.set(color).multiplyScalar(26);
  bulb.position.set(hx, h - 0.045, hz);
  bulb.rotation.y = yaw;
  ctx.group.add(bulb);
  return ctx.lamp({
    x: hx, y: h - 0.1, z: hz, color, intensity, type: 'spot', range, angle: 1.02, penumbra: 0.7, shadow,
    cone: { radius: 6.2, length: h - 0.1, intensity: coneK, edge: 1.5, fall: 1.25 }, flareSize: 2.6, bulb, flicker, strength: 1,
  });
}

// ---------- Valla de simple torsión ----------
let _fenceMat = null;
function fenceMaterial() {
  if (_fenceMat) return _fenceMat;
  const S = 128;
  const c = makeCanvas(S);
  const g = c.getContext('2d');
  g.strokeStyle = '#9aa0a6'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = -S; i <= S * 2; i += S / 2) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke();
    g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke();
  }
  const t = tex(c, { srgb: true });
  _fenceMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, side: THREE.DoubleSide, metalness: 0.85, roughness: 0.4, depthWrite: false });
  return _fenceMat;
}

export function fence(ctx, x0, z0, x1, z1, h = 2.7, o = {}) {
  const M = ctx.M;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const yaw = Math.atan2(-(z1 - z0), x1 - x0);
  const cx = (x0 + x1) / 2; const cz = (z0 + z1) / 2;
  const plane = new THREE.PlaneGeometry(len, h - 0.1);
  const uv = plane.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (len / 0.42), uv.getY(i) * ((h - 0.1) / 0.42));
  ctx.add(plane, fenceMaterial(), xform(cx, (h - 0.1) / 2 + 0.08, cz, 0, yaw, 0), 2);
  const n = Math.max(1, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const px = x0 + ((x1 - x0) * i) / n; const pz = z0 + ((z1 - z0) * i) / n;
    ctx.instance('post', xform(px, (h + 0.35) / 2, pz, 0, 0, 0, 1, h + 0.35, 1));
    ctx.add(boxUV(0.03, 0.03, 0.5, 1), M.steel, xform(px, h + 0.42, pz, 0.7, yaw + Math.PI / 2, 0), 0); // brazo del alambre de espino
    ctx.col.addCyl(px, pz, 0.06, 0, h, 'metal');
  }
  ctx.add(boxUV(len, 0.045, 0.045, 1), M.steel, xform(cx, h, cz, 0, yaw, 0), 1);
  ctx.add(boxUV(len, 0.045, 0.045, 1), M.steel, xform(cx, 0.12, cz, 0, yaw, 0), 0);
  const ox = Math.sin(yaw) * 0.17; const oz = Math.cos(yaw) * 0.17;
  for (const k of [0.3, 0.44, 0.58]) ctx.add(boxUV(len, 0.012, 0.012, 1), M.darkSteel, xform(cx + ox * k * 2.2, h + k, cz + oz * k * 2.2, 0, yaw, 0), 0);
  // Se puede ver y disparar a través; bloquea el paso.
  if (o.collide !== false) ctx.col.addBox(cx, cz, len, 0.14, 0, h + 0.5, yaw, 'metal', { bullets: false, sight: false, walkable: false });
}

// ---------- Barrera New Jersey ----------
export function jersey(ctx, x, z, yaw = 0) {
  ctx.instance('jersey', xform(x, 0, z, 0, yaw, 0));
  ctx.collider(x, z, 3, 0.56, 0, 0.82, yaw, 'concrete');
  ctx.coverAround(x, z, 3, 0.56, yaw, true);
}

// ---------- Muro de sacos terreros ----------
export function sandbags(ctx, x, z, yaw, len = 3, rows = 3) {
  const R = ctx.rng;
  const cos = Math.cos(yaw); const sin = Math.sin(yaw);
  const bagL = 0.66;
  for (let r = 0; r < rows; r++) {
    const n = Math.floor(len / bagL) - (r % 2);
    const start = -((n - 1) * bagL) / 2;
    for (let i = 0; i < n; i++) {
      for (const depth of r < rows - 1 ? [-0.17, 0.17] : [0]) {
        const lx = start + i * bagL + R.range(-0.03, 0.03); const lz = depth + R.range(-0.02, 0.02);
        ctx.instance('sandbag', xform(x + lx * cos + lz * sin, 0.11 + r * 0.2, z - lx * sin + lz * cos, R.range(-0.06, 0.06), yaw + R.range(-0.1, 0.1), R.range(-0.05, 0.05), 0.66, 0.24, 0.36));
      }
    }
  }
  ctx.collider(x, z, len, 0.7, 0, rows * 0.2 + 0.04, yaw, 'sand');
  ctx.coverAround(x, z, len, 0.7, yaw, true);
}

// ---------- Cajas de madera ----------
export function crate(ctx, x, z, s = 1.1, yaw = 0, y0 = 0, alt = false, cover = true) {
  const M = ctx.M;
  ctx.box(alt ? M.wood2 : M.wood, x, y0, z, s, s, s, { yaw, tile: s, surface: 'wood', cover: cover && y0 === 0 ? (s < 1.3 ? 'low' : 'tall') : null });
}

export function crateStack(ctx, x, z, yaw = 0, kind = 0) {
  const R = ctx.rng;
  const cos = Math.cos(yaw); const sin = Math.sin(yaw);
  const at = (lx, lz) => [x + lx * cos + lz * sin, z - lx * sin + lz * cos];
  const layouts = [
    [[0, 0, 1.2, 0], [1.3, 0.1, 1.1, 0], [0.55, 0, 1.0, 1.2]],
    [[0, 0, 1.4, 0], [0, 0, 1.1, 1.4], [1.5, -0.2, 1.0, 0], [-1.4, 0.2, 1.2, 0]],
    [[0, 0, 1.0, 0], [1.1, 0, 1.0, 0], [0, 1.1, 1.0, 0], [0.5, 0.5, 1.0, 1.0]],
  ];
  layouts[kind % layouts.length].forEach(([lx, lz, s, y0], i) => {
    const [px, pz] = at(lx, lz);
    crate(ctx, px, pz, s, yaw + R.range(-0.14, 0.14), y0, i % 2 === 1, y0 === 0);
  });
}

// ---------- Bidones ----------
export const DRUM_R = 0.3;
export const DRUM_H = 0.9;
const DRUM_COLORS = [0x2f4f78, 0x7a4630, 0x3e4a36, 0x8a8f94, 0x24303c];

export function barrel(ctx, x, z, color = null, y0 = 0, lying = false) {
  const c = color ?? ctx.rng.pick(DRUM_COLORS);
  if (lying) {
    const yaw = ctx.rng.range(0, TAU);
    ctx.instance('drum', xform(x, DRUM_R, z, 0, yaw, Math.PI / 2), c);
    ctx.collider(x, z, DRUM_H, DRUM_R * 2, 0, DRUM_R * 2, yaw, 'metal');
  } else {
    ctx.instance('drum', xform(x, y0 + DRUM_H / 2, z, 0, ctx.rng.range(0, TAU), 0), c);
    ctx.col.addCyl(x, z, DRUM_R, y0, y0 + DRUM_H, 'metal');
    if (y0 === 0) ctx.footprints.push({ type: 'cyl', x, z, r: DRUM_R });
  }
}

let _drumGeo = null;
export function drumGeometry() {
  if (_drumGeo) return _drumGeo;
  // Perfil torneado con aros de refuerzo y rebordes.
  const pts = [];
  const H = DRUM_H; const R = DRUM_R;
  const prof = [[0, 0], [R - 0.012, 0], [R + 0.006, 0.012], [R + 0.006, 0.03], [R - 0.004, 0.045], [R - 0.004, 0.29], [R + 0.008, 0.305], [R + 0.008, 0.32], [R - 0.004, 0.335],
    [R - 0.004, 0.565], [R + 0.008, 0.58], [R + 0.008, 0.595], [R - 0.004, 0.61], [R - 0.004, H - 0.045], [R + 0.006, H - 0.03], [R + 0.006, H - 0.012], [R - 0.012, H], [R - 0.02, H - 0.018], [0, H - 0.018]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y - H / 2));
  _drumGeo = new THREE.LatheGeometry(pts, 22);
  // UV: u alrededor, v a lo alto.
  const uv = _drumGeo.attributes.uv; const pos = _drumGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setY(i, pos.getY(i) / H + 0.5);
  return _drumGeo;
}

// Bidón explosivo: malla individual (se puede destruir).
export function explosiveBarrel(ctx, x, z) {
  const mesh = new THREE.Mesh(drumGeometry(), ctx.M.drumHaz);
  mesh.position.set(x, DRUM_H / 2, z);
  mesh.rotation.y = ctx.rng.range(0, TAU);
  mesh.castShadow = mesh.receiveShadow = true;
  ctx.group.add(mesh);
  const b = { x, z, mesh, alive: true, hp: 60, collider: null };
  b.collider = ctx.col.addCyl(x, z, DRUM_R, 0, DRUM_H, 'metal', { ref: b });
  ctx.footprints.push({ type: 'cyl', x, z, r: DRUM_R });
  ctx.barrels.push(b);
  return b;
}

// ---------- Palés, neumáticos y conos ----------
export function pallet(ctx, x, z, yaw = 0, count = 1) {
  for (let i = 0; i < count; i++) ctx.instance('pallet', xform(x, i * 0.15, z, 0, yaw + ctx.rng.range(-0.08, 0.08), 0));
  ctx.collider(x, z, 1.2, 1.0, 0, count * 0.15, yaw, 'wood');
}

export function tires(ctx, x, z, n = 3) {
  for (let i = 0; i < n; i++) ctx.instance('tire', xform(x + ctx.rng.range(-0.04, 0.04), 0.15 + i * 0.29, z + ctx.rng.range(-0.04, 0.04), 0, ctx.rng.range(0, TAU), 0));
  ctx.col.addCyl(x, z, 0.52, 0, n * 0.29 + 0.02, 'rubber');
  ctx.footprints.push({ type: 'cyl', x, z, r: 0.52 });
  if (n >= 3) ctx.coverAround(x, z, 1, 1, 0, n < 5);
}

export function trafficCone(ctx, x, z, fallen = false) {
  ctx.instance('cone', xform(x, fallen ? 0.14 : 0, z, fallen ? Math.PI / 2 - 0.1 : 0, ctx.rng.range(0, TAU), 0));
}

// Crea las InstancedMesh de todo lo acumulado con ctx.instance().
export function buildInstances(ctx) {
  const M = ctx.M;
  const defs = {
    post: () => [cylUV(0.04, 0.04, 1, 8), M.steel, 1],
    drum: () => [drumGeometry(), M.drum, 3],
    sandbag: () => [new THREE.SphereGeometry(0.5, 12, 8), M.sandbag, 3],
    tire: () => { const g = new THREE.TorusGeometry(0.36, 0.15, 10, 22); g.rotateX(Math.PI / 2); return [g, M.rubber, 3]; },
    cone: () => {
      const g = new THREE.LatheGeometry([[0.2, 0], [0.2, 0.03], [0.13, 0.035], [0.035, 0.5], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 14);
      return [g, wetPatch(new THREE.MeshStandardMaterial({ color: 0xd1470f, roughness: 0.55 })), 3];
    },
    jersey: () => {
      const s = new THREE.Shape();
      [[-0.28, 0], [0.28, 0], [0.28, 0.08], [0.16, 0.26], [0.09, 0.82], [-0.09, 0.82], [-0.16, 0.26], [-0.28, 0.08]].forEach(([px, py], i) => (i ? s.lineTo(px, py) : s.moveTo(px, py)));
      const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 1 });
      g.translate(0, 0, -1.5); g.rotateY(Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
      return [g, M.concrete, 3];
    },
    pallet: () => {
      const parts = [];
      for (let i = 0; i < 5; i++) parts.push(boxUV(1.2, 0.022, 0.14, 1).applyMatrix4(xform(0, 0.139, -0.43 + i * 0.215)));
      for (const zz of [-0.43, 0, 0.43]) parts.push(boxUV(1.2, 0.022, 0.1, 1).applyMatrix4(xform(0, 0.011, zz)));
      for (const xx of [-0.55, 0, 0.55]) parts.push(boxUV(0.1, 0.105, 1.0, 1).applyMatrix4(xform(xx, 0.075, 0)));
      return [mergeBoxes(parts), M.woodDry, 3];
    },
  };
  for (const [key, { matrices, colors }] of ctx.inst) {
    if (!defs[key]) continue;
    const [geo, mat, flags] = defs[key]();
    ctx.group.add(instanced(geo, mat, matrices, colors.length ? colors : null, flags));
  }
}

function mergeBoxes(parts) {
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3); const nor = new Float32Array(total * 3); const uv = new Float32Array(total * 2);
  const idx = [];
  let off = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); uv.set(g.attributes.uv.array, off * 2);
    for (const i of g.index.array) idx.push(i + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
