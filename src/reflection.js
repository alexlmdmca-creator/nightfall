// Reflejo planar del suelo (y = 0): renderiza la escena con una cámara espejada a un render target HDR
// con mipmaps, que el shader del suelo muestrea con más o menos desenfoque según la rugosidad.
import * as THREE from 'three';

const _camPos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const _up = new THREE.Vector3(0, 1, 0);
const _origin = new THREE.Vector3();

export class PlanarReflection {
  constructor(renderer, scale = 0.5) {
    this.renderer = renderer;
    this.scale = scale;
    this.enabled = true;
    this.clipBias = 0.003;
    this.target = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
    });
    this.camera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();
    this.hidden = []; // objetos que no deben aparecer en el reflejo (suelo, arma, etc.)
    this._vis = [];
  }

  setSize(w, h) {
    this.target.setSize(Math.max(2, Math.floor(w * this.scale)), Math.max(2, Math.floor(h * this.scale)));
  }

  render(scene, camera) {
    if (!this.enabled) return;
    const cam = this.camera;
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    if (_camPos.y <= 0.02) return;
    _rot.extractRotation(camera.matrixWorld);

    // Cámara espejada respecto al plano y = 0.
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    cam.position.set(_camPos.x, -_camPos.y, _camPos.z);
    cam.up.set(0, 1, 0).applyMatrix4(_rot);
    cam.up.y *= -1;
    cam.lookAt(_look.x, -_look.y, _look.z);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.projectionMatrix.copy(camera.projectionMatrix);

    this.textureMatrix.set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0,
    );
    this.textureMatrix.multiply(cam.projectionMatrix);
    this.textureMatrix.multiply(cam.matrixWorldInverse);

    // Plano de recorte oblicuo (Lengyel) para descartar lo que queda bajo el suelo.
    _plane.setFromNormalAndCoplanarPoint(_up, _origin);
    _plane.applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = cam.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
    _q.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm.elements[2] = _clip.x;
    pm.elements[6] = _clip.y;
    pm.elements[10] = _clip.z + 1.0 - this.clipBias;
    pm.elements[14] = _clip.w;
    cam.projectionMatrixInverse.copy(pm).invert();

    const r = this.renderer;
    for (let i = 0; i < this.hidden.length; i++) {
      this._vis[i] = this.hidden[i].visible;
      this.hidden[i].visible = false;
    }
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.shadowMap.autoUpdate;
    // Reutiliza las sombras del fotograma principal (salvo en el primero, que aún no existen).
    if (this._primed) r.shadowMap.autoUpdate = false;
    this._primed = true;
    r.setRenderTarget(this.target);
    r.clear();
    r.render(scene, cam);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevAuto;
    for (let i = 0; i < this.hidden.length; i++) this.hidden[i].visible = this._vis[i];
  }
}
