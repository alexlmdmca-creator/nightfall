// Núcleo de efectos: sistemas de partículas, calcomanías de impacto, casquillos y luces dinámicas.
import * as THREE from 'three';
import { ParticleSystem } from './particles.js';
import { particleAtlas, decalAtlas } from './sprites.js';
import { rand } from './utils.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _e = new THREE.Euler();

// Calcomanías: anillo de quads instanciados orientados a la normal de la superficie.
class Decals {
  constructor(max) {
    this.max = max;
    this.next = 0;
    const g = new THREE.PlaneGeometry(1, 1);
    g.setAttribute('aFrame', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
    const mat = new THREE.MeshBasicMaterial({
      map: decalAtlas(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aFrame;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (vec2(mod(aFrame, 2.0), floor(aFrame / 2.0)) + uv) * 0.5;');
    };
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.frames = g.attributes.aFrame;
  }

  add(x, y, z, nx, ny, nz, size, frame) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    if (this.mesh.count < this.max) this.mesh.count++;
    _q.setFromUnitVectors(_z, _n.set(nx, ny, nz));
    _q2.setFromAxisAngle(_z, Math.random() * Math.PI * 2);
    _q.multiply(_q2);
    _m.compose(_p.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004), _q, _s.set(size, size, size));
    this.mesh.setMatrixAt(i, _m);
    this.frames.setX(i, frame);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.frames.needsUpdate = true;
  }

  clear() { this.mesh.count = 0; this.next = 0; }
}

// Casquillos: física balística mínima con rebotes en el suelo.
class Casings {
  constructor(max, onBounce) {
    this.max = max;
    this.next = 0;
    this.onBounce = onBounce;
    this.items = [];
    const g = new THREE.CylinderGeometry(0.0055, 0.0062, 0.045, 8);
    g.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc89a3c, roughness: 0.28, metalness: 1 });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < max; i++) {
      this.items.push({ on: false, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0, t: 0, scale: 1, bounces: 0 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
  }

  spawn(x, y, z, vx, vy, vz, startScale = 1) {
    const c = this.items[this.next];
    this.next = (this.next + 1) % this.max;
    Object.assign(c, {
      on: true, x, y, z, vx, vy, vz, t: 0, bounces: 0, scale: startScale, s0: startScale,
      rx: rand(6.28), ry: rand(6.28), rz: rand(6.28), wx: rand(-22, 22), wy: rand(-14, 14), wz: rand(-30, 30),
    });
  }

  update(dt, groundAt) {
    let dirty = false;
    for (let i = 0; i < this.max; i++) {
      const c = this.items[i];
      if (!c.on) continue;
      dirty = true;
      c.t += dt;
      if (c.t > 9) { c.on = false; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); continue; }
      if (c.bounces < 4) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        const floor = groundAt(c.x, c.z, c.y) + 0.007;
        if (c.y < floor && c.vy < 0) {
          c.y = floor;
          c.bounces++;
          if (c.bounces < 4) this.onBounce?.(c.x, c.y, c.z, Math.min(1, -c.vy / 4), c.bounces);
          c.vy *= -0.36; c.vx *= 0.55; c.vz *= 0.55;
          c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5;
          if (c.bounces >= 4) { c.rx = 0; c.rz = 0; }
        }
      }
      // Sale pequeño (escala del arma en vista) y crece al alejarse de la cámara.
      c.scale = c.s0 + (1 - c.s0) * Math.min(1, c.t / 0.28);
      const fade = c.t > 8 ? 9 - c.t : 1;
      _e.set(c.rx, c.ry, c.rz);
      _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e), _s.setScalar(c.scale * fade));
      this.mesh.setMatrixAt(i, _m);
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.forEach((c, i) => { c.on = false; this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0)); });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, fog) {
    this.scene = scene;
    this.fog = fog;
    const atlas = particleAtlas();
    this.add = new ParticleSystem(2200, true, atlas);
    this.alpha = new ParticleSystem(1100, false, atlas);
    this.decals = new Decals(240);
    this.audio = null;
    this.casings = new Casings(48, (x, y, z, v, n) => this.audio?.casing(x, y, z, v, n));
    scene.add(this.decals.mesh, this.casings.mesh, this.alpha.mesh, this.add.mesh);

    // Luces dinámicas siempre presentes (intensidad 0 en reposo) para no recompilar shaders.
    this.lights = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xffb060, 0, i === 2 ? 46 : 26, 1.6);
      l.userData = { peak: 0, t: 1, dur: 0.06 };
      scene.add(l);
      this.lights.push(l);
    }
    this.emitters = [];
    this.sampleLight = null; // (x, y, z, out[3]) -> luz ambiente aproximada para teñir el humo
    this.groundAt = () => 0;
    this.onShake = null;
    this._lc = [0, 0, 0];
  }

  // Color de humo/polvo iluminado por el entorno.
  lit(x, y, z, r, g, b, boost = 1) {
    const c = this._lc;
    if (this.sampleLight) this.sampleLight(x, y, z, c); else { c[0] = c[1] = c[2] = 0.08; }
    c[0] = Math.min(1.6, c[0] * boost) * r; c[1] = Math.min(1.6, c[1] * boost) * g; c[2] = Math.min(1.6, c[2] * boost) * b;
    return c;
  }

  // Destello de luz puntual: slot 0 arma del jugador, 1 enemigos, 2 explosiones.
  flash(slot, x, y, z, color, peak, dur) {
    const l = this.lights[slot];
    l.position.set(x, y, z);
    l.color.set(color);
    l.userData.peak = peak; l.userData.t = 0; l.userData.dur = dur;
    l.intensity = peak;
  }

  addEmitter(e) { e.acc = 0; this.emitters.push(e); return e; }

  update(dt, camera) {
    for (const l of this.lights) {
      const u = l.userData;
      if (u.t < 1) {
        u.t = Math.min(1, u.t + dt / u.dur);
        l.intensity = u.peak * (1 - u.t) * (1 - u.t);
      } else if (l.intensity !== 0) l.intensity = 0;
    }
    const cx = camera.position.x; const cz = camera.position.z;
    for (const e of this.emitters) {
      if (e.off) continue;
      const dx = e.x - cx; const dz = e.z - cz;
      if (dx * dx + dz * dz > 85 * 85) continue;
      e.acc += e.rate * dt;
      while (e.acc >= 1) { e.acc -= 1; e.emit(this, e); }
    }
    this.casings.update(dt, this.groundAt);
    this.add.update(dt);
    this.alpha.update(dt);
    for (const s of [this.add, this.alpha]) {
      s.uniforms.uFogColor.value.copy(this.fog.color);
      s.uniforms.uFogDensity.value = this.fog.density;
    }
  }

  reset() {
    this.add.clear(); this.alpha.clear(); this.decals.clear(); this.casings.clear();
    this.emitters = this.emitters.filter((e) => !e.temp);
    this.emitters.forEach((e) => { e.off = false; });
  }
}
