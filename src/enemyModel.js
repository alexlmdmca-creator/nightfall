// Soldado procedural: una sola SkinnedMesh por enemigo (skinning rígido, 1 draw call),
// con pose procedural: ciclo de marcha, agachado, apuntado con IK de brazos, impacto y caída.
// Hay una variante de geometría por arma en mano: fusil (la de la IA), pistola y cuchillo.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xform } from './geo.js';

// Huesos: [nombre, padre, x, y, z] en espacio de modelo (mirando a +Z, derecha = -X).
const BONES = [
  ['root', -1, 0, 0, 0], ['pelvis', 0, 0, 0.95, 0], ['spine', 1, 0, 1.08, 0], ['head', 2, 0, 1.52, 0],
  ['armL', 2, 0.21, 1.42, 0], ['foreL', 4, 0.21, 1.13, 0], ['armR', 2, -0.21, 1.42, 0], ['foreR', 6, -0.21, 1.13, 0],
  ['thighL', 1, 0.1, 0.93, 0], ['shinL', 8, 0.1, 0.5, 0], ['thighR', 1, -0.1, 0.93, 0], ['shinR', 10, -0.1, 0.5, 0],
  ['gun', 2, 0, 1.08, 0],
];
const B = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
export const ARM_UP = 0.29;
export const ARM_FORE = 0.3;

const _geos = [];
// weapon: 0 fusil, 1 pistola, 2 cuchillo.
export function soldierGeometry(weapon = 0) {
  if (_geos[weapon]) return _geos[weapon];
  const parts = [];
  const add = (g, bone, color, m) => {
    let k = g.index ? g.toNonIndexed() : g;
    if (m) k.applyMatrix4(m);
    const n = k.attributes.position.count;
    const col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); si[i * 4] = bone; sw[i * 4] = 1; }
    k.setAttribute('color', new THREE.BufferAttribute(col, 3));
    k.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    k.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    parts.push(k);
  };
  const rb = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
  const UNI = 0x3d4434; const VEST = 0x23261f; const BLACK = 0x0d0e0f; const HELM = 0x2e3328; const SKIN = 0x15171a; const GUN = 0x111214;

  add(rb(0.34, 0.22, 0.22, 0.07), B.pelvis, UNI, xform(0, 0.98, 0));
  add(rb(0.36, 0.08, 0.24, 0.02), B.pelvis, BLACK, xform(0, 1.05, 0)); // cinturón
  add(rb(0.09, 0.12, 0.06), B.pelvis, VEST, xform(-0.19, 0.97, 0.02)); // funda
  add(rb(0.4, 0.46, 0.24, 0.08), B.spine, UNI, xform(0, 1.27, 0));
  add(rb(0.43, 0.36, 0.3, 0.05), B.spine, VEST, xform(0, 1.27, 0.005)); // portaplacas
  for (const x of [-0.12, 0, 0.12]) add(rb(0.1, 0.13, 0.06, 0.015), B.spine, VEST, xform(x, 1.17, 0.165));
  add(rb(0.12, 0.07, 0.05, 0.015), B.spine, BLACK, xform(0.1, 1.36, 0.16)); // radio
  add(rb(0.3, 0.36, 0.15, 0.05), B.spine, VEST, xform(0, 1.3, -0.2)); // mochila
  for (const sx of [-1, 1]) add(new THREE.SphereGeometry(0.082, 10, 8), B.spine, UNI, xform(sx * 0.205, 1.43, 0));
  add(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), B.head, SKIN, xform(0, 1.53, 0));
  add(new THREE.SphereGeometry(0.1, 14, 10), B.head, SKIN, xform(0, 1.64, 0.01, 0, 0, 0, 0.95, 1.12, 1));
  add(new THREE.SphereGeometry(0.127, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), B.head, HELM, xform(0, 1.665, -0.005, -0.12, 0, 0, 1, 1.02, 1.1));
  add(rb(0.17, 0.05, 0.06, 0.02), B.head, BLACK, xform(0, 1.655, 0.092)); // gafas
  add(rb(0.05, 0.05, 0.09, 0.012), B.head, BLACK, xform(0.035, 1.735, 0.105, 0.5)); // soporte NVG
  for (const sx of [-1, 1]) add(rb(0.03, 0.08, 0.07, 0.012), B.head, BLACK, xform(sx * 0.115, 1.64, 0)); // cascos
  for (const [arm, fore, sx] of [[B.armL, B.foreL, 1], [B.armR, B.foreR, -1]]) {
    add(cap(0.056, 0.2), arm, UNI, xform(sx * 0.21, 1.285, 0));
    add(cap(0.047, 0.19), fore, UNI, xform(sx * 0.21, 1.0, 0));
    add(rb(0.085, 0.07, 0.09, 0.02), fore, VEST, xform(sx * 0.21, 1.1, -0.01)); // codera
    add(rb(0.075, 0.095, 0.085, 0.025), fore, BLACK, xform(sx * 0.21, 0.865, 0)); // guante
  }
  for (const [thigh, shin, sx] of [[B.thighL, B.shinL, 1], [B.thighR, B.shinR, -1]]) {
    add(cap(0.082, 0.3), thigh, UNI, xform(sx * 0.1, 0.715, 0));
    add(cap(0.062, 0.3), shin, UNI, xform(sx * 0.1, 0.3, 0));
    add(rb(0.1, 0.1, 0.07, 0.025), shin, VEST, xform(sx * 0.1, 0.5, 0.055)); // rodillera
    add(rb(0.105, 0.11, 0.27, 0.035), shin, BLACK, xform(sx * 0.1, 0.055, 0.045)); // bota
  }
  // Arma (hueso "gun"; origen del hueso = empuñadura, cañón u hoja hacia +Z).
  const G = (g, x, y, z, rx = 0, color = GUN) => add(g, B.gun, color, xform(x, 1.08 + y, z, rx));
  if (weapon === 1) {
    G(rb(0.032, 0.032, 0.2, 0.008), 0, 0.045, 0.075); // corredera
    G(rb(0.03, 0.105, 0.046, 0.01), 0, -0.02, 0.0, 0.25); // empuñadura
    G(rb(0.012, 0.03, 0.05, 0.004), 0, 0.012, 0.06); // guardamonte
  } else if (weapon === 2) {
    G(rb(0.008, 0.036, 0.21, 0.003), 0, 0.012, 0.17, 0, 0x8d9297); // hoja
    G(rb(0.016, 0.07, 0.016, 0.004), 0, 0.012, 0.055); // guarda
    G(rb(0.03, 0.036, 0.12, 0.01), 0, 0.008, -0.01); // mango
  } else {
  G(rb(0.045, 0.075, 0.3, 0.01), 0, 0.04, 0.08);
  G(rb(0.045, 0.05, 0.26, 0.012), 0, 0.045, 0.36);
  G(new THREE.CylinderGeometry(0.011, 0.011, 0.2, 8), 0, 0.045, 0.58, Math.PI / 2);
  G(rb(0.03, 0.15, 0.055, 0.008), 0, -0.07, 0.13, -0.2);
  G(rb(0.032, 0.09, 0.04, 0.01), 0, -0.04, 0, 0.3);
  G(rb(0.04, 0.09, 0.22, 0.012), 0, 0.02, -0.19);
  G(rb(0.035, 0.04, 0.06, 0.008), 0, 0.105, 0.1);
  G(new THREE.CylinderGeometry(0.016, 0.016, 0.08, 8), 0.035, 0.045, 0.42, Math.PI / 2);
  }

  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 2.2;
  _geos[weapon] = geo;
  return geo;
}

