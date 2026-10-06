// Contexto de construcción del mundo: geometría estática por lotes, colisiones, huellas para el AO,
// nodos de cobertura para la IA y registro de luminarias (luz real + bombilla + cono + destello).
import * as THREE from 'three';
import { StaticBatch, boxUV, cylUV, xform } from '../geo.js';
import { CollisionWorld } from '../colliders.js';
import { coneGeometry, coneMaterial, flare } from '../volumetric.js';
import { makeRng } from '../utils.js';

const _c = new THREE.Color();

export class WorldCtx {
  constructor(scene, M) {
    this.scene = scene;
    this.M = M;
    this.batch = new StaticBatch();
    this.col = new CollisionWorld();
    this.footprints = [];
    this.cover = [];
    this.lamps = [];
    this.updaters = [];
    this.barrels = [];       // bidones explosivos (dinámicos)
    this.inst = new Map();   // instancias acumuladas por clave
    this.emitters = [];      // emisores de partículas a registrar en FX
    this.concreteRects = [];
    this.puddles = [];
    this.region = 'all';
    this.rng = makeRng(20261005);
    this.ambient = [0.03, 0.04, 0.055]; // luz base para teñir humo y polvo (noche; de día es mucho mayor)
    this.fakeLights = false; // true: las luminarias sólo brillan (bombilla, cono, destello), sin iluminar
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
  }

  // Caja estática con colisión. (x, z) = centro; y0 = base.
  box(mat, x, y0, z, w, h, d, o = {}) {
    const { yaw = 0, tile = 2, fitV = false, surface = 'concrete', collide = true, cover = null, flags = 3, pitch = 0, roll = 0 } = o;
    this.batch.add(boxUV(w, h, d, tile, fitV), mat, xform(x, y0 + h / 2, z, pitch, yaw, roll), this.region, flags);
    if (collide) this.collider(x, z, w, d, y0, y0 + h, yaw, surface, o.col);
    if (cover) this.coverAround(x, z, w, d, yaw, cover === 'low');
    return this;
  }

  cyl(mat, x, y0, z, r, h, o = {}) {
    const { surface = 'metal', collide = true, seg = 16, tile = 0, rTop = r, flags = 3 } = o;
    this.batch.add(cylUV(rTop, r, h, seg, tile), mat, xform(x, y0 + h / 2, z), this.region, flags);
    if (collide) {
      this.col.addCyl(x, z, r, y0, y0 + h, surface, o.col);
      if (y0 < 0.3) this.footprints.push({ type: 'cyl', x, z, r });
    }
    return this;
  }

  // Sólo visual.
  add(geo, mat, matrix = null, flags = 3) {
    this.batch.add(geo, mat, matrix, this.region, flags);
    return this;
  }

  collider(x, z, w, d, y0, y1, yaw = 0, surface = 'concrete', opts = {}) {
    const c = this.col.addBox(x, z, w, d, y0, y1, yaw, surface, opts);
    if (y0 < 0.3 && opts.foot !== false) this.footprints.push({ type: 'box', x, z, hx: w / 2, hz: d / 2, yaw });
    return c;
  }

  // Nodos de cobertura en los cuatro lados de una caja.
  coverAround(x, z, w, d, yaw, low) {
    const cos = Math.cos(yaw); const sin = Math.sin(yaw);
    const off = 0.62;
    const sides = [[w / 2 + off, 0, -1, 0], [-w / 2 - off, 0, 1, 0], [0, d / 2 + off, 0, -1], [0, -d / 2 - off, 0, 1]];
    for (const [lx, lz, nx, nz] of sides) {
      this.cover.push({
        x: x + lx * cos + lz * sin, z: z - lx * sin + lz * cos,
        nx: nx * cos + nz * sin, nz: -nx * sin + nz * cos, low, user: null,
      });
    }
  }

  instance(key, matrix, color = null) {
    if (!this.inst.has(key)) this.inst.set(key, { matrices: [], colors: [] });
    const e = this.inst.get(key);
    e.matrices.push(matrix);
    if (color !== null) e.colors.push(new THREE.Color(color));
  }

