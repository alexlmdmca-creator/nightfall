// Cúpula de cielo con dos aspectos según el mapa: noche nublada con resplandor urbano y relámpagos,
// o día despejado con sol, calima y nubes altas.
import * as THREE from 'three';

// Color de la niebla = color del horizonte, para que la geometría lejana se funda con el cielo.
// Éste es el de la noche de Sector 7; cada mapa define el suyo en su ambiente.
export const FOG_COLOR = new THREE.Color().setRGB(0.022, 0.03, 0.044);

export function createSky() {
  const uniforms = {
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uFlashDir: { value: new THREE.Vector3(0.4, 0.5, -0.76).normalize() },
    uHorizon: { value: FOG_COLOR.clone() },
    uZenith: { value: new THREE.Color().setRGB(0.006, 0.009, 0.016) },
    uDay: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uCloud: { value: 0.5 }, // cuánta nube alta hay de día
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        // Sólo la rotación de la vista: la cúpula acompaña siempre a la cámara.
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww; // siempre al fondo
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform float uTime, uFlash, uDay, uCloud;
      uniform vec3 uFlashDir, uHorizon, uZenith, uSunDir, uSunCol;
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col;
        if (uDay > 0.5) {
          // Degradado de calima a azul, halo y disco del sol, y nubes altas iluminadas.
          col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.8, h), 0.55));
          float mu = max(dot(d, uSunDir), 0.0);
          col += uSunCol * (pow(mu, 6.0) * 0.16 + pow(mu, 48.0) * 0.5);
          col += uSunCol * smoothstep(0.9993, 0.9997, mu) * 24.0;
          vec2 cuv = d.xz / (h + 0.3) * 0.8 + uTime * vec2(0.004, 0.0015);
          float c = smoothstep(0.5, 0.82, fbm(cuv)) * smoothstep(0.02, 0.3, h);
          vec3 lit = mix(uHorizon * 1.25, uSunCol * 0.95, 0.35 + 0.5 * pow(mu, 3.0));
          col = mix(col, lit, c * uCloud);
        } else {
          col = mix(uHorizon, uZenith, smoothstep(0.1, 0.65, h));
          // Contaminación lumínica de una ciudad lejana.
          float az = max(dot(normalize(d.xz + 1e-5), normalize(vec2(0.55, -0.83))), 0.0);
          col += vec3(0.20, 0.095, 0.03) * pow(az, 4.0) * exp(-h * 6.0) * 0.55;
          // Nubes proyectadas sobre un plano.
          vec2 cuv = d.xz / (h + 0.22) * 1.1 + uTime * vec2(0.011, 0.004);
          float c = fbm(cuv);
          float c2 = fbm(cuv * 2.3 - uTime * 0.01);
          float fade = smoothstep(0.1, 0.45, h);
          col *= mix(1.0, 0.45 + c * 1.1, fade);
          // Relámpago: ilumina las nubes desde dentro.
          float near = pow(max(dot(d, uFlashDir), 0.0), 3.0);
          col += vec3(0.5, 0.62, 0.95) * uFlash * (0.05 + c * c2 * 0.9 * (0.25 + near * 3.0)) * mix(0.4, 1.0, fade);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'sky';
  return { mesh, uniforms };
}
