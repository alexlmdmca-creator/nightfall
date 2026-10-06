// Luz volumétrica simulada: conos aditivos con bordes suaves, caída axial y niebla animada,
// más destellos (sprites) para bombillas y linternas.
import * as THREE from 'three';

const shared = { uTime: { value: 0 } };
export function tickVolumetrics(time) { shared.uTime.value = time; }

const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vT;
void main() {
  vT = 1.0 - uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vV = mv.xyz;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity, uEdge, uFall, uTime, uFogDensity;
varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vT;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  float dist = length(vV);
  float edge = pow(abs(dot(normalize(vN), vV / dist)), uEdge);
  float axial = pow(max(1.0 - vT, 0.0), uFall) * smoothstep(0.0, 0.04, vT);
  float n = 0.55 + 0.75 * noise(vW * 0.55 + vec3(uTime * 0.35, -uTime * 0.5, uTime * 0.12));
  float nearFade = smoothstep(0.3, 2.5, dist);
  float fog = exp(-uFogDensity * uFogDensity * dist * dist);
  gl_FragColor = vec4(uColor * (uIntensity * edge * axial * n * nearFade * fog), 1.0);
}`;

// Cono con el vértice en el origen que se abre hacia -Y (lámparas cenitales) o +Z (linternas).
export function coneGeometry(radius, length, alongZ = false) {
  const g = new THREE.ConeGeometry(radius, length, 28, 6, true);
  g.translate(0, -length / 2, 0);
  if (alongZ) g.rotateX(-Math.PI / 2);
  return g;
}

export function coneMaterial(color, intensity = 0.35, edge = 1.6, fall = 1.5) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uEdge: { value: edge }, uFall: { value: fall },
      uTime: shared.uTime, uFogDensity: { value: 0.012 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// Destello de bombilla: sprite aditivo con atenuación por distancia para que no "queme" de cerca.
let _flareTex = null;
function flareTexture() {
  if (_flareTex) return _flareTex;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1; const v = (y + 0.5) / S * 2 - 1;
      const r = Math.hypot(u, v);
      const core = Math.exp(-r * r * 18);
      const halo = Math.exp(-r * 3.2) * 0.35;
      const streak = Math.exp(-Math.abs(v) * 26) * Math.exp(-Math.abs(u) * 2.4) * 0.55 + Math.exp(-Math.abs(u) * 40) * Math.exp(-Math.abs(v) * 5) * 0.18;
      const a = Math.min(1, (core + halo + streak) * Math.max(0, 1 - r));
      const i = (y * S + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255; data[i + 3] = a * 255;
    }
  }
  _flareTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  _flareTex.magFilter = _flareTex.minFilter = THREE.LinearFilter;
  _flareTex.needsUpdate = true;
  return _flareTex;
}

export function flare(color, size = 1.4, intensity = 1.5) {
  const mat = new THREE.SpriteMaterial({ map: flareTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
  mat.color.set(color).multiplyScalar(intensity);
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 22;
  return s;
}
