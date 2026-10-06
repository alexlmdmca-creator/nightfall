// GLSL inyectado en MeshStandardMaterial para el suelo: mezcla de asfalto/hormigón/tierra por posición,
// marcas viales analíticas, humedad, charcos con ondas de lluvia y reflejo planar con estela vertical.
// Cada mapa aporta sus marcas pintadas y sus zonas bajo techo; el resto es común.
import { ROAD, PARKING, WAREHOUSE } from './layout.js';

const f = (n) => Number(n).toFixed(2);

export const groundParsFragment = /* glsl */ `
uniform sampler2D tAsphalt, tAsphaltN, tAsphaltO, tConcrete, tConcreteN, tConcreteO, tControl, tNoise, tRefl;
uniform mat4 uReflMatrix;
uniform float uTime, uRain, uReflOn, uWet;
uniform vec3 uDirtTint; // tinte de la tierra
uniform vec4 uTuft;     // color de las matas y cuánto se ven
uniform vec4 uSnowG;    // color del manto de nieve y cuánto cubre (0 = sin nieve)
uniform vec3 uMapRect; // cx, cz, tamaño
varying vec3 vGWorld;

float gHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 gHash2(vec2 p) { float n = gHash(p); return vec2(n, gHash(p + n * 37.0 + 1.7)); }

// Anillos concéntricos de gotas en una rejilla; devuelve la inclinación XZ de la normal.
vec2 gRipples(vec2 uv, float t) {
  vec2 cell = floor(uv), fr = fract(uv), acc = vec2(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 id = cell + o;
    float h = gHash(id);
    float tt = t * (0.85 + h * 0.6) + h * 7.0;
    float life = fract(tt);
    vec2 c = o + gHash2(id + floor(tt) * 3.7);
    vec2 d = fr - c;
    float dist = length(d) + 1e-4;
    float rad = life * 0.85;
    float w = sin((dist - rad) * 36.0) * (1.0 - smoothstep(0.0, 0.11, abs(dist - rad))) * (1.0 - life) * (1.0 - life);
    acc += (d / dist) * w;
  }
  return acc;
}

float gBox(vec2 p, vec2 lo, vec2 hi, float soft) {
  vec2 a = smoothstep(lo - soft, lo + soft, p) * (1.0 - smoothstep(hi - soft, hi + soft, p));
  return a.x * a.y;
}
float gLine(float d, float halfW) { return 1.0 - smoothstep(halfW - 0.015, halfW + 0.015, abs(d)); }
`;

