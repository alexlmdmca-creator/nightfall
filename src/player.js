// Controlador en primera persona: movimiento con inercia, sprint, agacharse, salto,
// balanceo de cabeza, retroceso de cámara y salud con regeneración.
import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';
import { BASE, ROAD, SPAWN } from './layout.js';

const RADIUS = 0.38;
const EYE_STAND = 1.68;
const EYE_CROUCH = 1.02;
const GRAVITY = 19;
const _mouse = { x: 0, y: 0 };

export class Player {
  constructor(camera, col, events) {
    this.camera = camera;
    this.col = col;
    this.events = events; // { step(surface, loud), land(v), hurt(amount), death() }
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.sensitivity = 1;
    this.baseFov = 74;
    this.aimZoom = 20; // grados de campo de visión que se cierran al apuntar (depende del arma)
    this.speedK = 1; // factor de velocidad del arma en mano
    this.bounds = { x0: BASE.x0 - 3.5, x1: BASE.x1 + 3.5, z0: BASE.z0 + 0.6, z1: ROAD.zSouth - 4 }; // límites del mapa en uso
    this.groundSurface = () => 'asphalt';
    this.reset();
  }

  reset(spawn = SPAWN) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.eye = EYE_STAND;
    this.onGround = true;
    this.crouching = false;
    this.sprinting = false;
    this.moving = false;
    this.speed = 0;
    this.health = 100;
    this.dead = false;
    this.invulnerable = false;
    this.lastHurt = -99;
    this.time = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.landDip = 0;
    this.roll = 0;
    this.punchP = 0; this.punchY = 0; this.punchVP = 0; this.punchVY = 0; // retroceso transitorio
    this.shake = 0;
    this.fov = this.baseFov;
    this.aimT = 0;
    this.mouseDX = 0; this.mouseDY = 0; // para el balanceo del arma
    this.deathT = 0;
    this.hurtDir = 0;
  }

  get eyeY() { return this.pos.y + this.eye; }
  get height() { return this.crouching ? 1.25 : 1.8; }

  addRecoil(pitch, yaw) {
    this.pitch += pitch * 0.38;
    this.yaw += yaw * 0.38;
    this.punchVP += pitch * 14;
    this.punchVY += yaw * 14;
  }

  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }

  damage(amount, fromX, fromZ) {
    if (this.dead || this.invulnerable) return;
    this.health -= amount;
    this.lastHurt = this.time;
    this.addShake(0.25);
    this.punchVP += (Math.random() - 0.3) * 0.9;
    this.punchVY += (Math.random() - 0.5) * 0.9;
    // Ángulo del agresor relativo a la vista (para el indicador del HUD).
    const ang = Math.atan2(fromX - this.pos.x, -(fromZ - this.pos.z));
    this.hurtDir = ang + this.yaw;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.events.death?.();
    }
    this.events.hurt?.(amount);
  }

  update(dt, input, aiming, canSprint = true) {
    this.time += dt;
    if (this.dead) return this.updateDead(dt);

    // --- Vista ---
    input.consumeMouse(_mouse);
    const sens = 0.0021 * this.sensitivity * lerp(1, 0.62, this.aimT);
    this.mouseDX = _mouse.x; this.mouseDY = _mouse.y;
    this.yaw -= _mouse.x * sens;
    this.pitch = clamp(this.pitch - _mouse.y * sens, -1.48, 1.48);

    // --- Dirección deseada ---
    let fwd = 0; let str = 0;
    if (input.down('KeyW')) fwd += 1;
    if (input.down('KeyS')) fwd -= 1;
    if (input.down('KeyD')) str += 1;
    if (input.down('KeyA')) str -= 1;
    const len = Math.hypot(fwd, str);
    if (len > 0) { fwd /= len; str /= len; }
    this.moving = len > 0;

    // --- Agacharse (no se puede levantar bajo un obstáculo) ---
    const wantCrouch = input.crouch;
    if (wantCrouch) this.crouching = true;
    else if (this.crouching && !this.col.blockedAbove(this.pos.x, this.pos.z, RADIUS, this.pos.y + 1.3, this.pos.y + 1.8)) this.crouching = false;

    this.sprinting = canSprint && input.sprint && fwd > 0.5 && !this.crouching && !aiming && this.onGround;
    const maxSpeed = (this.crouching ? 1.9 : this.sprinting ? 6.4 : aiming ? 2.3 : 3.9) * this.speedK;

    const sin = Math.sin(this.yaw); const cos = Math.cos(this.yaw);
    const wx = (-sin * fwd + cos * str) * maxSpeed;
    const wz = (-cos * fwd - sin * str) * maxSpeed;
    // Inercia: acelera rápido, frena algo más lento; poco control en el aire.
    const lambda = this.onGround ? (this.moving ? 9.5 : 12) : 1.6;
    this.vel.x = damp(this.vel.x, wx, lambda, dt);
    this.vel.z = damp(this.vel.z, wz, lambda, dt);

    if (this.onGround && input.hit('Space') && !this.crouching) {
      this.vel.y = 5.7;
      this.onGround = false;
    }
    this.vel.y -= GRAVITY * dt;

    // --- Integración con subpasos y colisión ---
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.18));
    const sdt = dt / steps;
    const px = this.pos.x; const pz = this.pos.z;
    for (let i = 0; i < steps; i++) {
      this.pos.x += this.vel.x * sdt;
      this.pos.z += this.vel.z * sdt;
      this.col.resolveCircle(this.pos, RADIUS, this.pos.y, this.pos.y + this.height, this.onGround ? 0.32 : 0.1);
    }
    // Límites del mapa.
    this.pos.x = clamp(this.pos.x, this.bounds.x0, this.bounds.x1);
    this.pos.z = clamp(this.pos.z, this.bounds.z0, this.bounds.z1);
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (dt > 0) { this.vel.x = (this.pos.x - px) / dt; this.vel.z = (this.pos.z - pz) / dt; }
    this.speed = moved / Math.max(dt, 1e-5);

    this.pos.y += this.vel.y * dt;
    const ground = this.col.groundHeight(this.pos.x, this.pos.z, this.pos.y, this.onGround ? 0.32 : 0.05, RADIUS * 0.6);
    if (this.pos.y <= ground) {
      if (!this.onGround) {
        const impact = -this.vel.y;
        if (impact > 2.5) { this.landDip = Math.min(0.16, impact * 0.016); this.events.land?.(impact); }
        if (impact > 13) this.damage((impact - 13) * 6, this.pos.x, this.pos.z);
      }
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.pos.y > ground + 0.05) {
      this.onGround = false;
    }

    // --- Pasos y balanceo ---
    const speedN = clamp(this.speed / 6.4, 0, 1);
    if (this.onGround && this.speed > 0.6) {
      this.stepDist += moved;
      const stride = this.sprinting ? 2.05 : this.crouching ? 1.25 : 1.55;
      this.bob += (moved / stride) * Math.PI;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.events.step?.(this.groundSurface(this.pos.x, this.pos.z, this.pos.y), this.sprinting ? 1 : this.crouching ? 0.35 : 0.65);
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround ? speedN : 0, 8, dt);
    this.eye = damp(this.eye, this.crouching ? EYE_CROUCH : EYE_STAND, 11, dt);
    this.landDip = damp(this.landDip, 0, 7, dt);
    this.aimT = damp(this.aimT, aiming ? 1 : 0, 14, dt);

    // Retroceso transitorio: muelle amortiguado hacia cero.
    this.punchVP += (-this.punchP * 170 - this.punchVP * 17) * dt;
    this.punchVY += (-this.punchY * 170 - this.punchVY * 17) * dt;
    this.punchP += this.punchVP * dt;
    this.punchY += this.punchVY * dt;

    // Inclinación lateral al desplazarse de lado.
    const strafe = (this.vel.x * cos - this.vel.z * sin) / 6.4;
    this.roll = damp(this.roll, -strafe * 0.028, 8, dt);
    this.shake = damp(this.shake, 0, 5.5, dt);

    const targetFov = this.baseFov + (this.sprinting ? 8 : 0) - this.aimT * this.aimZoom;
    this.fov = damp(this.fov, targetFov, 9, dt);
    this.applyCamera();
  }

  updateDead(dt) {
    this.deathT += dt;
    this.eye = damp(this.eye, 0.28, 3.2, dt);
    this.roll = damp(this.roll, 0.9, 2.6, dt);
    this.pitch = damp(this.pitch, 0.25, 2, dt);
    this.shake = damp(this.shake, 0, 4, dt);
    this.applyCamera();
  }

  applyCamera() {
    const cam = this.camera;
    const bobY = Math.sin(this.bob * 2) * 0.021 * this.bobAmt * (1 - this.aimT * 0.7);
    const bobX = Math.cos(this.bob) * 0.016 * this.bobAmt * (1 - this.aimT * 0.7);
    const sh = this.shake * this.shake;
    const t = this.time * 43;
    const cos = Math.cos(this.yaw); const sin = Math.sin(this.yaw);
    cam.position.set(
      this.pos.x + cos * bobX,
      this.pos.y + this.eye + bobY - this.landDip,
      this.pos.z - sin * bobX,
    );
    cam.rotation.set(
      this.pitch + this.punchP + Math.sin(t * 1.3) * sh * 0.03,
      this.yaw + this.punchY + Math.sin(t + 1.7) * sh * 0.03,
      this.roll + Math.cos(this.bob) * 0.0035 * this.bobAmt + Math.sin(t * 0.9 + 0.4) * sh * 0.02,
    );
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  regen(dt) {
    if (!this.dead && this.health < 100 && this.time - this.lastHurt > 4.5) {
      this.health = Math.min(100, this.health + 14 * dt);
    }
  }
}
