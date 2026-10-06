// Sistema de partículas en pool: quads instanciados (1 draw call por sistema), simulación en CPU
// con arrays tipados. Modos: 0 billboard, 1 estirado a lo largo de la velocidad, 2 plano en el suelo.
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS } from './sprites.js';

const VERT = /* glsl */ `
attribute vec2 corner;
attribute vec3 iPos;
attribute vec3 iAxis;
attribute vec4 iParams; // tamaño, rotación, marco, alfa
attribute vec4 iColor;  // rgb + modo
uniform vec2 uAtlas;
uniform float uFogDensity, uNearFade;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  float size = iParams.x;
  float mode = iColor.a;
  float c = cos(iParams.y), s = sin(iParams.y);
  vec2 q = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c) * size;
  vec3 wp;
  if (mode > 1.5) {
    wp = iPos + vec3(q.x, 0.0, q.y);
  } else if (mode > 0.5) {
    float len = length(iAxis) + 1e-5;
    vec3 dir = iAxis / len;
    vec3 side = normalize(cross(dir, cameraPosition - iPos) + vec3(1e-5));
    wp = iPos + dir * corner.x * len + side * corner.y * size;
  } else {
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    wp = iPos + right * q.x + up * q.y;
  }
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mv;
  float fr = iParams.z;
  vUv = (vec2(mod(fr, uAtlas.x), floor(fr / uAtlas.x)) + corner + 0.5) / uAtlas;
  float dist = -mv.z;
  vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  float nearFade = smoothstep(0.06, 0.06 + size * uNearFade, dist);
  vColor = vec4(iColor.rgb, iParams.w * nearFade);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tAtlas;
uniform vec3 uFogColor;
uniform float uAdditive;
varying vec2 vUv;
varying vec4 vColor;
varying float vFog;
void main() {
  vec4 t = texture2D(tAtlas, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  vec3 c = t.rgb * vColor.rgb;
  if (uAdditive > 0.5) gl_FragColor = vec4(c * (1.0 - vFog), a);
  else gl_FragColor = vec4(mix(c, uFogColor, vFog), a);
}`;

const F = (n) => new Float32Array(n);