// Variables que produce este bloque: gAlb, gRough, gN (mundo), gSpec, gAO, gSmear, gLod.
// marks: GLSL que define los float white, yellow, hz y hzStripe (pintura del suelo).
// indoor: expresión GLSL (float 0-1) de las zonas bajo techo.
export const groundMainFragment = (marks, indoor) => /* glsl */ `
vec2 gp = vGWorld.xz;
vec4 ctrl = texture2D(tControl, (gp - uMapRect.xy) / uMapRect.z + 0.5);
float nLo = texture2D(tNoise, gp * 0.019).r;
float nMid = texture2D(tNoise, gp * 0.11 + 0.37).r;
float nHi = texture2D(tNoise, gp * 0.83 + 0.11).r;

vec2 uvA = gp / 5.0;
vec2 uvC = gp / 4.0;
vec3 albA = texture2D(tAsphalt, uvA).rgb;
vec3 nA = texture2D(tAsphaltN, uvA).xyz * 2.0 - 1.0;
float rA = texture2D(tAsphaltO, uvA).g;
vec3 albC = texture2D(tConcrete, uvC).rgb;
vec3 nC = texture2D(tConcreteN, uvC).xyz * 2.0 - 1.0;
float rC = texture2D(tConcreteO, uvC).g;

float wC = smoothstep(0.42, 0.58, ctrl.b + (nHi - 0.5) * 0.12);
float wD = smoothstep(0.3, 0.7, ctrl.a + (nMid - 0.5) * 0.55);
vec3 gAlb = mix(albA, albC, wC);
vec3 nT = mix(nA, nC, wC);
float gRough = mix(rA, rC, wC);

// Tierra/grava fuera del asfalto: el propio asfalto a otra escala, teñido.
vec2 uvD = gp / 3.3 + 0.5;
vec3 albD = texture2D(tAsphalt, uvD).rgb * uDirtTint * (0.5 + nLo * 0.7);
albD = mix(albD, uTuft.rgb, smoothstep(0.55, 0.8, nMid) * uTuft.a); // matas de hierba
vec3 nD = texture2D(tAsphaltN, uvD).xyz * 2.0 - 1.0;
gAlb = mix(gAlb, albD, wD);
nT = mix(nT, nD * vec3(1.6, 1.6, 1.0), wD);
gRough = mix(gRough, 0.96, wD);
gAlb *= 0.72 + 0.56 * nLo; // variación macro para romper el tileado
// Nieve: cubre la tierra y deja manchas sobre lo pavimentado.
float snowW = uSnowG.a * max(wD, smoothstep(0.42, 0.7, nMid * 0.6 + nLo * 0.55) * 0.75);
gAlb = mix(gAlb, uSnowG.rgb * (0.82 + 0.3 * nLo), snowW);
nT.xy *= 1.0 - 0.75 * snowW;
gRough = mix(gRough, 0.93, snowW);

// ---- Marcas viales (analíticas, nítidas a cualquier distancia) ----
float wear = smoothstep(0.28, 0.62, nHi * 0.6 + nMid * 0.5);
${marks}
gAlb = mix(gAlb, vec3(0.5, 0.5, 0.48), white * 0.9);
gAlb = mix(gAlb, vec3(0.55, 0.38, 0.03), yellow * 0.9);
gAlb = mix(gAlb, mix(vec3(0.015), vec3(0.6, 0.42, 0.03), hzStripe), hz * (0.45 + 0.5 * wear));
float paint = max(max(white, yellow), hz * 0.8);
gRough = mix(gRough, 0.55, paint);
nT.xy *= 1.0 - 0.6 * paint;

// ---- Humedad y charcos ----
// Exposición a la lluvia: 0 bajo techo.
float indoor = ${indoor};
float expo = 1.0 - indoor;
float wet = (0.62 + 0.38 * nLo) * expo * uWet;
float pud = smoothstep(0.44, 0.6, ctrl.r + (nHi - 0.5) * 0.2 + (nMid - 0.5) * 0.1) * expo * uWet;
`;

// Marcas de Sector 7: carretera de acceso, plazas de aparcamiento y franja de peligro del almacén.
export const SECTOR7_MARKS = /* glsl */ `
float road = step(${f(ROAD.zNorth + 3)}, gp.y) * step(abs(gp.x), ${f(ROAD.halfW)});
float pEdge = gLine(abs(gp.x) - ${f(ROAD.halfW - 0.45)}, 0.075) * road;
float pCenter = gLine(gp.x, 0.075) * step(fract(gp.y / 7.5), 0.4) * road;
float pStop = gLine(gp.y - ${f(ROAD.zNorth + 4.2)}, 0.22) * step(abs(gp.x), ${f(ROAD.halfW - 0.5)});
// Plazas de aparcamiento: dos filas enfrentadas.
float inPark = step(${f(PARKING.x0)}, gp.x) * step(gp.x, ${f(PARKING.x1)});
float stallX = gLine(mod(gp.x - ${f(PARKING.x0)} + ${f(PARKING.stall / 2)}, ${f(PARKING.stall)}) - ${f(PARKING.stall / 2)}, 0.06);
float rowA = step(${f(PARKING.z1 - 5.5)}, gp.y) * step(gp.y, ${f(PARKING.z1)});
float rowB = step(${f(PARKING.z0)}, gp.y) * step(gp.y, ${f(PARKING.z0 + 5.5)});
float pStall = inPark * stallX * max(rowA, rowB);
float white = max(max(pEdge, pStop), pStall) * wear * (1.0 - wD) * (1.0 - wC);
float yellow = pCenter * wear;
// Franja de peligro en la entrada del almacén.
float hz = gBox(gp, vec2(${f(WAREHOUSE.doorX0 - 0.6)}, ${f(WAREHOUSE.z1 - 0.1)}), vec2(${f(WAREHOUSE.doorX1 + 0.6)}, ${f(WAREHOUSE.z1 + 0.55)}), 0.02);
float hzStripe = step(0.5, fract((gp.x + gp.y) * 1.4));
`;

