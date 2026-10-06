// Mapa SECTOR 7: carretera de acceso -> control -> aparcamiento -> patio de contenedores -> almacén.
// Noche de tormenta. Es el mapa de la misión y también vale para partidas por equipos.
import * as THREE from 'three';
import { WorldCtx } from './ctx.js';
import { xform, boxUV, cylUV } from '../geo.js';
import { lampPost, fence, jersey, sandbags, crate, crateStack, barrel, explosiveBarrel, pallet, tires, trafficCone, buildInstances } from './props.js';
import { warehouse, office, guardBooth, perimeter, guardTower, fuelDepot } from './structures.js';
import { truck, jeep, container, generator, floodTower } from './vehicles.js';
import { fireEmitter } from '../fxRecipes.js';
import { makeCanvas, tex } from '../textures.js';
import { buildGround, defaultPuddles } from '../ground.js';
import { SECTOR7_MARKS } from '../groundShader.js';
import { MAP, ROAD, BASE, OFFICE, OBJECTIVE, WAREHOUSE, TEAM_SPAWN } from '../layout.js';

function signBoard(ctx, x, y, z, yaw, w, h, lines, bg = '#b9b4a2', fg = '#16130f') {
  const c = makeCanvas(512, Math.round((512 * h) / w));
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(12, 12, c.width - 24, c.height - 24);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([text, size, color], i) => {
    g.font = `bold ${size}px "Arial Narrow", Arial`;
    g.fillStyle = color || fg;
    g.fillText(text, c.width / 2, (c.height * (i + 1)) / (lines.length + 1));
  });
  // Óxido y suciedad.
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,40,18,${Math.random() * 0.25})`; g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 26, 0, 7); g.fill(); }
  const mat = new THREE.MeshStandardMaterial({ map: tex(c, { srgb: true, wrap: false }), roughness: 0.5, metalness: 0.3 });
  ctx.add(new THREE.PlaneGeometry(w, h), mat, xform(x, y, z, 0, yaw, 0), 2);
  ctx.add(boxUV(w + 0.06, h + 0.06, 0.03, 1), ctx.M.darkSteel, xform(x - Math.sin(yaw) * 0.02, y, z - Math.cos(yaw) * 0.02, 0, yaw, 0), 1);
}

// Poste de tendido con cables en catenaria hasta el siguiente.
function utilityLine(ctx, pts) {
  const M = ctx.M;
  pts.forEach(([x, z]) => {
    ctx.cyl(M.woodDry, x, 0, z, 0.14, 9, { seg: 8, surface: 'wood' });
    ctx.add(boxUV(2.2, 0.12, 0.12, 1), M.woodDry, xform(x, 8.4, z));
    for (const s of [-0.95, 0, 0.95]) ctx.add(cylUV(0.04, 0.05, 0.16, 6), M.glassDark, xform(x + s, 8.54, z), 0);
  });
  const cableMat = new THREE.LineBasicMaterial({ color: 0x050607 });
  const verts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (const s of [-0.95, 0, 0.95]) {
      for (let k = 0; k < 14; k++) {
        const a = k / 14; const b = (k + 1) / 14;
        const sag = (t) => 8.6 - Math.sin(t * Math.PI) * 1.1;
        verts.push(pts[i][0] + s + (pts[i + 1][0] - pts[i][0]) * a, sag(a), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * a);
        verts.push(pts[i][0] + s + (pts[i + 1][0] - pts[i][0]) * b, sag(b), pts[i][1] + (pts[i + 1][1] - pts[i][1]) * b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  ctx.group.add(new THREE.LineSegments(g, cableMat));
}

// Silueta de arbolado lejano alrededor del mapa.
function treeLine(ctx) {
  const c = makeCanvas(2048, 256);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  // Coníferas por pisos de triángulos sobre una masa continua de monte bajo.
  let x = -20;
  while (x < 2068) {
    const w = 26 + Math.random() * 34; const h = 110 + Math.random() * 130; const tiers = 5 + Math.floor(Math.random() * 4);
    for (let k = 0; k < tiers; k++) {
      const t0 = k / tiers; const yTop = 256 - h * (1 - t0); const yBot = yTop + (h / tiers) * 1.7; const half = (w / 2) * (0.25 + 0.75 * (k + 1) / tiers);
      g.beginPath(); g.moveTo(x + w / 2, yTop); g.lineTo(x + w / 2 + half, yBot); g.lineTo(x + w / 2 - half, yBot); g.fill();
    }
    x += w * (0.35 + Math.random() * 0.45);
  }
  for (let px = 0; px < 2048; px += 4) g.fillRect(px, 256 - 70 - Math.random() * 26 - 18 * Math.sin(px * 0.013), 4, 120);
  const t = tex(c, { srgb: true });
  t.repeat.set(4, 1);
  const mat = new THREE.MeshBasicMaterial({ alphaMap: t, color: 0x010203, transparent: true, alphaTest: 0.5, side: THREE.BackSide, fog: false });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(96, 96, 20, 64, 1, true), mat);
  mesh.position.set(0, 9, 5);
  ctx.group.add(mesh);
}

export function buildWorld(scene, M, reflection) {
  const ctx = new WorldCtx(scene, M);
  const R = ctx.rng;

  perimeter(ctx);
  office(ctx);
  warehouse(ctx);

  // ================= Carretera de acceso =================
  ctx.region = 'road';
  lampPost(ctx, 6.1, 57, -1, 0, { shadow: true });
  lampPost(ctx, -6.1, 42, 1, 0, { flicker: 0.3 });
  lampPost(ctx, 6.1, 26, -1, 0, { color: 0xffa64a });
  utilityLine(ctx, [[9.5, 70], [9.5, 48], [9.5, 27], [9.5, 15.2]]);
  signBoard(ctx, -6.8, 2.1, 30.5, 0.5, 2.6, 1.5, [['ZONA MILITAR', 74, '#8f1410'], ['PROHIBIDO EL PASO', 48], ['USO DE FUERZA AUTORIZADO', 30]]);
  for (const s of [-0.9, 0.9]) ctx.cyl(M.steel, -6.8 + s * Math.cos(0.5), 0, 30.5 - s * Math.sin(0.5), 0.04, 2.85, { seg: 6 });
  // Chicane de barreras y coche de control ardiendo.
  jersey(ctx, -2.6, 33.5, 0.08); jersey(ctx, 2.7, 27.5, -0.06); jersey(ctx, -2.9, 22, 0.03);
  jeep(ctx, 3.2, 46.5, 2.5, 0x3b3f44);
  barrel(ctx, 5.6, 36.2, 0x7a4630); barrel(ctx, 6.3, 35.6); barrel(ctx, 6.9, 37.4, null, 0, true);
  ctx.cyl(M.metal(0x4a3a30, { worn: true }), -6.2, 0, 50.5, 0.31, 0.9, { seg: 14 });
  ctx.emitters.push(fireEmitter(-6.2, 0.82, 50.5, 0.9));
  const fire = ctx.lamp({ x: -6.2, y: 1.5, z: 50.5, color: 0xff7a22, intensity: 130, type: 'point', range: 15, flareSize: 0, strength: 1.3 });
  fire.pulse = (t) => 0.7 + 0.2 * Math.sin(t * 13.1) + 0.14 * Math.sin(t * 23.7 + 1.3) + 0.1 * Math.sin(t * 41.3);
  ctx.fire = { x: -6.2, z: 50.5 };
  tires(ctx, -8.4, 52, 3); pallet(ctx, -8.6, 48.2, 0.4, 3); crate(ctx, -9.8, 50.2, 1.0, 0.3);
  trafficCone(ctx, 1.6, 31); trafficCone(ctx, -0.2, 25.2); trafficCone(ctx, 3.5, 20.5, true);
  // Contenedor de obra y escombros junto a la oficina.
  ctx.box(M.metal(0x2f5a44, { worn: true }), -10.8, 0, 29.2, 1.7, 1.25, 3.4, { surface: 'metal', tile: 1.5, cover: 'low', yaw: 0.06 });
  crateStack(ctx, 8.3, 62.5, 0.3, 0);
  sandbags(ctx, -7.5, 61, 0.25, 3.2, 3);

  // ================= Control de acceso =================
  ctx.region = 'gate';
  guardBooth(ctx, 7.3, 19.2);
  sandbags(ctx, -6.6, 12.6, 0.2, 4, 3);
  sandbags(ctx, 6.2, 11.4, -0.5, 3.4, 2);
  jersey(ctx, -3.2, 15.2, 0.0); jersey(ctx, 3.3, 9.4, 0.3);
  trafficCone(ctx, 0.4, 17.6); trafficCone(ctx, -1.8, 17.2);
  signBoard(ctx, -5.6, 2.3, 16.25, 0, 1.5, 1.0, [['ALTO', 150, '#8f1410'], ['CONTROL', 70]]);

  // ================= Aparcamiento (oeste) y zona técnica (este) =================
  ctx.region = 'parking';
  truck(ctx, -36.5, 9, Math.PI, true);
  truck(ctx, -27.4, 8.6, Math.PI + 0.04, false);
  jeep(ctx, -18.5, 9.6, Math.PI - 0.1);
  jeep(ctx, -30.4, -4.2, 0.12, 0x56513a);
  truck(ctx, -15.2, -3.4, 0.5, true);
  lampPost(ctx, -24, 2.5, 0, 1, { color: 0xcfe4ff, intensity: 700, shadow: true, h: 8.2, coneK: 0.26 });
  lampPost(ctx, -40, -1, 1, 0, { color: 0xcfe4ff, intensity: 520, flicker: 0.45, h: 8.2, coneK: 0.24 });
  tires(ctx, -21.8, -5.6, 4); tires(ctx, -22.9, -5.0, 2);
  for (const [x, z] of [[-42.6, 12.4], [-43.3, 11.6], [-42.4, 10.9], [-12.4, 12.6], [-11.7, 13.3]]) barrel(ctx, x, z);
  crateStack(ctx, -9.5, 2.5, 0.2, 1);
  pallet(ctx, -12.5, 6.5, 0.7, 4);
  // Zona técnica: generadores, torre de focos, bidones de combustible.
  generator(ctx, 24.5, 6.5, 0.15);
  generator(ctx, 28.6, 9.8, 1.4);
  floodTower(ctx, 31.5, 1.5, 6, -19);
  for (const [x, z] of [[20.3, 9.8], [21.1, 10.5], [20.4, 11.2]]) barrel(ctx, x, z, 0x2f4f78);
  explosiveBarrel(ctx, 19.2, 3.2); explosiveBarrel(ctx, 19.9, 3.9);
  crateStack(ctx, 13.5, 6.8, -0.3, 2);
  crateStack(ctx, 36.5, -2.5, 0.5, 0);
  guardTower(ctx, 40.2, 11);
  jersey(ctx, 10.5, -4.5, 1.2); jersey(ctx, 16.8, -1.2, 0.2);
  sandbags(ctx, 2.5, 1.5, 0.05, 3.4, 3);

  // ================= Patio de contenedores =================
  ctx.region = 'yard';
  container(ctx, -31, -12, 0.03, 'blue'); container(ctx, -31, -12, 0.03, 'grey', 1);
  container(ctx, -22.5, -12.4, -0.02, 'red');
  container(ctx, -12.5, -17, Math.PI / 2 + 0.05, 'green'); container(ctx, -12.5, -17, Math.PI / 2 + 0.02, 'orange', 1);
  container(ctx, 9.5, -11.6, 0.04, 'orange');
  container(ctx, 18, -14, 0.5, 'white');
  container(ctx, -27, -23.5, 0.0, 'green', 0, true); container(ctx, -30, -23.4, 0.02, 'red', 1);
  container(ctx, 8.6, -23.6, Math.PI / 2, 'blue'); container(ctx, 8.6, -23.6, Math.PI / 2 - 0.04, 'white', 1);
  container(ctx, 24.5, -24, -0.06, 'red', 0, true); container(ctx, 21.5, -24, -0.03, 'grey', 1);
  container(ctx, 36, -16, Math.PI / 2 + 0.1, 'blue');
  lampPost(ctx, -17.6, -27.5, 0.7, 0.7, { color: 0xffa040, intensity: 640, h: 8, flicker: 0.08 });
  crateStack(ctx, -2.6, -16.5, 0.4, 0); crateStack(ctx, 3.4, -26.2, -0.2, 2);
  crate(ctx, -6.2, -25.5, 1.3, 0.2, 0, true);
  jersey(ctx, -4.4, -9.2, 0.1); jersey(ctx, 3.8, -18.6, -0.25);
  explosiveBarrel(ctx, -7.9, -19.4); explosiveBarrel(ctx, 15.3, -20.2); explosiveBarrel(ctx, 14.6, -20.8);
  for (const [x, z] of [[-20.4, -19.6], [-19.6, -20.3], [28.4, -17.2], [-36.5, -17.5], [-37.2, -18.3]]) barrel(ctx, x, z);
  pallet(ctx, 1.2, -29.4, 0.2, 2); tires(ctx, -9.6, -29.2, 3);
  generator(ctx, -37, -29, 0.3);

  // ================= Entorno del almacén =================
  ctx.region = 'warehouse';
  fuelDepot(ctx, 28, -47);
  explosiveBarrel(ctx, 23.6, -39.2); explosiveBarrel(ctx, 24.4, -38.6); explosiveBarrel(ctx, 23.4, -38.2);
  lampPost(ctx, 21.5, -34.5, 0.4, -0.9, { color: 0xbfe6d0, intensity: 520, h: 7.4, coneK: 0.26 });
  crateStack(ctx, -9.6, -31.6, 0.1, 1); sandbags(ctx, 7.2, -31.2, 0.1, 3.6, 3);
  ctx.box(M.metal(0x2c4a3a, { worn: true }), -30.5, 0, -40, 2.0, 1.5, 4.2, { surface: 'metal', tile: 1.5, cover: 'tall' });
  pallet(ctx, -33.2, -47.5, 0.3, 5); pallet(ctx, -31.4, -51, 1.2, 3);
  for (const [x, z] of [[-28.2, -55.5], [-29, -56.2], [-27.4, -56.4]]) barrel(ctx, x, z);
  // Interior: cajas, carretilla y terminal objetivo.
  crateStack(ctx, -2.5, -41.5, 0.3, 1); crateStack(ctx, 5.2, -50.5, -0.4, 2); crateStack(ctx, -13, -51.5, 0.2, 0);
  crate(ctx, 0.8, -46.4, 1.3, 0.1, 0, true); crate(ctx, -9.5, -38.6, 1.1, 0.5);
  pallet(ctx, 12.5, -46, 0.1, 3);
  const ox = OBJECTIVE.x; const oz = OBJECTIVE.z;
  ctx.box(M.metal(0x3a3f44, { worn: true, wet: 0 }), ox, 0, oz - 1.9, 3.4, 0.95, 0.9, { surface: 'metal', tile: 1.5 });
  ctx.box(M.metal(0x23262a, { wet: 0 }), ox - 0.9, 0, oz - 2.75, 0.9, 2.0, 0.7, { surface: 'metal', tile: 1.5 });
  ctx.box(M.metal(0x23262a, { wet: 0 }), ox + 1.0, 0, oz - 2.75, 0.9, 2.0, 0.7, { surface: 'metal', tile: 1.5 });
  for (const [dx, col] of [[-0.75, 0x40ff90], [0.2, 0x40c0ff], [1.05, 0x40ff90]]) {
    ctx.add(boxUV(0.78, 0.5, 0.05, 1), M.plastic, xform(ox + dx, 1.33, oz - 2.05, -0.12, 0, 0), 0);
    ctx.add(new THREE.PlaneGeometry(0.7, 0.42), M.glow(col, 0.55), xform(ox + dx, 1.33, oz - 2.02, -0.12, 0, 0), 0);
  }
  for (let i = 0; i < 10; i++) ctx.add(new THREE.SphereGeometry(0.014, 6, 4), M.glow(i % 3 ? 0x30ff60 : 0xff4020, 7), xform(ox - 0.9 + (i % 2 ? 1.9 : 0) + ((i >> 1) % 3) * 0.08 - 0.08, 1.2 + (i % 5) * 0.14, oz - 2.39), 0);
  ctx.lamp({ x: ox, y: 1.5, z: oz - 1.3, color: 0x50ffa0, intensity: 7, type: 'point', range: 8, strength: 0.5 });

  buildInstances(ctx);
  treeLine(ctx);
  const staticMeshes = ctx.finish();

  const ground = buildGround({
    surfaces: M.surf, footprints: ctx.footprints, puddles: defaultPuddles(), concreteRects: ctx.concreteRects, reflection,
    spec: {
      key: 'sector7', map: MAP, marks: SECTOR7_MARKS, wet: 1,
      indoor: [{ x0: WAREHOUSE.x0, x1: WAREHOUSE.x1, z0: WAREHOUSE.z0, z1: WAREHOUSE.z1 }],
      // Tierra en todo salvo el recinto, la carretera de acceso y el entorno de la oficina.
      paintDirt(c) {
        c.fillStyle = '#fff';
        c.fillRect(MAP.cx - MAP.size, MAP.cz - MAP.size, MAP.size * 2, MAP.size * 2);
        c.fillStyle = '#000';
        c.fillRect(BASE.x0 - 1, BASE.z0 - 1, BASE.x1 - BASE.x0 + 2, BASE.z1 - BASE.z0 + 2);
        c.fillRect(-ROAD.halfW - 0.7, ROAD.zNorth - 1, ROAD.halfW * 2 + 1.4, 200);
        c.fillRect(OFFICE.x0 - 3, OFFICE.z0 - 3, OFFICE.x1 - OFFICE.x0 + 6, OFFICE.z1 - OFFICE.z0 + 6);
        c.fillRect(OFFICE.x1, 36, -ROAD.halfW - OFFICE.x1, 5); // acceso de la oficina a la carretera
      },
    },
  });
  ctx.group.add(ground.mesh);

  // Descarta nodos de cobertura dentro de obstáculos o fuera del recinto.
  const cover = ctx.cover.filter((n) => !ctx.col.blockedAbove(n.x, n.z, 0.34, 0.3, 1.6) && Math.abs(n.x) < 44 && n.z > -60 && n.z < 14);

  // Patrullas enemigas: [x, z, yaw, ruta].
  const enemies = [
    { x: -2.5, z: 10.5, yaw: 0, path: [[-2.5, 10.5], [3, 6.5], [-1, 3.5]] },
    { x: 8.5, z: 13.2, yaw: 0.4, path: [[8.5, 13.2], [14, 12.5]] },
    { x: -22, z: 0.5, yaw: 1.2, path: [[-22, 0.5], [-33, 1.5], [-24, 4]] },
    { x: 22, z: 0.5, yaw: -1, path: [[22, 0.5], [12, -1.5], [27, -6]] },
    { x: -1.5, z: -13.5, yaw: 0, path: [[-1.5, -13.5], [1.5, -21], [0, -28.5]] },
    { x: -19, z: -17.5, yaw: 0.6, path: [[-19, -17.5], [-18.5, -29], [-34, -28]] },
    { x: 15, z: -17.6, yaw: -0.4, path: [[15.5, -18], [30, -19.2]] },
    { x: 29, z: -30.5, yaw: 0.2, path: [[29, -30.5], [10, -30.5]] },
    { x: -9, z: -44.5, yaw: 0, path: [[-9, -44.5], [3.5, -43.5], [-3, -37]] },
    { x: 1, z: -52.5, yaw: 0, path: [[1, -52.5], [-9, -53.5]] },
  ];

  return {
    ctx, group: ctx.group, ground, cover, enemies, staticMeshes,
    col: ctx.col, lamps: ctx.lamps, barrels: ctx.barrels, emitters: ctx.emitters,
    dry: { x0: WAREHOUSE.x0, z0: WAREHOUSE.z0, x1: WAREHOUSE.x1, z1: WAREHOUSE.z1, y: WAREHOUSE.ridgeH + 0.4 },
    hum: ctx.hum || [], fire: ctx.fire,
    bounds: { x0: BASE.x0 - 3.5, x1: BASE.x1 + 3.5, z0: BASE.z0 + 0.6, z1: ROAD.zSouth - 4 },
    spawns: TEAM_SPAWN.map((s) => [s]), // zonas de aparición por equipo
    envPos: [0, 3.2, 18], // desde dónde se captura el mapa de entorno
    // Ambiente: noche cerrada con lluvia; la luz la ponen las farolas y la linterna.
    env: {
      day: false, weather: 'rain', wet: 1, snow: 0, flashlight: true,
      fog: [0.022, 0.03, 0.044], fogDensity: 0.0135, zenith: [0.006, 0.009, 0.016],
      hemi: { sky: 0x93abd6, ground: 0x0d1016, intensity: 0.5 },
      sun: { color: 0x9fb8ea, intensity: 0.42, dir: [-46, 80, 32], target: [0, 4] }, // la luna
      exposure: 1.15, vignette: 0.62, envIntensity: 0.75, groundEnv: 0.22, shadowEvery: 4,
    },
  };
}