let _mat = null;
function soldierMaterial(surf) {
  if (!_mat) {
    _mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, normalMap: surf.tarp.normalMap });
    _mat.normalScale.set(0.6, 0.6);
  }
  return _mat;
}

const _down = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(); const _b = new THREE.Vector3(); const _c = new THREE.Vector3(); const _t = new THREE.Vector3();
const _q1 = new THREE.Quaternion(); const _q2 = new THREE.Quaternion();
const _grip = new THREE.Vector3(); const _hand = new THREE.Vector3(); const _gq = new THREE.Quaternion(); const _ge = new THREE.Euler();

// IK de dos huesos (hombro -> mano) en el espacio local de la columna.
function solveArm(upper, fore, sx, sy, sz, target, poleX, poleY, poleZ) {
  _a.set(target.x - sx, target.y - sy, target.z - sz);
  let d = _a.length();
  const max = ARM_UP + ARM_FORE - 0.005;
  if (d > max) { _a.multiplyScalar(max / d); d = max; }
  _a.divideScalar(d);
  const x = (ARM_UP * ARM_UP - ARM_FORE * ARM_FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, ARM_UP * ARM_UP - x * x));
  _b.set(poleX, poleY, poleZ).addScaledVector(_a, -_a.dot(_b.set(poleX, poleY, poleZ))).normalize(); // polo ⟂ al eje
  _c.copy(_a).multiplyScalar(x).addScaledVector(_b, h); // codo relativo al hombro
  _t.copy(_a).multiplyScalar(d).sub(_c).normalize();
  _c.normalize();
  upper.quaternion.setFromUnitVectors(_down, _c);
  _q1.copy(upper.quaternion).invert();
  fore.quaternion.copy(_q1).multiply(_q2.setFromUnitVectors(_down, _t));
}

export function createSoldier(surf) {
  const bones = BONES.map(([name]) => { const b = new THREE.Bone(); b.name = name; return b; });
  BONES.forEach(([, parent, x, y, z], i) => {
    if (parent < 0) bones[i].position.set(x, y, z);
    else { const p = BONES[parent]; bones[i].position.set(x - p[2], y - p[3], z - p[4]); bones[parent].add(bones[i]); }
  });
  const mesh = new THREE.SkinnedMesh(soldierGeometry(), soldierMaterial(surf));
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const bone = Object.fromEntries(bones.map((b) => [b.name, b]));
  return { mesh, bone };
}

