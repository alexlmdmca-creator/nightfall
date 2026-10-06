// Ayudas de geometría: cajas con UV a escala real, matrices y lotes estáticos fusionados por material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function xform(px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
}

// Caja con UV proporcionales al tamaño (1 unidad UV = `tile` metros).
// fitV: en las caras laterales v va de 0 a 1 (para texturas de muro con AO horneada).
export function boxUV(w, h, d, tile = 2, fitV = false) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const side = f !== 2 && f !== 3;
    const su = dims[f][0] / tile;
    const sv = fitV && side ? 1 : dims[f][1] / tile;
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  return g;
}

// Cilindro con UV a escala (u: perímetro, v: altura).
export function cylUV(rTop, rBot, h, seg = 16, tile = 0, open = false) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  if (tile > 0) {
    const uv = g.attributes.uv;
    const su = (Math.PI * (rTop + rBot)) / tile;
    const sv = h / tile;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  return g;
}

function normalize(g) {
  let out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') out.deleteAttribute(name);
  }
  if (!out.attributes.uv) {
    out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2));
  }
  if (!out.attributes.normal) out.computeVertexNormals();
  out.clearGroups();
  return out;
}

// Acumula geometría estática y la fusiona en una malla por (material, región).
export class StaticBatch {
  constructor() {
    this.groups = new Map();
    this.tris = 0;
  }

  add(geometry, material, matrix = null, region = 'all', flags = 3) {
    const g = normalize(geometry.clone ? geometry.clone() : geometry);
    if (matrix) g.applyMatrix4(matrix);
    const key = `${material.uuid}|${region}|${flags}`;
    let entry = this.groups.get(key);
    if (!entry) { entry = { material, list: [], flags, region }; this.groups.set(key, entry); }
    entry.list.push(g);
    return this;
  }

  // flags: bit 0 = proyecta sombra, bit 1 = recibe sombra.
  build(parent) {
    const meshes = [];
    for (const { material, list, flags, region } of this.groups.values()) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) { console.warn('No se pudo fusionar un lote', region); continue; }
      list.forEach((g) => g !== merged && g.dispose());
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = !!(flags & 1);
      mesh.receiveShadow = !!(flags & 2);
      mesh.matrixAutoUpdate = false;
      mesh.name = `static:${region}`;
      parent.add(mesh);
      meshes.push(mesh);
      this.tris += merged.attributes.position.count / 3;
    }
    this.groups.clear();
    return meshes;
  }
}

// Crea una InstancedMesh a partir de una lista de matrices (y colores opcionales).
export function instanced(geometry, material, matrices, colors = null, flags = 3) {
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
    if (colors) mesh.setColorAt(i, colors[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = !!(flags & 1);
  mesh.receiveShadow = !!(flags & 2);
  mesh.computeBoundingSphere();
  return mesh;
}

export { mergeGeometries };