  // Luminaria. type: 'spot' (hacia target) | 'point' | 'fake' (sin luz real).
  lamp(o) {
    const {
      x, y, z, color = 0xffa348, intensity = 600, type = 'spot', range = 30, angle = 1.05, penumbra = 0.65, decay = 2,
      target = [x, 0, z], shadow = false, shadowSize = 1024, cone = null, flareSize = 0, flareK = 1.4, bulb = null, flicker = 0, strength = 1,
    } = o;
    const lamp = { x, y, z, range, base: intensity, k: 1, flicker, fT: 0, fState: 1, strength, type, dir: new THREE.Vector3(0, -1, 0), cos: -1 };
    _c.set(color);
    lamp.r = _c.r; lamp.g = _c.g; lamp.b = _c.b;
    if (type === 'spot' && !this.fakeLights) {
      const l = new THREE.SpotLight(color, intensity, range, angle, penumbra, decay);
      l.position.set(x, y, z);
      l.target.position.set(target[0], target[1], target[2]);
      lamp.shadowWanted = shadow;
      if (shadow) {
        l.castShadow = true;
        l.shadow.mapSize.set(shadowSize, shadowSize);
        l.shadow.bias = -0.0006;
        l.shadow.normalBias = 0.03;
        l.shadow.camera.near = 0.5;
        l.shadow.camera.far = range;
      }
      this.group.add(l, l.target);
      lamp.light = l;
      lamp.dir.set(target[0] - x, target[1] - y, target[2] - z).normalize();
      lamp.cos = Math.cos(angle);
    } else if (type === 'spot') {
      lamp.dir.set(target[0] - x, target[1] - y, target[2] - z).normalize();
      lamp.cos = Math.cos(angle);
    } else if (type === 'point' && !this.fakeLights) {
      const l = new THREE.PointLight(color, intensity, range, decay);
      l.position.set(x, y, z);
      this.group.add(l);
      lamp.light = l;
    }
    if (cone) {
      const mesh = new THREE.Mesh(coneGeometry(cone.radius, cone.length), coneMaterial(color, cone.intensity ?? 0.3, cone.edge ?? 1.7, cone.fall ?? 1.4));
      mesh.position.set(x, y, z);
      if (lamp.dir.y > -0.999) mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), lamp.dir);
      mesh.renderOrder = 15;
      this.group.add(mesh);
      lamp.cone = mesh;
      lamp.coneBase = mesh.material.uniforms.uIntensity.value;
    }
    if (flareSize > 0) {
      const f = flare(color, flareSize, flareK);
      f.position.set(x, y - 0.05, z);
      this.group.add(f);
      lamp.flare = f;
      lamp.flareBase = f.material.color.clone();
    }
    if (bulb) { lamp.bulb = bulb; lamp.bulbBase = bulb.material.color.clone(); }
    this.lamps.push(lamp);
    return lamp;
  }

  // Parpadeo de luminarias averiadas y pulsos de balizas.
  updateLamps(dt, time, audio) {
    for (const l of this.lamps) {
      let k = l.on === false ? 0 : 1;
      if (l.flicker > 0 && k > 0) {
        l.fT -= dt;
        if (l.fT <= 0) {
          const was = l.fState;
          l.fState = Math.random() < l.flicker ? (Math.random() < 0.5 ? 0.05 : 0.4) : 1;
          l.fT = l.fState < 1 ? 0.03 + Math.random() * 0.12 : 0.08 + Math.random() * 1.6;
          if (was < 0.5 && l.fState === 1 && audio) audio.buzz(l.x, l.y, l.z);
        }
        k = l.fState;
      }
      if (l.pulse) k *= l.pulse(time);
      if (k === l.k) continue;
      l.k = k;
      if (l.light) l.light.intensity = l.base * k;
      if (l.cone) l.cone.material.uniforms.uIntensity.value = l.coneBase * k;
      if (l.flare) l.flare.material.color.copy(l.flareBase).multiplyScalar(k);
      if (l.bulb) l.bulb.material.color.copy(l.bulbBase).multiplyScalar(0.04 + 0.96 * k);
    }
  }

  // Luz ambiente aproximada en un punto (para teñir humo y partículas).
  sampleLight(x, y, z, out, extra = null) {
    let r = this.ambient[0]; let g = this.ambient[1]; let b = this.ambient[2];
    for (const l of this.lamps) {
      const dx = l.x - x; const dy = l.y - y; const dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > l.range * l.range) continue;
      const d = Math.sqrt(d2);
      let w = (1 - d / l.range); w = w * w * l.k * l.strength;
      if (l.cos > -0.99) { const c = -(dx * l.dir.x + dy * l.dir.y + dz * l.dir.z) / (d || 1); w *= Math.max(0, Math.min(1, (c - l.cos) / 0.25 + 0.15)); }
      r += l.r * w; g += l.g * w; b += l.b * w;
    }
    if (extra) for (const e of extra) {
      if (e.intensity <= 0) continue;
      const d = Math.hypot(e.position.x - x, e.position.y - y, e.position.z - z);
      const w = Math.min(2, e.intensity / (60 + d * d * 30));
      r += e.color.r * w; g += e.color.g * w; b += e.color.b * w;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }

  finish() {
    const meshes = this.batch.build(this.group);
    return meshes;
  }
}
