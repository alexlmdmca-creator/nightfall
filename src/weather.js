// Clima: lluvia 3D (trazos instanciados animados en GPU e iluminados por las luminarias cercanas),
// salpicaduras en el suelo y relámpagos. Los mismos trazos, lentos, cortos y anchos, hacen de nieve.
import * as THREE from 'three';
import { rand } from './utils.js';

export const RAIN_LIGHTS = 8;

const LIGHT_PARS = /* glsl */ `
uniform vec4 uLPos[${RAIN_LIGHTS}];  // xyz, alcance
uniform vec4 uLCol[${RAIN_LIGHTS}];  // rgb, coseno del cono (-1 = omnidireccional)
uniform vec3 uLDir[${RAIN_LIGHTS}];
uniform vec3 uAmbient;
uniform vec4 uDry;   // x0, z0, x1, z1 de la zona bajo techo
uniform float uDryY;
vec3 rainLight(vec3 p) {
  vec3 light = uAmbient;
  for (int i = 0; i < ${RAIN_LIGHTS}; i++) {
    vec3 L = uLPos[i].xyz - p;
    float d = length(L);
    float att = max(0.0, 1.0 - d / uLPos[i].w);
    float cone = uLCol[i].w < -0.5 ? 1.0 : smoothstep(uLCol[i].w - 0.02, uLCol[i].w + 0.14, dot(-L / max(d, 1e-3), uLDir[i]));
    light += uLCol[i].rgb * (att * att * cone);
  }
  return light;
}
float covered(vec3 p) {
  return step(uDry.x, p.x) * step(p.x, uDry.z) * step(uDry.y, p.z) * step(p.z, uDry.w) * step(p.y, uDryY);
}`;

