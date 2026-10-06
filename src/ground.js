// Suelo: un único plano con shader PBR extendido + mapa de control (charcos, AO de contacto, zonas).
// Cada mapa lo configura con un `spec`: área cubierta, qué es tierra, zonas bajo techo, pintura y humedad.
import * as THREE from 'three';
import { fbm, makeRng, smoothstep } from './utils.js';
import { makeCanvas, sharedNoise, tex } from './textures.js';
import { ROAD } from './layout.js';
import { groundParsFragment, groundMainFragment, groundTailFragment, groundVertexPars, groundVertexMain, indoorGLSL } from './groundShader.js';

const RES = 1024;

function worldCtx(canvas, map) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const s = RES / map.size;
  ctx.setTransform(s, 0, 0, s, RES / 2 - map.cx * s, RES / 2 - map.cz * s);
  return ctx;
}

function blurred(src, px) {
  const c = makeCanvas(RES);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(src, 0, 0);
  return ctx;
}

const red = (ctx) => {
  const d = ctx.getImageData(0, 0, RES, RES).data;
  const out = new Uint8Array(RES * RES);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  return out;
};

// footprints: [{type:'box'|'cyl', x, z, hx, hz, yaw, r}], puddles: [{x, z, r, sx?}]
// spec: {
//   key: nombre del mapa (distingue su shader) · map: { cx, cz, size } área del mapa de control
//   paintDirt(ctx, map): pinta en blanco lo que es tierra y en negro lo pavimentado
//   indoor: rectángulos bajo techo { x0, x1, z0, z1 } · marks: GLSL de la pintura del suelo
//   wet: 0-1 humedad por lluvia · dirtTint: [r, g, b] · tuft: [r, g, b, cantidad] matas sobre la tierra
//   snow: [r, g, b, cantidad] manto de nieve
// }
export function buildGround({ surfaces, footprints, puddles, concreteRects, reflection, spec }) {
  const MAP = spec.map;
  // ---- Charcos: ruido de baja frecuencia + charcos colocados a mano ----
  const pc = makeCanvas(RES);
  {
    const small = makeCanvas(256);
    const sctx = small.getContext('2d');
    const img = sctx.createImageData(256, 256);
    for (let y = 0, i = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++, i += 4) {
        const wx = ((x / 256) - 0.5) * MAP.size + MAP.cx;
        const wz = ((y / 256) - 0.5) * MAP.size + MAP.cz;
        const n = fbm(wx * 0.085 + 3.1, wz * 0.085 + 7.7, 4, 0, 77);
        const v = smoothstep(0.5, 0.7, n) * 200;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    const raw = pc.getContext('2d', { willReadFrequently: true });
    raw.imageSmoothingQuality = 'high';
    raw.drawImage(small, 0, 0, RES, RES);
    const ctx = worldCtx(pc, MAP);
    ctx.globalCompositeOperation = 'lighter';
    for (const p of puddles) {
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(p.rot || 0);
      ctx.scale(p.sx || 1, 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
      ctx.restore();
    }
  }

  // ---- Oclusión de contacto: huellas de los objetos, difuminadas a dos radios ----
  const fc = makeCanvas(RES);
  {
    const ctx = worldCtx(fc, MAP);
    ctx.fillStyle = '#fff';
    for (const fp of footprints) {
      ctx.save();
      ctx.translate(fp.x, fp.z);
      if (fp.type === 'cyl') { ctx.beginPath(); ctx.arc(0, 0, fp.r, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.rotate(-(fp.yaw || 0)); ctx.fillRect(-fp.hx, -fp.hz, fp.hx * 2, fp.hz * 2); }
      ctx.restore();
    }
  }
  const aoTight = red(blurred(fc, 2.5));
  const aoWide = red(blurred(fc, 11));

  // ---- Zonas: hormigón y tierra ----
  const cc = makeCanvas(RES);
  {
    const ctx = worldCtx(cc, MAP);
    ctx.fillStyle = '#fff';
    for (const r of concreteRects) ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
  }
  const dc = makeCanvas(RES);
  spec.paintDirt(worldCtx(dc, MAP), MAP);

  const puddle = red(pc.getContext('2d', { willReadFrequently: true }));
  const concrete = red(blurred(cc, 1.2));
  const dirt = red(blurred(dc, 4));

  const data = new Uint8Array(RES * RES * 4);
  for (let i = 0; i < RES * RES; i++) {
    const occ = Math.min(1, (aoTight[i] / 255) * 0.62 + (aoWide[i] / 255) * 0.5);
    data[i * 4] = puddle[i];
    data[i * 4 + 1] = 255 * (1 - occ * 0.9);
    data[i * 4 + 2] = concrete[i];
    data[i * 4 + 3] = dirt[i];
  }
  const control = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
  control.minFilter = THREE.LinearMipmapLinearFilter;
  control.magFilter = THREE.LinearFilter;
  control.generateMipmaps = true;
  control.needsUpdate = true;

  const noiseTex = tex(sharedNoise().mid, {});
  const wet = spec.wet ?? 1;

  const uniforms = {
    tAsphalt: { value: surfaces.asphalt.map }, tAsphaltN: { value: surfaces.asphalt.normalMap }, tAsphaltO: { value: surfaces.asphalt.ormMap },
    tConcrete: { value: surfaces.concreteFloor.map }, tConcreteN: { value: surfaces.concreteFloor.normalMap }, tConcreteO: { value: surfaces.concreteFloor.ormMap },
    tControl: { value: control }, tNoise: { value: noiseTex },
    tRefl: { value: reflection.target.texture }, uReflMatrix: { value: reflection.textureMatrix },
    uTime: { value: 0 }, uRain: { value: wet > 0 ? 1 : 0 }, uReflOn: { value: wet > 0 ? 1 : 0 }, uWet: { value: wet },
    uDirtTint: { value: new THREE.Vector3(...(spec.dirtTint || [1.5, 1.2, 0.85])) },
    uTuft: { value: new THREE.Vector4(...(spec.tuft || [0.035, 0.05, 0.02, 0.7])) },
    uSnowG: { value: new THREE.Vector4(...(spec.snow || [1, 1, 1, 0])) },
    uMapRect: { value: new THREE.Vector3(MAP.cx, MAP.cz, MAP.size) },
  };

  const mainFragment = groundMainFragment(spec.marks, indoorGLSL(spec.indoor)) + groundTailFragment;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.envMapIntensity = 0.25;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${groundVertexPars}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${groundVertexMain}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${groundParsFragment}`)
      .replace('#include <map_fragment>', `${mainFragment}\ndiffuseColor.rgb = gAlb;`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = max(gRough, 0.14);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = 0.0;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gN, 0.0)).xyz);')
      .replace('#include <opaque_fragment>', 'outgoingLight = outgoingLight * gAO + gRefl * gSpec * mix(1.0, gAO, 0.7);\n#include <opaque_fragment>');
  };
  material.customProgramCacheKey = () => `ground-${spec.key}`;

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.name = 'ground';

  const sample = (arr, x, z) => {
    const px = Math.floor(((x - MAP.cx) / MAP.size + 0.5) * RES);
    const py = Math.floor(((z - MAP.cz) / MAP.size + 0.5) * RES);
    if (px < 0 || py < 0 || px >= RES || py >= RES) return 0;
    return arr[py * RES + px] / 255;
  };
  const indoor = (x, z) => spec.indoor.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

  return {
    mesh, material, uniforms,
    indoor,
    // Tipo de superficie para impactos y pasos.
    surfaceAt(x, z) {
      if (wet > 0 && !indoor(x, z) && sample(puddle, x, z) > 0.52) return 'water';
      if (sample(concrete, x, z) > 0.5) return 'concrete';
      if (sample(dirt, x, z) > 0.5) return 'dirt';
      return 'asphalt';
    },
  };
}

// Charcos de composición de Sector 7: colocados donde más lucen los reflejos.
export function defaultPuddles() {
  const R = makeRng(4242);
  const list = [
    { x: 1, z: 58, r: 4.2, sx: 1.5 }, { x: -2.5, z: 49, r: 3.2, sx: 0.7 }, { x: 2.6, z: 40, r: 3.6, sx: 0.8 },
    { x: -1, z: 30, r: 4.5, sx: 1.6 }, { x: 3.4, z: 23, r: 2.6 }, { x: 0, z: 12, r: 5, sx: 1.7 },
    { x: -9, z: 6, r: 4 }, { x: -24, z: 2.5, r: 5.5, sx: 1.8 }, { x: -33, z: -3, r: 3.5 },
    { x: 8, z: -2, r: 4.6, sx: 1.4 }, { x: 22, z: 4, r: 5, sx: 1.3 }, { x: 31, z: -6, r: 3.6 },
    { x: 0, z: -11, r: 4.4, sx: 1.2 }, { x: -3, z: -22, r: 4.8, sx: 0.8 }, { x: 4, z: -30.5, r: 3.8, sx: 2.2 },
    { x: -14, z: -17, r: 3.4 }, { x: 15, z: -17, r: 3.8, sx: 1.6 }, { x: 27, z: -27, r: 4.2 },
    { x: -34, z: -20, r: 4.4 }, { x: -32, z: -40, r: 5, sx: 0.7 }, { x: 28, z: -42, r: 4.4, sx: 1.3 },
  ];
  // Regueros junto a los bordillos de la carretera.
  for (let z = ROAD.zNorth + 6; z < ROAD.zSouth - 4; z += R.range(5, 9)) {
    list.push({ x: R.sign() * (ROAD.halfW - 0.9), z, r: R.range(1.4, 2.6), sx: 0.45, rot: 0 });
  }
  return list;
}