// Mapa sin pintura en el suelo.
export const NO_MARKS = 'float white = 0.0; float yellow = 0.0; float hz = 0.0; float hzStripe = 0.0;';

// Expresión GLSL de "bajo techo" a partir de rectángulos { x0, x1, z0, z1 }.
export const indoorGLSL = (rects) => (rects.length
  ? `min(1.0, ${rects.map((r) => `gBox(gp, vec2(${f(r.x0)}, ${f(r.z0)}), vec2(${f(r.x1)}, ${f(r.z1)}), 0.9)`).join(' + ')})`
  : '0.0');

// Resto del bloque común: humedad sobre el albedo, normal, reflejo planar.
export const groundTailFragment = /* glsl */ `
gAlb *= mix(1.0, 0.42, wet);
gAlb = mix(gAlb, gAlb * 0.45, pud);
gRough = mix(gRough, mix(0.26, 0.46, nMid) + wD * 0.25, wet);
float filmRough = gRough;
gRough = mix(gRough, 0.05, pud);

vec2 tilt = nT.xy * mix(1.0, 0.45, wet);
if (pud > 0.02) {
  vec2 rip = (gRipples(gp * 2.7, uTime) + gRipples(gp * 4.3 + 11.3, uTime * 1.17)) * 0.5 * uRain;
  tilt = mix(tilt, rip * 0.32 + nT.xy * 0.03, pud);
}
vec3 gN = normalize(vec3(tilt.x, 1.0, tilt.y));

// ---- Reflejo planar ----
vec3 gV = cameraPosition - vGWorld;
float gDist = length(gV);
gV /= gDist;
float NdV = clamp(dot(gN, gV), 0.0, 1.0);
float fres = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
float dryConcrete = indoor * wC;
float gSpec = fres * mix(0.5 * wet * (1.0 - wD * 0.7), 1.0, pud) + fres * 0.22 * dryConcrete;
float gLod = mix(mix(1.0, 4.5, filmRough * 1.6), 0.0, pud) + dryConcrete * 3.5;
float gSmear = mix(0.05 + filmRough * 0.22, 0.004, pud);
float gAO = mix(1.0, ctrl.g, 0.85);

vec3 gRefl = vec3(0.0);
if (uReflOn > 0.5) {
  vec4 rc = uReflMatrix * vec4(vGWorld, 1.0);
  vec2 ruv = rc.xy / rc.w;
  // La inclinación lateral desplaza poco el reflejo en ángulos rasantes; la longitudinal, mucho.
  vec2 fwd = normalize(-gV.xz + 1e-5);
  float side = dot(tilt, vec2(-fwd.y, fwd.x));
  float along = dot(tilt, fwd);
  float k = mix(0.5, 1.0, pud);
  ruv += vec2(side * (0.25 + NdV) * 0.55, along * 0.75) * k;
  float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
  float wsum = 0.0;
  for (int i = 0; i < 6; i++) {
    float t = (float(i) + jit) / 5.0 - 0.5;
    float w = 1.0 - abs(t) * 1.5;
    vec2 suv = clamp(ruv + vec2(0.0, t * gSmear), 0.002, 0.998);
    gRefl += textureLod(tRefl, suv, gLod).rgb * w;
    wsum += w;
  }
  gRefl = min(gRefl / wsum, vec3(40.0));
}
`;

export const groundVertexPars = /* glsl */ `
varying vec3 vGWorld;
`;
export const groundVertexMain = /* glsl */ `
vGWorld = (modelMatrix * vec4(position, 1.0)).xyz;
`;