export class Weather {
  constructor(scene, dry) {
    this.time = 0;
    this.intensity = 1;
    this.flash = 0;
    this.nextStrike = rand(5, 9);
    this.strikeQueue = [];
    this.onThunder = null;
    this.active = true; // hay precipitación (lluvia o nieve)
    this.storm = true; // relámpagos y truenos (sólo con lluvia)
    this.ambient = [0.05, 0.065, 0.09]; // luz base de las gotas o los copos

    const lightUniforms = {
      uLPos: { value: Array.from({ length: RAIN_LIGHTS }, () => new THREE.Vector4(0, -100, 0, 1)) },
      uLCol: { value: Array.from({ length: RAIN_LIGHTS }, () => new THREE.Vector4(0, 0, 0, -1)) },
      uLDir: { value: Array.from({ length: RAIN_LIGHTS }, () => new THREE.Vector3(0, -1, 0)) },
      uAmbient: { value: new THREE.Color(0.05, 0.065, 0.09) },
      uDry: { value: new THREE.Vector4(dry.x0, dry.z0, dry.x1, dry.z1) },
      uDryY: { value: dry.y },
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
    };
    this.lu = lightUniforms;

    // ---------- Lluvia ----------
    const COUNT = 15000;
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2));
    const seed = new Float32Array(COUNT * 4);
    for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(seed, 4));
    g.instanceCount = COUNT;
    this.rainUniforms = {
      ...lightUniforms,
      uBox: { value: new THREE.Vector3(38, 22, 38) },
      uWind: { value: new THREE.Vector3(1.6, 0, 0.7) },
      uSpeed: { value: 13 },
      uAlpha: { value: 1.0 },
      uLen: { value: 1 }, // largo y ancho relativos del trazo (la nieve: corto y ancho)
      uWidth: { value: 1 },
    };
    const rain = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 corner; attribute vec4 seed;
        uniform vec3 uCam, uBox, uWind; uniform float uTime, uSpeed, uAlpha, uLen, uWidth;
        varying vec3 vCol; varying vec2 vC;
        ${LIGHT_PARS}
        void main() {
          float speed = uSpeed * (0.78 + seed.w * 0.44);
          float h = mod(seed.y * uBox.y - uTime * speed, uBox.y);
          vec2 drift = uWind.xz * ((uBox.y - h) / speed);
          vec3 p;
          p.xz = mod(seed.xz * uBox.xz + drift - uCam.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5 + uCam.xz;
          p.y = h + uCam.y - uBox.y * 0.38;
          vec3 vel = normalize(vec3(uWind.x, -speed, uWind.z));
          vec3 side = normalize(cross(vel, cameraPosition - p));
          float len = (0.42 + seed.w * 0.38) * uLen;
          vec3 wp = p - vel * corner.y * len + side * corner.x * (0.007 + seed.x * 0.008) * uWidth;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          float fade = smoothstep(0.7, 3.2, dist) * (1.0 - smoothstep(14.0, 19.0, length(p.xz - uCam.xz)));
          float vis = step(0.02, p.y) * (1.0 - covered(p));
          vCol = rainLight(p) * (uAlpha * fade * vis * (0.55 + seed.z * 0.7));
          vC = corner;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying vec2 vC;
        void main() {
          float a = max(1.0 - abs(vC.x) * 2.0, 0.0) * smoothstep(0.0, 0.25, vC.y) * (1.0 - smoothstep(0.55, 1.0, vC.y));
          gl_FragColor = vec4(min(max(vCol, 0.0) * a, vec3(6.0)), 1.0);
        }`,
    }));
    rain.frustumCulled = false;
    rain.renderOrder = 18;
    this.rain = rain;

    // ---------- Salpicaduras en el suelo ----------
    const SPL = 2600;
    const sg = new THREE.InstancedBufferGeometry();
    sg.setIndex([0, 1, 2, 0, 2, 3]);
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
    sg.setAttribute('corner', new THREE.Float32BufferAttribute([-0.5, 0, 0.5, 0, 0.5, 1, -0.5, 1], 2));
    const sseed = new Float32Array(SPL * 4);
    for (let i = 0; i < sseed.length; i++) sseed[i] = Math.random();
    sg.setAttribute('seed', new THREE.InstancedBufferAttribute(sseed, 4));
    sg.instanceCount = SPL;
    this.splashUniforms = { ...lightUniforms, uBox: { value: new THREE.Vector3(30, 0, 30) } };
    const splash = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      uniforms: this.splashUniforms,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec2 corner; attribute vec4 seed;
        uniform vec3 uCam, uBox; uniform float uTime;
        varying vec3 vCol; varying vec2 vC; varying float vLife;
        ${LIGHT_PARS}
        float h1(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          float period = 0.75 + seed.w * 0.6;
          float tt = uTime / period + seed.y;
          float cyc = floor(tt);
          float life = fract(tt) / 0.3; // visible sólo el primer 30 % del ciclo
          vec2 rnd = vec2(h1(seed.xz * 91.7 + cyc), h1(seed.zx * 47.3 + cyc * 1.31));
          vec3 p = vec3(0.0, 0.015, 0.0);
          p.xz = mod(rnd * uBox.xz - uCam.xz + uBox.xz * 0.5, uBox.xz) - uBox.xz * 0.5 + uCam.xz;
          float s = (0.02 + seed.x * 0.03) * (0.5 + life * 0.9);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 wp = p + right * corner.x * s * 1.3 + vec3(0.0, corner.y * s * (0.9 + 1.2 * life), 0.0);
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float vis = step(life, 1.0) * (1.0 - covered(p + vec3(0.0, 0.5, 0.0))) * (1.0 - smoothstep(10.0, 15.0, length(p.xz - uCam.xz)));
          vCol = rainLight(p + vec3(0.0, 0.3, 0.0)) * (vis * (1.0 - life) * 0.55);
          vC = corner; vLife = life;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying vec2 vC; varying float vLife;
        void main() {
          // Corona de salpicadura: arco que se abre.
          // Pequeña pluma vertical que se abre en "V" al envejecer.
          float x = abs(vC.x) * 2.0;
          float a = (1.0 - smoothstep(0.0, 1.0, x)) * (1.0 - smoothstep(0.15, 1.0, vC.y));
          gl_FragColor = vec4(min(max(vCol, 0.0) * a, vec3(6.0)), 1.0);
        }`,
    }));
    splash.frustumCulled = false;
    splash.renderOrder = 17;
    this.splash = splash;
    scene.add(rain, splash);
  }

  // Zona bajo techo donde no llueve: { x0, z0, x1, z1, y }.
  setDry(dry) {
    this.lu.uDry.value.set(dry.x0, dry.z0, dry.x1, dry.z1);
    this.lu.uDryY.value = dry.y;
  }

  // Tipo de precipitación: 'rain' (lluvia con tormenta), 'snow' (nevada tranquila) o 'none'.
  setMode(mode) {
    const snow = mode === 'snow';
    this.active = mode !== 'none';
    this.storm = mode === 'rain';
    this.rain.visible = this.active;
    this.splash.visible = this.storm;
    const u = this.rainUniforms;
    u.uSpeed.value = snow ? 1.7 : 13;
    u.uLen.value = snow ? 0.085 : 1;
    u.uWidth.value = snow ? 2.6 : 1;
    u.uWind.value.set(snow ? 1.1 : 1.6, 0, snow ? 0.45 : 0.7);
    this.ambient = snow ? [0.62, 0.66, 0.74] : [0.05, 0.065, 0.09];
    if (!this.storm) { this.flash = 0; this.strikeQueue.length = 0; }
  }

  // Elige las luminarias más influyentes cerca de la cámara y las pasa a los shaders de lluvia.
  setLights(camPos, lamps, extra) {
    const scored = [];
    for (const l of lamps) {
      if (l.k <= 0.02) continue;
      const d = Math.hypot(l.x - camPos.x, l.z - camPos.z);
      if (d > l.range + 20) continue;
      scored.push([d - l.range * 0.6, l]);
    }
    scored.sort((a, b) => a[0] - b[0]);
    let n = 0;
    const P = this.lu.uLPos.value; const C = this.lu.uLCol.value; const D = this.lu.uLDir.value;
    for (const e of extra) {
      if (n >= RAIN_LIGHTS || e.intensity <= 0.001) continue;
      P[n].set(e.x, e.y, e.z, e.range); C[n].set(e.r * e.intensity, e.g * e.intensity, e.b * e.intensity, e.cos ?? -1);
      if (e.dir) D[n].copy(e.dir);
      n++;
    }
    for (let i = 0; i < scored.length && n < RAIN_LIGHTS; i++, n++) {
      const l = scored[i][1];
      const s = l.k * l.strength * 2.4;
      P[n].set(l.x, l.y, l.z, l.range); C[n].set(l.r * s, l.g * s, l.b * s, l.cos > -0.99 ? l.cos : -1); D[n].copy(l.dir);
    }
    for (; n < RAIN_LIGHTS; n++) C[n].set(0, 0, 0, -1);
  }

  update(dt, camera) {
    this.time += dt;
    this.lu.uTime.value = this.time;
    this.lu.uCam.value.copy(camera.position);
    const amb = this.lu.uAmbient.value;
    if (!this.storm) { amb.setRGB(this.ambient[0], this.ambient[1], this.ambient[2]); return; }
    // Relámpagos: uno o varios destellos encadenados y el trueno con retardo.
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) {
      this.nextStrike = rand(11, 26);
      const close = Math.random();
      const n = 1 + Math.floor(Math.random() * 3);
      let t = 0;
      for (let i = 0; i < n; i++) { this.strikeQueue.push({ t, power: (0.5 + Math.random() * 0.5) * (0.5 + close * 0.5) }); t += rand(0.06, 0.22); }
      this.strikeQueue.push({ t: 0.25 + (1 - close) * 2.2, thunder: close });
    }
    for (let i = this.strikeQueue.length - 1; i >= 0; i--) {
      const s = this.strikeQueue[i];
      s.t -= dt;
      if (s.t <= 0) {
        if (s.thunder !== undefined) this.onThunder?.(s.thunder); else this.flash = Math.max(this.flash, s.power);
        this.strikeQueue.splice(i, 1);
      }
    }
    this.flash *= Math.exp(-dt * 7.5);
    if (this.flash < 0.002) this.flash = 0;
    amb.setRGB(this.ambient[0] + this.flash * 1.2, this.ambient[1] + this.flash * 1.4, this.ambient[2] + this.flash * 1.9);
  }
}
