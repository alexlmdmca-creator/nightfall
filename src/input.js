// Entrada: teclado, ratón y bloqueo de puntero.

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set(); // flancos de subida, se vacían cada fotograma
    this.dx = 0;
    this.dy = 0;
    this.fire = false;
    this.aim = false;
    this.wheel = 0; // pasos de rueda pendientes (cambio de arma)
    this.locked = false;
    this.enabled = false; // sólo durante el juego
    this.onLockChange = null;
    this.crouchToggle = false;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Evita atajos del navegador que sí se pueden cancelar (Ctrl+S, Ctrl+D, espacio, etc.).
      if (e.ctrlKey || e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        this.pressed.add(e.code);
        if (e.code === 'KeyC') this.crouchToggle = !this.crouchToggle;
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.aim = false; });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // Chrome a veces entrega saltos enormes espurios al capturar el puntero.
      if (Math.abs(e.movementX) > 600 || Math.abs(e.movementY) > 600) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    dom.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.fire = true; this.pressed.add('Mouse0'); }
      if (e.button === 2) this.aim = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.aim = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { if (this.locked && this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) { this.fire = false; this.aim = false; this.keys.clear(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }

  // Pide el bloqueo de puntero (con ratón "crudo" si el navegador lo permite).
  async lock() {
    if (this.locked) return true;
    try {
      await this.dom.requestPointerLock({ unadjustedMovement: true });
    } catch {
      try { await this.dom.requestPointerLock(); } catch { return false; }
    }
    return true;
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  get crouch() { return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.crouchToggle; }
  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }

  consumeMouse(out) {
    out.x = this.dx; out.y = this.dy;
    this.dx = 0; this.dy = 0;
    return out;
  }

  // Sentido de la rueda desde la última consulta: -1, 0 o 1.
  consumeWheel() {
    const w = Math.sign(this.wheel);
    this.wheel = 0;
    return w;
  }

  endFrame() { this.pressed.clear(); }
}
