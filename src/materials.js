// Materiales PBR compartidos. Todos los exteriores llevan un parche de "mojado por lluvia".
import * as THREE from 'three';
import * as S from './surfaces.js';
import * as S2 from './surfaces2.js';

export function createSurfaces() {
  return {
    asphalt: S.asphalt(),
    concreteFloor: S.concreteFloor(),
    concreteWall: S.concreteWall(),
    cinder: S.cinderBlock(),
    corrugated: S.corrugated(),
    corrugatedClean: S.corrugated({ seed: 515, rust: 0.35, metal: 0.55, rough: 0.5 }),
    metal: S2.metalPaint(),
    metalWorn: S2.metalPaint({ seed: 616, wear: 2.2, rough: 0.55, metal: 0.4 }),
    drum: S2.drum(false),
    drumHaz: S2.drum(true),
    wood: S2.woodCrate('MUNICIÓN 5.56', 808),
    wood2: S2.woodCrate('SUMINISTROS', 818),
    sandbag: S2.sandbag(),
    tire: S2.tire(),
    tarp: S2.tarp(),
    glassDrops: S2.glassDrops(),
  };
}

// Humedad global por lluvia: 1 en mapas lluviosos, 0 en los secos (la fija el ambiente del mapa).
export const WET = { value: 1 };
// Nieve posada en las caras que miran hacia arriba: 0 salvo en los mapas nevados.
export const SNOW = { value: 0 };

// Lluvia sobre el material: las caras hacia arriba brillan más y oscurecen el albedo.
export function wetPatch(material, amount = 1) {
  const k = amount.toFixed(2);
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uWetAll = WET; shader.uniforms.uSnowAll = SNOW;
    if (!shader.fragmentShader.includes('uniform float uWetAll;')) shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWetAll, uSnowAll;');
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `#include <normal_fragment_maps>
      {
        vec3 wN = inverseTransformDirection(normal, viewMatrix);
        float wetK = ${k} * uWetAll * (0.3 + 0.7 * smoothstep(-0.1, 0.8, wN.y));
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.36 + 0.03, wetK);
        diffuseColor.rgb *= mix(1.0, 0.7, wetK * (1.0 - metalnessFactor));
        float snowK = uSnowAll * smoothstep(0.5, 0.86, wN.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.56, 0.59, 0.64), snowK);
        roughnessFactor = mix(roughnessFactor, 0.92, snowK);
        metalnessFactor *= 1.0 - snowK;
      }`,
    );
  };
  const base = material.customProgramCacheKey ? material.customProgramCacheKey() : '';
  material.customProgramCacheKey = () => `${base}|wets${k}`;
  return material;
}

// Material estándar a partir de un conjunto de texturas (albedo, normal, ORM).
export function pbr(set, opts = {}, wet = 1) {
  const { normalScale = 1, ...rest } = opts;
  const m = new THREE.MeshStandardMaterial({
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.ormMap,
    metalnessMap: set.ormMap,
    aoMap: set.ormMap,
    roughness: 1,
    metalness: 1,
    ...rest,
  });
  m.normalScale.set(normalScale, normalScale);
  return wet > 0 ? wetPatch(m, wet) : m;
}

export function createMaterials(surf) {
  const cache = new Map();
  const M = {
    surf,
    concreteWall: pbr(surf.concreteWall),
    concreteWallDry: pbr(surf.concreteWall, { color: 0xb9b9b9 }, 0),
    concrete: pbr(surf.concreteFloor, { color: 0xb0b0b0 }),
    concreteDry: pbr(surf.concreteFloor, { color: 0xa8a8a8 }, 0),
    cinder: pbr(surf.cinder, { color: 0xb8b4aa }),
    cinderDark: pbr(surf.cinder, { color: 0x6f6d68 }),
    corrugatedWall: pbr(surf.corrugated, { color: 0x6f7c86 }),
    corrugatedRoof: pbr(surf.corrugated, { color: 0x4a4f54 }),
    corrugatedIn: pbr(surf.corrugatedClean, { color: 0x7a8288 }, 0),
    wood: pbr(surf.wood),
    wood2: pbr(surf.wood2),
    woodDry: pbr(surf.wood, {}, 0),
    sandbag: pbr(surf.sandbag, {}, 0.7),
    tire: pbr(surf.tire, {}, 0.6),
    tarp: pbr(surf.tarp),
    drum: pbr(surf.drum),
    drumHaz: pbr(surf.drumHaz, { color: 0xc62a1e }),
    rubber: wetPatch(new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.82, metalness: 0 }), 0.6),
    plastic: wetPatch(new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.5, metalness: 0 })),
    steel: wetPatch(new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.32, metalness: 1 })),
    darkSteel: wetPatch(new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.42, metalness: 0.9 })),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0b1116, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.62,
      normalMap: surf.glassDrops, depthWrite: false,
    }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x05080b, roughness: 0.06, metalness: 0.2, normalMap: surf.glassDrops }),

    // Metal pintado teñido (con caché por color).
    metal(color, { worn = false, rough = 1, metal = 1, wet = 1 } = {}) {
      const key = `m${color}|${worn}|${rough}|${metal}|${wet}`;
      if (!cache.has(key)) cache.set(key, pbr(worn ? surf.metalWorn : surf.metal, { color, roughness: rough, metalness: metal }, wet));
      return cache.get(key);
    },

    // Emisivo HDR sin iluminación (bombillas, LEDs, pantallas): alimenta el bloom.
    glow(color, intensity = 4, opts = {}) {
      const key = `g${color}|${intensity}|${JSON.stringify(opts)}`;
      if (!cache.has(key)) {
        const m = new THREE.MeshBasicMaterial({ ...opts });
        m.color.set(color).multiplyScalar(intensity);
        cache.set(key, m);
      }
      return cache.get(key);
    },
  };
  M.glass.normalScale.set(0.35, 0.35);
  M.glassDark.normalScale.set(0.4, 0.4);
  return M;
}
