// Motor de audio 100 % procedural (Web Audio API): buses, reverb generada, ambiente de lluvia/viento,
// dron musical y utilidades de síntesis. Los sonidos concretos están en sounds.js.
import { clamp, rand } from './utils.js';
import { installSounds } from './sounds.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.8;
    this.lx = 0; this.ly = 1.7; this.lz = 0; this.lrx = 1; this.lrz = 0; // oyente (posición y vector derecha)
    this.indoor = 0;
    this.combat = 0;
    this.stepSide = 1;
    this.rainK = 1; // 0 en mapas secos: sin lluvia y con más viento
  }

  // Debe llamarse tras un gesto del usuario.
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.22;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.connect(this.master);

    // Reverb: respuesta al impulso sintética (ruido con caída exponencial y filtrado progresivo).
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    const rvGain = ctx.createGain(); rvGain.gain.value = 0.9;
    this.reverb.connect(rvGain).connect(this.master);

    // Ruido blanco y rosa reutilizables.
    this.white = this._noiseBuffer(2.5, false);
    this.pink = this._noiseBuffer(4, true);
    this.crackle = this._sparseBuffer(3.2, 55, 0.004);
    this.patter = this._sparseBuffer(2.6, 900, 0.0016);

    this._startAmbience();
    this.ready = true;
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }

  setListener(x, y, z, yaw) {
    this.lx = x; this.ly = y; this.lz = z;
    this.lrx = Math.cos(yaw); this.lrz = -Math.sin(yaw);
  }

  // Atenuación y paneo de una fuente en el mundo. Devuelve { gain, pan, dist }.
  spatial(x, y, z, ref = 6, out = this._sp || (this._sp = {})) {
    const dx = x - this.lx; const dy = y - this.ly; const dz = z - this.lz;
    const dist = Math.hypot(dx, dy, dz);
    out.dist = dist;
    out.gain = ref / (ref + dist);
    const h = Math.hypot(dx, dz) || 1;
    out.pan = clamp(((dx * this.lrx + dz * this.lrz) / h) * Math.min(1, dist / 3), -0.9, 0.9);
    return out;
  }

  _noiseBuffer(sec, pink) {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0; let b1 = 0; let b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (pink) {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      } else d[i] = w;
    }
    return buf;
  }

  // Clics dispersos con caída: base para crepitar del fuego y lluvia sobre chapa.
  _sparseBuffer(sec, perSecond, decay) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, Math.floor(sr * sec), sr);
    const d = buf.getChannelData(0);
    const n = Math.floor(sec * perSecond);
    for (let k = 0; k < n; k++) {
      const start = Math.floor(Math.random() * (d.length - sr * 0.05));
      const amp = Math.random() ** 2;
      const len = Math.floor(sr * decay * (1 + Math.random() * 3));
      for (let i = 0; i < len; i++) d[start + i] += (Math.random() * 2 - 1) * amp * Math.exp((-5 * i) / len);
    }
    return buf;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * sec);
    const buf = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const a = 0.25 + 0.7 * t; // se oscurece con el tiempo
        lp = lp * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.012 ? i / (sr * 0.012) : 1) * 2.2;
      }
      // Eco temprano tipo "slapback" de exterior.
      const tap = Math.floor(sr * (0.11 + ch * 0.017));
      for (let i = 0; i < sr * 0.03; i++) d[tap + i] += (Math.random() * 2 - 1) * 0.5 * (1 - i / (sr * 0.03));
    }
    return buf;
  }

  _loop(buffer, dest, gain = 1, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer; src.loop = true; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(dest);
    src.start(0, Math.random() * buffer.duration);
    return g;
  }

  _filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    return f;
  }

  _startAmbience() {
    const ctx = this.ctx;
    // Lluvia: siseo agudo + cuerpo medio + retumbo grave, con filtro global para interiores.
    this.rainLP = this._filter('lowpass', 16000, 0.5);
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    this.rainLP.connect(this.rainGain).connect(this.amb);
    const hiss = this._filter('highpass', 4200, 0.4); this._loop(this.white, hiss, 0.055); hiss.connect(this.rainLP);
    const body = this._filter('bandpass', 1500, 0.5); this._loop(this.pink, body, 0.5, 1.1); body.connect(this.rainLP);
    const low = this._filter('lowpass', 260, 0.6); this._loop(this.pink, low, 0.55, 0.7); low.connect(this.rainLP);
    // Lluvia sobre el tejado de chapa (sólo interior).
    this.roofGain = ctx.createGain(); this.roofGain.gain.value = 0;
    const roofBP = this._filter('bandpass', 2300, 1.1);
    this._loop(this.patter, roofBP, 1.0); roofBP.connect(this.roofGain).connect(this.amb);
    // Viento.
    this.windLP = this._filter('lowpass', 380, 1.2);
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this._loop(this.pink, this.windLP, 1.0, 0.5); this.windLP.connect(this.windGain).connect(this.amb);
    // Dron grave continuo + pulso de tensión en combate.
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const dlp = this._filter('lowpass', 190, 2);
    for (const [f, type, g] of [[55, 'sawtooth', 0.5], [55.35, 'sawtooth', 0.5], [82.4, 'triangle', 0.35], [110.2, 'sine', 0.2]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(dlp); o.start();
    }
    dlp.connect(this.droneGain).connect(this.amb);
    this.droneLP = dlp;
    this.pulseGain = ctx.createGain(); this.pulseGain.gain.value = 0;
    const po = ctx.createOscillator(); po.type = 'sawtooth'; po.frequency.value = 73.4;
    const plp = this._filter('lowpass', 320, 3);
    const trem = ctx.createGain(); trem.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 2.4;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(trem.gain); lfo.start();
    po.connect(plp).connect(trem).connect(this.pulseGain).connect(this.amb); po.start();
    // Fuentes localizadas: generador y fuego (ganancia según distancia).
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hlp = this._filter('lowpass', 210, 1.5);
    for (const f of [49, 98.5, 147]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(hlp); o.start(); }
    hlp.connect(this.humGain).connect(this.amb);
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    const fbp = this._filter('bandpass', 900, 0.6);
    this._loop(this.crackle, fbp, 1.0); this._loop(this.pink, fbp, 0.35, 0.8);
    fbp.connect(this.fireGain).connect(this.amb);
  }

  // Estado de ambiente por fotograma. `mix` 0 = menú (más suave), 1 = en juego.
  update(dt, { indoor = 0, combat = 0, humDist = 99, fireDist = 99, time = 0 }) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.indoor += (indoor - this.indoor) * Math.min(1, dt * 3);
    this.combat += (combat - this.combat) * Math.min(1, dt * 0.8);
    const k = this.indoor;
    const gust = 0.75 + 0.25 * Math.sin(time * 0.31) * Math.sin(time * 0.13 + 1.3);
    this.rainGain.gain.setTargetAtTime(0.42 * gust * (1 - k * 0.55) * this.rainK, t, 0.1);
    this.rainLP.frequency.setTargetAtTime(16000 - k * 15100, t, 0.1);
    this.roofGain.gain.setTargetAtTime(0.5 * k * this.rainK, t, 0.15);
    this.windGain.gain.setTargetAtTime((0.16 + 0.2 * (1 - this.rainK)) * (1 - k * 0.7) * (0.6 + 0.4 * Math.sin(time * 0.21 + 2)), t, 0.2);
    this.windLP.frequency.setTargetAtTime(300 + 260 * (0.5 + 0.5 * Math.sin(time * 0.17)), t, 0.3);
    this.droneGain.gain.setTargetAtTime(0.11, t, 0.5);
    this.droneLP.frequency.setTargetAtTime(170 + 150 * this.combat + 30 * Math.sin(time * 0.09), t, 0.4);
    this.pulseGain.gain.setTargetAtTime(0.085 * this.combat, t, 0.3);
    this.humGain.gain.setTargetAtTime(0.075 * clamp(1 - humDist / 26, 0, 1) ** 2, t, 0.1);
    this.fireGain.gain.setTargetAtTime(0.5 * clamp(1 - fireDist / 20, 0, 1) ** 2, t, 0.1);
  }

  // ---------- Primitivas de síntesis ----------
  // Destino con paneo y envío a reverb.
  _out(pan = 0, verb = 0, gain = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      g.connect(p); node = p;
    }
    node.connect(this.sfx);
    if (verb > 0) { const s = ctx.createGain(); s.gain.value = verb; node.connect(s).connect(this.reverb); }
    return g;
  }

  // Ráfaga de ruido filtrado con envolvente de ataque/caída. f1 opcional = barrido del filtro.
  noise(dest, { type = 'lowpass', f0 = 1000, f1 = 0, q = 0.7, peak = 0.5, attack = 0.002, decay = 0.1, delay = 0, pink = false, rate = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.white;
    src.playbackRate.value = rate * rand(0.9, 1.1);
    const f = this._filter(type, f0, q);
    if (f1 > 0) f.frequency.exponentialRampToValueAtTime(f1, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + attack + decay + 0.05);
  }

  // Tono con barrido de frecuencia y caída exponencial.
  tone(dest, { type = 'sine', f0 = 440, f1 = 0, peak = 0.4, attack = 0.002, decay = 0.1, delay = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 > 0) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }
}

installSounds(AudioEngine.prototype);
