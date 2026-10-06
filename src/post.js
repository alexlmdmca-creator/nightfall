// Cadena de postprocesado: escena HDR con MSAA -> bloom -> tonemapping ACES -> pase final
// (aberración cromática, viñeta, grano, etalonaje y efectos de daño).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/addons/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uCA: { value: 0.012 },
    uVignette: { value: 0.62 },
    uGrain: { value: 0.055 },
    uDamage: { value: 0 },
    uSat: { value: 1.0 },
    uFade: { value: 1.0 },
    uFlash: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uCA, uVignette, uGrain, uDamage, uSat, uFade, uFlash;
    varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * (r2 * uCA + uDamage * 0.004);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // Etalonaje: sombras frías, luces cálidas, algo más de contraste.
      col = mix(vec3(l), col, uSat);
      col *= mix(vec3(0.90, 0.99, 1.10), vec3(1.05, 1.0, 0.95), smoothstep(0.0, 0.65, l));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      col *= 1.0 - uVignette * smoothstep(0.12, 0.95, r2 * 2.1);
      float n = hash(vUv * uRes + fract(uTime * 7.13) * 311.0) - 0.5;
      col += n * uGrain * (1.0 - l * 0.55);
      // Daño: bordes rojos y pérdida de color.
      float edge = smoothstep(0.22, 0.95, r2 * 1.9);
      col = mix(col, vec3(l * 1.35 + 0.06, l * 0.18, l * 0.14), uDamage * edge);
      col += uFlash;
      gl_FragColor = vec4(max(col, 0.0) * uFade, 1.0);
    }
  `,
};

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.pixelRatio = 1;
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthBuffer: true });
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
    this.composer.addPass(new TexturePass(this.sceneRT.texture));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.62, 0.72, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.u = this.final.uniforms;
  }

  setMSAA(samples) {
    if (this.sceneRT.samples === samples) return;
    this.sceneRT.samples = samples;
    this.sceneRT.dispose();
  }

  setSize(w, h, pixelRatio) {
    this.pixelRatio = pixelRatio;
    const pw = Math.max(2, Math.floor(w * pixelRatio));
    const ph = Math.max(2, Math.floor(h * pixelRatio));
    this.sceneRT.setSize(pw, ph);
    this.composer.setPixelRatio(1);
    this.composer.setSize(pw, ph);
    this.u.uRes.value.set(pw, ph);
    this.width = pw;
    this.height = ph;
  }

  render(scene, camera, dt, time) {
    const r = this.renderer;
    this.u.uTime.value = time;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    this.composer.render(dt);
  }
}