export class ParticleSystem {
  constructor(max, additive, atlas) {
    this.max = max;
    this.hi = 0;
    this.cursor = 0;
    this.alive = new Uint8Array(max);
    this.px = F(max); this.py = F(max); this.pz = F(max);
    this.vx = F(max); this.vy = F(max); this.vz = F(max);
    this.life = F(max); this.maxLife = F(max);
    this.s0 = F(max); this.s1 = F(max);
    this.rot = F(max); this.rotV = F(max);
    this.frame = F(max);
    this.cr = F(max); this.cg = F(max); this.cb = F(max);
    this.a0 = F(max); this.fadeIn = F(max); this.fadeK = F(max);
    this.grav = F(max); this.drag = F(max);
    this.mode = F(max); this.stretch = F(max); this.len = F(max);
    this.bounce = new Uint8Array(max);

    const g = new THREE.InstancedBufferGeometry();
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5], 2));
    const attr = (size) => new THREE.InstancedBufferAttribute(F(max * size), size).setUsage(THREE.DynamicDrawUsage);
    this.aPos = attr(3); this.aAxis = attr(3); this.aParams = attr(4); this.aColor = attr(4);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iAxis', this.aAxis);
    g.setAttribute('iParams', this.aParams); g.setAttribute('iColor', this.aColor);
    g.instanceCount = 0;
    this.geometry = g;

    this.uniforms = {
      tAtlas: { value: atlas },
      uAtlas: { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0.016 },
      uNearFade: { value: additive ? 0.4 : 1.1 },
      uAdditive: { value: additive ? 1 : 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 21 : 20;
  }

  // Devuelve el índice emitido. Reutiliza la partícula más antigua si el pool está lleno.
  emit(o) {
    let i = this.cursor;
    for (let n = 0; n < this.max; n++) {
      if (!this.alive[i]) break;
      i = (i + 1) % this.max;
    }
    this.cursor = (i + 1) % this.max;
    if (i >= this.hi) this.hi = i + 1;
    this.alive[i] = 1;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0; this.vz[i] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life || 1;
    this.s0[i] = o.size || 0.1; this.s1[i] = o.sizeEnd !== undefined ? o.sizeEnd : this.s0[i];
    this.rot[i] = o.rot || 0; this.rotV[i] = o.rotV || 0;
    this.frame[i] = o.frame || 0;
    this.cr[i] = o.r !== undefined ? o.r : 1; this.cg[i] = o.g !== undefined ? o.g : 1; this.cb[i] = o.b !== undefined ? o.b : 1;
    this.a0[i] = o.alpha !== undefined ? o.alpha : 1;
    this.fadeIn[i] = o.fadeIn || 0; this.fadeK[i] = o.fadeK || 1;
    this.grav[i] = o.gravity || 0; this.drag[i] = o.drag || 0;
    this.mode[i] = o.mode || 0; this.stretch[i] = o.stretch || 0; this.len[i] = o.len || 0;
    this.bounce[i] = o.bounce ? 1 : 0;
    return i;
  }

  update(dt) {
    const P = this.aPos.array; const A = this.aAxis.array; const Q = this.aParams.array; const C = this.aColor.array;
    let n = 0;
    let hi = 0;
    for (let i = 0; i < this.hi; i++) {
      if (!this.alive[i]) continue;
      const life = (this.life[i] -= dt);
      if (life <= 0) { this.alive[i] = 0; continue; }
      hi = i + 1;
      let vx = this.vx[i]; let vy = this.vy[i]; let vz = this.vz[i];
      vy -= this.grav[i] * dt;
      if (this.drag[i] > 0) { const k = Math.exp(-this.drag[i] * dt); vx *= k; vy *= k; vz *= k; }
      this.px[i] += vx * dt; this.py[i] += vy * dt; this.pz[i] += vz * dt;
      if (this.bounce[i] && this.py[i] < 0.015 && vy < 0) {
        this.py[i] = 0.015; vy *= -0.38; vx *= 0.62; vz *= 0.62;
      }
      this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
      this.rot[i] += this.rotV[i] * dt;

      const t = 1 - life / this.maxLife[i];
      const fi = this.fadeIn[i];
      const alpha = this.a0[i] * (fi > 0 && t < fi ? t / fi : 1) * Math.min(1, (1 - t) * this.fadeK[i]);
      const p3 = n * 3; const p4 = n * 4;
      P[p3] = this.px[i]; P[p3 + 1] = this.py[i]; P[p3 + 2] = this.pz[i];
      const mode = this.mode[i];
      if (mode === 1) {
        const sp = Math.hypot(vx, vy, vz) + 1e-6;
        const L = this.len[i] > 0 ? this.len[i] : Math.max(this.s0[i], sp * this.stretch[i]);
        A[p3] = (vx / sp) * L; A[p3 + 1] = (vy / sp) * L; A[p3 + 2] = (vz / sp) * L;
      }
      Q[p4] = this.s0[i] + (this.s1[i] - this.s0[i]) * t; Q[p4 + 1] = this.rot[i]; Q[p4 + 2] = this.frame[i]; Q[p4 + 3] = alpha;
      C[p4] = this.cr[i]; C[p4 + 1] = this.cg[i]; C[p4 + 2] = this.cb[i]; C[p4 + 3] = mode;
      n++;
    }
    this.hi = hi;
    this.geometry.instanceCount = n;
    if (n > 0) {
      for (const [a, size] of [[this.aPos, 3], [this.aAxis, 3], [this.aParams, 4], [this.aColor, 4]]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * size);
        a.needsUpdate = true;
      }
    }
  }

  clear() { this.alive.fill(0); this.hi = 0; this.geometry.instanceCount = 0; }
}
