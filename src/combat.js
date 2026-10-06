// Reglas de combate y misión: disparos del jugador, impactos, bidones explosivos y objetivos.
// En partidas en línea (mission = false) los disparos se resuelven contra los demás jugadores tal y
// como se ven en pantalla, y cada disparo se comunica al resto para que lo dibujen y lo oigan.
import { impact, explosion, splash, fireEmitter, muzzleWorld, tracer, sparks } from './fxRecipes.js';
import { OBJECTIVE, BASE } from './layout.js';
import { ST } from './enemies.js';
import { PART } from './net.js';
import { PISTOL, KNIFE } from './weapon.js';

const _hit = {};
// Daño base por arma (fusil, pistola, cuchillo), contra la IA y entre jugadores. Entre jugadores es
// menor para que un duelo no se decida en dos balas.
const DAMAGE = [{ ai: 34, pvp: 26 }, { ai: 22, pvp: 17 }, { ai: 60, pvp: 55 }];
const LETHAL = 200; // puñalada por la espalda: quita toda la vida
const MELEE_PAD = 0.14; // holgura de las zonas de impacto en el cuerpo a cuerpo

// ¿Está el atacante (vector a = atacante - víctima) a la espalda de alguien que mira hacia f?
const behind = (fx, fz, ax, az) => (fx * ax + fz * az) / (Math.hypot(ax, az) || 1) < -0.3;
const PVP_PART = [1, 2.2, 0.75]; // torso, cabeza, piernas (índices de PART)

export class Combat {
  constructor(g) {
    this.g = g; // referencias: world, fx, audio, enemies, player, hud, weapon, net, remotes
    this.difficulty = 1;
    this.mission = true; // false en partidas en línea: sin objetivos ni final de misión
    this.timers = [];
    this.source = { by: 0, part: 0, w: 0 }; // quién causa el daño que se está aplicando al jugador (0 = nadie) y con qué arma
    this.reset();
    g.enemies.onKilled = (e, part) => {
      this.kills++;
      if (part === 'head') this.headshots++;
      g.hud.killMsg(part === 'head' ? 'HOSTIL NEUTRALIZADO · DISPARO A LA CABEZA' : 'HOSTIL NEUTRALIZADO');
    };
  }

  reset() {
    this.kills = 0; this.headshots = 0; this.shots = 0; this.hits = 0; this.time = 0;
    this.stage = 0; this.done = false; this.timers.length = 0;
    this.source.by = 0; this.source.part = 0;
  }

  get flashlight() { return this.g.weapon.lightOn; }
  get objective() { return this.done || !this.mission ? null : this.stage === 0 ? { x: 0, z: BASE.z1 - 1, y: 1.6 } : { x: OBJECTIVE.x, z: OBJECTIVE.z - 1.6, y: 1.6 }; }

