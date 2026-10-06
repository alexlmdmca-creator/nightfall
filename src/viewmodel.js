// Modelos procedurales de las armas en primera persona: carabina con mira holográfica y linterna,
// pistola compacta y cuchillo de combate, cada uno con sus brazos.
// Unidades reales en metros; el grupo raíz se escala y cuelga de la cámara. -Z = hacia delante.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { xform } from './geo.js';

export const SIGHT_Y = 0.097; // altura del eje de la mira del fusil sobre el origen del arma
export const PISTOL_SIGHT_Y = 0.049; // ídem para las miras de la pistola
export const MUZZLE = new THREE.Vector3(0, 0.032, -0.585);
export const EJECT = new THREE.Vector3(0.03, 0.04, -0.03);

const _y = new THREE.Vector3(0, 1, 0);

function between(p0, p1, r0, r1, seg = 12) {
  const a = new THREE.Vector3(...p0); const b = new THREE.Vector3(...p1);
  const dir = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, dir.length(), seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(_y, dir.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// Materiales compartidos por los tres modelos.
let _mat = null;
function materials(surf) {
  if (_mat) return _mat;
  const drops = surf.glassDrops;
  const mk = (color, rough, metal, dropK = 0.5) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, normalMap: drops });
    m.normalScale.set(dropK, dropK);
    return m;
  };
  _mat = {
    black: mk(0x2a2c30, 0.4, 0.7),
    dark: mk(0x0d0e10, 0.55, 0.3, 0.2),
    fde: mk(0x7d6c4e, 0.58, 0.05),
    steel: mk(0x9a9da0, 0.22, 1, 0.3),
    glove: mk(0x1d2024, 0.8, 0, 0.25),
    pad: mk(0x23262a, 0.55, 0.1, 0.3),
    sleeve: new THREE.MeshStandardMaterial({ color: 0x4d5440, roughness: 0.9, map: surf.tarp.map, normalMap: surf.tarp.normalMap }),
  };
  return _mat;
}

// Utilidades de construcción: acumulan geometría por material y la fusionan en una malla por material.
function kit(surf) {
  const mat = materials(surf);
  const lists = new Map();
  const put = (m, g, mtx) => { if (mtx) g.applyMatrix4(mtx); const k = g.index ? g.toNonIndexed() : g; if (!lists.has(m)) lists.set(m, []); lists.get(m).push(k); };
  const rbox = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, r = 0.004) => put(m, new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)), xform(x, y, z, rx, ry, rz));
  const box = (m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => put(m, new THREE.BoxGeometry(w, h, d), xform(x, y, z, rx, ry, rz));
  const cylZ = (m, r0, r1, len, x, y, z, seg = 16) => put(m, new THREE.CylinderGeometry(r1, r0, len, seg), xform(x, y, z, Math.PI / 2, 0, 0));
  const flush = (parent) => {
    for (const [m, list] of lists) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), m);
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    lists.clear();
  };
  return { mat, put, rbox, box, cylZ, flush };
}

const finish = (root) => root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });

// ---------- Fusil ----------
export function buildViewModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel';
  const { mat, put, rbox, box, cylZ, flush } = kit(surf);

  // --- Cajón de mecanismos ---
  rbox(mat.black, 0.044, 0.048, 0.205, 0, 0.034, -0.015);
  rbox(mat.black, 0.04, 0.05, 0.15, 0, -0.012, 0);
  rbox(mat.black, 0.036, 0.062, 0.07, 0, -0.055, -0.07);
  box(mat.dark, 0.003, 0.02, 0.062, 0.0222, 0.037, -0.03); // ventana de expulsión
  cylZ(mat.black, 0.007, 0.007, 0.03, 0.026, 0.03, 0.062, 10);
  rbox(mat.black, 0.052, 0.009, 0.022, 0, 0.058, 0.088, 0, 0, 0, 0.002);
  box(mat.black, 0.008, 0.004, 0.062, 0, -0.064, 0.002);
  box(mat.steel, 0.006, 0.022, 0.006, 0, -0.05, 0.014, 0.25);
  rbox(mat.fde, 0.03, 0.1, 0.044, 0, -0.085, 0.052, 0.32, 0, 0, 0.008);
  // Culata.
  cylZ(mat.black, 0.014, 0.014, 0.19, 0, 0.03, 0.18, 14);
  rbox(mat.fde, 0.042, 0.066, 0.16, 0, 0.02, 0.245, 0, 0, 0, 0.01);
  rbox(mat.fde, 0.03, 0.03, 0.11, 0, -0.036, 0.275, -0.38, 0, 0, 0.008);
  rbox(mat.dark, 0.045, 0.132, 0.024, 0, -0.006, 0.332, 0, 0, 0, 0.008);
  // Guardamanos con ranuras, raíl y empuñadura.
  rbox(mat.fde, 0.046, 0.05, 0.27, 0, 0.032, -0.255, 0, 0, 0, 0.012);
  for (let i = 0; i < 5; i++) {
    for (const sx of [-1, 1]) box(mat.dark, 0.002, 0.012, 0.032, sx * 0.0232, 0.032, -0.15 - i * 0.048);
    box(mat.dark, 0.016, 0.002, 0.03, 0, 0.0065, -0.15 - i * 0.048);
  }
  box(mat.black, 0.022, 0.006, 0.475, 0, 0.0605, -0.152);
  for (let i = 0; i < 44; i++) box(mat.black, 0.0225, 0.0045, 0.0055, 0, 0.0655, 0.082 - i * 0.0108);
  rbox(mat.fde, 0.028, 0.072, 0.036, 0, -0.03, -0.245, -0.22, 0, 0, 0.008);
  // Cañón y freno de boca.
  cylZ(mat.black, 0.0085, 0.0085, 0.15, 0, 0.032, -0.455);
  cylZ(mat.black, 0.0118, 0.0118, 0.03, 0, 0.032, -0.4, 12);
  cylZ(mat.black, 0.0128, 0.0118, 0.062, 0, 0.032, -0.55);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) box(mat.dark, 0.004, 0.007, 0.01, sx * 0.0115, 0.032, -0.532 - i * 0.016);
  cylZ(mat.dark, 0.0058, 0.0058, 0.004, 0, 0.032, -0.5815, 12);
  // Módulo láser y linterna.
  rbox(mat.black, 0.04, 0.022, 0.07, 0, 0.0775, -0.33, 0, 0, 0, 0.004);
  cylZ(mat.black, 0.0135, 0.0125, 0.075, 0.037, 0.034, -0.345, 14);
  cylZ(mat.black, 0.0165, 0.0135, 0.02, 0.037, 0.034, -0.39, 14);
  // Mira holográfica: base, capó y montantes.
  rbox(mat.black, 0.04, 0.013, 0.075, 0, 0.0725, -0.02, 0, 0, 0, 0.003);
  for (const sx of [-1, 1]) rbox(mat.black, 0.004, 0.046, 0.05, sx * 0.023, 0.1, -0.03, 0, 0, 0, 0.0015);
  rbox(mat.black, 0.05, 0.005, 0.052, 0, 0.1245, -0.03, 0, 0, 0, 0.002);
  rbox(mat.black, 0.036, 0.012, 0.03, 0, 0.084, 0.012, 0, 0, 0, 0.003);
  flush(root);

  // Cerrojo visible por la ventana (se anima al disparar).
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.056), mat.steel);
  bolt.position.set(0.0222, 0.037, -0.03);
  root.add(bolt);

  // Cargador (se anima al recargar).
  const mag = new THREE.Group();
  mag.position.set(0, -0.085, -0.074);
  const magMesh = new THREE.Mesh(new RoundedBoxGeometry(0.025, 0.17, 0.06, 2, 0.004), mat.dark);
  magMesh.position.set(0, -0.07, 0.006);
  magMesh.rotation.x = 0.16;
  magMesh.receiveShadow = true;
  mag.add(magMesh);
  root.add(mag);

  // LEDs y lente de la linterna.
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.002, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 6, 0.4) }));
  led.position.set(0.012, 0.089, -0.296);
  root.add(led);
  const lampLens = new THREE.Mesh(new THREE.CircleGeometry(0.0135, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(14, 14, 16) }));
  lampLens.position.set(0.037, 0.034, -0.4005);
  lampLens.rotation.y = Math.PI;
  root.add(lampLens);

  // Lente con retícula colimada: se dibuja según el ángulo respecto al eje del arma.
  const lensUniforms = { uFwd: { value: new THREE.Vector3(0, 0, -1) }, uGain: { value: 1 } };
  const lens = new THREE.Mesh(
    new THREE.PlaneGeometry(0.042, 0.042),
    new THREE.ShaderMaterial({
      uniforms: lensUniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vView; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vView = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFwd; uniform float uGain; varying vec3 vView;
        void main() {
          vec3 v = normalize(vView);
          vec3 d = v - uFwd * dot(v, uFwd);
          float a = length(d);
          float ang = atan(d.y, d.x);
          float dotR = 1.0 - smoothstep(0.0006, 0.0011, a);
          float ring = 1.0 - smoothstep(0.0, 0.0013, abs(a - 0.0125));
          float ticks = (1.0 - smoothstep(0.0, 0.0011, abs(sin(ang * 2.0)) * a)) * step(0.0125, a) * step(a, 0.0165);
          float r = max(dotR, max(ring, ticks));
          vec3 col = vec3(9.0, 0.5, 0.25) * r * uGain;
          gl_FragColor = vec4(col + vec3(0.02, 0.05, 0.06), 0.1 + r * 0.9);
        }`,
    }),
  );
  lens.position.set(0, SIGHT_Y + 0.004, -0.03);
  lens.renderOrder = 30;
  root.add(lens);

  // --- Brazo derecho (fijo al arma) ---
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.052, 0.088, 0.07, 0.004, -0.086, 0.06, 0.32, 0, 0, 0.016);
  rbox(mat.glove, 0.013, 0.014, 0.055, 0.0235, -0.038, 0.016, 0.1, 0, 0, 0.005);
  rbox(mat.glove, 0.016, 0.016, 0.055, -0.026, -0.05, 0.04, 0.2, 0.2, 0, 0.006);
  rbox(mat.pad, 0.044, 0.012, 0.05, 0.02, -0.063, 0.085, 0.32, 0, -0.9, 0.004);
  put(mat.sleeve, between([0.012, -0.125, 0.09], [0.15, -0.32, 0.43], 0.034, 0.055));
  put(mat.glove, between([0.008, -0.11, 0.078], [0.026, -0.14, 0.12], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  // --- Brazo izquierdo (acompaña al cargador durante la recarga) ---
  const leftArm = new THREE.Group();
  rbox(mat.glove, 0.058, 0.078, 0.056, 0, -0.036, -0.243, -0.22, 0, 0, 0.016);
  rbox(mat.glove, 0.015, 0.05, 0.06, -0.031, 0.004, -0.235, 0, 0, 0.1, 0.006);
  rbox(mat.glove, 0.016, 0.032, 0.034, 0.03, -0.004, -0.22, 0, 0, -0.1, 0.006);
  rbox(mat.pad, 0.012, 0.046, 0.052, -0.034, -0.04, -0.243, -0.22, 0, 0, 0.004);
  put(mat.sleeve, between([-0.012, -0.075, -0.225], [-0.27, -0.33, 0.2], 0.034, 0.056));
  put(mat.glove, between([-0.004, -0.06, -0.238], [-0.03, -0.095, -0.195], 0.036, 0.037));
  flush(leftArm);
  root.add(leftArm);

  const muzzle = new THREE.Object3D(); muzzle.position.copy(MUZZLE); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.copy(EJECT); root.add(eject);

  finish(root);
  return { root, bolt, mag, leftArm, rightArm, muzzle, eject, lens, lensUniforms, lampLens };
}

// ---------- Pistola ----------
// Compacta de pequeño calibre, a dos manos. La corredera y el cargador se animan aparte.
export function buildPistolModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-pistol';
  const { mat, put, rbox, box, cylZ, flush } = kit(surf);

  // Armazón, guardamonte y empuñadura.
  rbox(mat.dark, 0.026, 0.018, 0.15, 0, 0.011, -0.05, 0, 0, 0, 0.004);
  rbox(mat.dark, 0.022, 0.012, 0.06, 0, -0.002, -0.092, 0, 0, 0, 0.003);
  box(mat.dark, 0.008, 0.004, 0.05, 0, -0.032, -0.036);
  box(mat.dark, 0.008, 0.03, 0.004, 0, -0.018, -0.061);
  box(mat.steel, 0.005, 0.018, 0.005, 0, -0.012, -0.03, 0.25);
  rbox(mat.fde, 0.028, 0.098, 0.044, 0, -0.047, 0.014, 0.2, 0, 0, 0.008);
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) box(mat.dark, 0.002, 0.006, 0.03, sx * 0.0142, -0.03 - i * 0.016, 0.01 + i * 0.0032, 0.2);
  cylZ(mat.steel, 0.0052, 0.0052, 0.012, 0, 0.031, -0.136, 12); // boca del cañón
  flush(root);

  // Corredera con miras (retrocede en cada disparo).
  const slide = new THREE.Group();
  rbox(mat.black, 0.027, 0.024, 0.186, 0, 0.03, -0.046, 0, 0, 0, 0.004);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) box(mat.dark, 0.0015, 0.016, 0.004, sx * 0.0137, 0.03, 0.036 - i * 0.008);
  box(mat.dark, 0.002, 0.012, 0.03, 0.0137, 0.034, -0.03); // ventana de expulsión
  for (const sx of [-1, 1]) box(mat.dark, 0.005, 0.007, 0.007, sx * 0.007, 0.0455, 0.04); // alza
  box(mat.dark, 0.004, 0.007, 0.007, 0, 0.0455, -0.13); // punto de mira
  flush(slide);
  const dotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 2.6, 0.6) });
  for (const [x, z] of [[-0.007, 0.0438], [0.007, 0.0438], [0, -0.1262]]) {
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 8), dotMat);
    dot.position.set(x, 0.0462, z);
    slide.add(dot);
  }
  root.add(slide);

  // Cargador: baja a lo largo de la empuñadura al recargar.
  const mag = new THREE.Group();
  mag.rotation.x = 0.2;
  const magMesh = new THREE.Mesh(new RoundedBoxGeometry(0.021, 0.1, 0.031, 2, 0.003), mat.black);
  magMesh.position.set(0, -0.052, 0.004);
  const magBase = new THREE.Mesh(new RoundedBoxGeometry(0.029, 0.009, 0.046, 2, 0.003), mat.black);
  magBase.position.set(0, -0.103, 0.004);
  mag.add(magMesh, magBase);
  root.add(mag);

  // Mano derecha en la empuñadura.
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.05, 0.082, 0.062, 0.004, -0.052, 0.024, 0.2, 0, 0, 0.016);
  rbox(mat.glove, 0.046, 0.05, 0.022, 0, -0.05, -0.012, 0.2, 0, 0, 0.008);
  rbox(mat.glove, 0.012, 0.012, 0.052, 0.0195, -0.004, -0.03, 0, 0, 0, 0.005); // índice a lo largo del armazón
  rbox(mat.glove, 0.014, 0.016, 0.05, -0.02, 0.006, 0.0, 0.1, 0.15, 0, 0.006); // pulgar
  rbox(mat.pad, 0.04, 0.012, 0.046, 0.02, -0.03, 0.05, 0.2, 0, -0.9, 0.004);
  put(mat.sleeve, between([0.012, -0.095, 0.055], [0.16, -0.31, 0.42], 0.034, 0.055));
  put(mat.glove, between([0.008, -0.08, 0.045], [0.026, -0.112, 0.085], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  // Mano izquierda de apoyo (acompaña al cargador durante la recarga).
  const leftArm = new THREE.Group();
  rbox(mat.glove, 0.05, 0.072, 0.058, -0.02, -0.066, 0.014, 0.2, 0, 0.18, 0.016);
  rbox(mat.glove, 0.016, 0.05, 0.05, -0.036, -0.03, 0.004, 0.2, 0, 0.1, 0.006);
  rbox(mat.glove, 0.014, 0.015, 0.05, -0.021, 0.004, -0.045, 0, 0.12, 0, 0.006); // pulgar adelantado
  put(mat.sleeve, between([-0.03, -0.105, 0.03], [-0.27, -0.33, 0.36], 0.034, 0.056));
  put(mat.glove, between([-0.024, -0.09, 0.022], [-0.05, -0.122, 0.062], 0.036, 0.037));
  flush(leftArm);
  root.add(leftArm);

  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.031, -0.145); root.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.016, 0.04, -0.025); root.add(eject);

  finish(root);
  return { root, slide, mag, leftArm, rightArm, muzzle, eject };
}

// ---------- Cuchillo ----------
// Hoja hacia delante (-Z), filo hacia abajo, empuñado con la mano derecha.
export function buildKnifeModel(surf) {
  const root = new THREE.Group();
  root.name = 'viewmodel-knife';
  const { mat, put, rbox, box, flush } = kit(surf);

  // Hoja: perfil lateral extruido (x = largo, y = alto), girado para que apunte hacia delante.
  const s = new THREE.Shape();
  s.moveTo(0, -0.014);
  s.lineTo(0.118, -0.014);
  s.quadraticCurveTo(0.165, -0.012, 0.185, 0.009);
  s.lineTo(0.128, 0.015);
  s.lineTo(0.118, 0.0185);
  s.lineTo(0, 0.0185);
  s.closePath();
  const blade = new THREE.ExtrudeGeometry(s, { depth: 0.0026, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0016, bevelSegments: 1, steps: 1 });
  blade.translate(0, 0, -0.0013);
  blade.rotateY(Math.PI / 2); // x del perfil -> -Z
  blade.translate(0, 0.002, -0.04);
  put(mat.steel, blade);
  box(mat.dark, 0.0034, 0.003, 0.085, 0, 0.011, -0.095); // canal de la hoja
  // Guarda, mango con estrías y pomo.
  rbox(mat.black, 0.014, 0.056, 0.012, 0, 0.003, -0.036, 0, 0, 0, 0.004);
  rbox(mat.pad, 0.023, 0.031, 0.108, 0, 0.002, 0.024, 0, 0, 0, 0.009);
  for (let i = 0; i < 5; i++) box(mat.dark, 0.0245, 0.0325, 0.004, 0, 0.002, -0.012 + i * 0.018);
  rbox(mat.black, 0.024, 0.034, 0.014, 0, 0.002, 0.084, 0, 0, 0, 0.005);
  flush(root);

  // Mano derecha cerrada sobre el mango.
  const rightArm = new THREE.Group();
  rbox(mat.glove, 0.05, 0.062, 0.084, 0.002, -0.004, 0.026, 0, 0, 0, 0.018);
  rbox(mat.glove, 0.016, 0.02, 0.06, -0.022, 0.024, 0.006, 0, 0.2, 0, 0.007); // pulgar sobre el lomo
  rbox(mat.pad, 0.044, 0.012, 0.05, 0.024, 0.006, 0.03, 0, 0, -1.2, 0.004);
  put(mat.sleeve, between([0.014, -0.03, 0.075], [0.15, -0.26, 0.44], 0.034, 0.055));
  put(mat.glove, between([0.008, -0.018, 0.06], [0.026, -0.05, 0.1], 0.036, 0.037));
  flush(rightArm);
  root.add(rightArm);

  finish(root);
  return { root, rightArm };
}