// Aplica la pose. p: { phase, walk, crouch, aim, aimPitch, flinchX, flinchY, death, deathDir, lean }
// Opcionales (jugadores): weapon (0 fusil, 1 pistola, 2 cuchillo) y swing (avance 0-1 del tajo).
export function poseSoldier(s, p) {
  const b = s.bone;
  const sw = Math.sin(p.phase);
  const walk = p.walk;
  const cr = p.crouch;
  // Piernas: marcha + flexión al agacharse.
  const thigh = -cr * 1.15;
  const shin = cr * 2.05;
  b.thighL.rotation.x = thigh + sw * 0.62 * walk;
  b.thighR.rotation.x = thigh - sw * 0.62 * walk;
  b.shinL.rotation.x = shin + Math.max(0, -Math.cos(p.phase)) * 0.95 * walk;
  b.shinR.rotation.x = shin + Math.max(0, Math.cos(p.phase)) * 0.95 * walk;
  b.thighL.rotation.z = cr * 0.12; b.thighR.rotation.z = -cr * 0.12;
  b.pelvis.position.y = 0.95 - cr * 0.4 + Math.abs(Math.cos(p.phase)) * 0.035 * walk;
  b.pelvis.rotation.y = sw * 0.09 * walk;
  // Torso: inclinación al correr, apuntado vertical y sacudida por impacto.
  b.spine.rotation.set(0.1 * walk + cr * 0.28 - p.aimPitch * p.aim * 0.75 + p.flinchX, -sw * 0.11 * walk + p.flinchY + p.aim * -0.22, p.lean * 0.3);
  b.head.rotation.set(-cr * 0.2 - p.aimPitch * p.aim * 0.2 - 0.1 * walk, p.aim * 0.2 + (1 - p.aim) * Math.sin(p.look) * 0.5, 0);

  const a = p.aim;
  const weapon = p.weapon || 0;
  if (weapon === 1) {
    // Pistola: baja y apuntando al suelo en reposo; a dos manos y brazos extendidos al apuntar.
    _grip.set(-0.12 + a * 0.09, 0.0 + a * 0.3, 0.2 + a * 0.24);
    _ge.set((1 - a) * 0.95 + sw * 0.03 * walk, (1 - a) * 0.25 + a * 0.2, 0);
  } else if (weapon === 2) {
    // Cuchillo: adelantado en la derecha; el tajo lo lleva al frente cruzando hacia el centro.
    const cut = Math.sin(Math.PI * (p.swing || 0));
    _grip.set(-0.2 + cut * 0.17, 0.06 + a * 0.08 + cut * 0.08, 0.24 + a * 0.04 + cut * 0.24);
    _ge.set(-0.25 + (1 - a) * 0.5 - cut * 0.2, 0.25 + cut * 0.7, 0);
  } else {
    // Fusil: mezcla entre "listo" (cruzado al pecho) y "apuntando".
    _grip.set(-0.13 + a * 0.01, 0.1 + a * 0.16, 0.2 + a * 0.07);
    _ge.set((1 - a) * 0.62 + sw * 0.03 * walk, (1 - a) * 0.72 + a * 0.2, (1 - a) * 0.25);
  }
  _gq.setFromEuler(_ge);
  b.gun.position.copy(_grip);
  b.gun.quaternion.copy(_gq);
  // Manos sobre el arma: derecha en la empuñadura; izquierda en el guardamanos, de apoyo o en guardia.
  _hand.set(0, -0.03, 0).applyQuaternion(_gq).add(_grip);
  solveArm(b.armR, b.foreR, -0.21, 0.34, 0, _hand, -0.5, -1, -0.3);
  if (weapon === 2) _hand.set(0.17, 0.08 + a * 0.06, 0.26);
  else _hand.set(weapon === 1 ? 0.035 : 0, weapon === 1 ? -0.05 : 0, weapon === 1 ? 0.0 : 0.34).applyQuaternion(_gq).add(_grip);
  solveArm(b.armL, b.foreL, 0.21, 0.34, 0, _hand, 0.7, -1, 0.1);

  // Caída al morir: el cuerpo gira sobre los pies y las extremidades se sueltan.
  if (p.death > 0) {
    const d = p.death;
    const ease = 1 - (1 - d) * (1 - d);
    b.root.rotation.set(-ease * 1.5 * p.deathDir, 0, ease * p.deathTwist * 0.4);
    b.root.position.y = ease * 0.16;
    b.spine.rotation.x += -0.35 * ease * p.deathDir;
    b.head.rotation.x += -0.3 * ease * p.deathDir;
    b.thighL.rotation.x = thigh * (1 - ease) + 0.35 * ease; b.thighR.rotation.x = thigh * (1 - ease) - 0.15 * ease;
    b.shinL.rotation.x = shin * (1 - ease) + 0.5 * ease; b.shinR.rotation.x = shin * (1 - ease) + 0.15 * ease;
    b.pelvis.position.y = 0.95 - cr * 0.4 * (1 - ease);
    b.armL.rotation.z -= ease * 0.9; b.armR.rotation.z += ease * 0.7;
  } else {
    b.root.rotation.set(0, 0, 0);
    b.root.position.y = 0;
  }
}