  // Disparo del jugador: origen y dirección (THREE.Vector3). Devuelve el punto final.
  playerShot(o, d) {
    const { enemies, world, fx, audio, hud, player, weapon } = this.g;
    this.shots++;
    const wh = world.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 220, 'bullets', _hit, true);
    if (!this.mission) return this.pvpShot(o, d, wh);
    const eh = enemies.raycast(o.x, o.y, o.z, d.x, d.y, d.z, wh ? wh.dist : 220);
    enemies.hear(player.pos.x, player.pos.z, weapon.def.noise);
    if (eh) {
      const x = o.x + d.x * eh.dist; const y = o.y + d.y * eh.dist; const z = o.z + d.z * eh.dist;
      const dmg = DAMAGE[weapon.cur].ai * (eh.part === 'head' ? 3.2 : eh.part === 'legs' ? 0.68 : 1) * (eh.dist > 45 ? 0.85 : 1);
      const wasAlive = eh.enemy.state !== ST.DEAD;
      const killed = enemies.damage(eh.enemy, eh.part, dmg, d.x, d.z);
      impact(fx, 'flesh', x, y, z, -d.x, -d.y * 0.3 + 0.3, -d.z);
      audio.impact('flesh', x, y, z);
      if (wasAlive) {
        this.hits++;
        const kind = killed ? 'kill' : eh.part === 'head' ? 'head' : 'hit';
        hud.hitmarker(kind); audio.hitmarker(kind);
      }
      return { x, y, z };
    }
    if (wh) { this.worldImpact(wh, true); return { x: wh.x, y: wh.y, z: wh.z }; }
    return { x: o.x + d.x * 200, y: o.y + d.y * 200, z: o.z + d.z * 200 };
  }

  // Disparo en línea: quien dispara decide si alcanza a un rival y se lo comunica al servidor.
  // La baja la confirma el servidor más tarde (mensaje "kill").
  pvpShot(o, d, wh) {
    const { remotes, net, fx, audio, hud, weapon } = this.g;
    const rh = remotes.raycast(o.x, o.y, o.z, d.x, d.y, d.z, wh ? wh.dist : 220, net.room.settings.ff ? -1 : net.me.team);
    const dist = rh ? rh.dist : wh ? wh.dist : 200;
    const end = { x: o.x + d.x * dist, y: o.y + d.y * dist, z: o.z + d.z * dist };
    if (rh) {
      impact(fx, 'flesh', end.x, end.y, end.z, -d.x, -d.y * 0.3 + 0.3, -d.z);
      audio.impact('flesh', end.x, end.y, end.z);
      remotes.flinch(rh.player);
      this.hits++;
      const kind = rh.part === PART.HEAD ? 'head' : 'hit';
      hud.hitmarker(kind); audio.hitmarker(kind);
      net.hit(rh.player.id, DAMAGE[weapon.cur].pvp * PVP_PART[rh.part] * (rh.dist > 45 ? 0.85 : 1), rh.part, weapon.cur);
    } else if (wh) this.worldImpact(wh, true, net.id);
    net.fire(o, end, rh ? 1 : 0);
    return end;
  }

  // Tajo de cuchillo: de frente hiere; por la espalda quita toda la vida. Es silencioso para la IA.
  // Devuelve si ha alcanzado a alguien.
  playerMelee(o, d, reach) {
    const { enemies, remotes, net, world, fx, audio, hud, player } = this.g;
    const wh = world.col.raycast(o.x, o.y, o.z, d.x, d.y, d.z, reach, 'bullets', _hit, true);
    let dist = wh ? wh.dist : reach;
    let struck = false;
    if (this.mission) {
      const eh = enemies.raycast(o.x, o.y, o.z, d.x, d.y, d.z, dist, MELEE_PAD);
      if (eh) {
        const e = eh.enemy;
        const back = behind(Math.sin(e.yaw), Math.cos(e.yaw), player.pos.x - e.x, player.pos.z - e.z);
        const wasAlive = e.state !== ST.DEAD;
        const killed = enemies.damage(e, 'torso', back ? LETHAL : DAMAGE[KNIFE].ai, d.x, d.z);
        if (wasAlive) { this.hits++; const kind = killed ? 'kill' : 'hit'; hud.hitmarker(kind); audio.hitmarker(kind); }
        dist = eh.dist; struck = true;
      }
    } else {
      const rh = remotes.raycast(o.x, o.y, o.z, d.x, d.y, d.z, dist, net.room.settings.ff ? -1 : net.me.team, MELEE_PAD);
      if (rh) {
        const r = rh.player;
        const back = behind(-Math.sin(r.yaw), -Math.cos(r.yaw), player.pos.x - r.x, player.pos.z - r.z);
        remotes.flinch(r);
        this.hits++;
        hud.hitmarker('hit'); audio.hitmarker('hit');
        net.hit(r.id, back ? LETHAL : DAMAGE[KNIFE].pvp, PART.TORSO, KNIFE);
        dist = rh.dist; struck = true;
      }
    }
    const x = o.x + d.x * dist; const y = o.y + d.y * dist; const z = o.z + d.z * dist;
    if (struck) {
      impact(fx, 'flesh', x, y, z, -d.x, -d.y * 0.3 + 0.3, -d.z);
      audio.impact('flesh', x, y, z);
    } else if (wh) {
      // Contra una pared: suena y, si es metal, salta alguna chispa (no deja agujero ni daña bidones).
      const surface = wh.surface === 'ground' ? world.ground.surfaceAt(wh.x, wh.z) : wh.surface;
      audio.impact(surface === 'asphalt' ? 'concrete' : surface, x, y, z);
      if (surface === 'metal') sparks(fx, x, y, z, wh.nx, wh.ny, wh.nz, 4, 0.5);
    }
    if (!this.mission) net.fire(o, { x, y, z }, struck ? 3 : 2);
    return struck;
  }

  // Disparo de otro jugador: [ox, oy, oz, ex, ey, ez, tipo]. Se dibuja saliendo de su arma y se
  // repite el impacto contra el mundo propio, de modo que los bidones se gastan igual para todos.
  // tipo: 0 bala al mundo, 1 bala a un jugador, 2 tajo al aire, 3 tajo a un jugador.
  remoteShot(id, s) {
    const { remotes, world, fx, audio, player } = this.g;
    const r = remotes.get(id);
    if (!r || !r.placed) return;
    const ox = s[0]; const oy = s[1]; const oz = s[2]; const ex = s[3]; const ey = s[4]; const ez = s[5];
    let dx = ex - ox; let dy = ey - oy; let dz = ez - oz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    dx /= dist; dy /= dist; dz /= dist;
    if (s[6] >= 2) {
      remotes.swing(r);
      audio.knifeSwing(r.x, r.y + 1.3, r.z);
    } else {
      const m = remotes.muzzle(r);
      muzzleWorld(fx, m.x, m.y, m.z, dx, dy, dz);
      tracer(fx, m.x, m.y, m.z, ex, ey, ez, 6, 2.6, 1.2, 190);
      audio.enemyShot(m.x, m.y, m.z, remotes.weaponOf(r) === PISTOL ? 1.55 : 1);
    }
    if (s[6] === 1 || s[6] === 3) {
      // Ha alcanzado a alguien: sangre en el punto, salvo si es uno mismo (quedaría pegada a la cámara).
      if (Math.hypot(ex - player.pos.x, ez - player.pos.z) > 1.2) {
        impact(fx, 'flesh', ex, ey, ez, -dx, -dy * 0.3 + 0.3, -dz);
        audio.impact('flesh', ex, ey, ez);
      }
      return;
    }
    if (s[6] >= 2) return;
    const wh = world.col.raycast(ox, oy, oz, dx, dy, dz, dist + 0.4, 'bullets', _hit, true);
    if (wh) this.worldImpact(wh, true, id);
    // Silbido si la bala pasa cerca de la cabeza.
    const along = (player.pos.x - ox) * dx + (player.eyeY - oy) * dy + (player.pos.z - oz) * dz;
    if (along > 0 && along < dist && !player.dead) {
      const cx = ox + dx * along - player.pos.x; const cy = oy + dy * along - player.eyeY; const cz = oz + dz * along - player.pos.z;
      if (cx * cx + cy * cy + cz * cz < 2.2) audio.whizz(Math.sign(cx * Math.cos(player.yaw) - cz * Math.sin(player.yaw)) || 1);
    }
  }

  // Daño al jugador local causado por otro jugador (`by`, 0 = nadie). Si muere, `source` dice quién fue.
  hurtPlayer(amount, fromX, fromZ, by = 0, part = 0, w = 0) {
    this.source.by = by; this.source.part = part; this.source.w = w;
    this.g.player.damage(amount, fromX, fromZ);
    this.source.by = 0; this.source.part = 0; this.source.w = 0;
  }

  // ¿Hiere al jugador local una explosión provocada por `by`? Sin fuego amigo, las de los compañeros no.
  canHurt(by) {
    if (this.mission || !by) return true;
    const { net, remotes } = this.g;
    if (by === net.id || net.room.settings.ff) return true;
    const r = remotes.get(by);
    return !r || r.team !== net.me.team;
  }

  // Impacto de bala contra el mundo (resultado de CollisionWorld.raycast). `by`: jugador que dispara, en línea.
  worldImpact(h, fromPlayer, by = 0) {
    const { world, fx, audio } = this.g;
    let surface = h.surface;
    if (surface === 'ground') surface = world.ground.surfaceAt(h.x, h.z);
    if (surface === 'asphalt') surface = 'concrete';
    impact(fx, surface, h.x, h.y, h.z, h.nx, h.ny, h.nz);
    audio.impact(surface, h.x, h.y, h.z);
    const ref = h.collider && h.collider.ref;
    if (ref && ref.alive) {
      ref.hp -= fromPlayer ? 34 : 12;
      if (ref.hp <= 0) this.explode(ref, by);
    }
  }

  explode(b, by = 0) {
    if (!b.alive) return;
    const { world, fx, audio, enemies, player } = this.g;
    b.alive = false;
    b.mesh.visible = false;
    world.col.remove(b.collider);
    if (!this.mission) this.g.net.barrel(world.barrels.indexOf(b), by);
    explosion(fx, b.x, 0.3, b.z, 1);
    audio.explosion(b.x, 1, b.z);
    fx.addEmitter(fireEmitter(b.x, 0.1, b.z, 1.3, true)).life = 14;
    const pd = Math.hypot(player.pos.x - b.x, player.pos.z - b.z);
    player.addShake(Math.max(0, 1.1 - pd / 28));
    if (pd < 6.5 && this.canHurt(by)) this.hurtPlayer(70 * (1 - pd / 6.5) + 6, b.x, b.z, by);
    for (const e of enemies.list) {
      const d = Math.hypot(e.x - b.x, e.z - b.z);
      if (d < 7) enemies.damage(e, 'torso', 190 * (1 - d / 7) + 15, e.x - b.x, e.z - b.z);
    }
    enemies.hear(b.x, b.z, 80);
    // Reacción en cadena con los bidones vecinos.
    for (const o of world.barrels) {
      if (o.alive && Math.hypot(o.x - b.x, o.z - b.z) < 3.6) this.timers.push({ t: 0.12 + Math.random() * 0.2, fn: () => this.explode(o, by) });
    }
  }

  // Aviso del servidor: a otro jugador le ha reventado este bidón.
  remoteBarrel(i, by) {
    const b = this.g.world.barrels[i];
    if (b) this.explode(b, by);
  }

  restoreBarrels() {
    const { world } = this.g;
    for (const b of world.barrels) {
      if (!b.alive) { b.alive = true; b.mesh.visible = true; world.col.list.push(b.collider); }
      b.hp = 60;
    }
  }

  // Al entrar en una partida empezada: retira sin efectos los bidones que ya habían reventado.
  clearBarrels(indices) {
    const { world } = this.g;
    for (const i of indices) {
      const b = world.barrels[i];
      if (!b || !b.alive) continue;
      b.alive = false; b.mesh.visible = false;
      world.col.remove(b.collider);
    }
  }

  update(dt) {
    const { player, hud, enemies, audio, fx } = this.g;
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      if ((t.t -= dt) <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    for (const e of fx.emitters) if (e.life !== undefined && (e.life -= dt) <= 0) e.off = true;

    if (this.done || player.dead || !this.mission) return;
    if (this.stage === 0 && player.pos.z < BASE.z1 - 1) {
      this.stage = 1;
      hud.objective('Llega al terminal del almacén', '');
      audio.objective();
    }
    if (this.stage === 1) {
      hud.objectiveSub(`Hostiles restantes: ${enemies.alive}`);
      if (Math.hypot(player.pos.x - OBJECTIVE.x, player.pos.z - (OBJECTIVE.z - 1.2)) < 2.4) {
        this.done = true;
        audio.objective();
        this.g.onMissionEnd(true);
      }
    }
  }

  // Salpicadura al pisar un charco.
  footSplash(x, z) { splash(this.g.fx, x, z, 0.45); }
}
