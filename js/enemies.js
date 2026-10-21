'use strict';
// Enemies, pickups, and hit and kill handling. Phase 1 ports the scrapper; the other seven types come in Phase 3.
// Behaviour and timings follow the 2D enemies.js; distances and speeds are converted at PX = 1/11.

const ENEMY_DEFS = {
  scrapper: { hp: 44, r: 0.45, h: 1.64, speed: 7.45, score: 100, mass: 1, dmg: 12, model: 'scrapper', debris: ['#6b4a3a', '#3e2a24', '#8e6a52', '#8a8a90'] },
};
const ENEMY_BASE_STATE = { scrapper: 'chase' };
const WINDUP_STATES = new Set(['windup', 'aim', 'tele', 'punchWind', 'slamWind', 'bashWind', 'lungeWind', 'throwWind']);
// The melee glint flashes this long before a hit lands, so a reaction to it lands inside the parry window.
const GLINT_LEAD = 0.28;
// Melee attack tokens: only this many enemies may wind up or swing at once; the rest hold back.
const MELEE_STATES = new Set(['windup', 'strike', 'punchWind', 'punch', 'tele', 'dive', 'bashWind', 'bash', 'lungeWind', 'lunge']);
function meleeTokenLimit() { return clamp(Math.round(2 * S.enemies.aggression), 1, 4); }
function meleeTokensFree(self) {
  let n = 0;
  for (const e of Game.enemies) if (e !== self && !e.dead && !e.spawning && MELEE_STATES.has(e.state)) n++;
  return n < meleeTokenLimit();
}
// An attacker the camera can't see (more than 75 degrees off its view) winds up 1.3x longer.
const OFFVIEW_WIND = 1.3;

class Enemy {
  constructor(type, pos, scale = {}) {
    const d = ENEMY_DEFS[type];
    this.type = type; this.def = d; this.isEnemy = true;
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.prev = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: 0, y: 0, z: 0 }; this.r = d.r; this.h = d.h; this.onGround = false; this.col = null;
    this.maxHp = this.hp = Math.max(1, Math.round(d.hp * S.enemies.health * (scale.hp || 1)));
    this.dmgMul = scale.dmg || 1;
    this.heavy = !!d.heavy; this.flying = !!d.flying; this.mass = d.mass;
    this.state = ENEMY_BASE_STATE[type]; this.st = 0; this.cd = rand(0.6, 1.5);
    this.stun = 0; this.hitFlash = 0;
    const p = Game.player;
    this.yaw = p ? yawOf(p.pos.x - pos.x, p.pos.z - pos.z) : 0;
    this.spawning = true; this.spawnT = 0.75; this.dead = false; this.t = rand(0, 10);
    this.tethered = false; this.cutMark = 0; this.poise = 0; this.windMul = 1;
    this.speedVar = rand(0.88, 1.12); this.walk = 0; this.struck = false; this.fade = 1;
    this.model = null;
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h / 2, z: this.pos.z }; }
  setState(s) { this.state = s; this.st = 0; this.glinted = false; }
  meleeWind() {
    if (this.type === 'scrapper' && this.state === 'windup') return this.tele(0.45);
    return 0;
  }
  glintPoint() {
    if (this.model && this.model.bones.weapon) {
      const v = Rig.boneWorld(this.model, 'weapon', new THREE.Vector3());
      return { x: v.x, y: v.y + 0.25, z: v.z };
    }
    return { x: this.pos.x, y: this.pos.y + this.h + 0.8, z: this.pos.z };
  }
  checkGlint() {
    const w = this.meleeWind();
    if (!w || this.glinted || this.st < Math.max(0, w - GLINT_LEAD)) return;
    this.glinted = true;
    const g = this.glintPoint();
    FX.glint(g, { c: '#ffe8a0', size: this.heavy ? 1.1 : 0.8, follow: () => this.glintPoint(), threat: this });
    Sound.play('glint', {}, g);
  }
  windingUp() { return WINDUP_STATES.has(this.state); }
  // kv: knock velocity { x, y, z } in m/s
  stagger(dur, kv) {
    if (this.heavy && dur < 1) dur *= 0.5;
    this.stun = Math.max(this.stun, dur);
    if (kv) { this.vel.x += kv.x / this.mass; this.vel.z += kv.z / this.mass; }
    if (this.state !== ENEMY_BASE_STATE[this.type]) this.setState(ENEMY_BASE_STATE[this.type]);
    this.cd = Math.max(this.cd, 0.4);
  }
  scaleSpeed() { return this.def.speed * S.enemies.speed * this.speedVar; }
  tele(base) { return base * S.enemies.telegraph * this.windMul; }
  dmg() { return this.def.dmg * this.dmgMul; }
  // facing as a unit vector on the ground
  fwd() { return { x: fwdX(this.yaw), z: fwdZ(this.yaw) }; }
  turnToward(x, z, rate, dt) {
    const want = yawOf(x - this.pos.x, z - this.pos.z);
    this.yaw += clamp(angDiff(this.yaw, want), -rate * dt, rate * dt);
  }

  update(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.t += dt; this.st += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.spawning) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawning = false;
        const c = this.center();
        FX.ring({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 0.2, 1.6, 0.25, { c: '#ff7a3a', flat: true });
        FX.sparks(c, 10, null, TAU, 3.6, 12.7, { c0: '#fff4d0', c1: '#ff9a3a', c2: '#7a2a10' });
        FX.dust(this.pos, 5, { smax: 3.6 });
      }
      return;
    }
    this.cd -= dt * S.enemies.aggression;
    if (this.stun > 0) {
      this.stun -= dt;
      this.physics(dt, true);
      return;
    }
    this[this.type](dt);
    this.checkGlint();
    this.physics(dt, false);
  }
  physics(dt, stunned) {
    const v = this.vel;
    v.y = Math.max(v.y - 81.8 * dt * Game.gravMul(), -47.3);
    if (stunned) {
      const [nx, nz] = approach2(v.x, v.z, 0, 0, (this.onGround ? 63.6 : 10.9) * dt);
      v.x = nx; v.z = nz;
    }
    World.moveBody(this, dt, { step: stunned ? 0 : 1.0 });
    const B = Arena.bounds();
    this.pos.x = clamp(this.pos.x, B.minX + this.r, B.maxX - this.r);
    this.pos.z = clamp(this.pos.z, B.minZ + this.r, B.maxZ - this.r);
    if (this.pos.y < -20) { this.dead = true; Game.onKill(this, { cause: 'fall' }); }
  }
  // Steer at the player: straight when the way is clear or off the street, else down the street flow field.
  groundChase(dt, spd, stopDist) {
    const p = Game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    let mx = dx / d, mz = dz / d;
    const street = Math.abs(this.pos.y - World.def.groundY) < 0.3;
    if (street && d > 2.5) {
      const knee = { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z };
      if (World.raycast(knee, { x: mx, y: 0, z: mz }, d)) {
        const f = Nav.dir(this.pos.x, this.pos.z);
        if (f) { mx = f.x; mz = f.z; }
      }
    }
    if (d > stopDist) {
      const [nx, nz] = approach2(this.vel.x, this.vel.z, mx * spd, mz * spd, 63.6 * dt);
      this.vel.x = nx; this.vel.z = nz;
    } else {
      const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 81.8 * dt);
      this.vel.x = nx; this.vel.z = nz;
    }
    // close up it faces you; further off it faces where it's going
    if (d < 6) this.turnToward(p.pos.x, p.pos.z, 9, dt);
    else this.turnToward(this.pos.x + mx, this.pos.z + mz, 7, dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.9 && this.onGround) this.walk += hs * dt * 1.43;
  }
  // A box in front of the enemy: reach forward, halfW to each side, y0..y1 above its feet.
  meleeCheck(reach, halfW, y0, y1, dmg, knock) {
    if (this.struck) return;
    const p = Game.player, f = this.fwd();
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const along = dx * f.x + dz * f.z, side = Math.abs(dx * -f.z + dz * f.x);
    if (along > -p.r && along < reach + p.r && side < halfW + p.r && p.pos.y < this.pos.y + y1 && p.pos.y + p.h > this.pos.y + y0) {
      this.struck = true;
      const res = p.takeHit({ dmg, from: this.center(), kind: 'melee', source: this, knock });
      if (res === 'hit') FX.sparks(p.center(), 8, { x: f.x, y: 0.2, z: f.z }, 1.2, 5.5, 18);
    }
  }

  // ---------- AI ----------
  scrapper(dt) {
    const p = Game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), dy = p.pos.y - this.pos.y;
    switch (this.state) {
      case 'chase': {
        // without a free attack token it hangs back just out of reach
        const token = meleeTokensFree(this);
        this.groundChase(dt, this.scaleSpeed() * (token ? 1 : 0.6), token ? 1.64 : 4.2);
        if (!token && d < 3.6 && this.onGround) {
          const [nx, nz] = approach2(this.vel.x, this.vel.z, (-dx / (d || 1)) * 3.6, (-dz / (d || 1)) * 3.6, 54.5 * dt);
          this.vel.x = nx; this.vel.z = nz;
        }
        if (token && d < 2.7 && Math.abs(dy) < 2.2 && this.cd <= 0 && !p.dead && this.onGround) {
          this.setState('windup');
          this.windMul = Camera.offView(this.center()) ? OFFVIEW_WIND : 1;
          Sound.play('enemyWindup', {}, this.center());
        }
        break;
      }
      case 'windup': {
        const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 81.8 * dt);
        this.vel.x = nx; this.vel.z = nz;
        // tracks you through most of the wind-up, then commits to its line
        if (this.st < this.tele(0.45) * 0.7) this.turnToward(p.pos.x, p.pos.z, 4, dt);
        if (this.st >= this.tele(0.45)) {
          this.setState('strike');
          const f = this.fwd();
          this.vel.x = f.x * 17.3; this.vel.z = f.z * 17.3;
          this.struck = false;
          Sound.play('enemyMelee', {}, this.center());
        }
        break;
      }
      case 'strike':
        this.meleeCheck(2.2, 0.75, 0.25, 1.55, this.dmg(), 15.5);
        if (this.st > 0.15) this.setState('recover');
        break;
      case 'recover': {
        const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 81.8 * dt);
        this.vel.x = nx; this.vel.z = nz;
        if (this.st > 0.5) { this.setState('chase'); this.cd = rand(0.9, 1.7); this.windMul = 1; }
        break;
      }
    }
  }
}

// Keep grounded enemies from stacking: the 2D push, around in a circle instead of along a line.
function separateEnemies(dt) {
  const es = Game.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.spawning || a.flying) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.spawning || b.flying) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), minD = (a.r + b.r) * 0.84;
      if (d < minD && Math.abs(a.pos.y - b.pos.y) < 1.1) {
        const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, push = (minD - d) * 4 * dt;
        if (World.boxFree(a.pos.x - ux * push, a.pos.y + 0.01, a.pos.z - uz * push, a.r, a.h - 0.05)) { a.pos.x -= ux * push; a.pos.z -= uz * push; }
        if (World.boxFree(b.pos.x + ux * push, b.pos.y + 0.01, b.pos.z + uz * push, b.r, b.h - 0.05)) { b.pos.x += ux * push; b.pos.z += uz * push; }
      }
    }
  }
}

// o: { kv: knock velocity {x,y,z} m/s, dir: hit direction (for sparks), heavy, heavyAtk, cause, stagger, hitstop, shake, crit, guardBreak, noKnock }
function hurtEnemy(e, dmg, o = {}) {
  if (e.dead || e.spawning || e.dying) return 0;
  if (e.shielded && e.shielded(o)) { e.shieldHit(o); return 0; }
  let d = dmg * (e.damageTakenMul ? e.damageTakenMul() : 1) * (Game.has('glass') ? 1.35 : 1);
  if (e.tethered) d *= 1.25;
  d = Math.max(1, Math.round(d));
  e.hp -= d;
  e.hitFlash = 0.08;
  if (!o.noKnock && o.kv) {
    const m = e.heavy ? (o.heavy ? 3 : 9) : e.mass;
    e.vel.x = o.kv.x / m + e.vel.x * 0.2;
    e.vel.z = o.kv.z / m + e.vel.z * 0.2;
    const ky = o.kv.y / m;
    if (ky > 0) { e.vel.y = Math.max(e.vel.y, ky); if (ky > 5.5) e.onGround = false; }
    else if (ky < 0) e.vel.y = Math.min(e.vel.y, ky);
  }
  // heavy attacks hit brutes and scrappers hard but don't stagger them
  const steady = o.heavyAtk && (e.type === 'brute' || e.type === 'scrapper');
  if (e.heavy) {
    e.poise += d;
    if (!steady && (o.heavy || e.poise > 80)) { e.poise = 0; e.stagger(o.stagger || 0.4); }
  } else if (!steady) e.stagger(Math.max(o.stagger || 0.2, 0.12));
  const c = e.center();
  const dir = o.dir || { x: c.x - Game.player.pos.x, y: 0.3, z: c.z - Game.player.pos.z };
  FX.sparks(c, o.heavy ? 12 : 7, dir, 1.3, 5.5, 21.8);
  FX.oil(c, o.heavy ? 5 : 2, dir, 10.9);
  FX.text(String(d), { x: c.x, y: e.pos.y + e.h + 0.4, z: c.z }, { c: o.crit ? '#ffd070' : o.heavy || d >= 30 ? '#ff8a9a' : '#ffffff', scale: o.crit || d >= 60 ? 2 : 1 });
  FX.light(c, '#ff3048', 2.5, 4, 0.1);
  Sound.play('hit', { heavy: o.heavy || d >= 30 }, c);
  if (o.hitstop) Game.hitstop(o.hitstop);
  if (o.shake) Game.shake(o.shake);
  Game.registerHit(d, o.cause);
  if (e.hp <= 0) killEnemy(e, o);
  return d;
}

function killEnemy(e, o) {
  if (e.onDeath) { e.onDeath(o); return; }
  e.dead = true; e.tethered = false; e.hp = 0;
  const c = e.center();
  const cut = ['slash', 'heavy', 'iaido', 'saw', 'tether', 'plunge', 'chain', 'groundcut'].includes(o.cause);
  // the model comes apart: a cut throws the halves either side of the blade
  FX.gibs(e, { kv: o.kv, dir: o.dir, cut });
  if (cut && o.dir) {
    const L = Math.max(e.r * 2, e.h) * 0.7;
    const px = -o.dir.z, pz = o.dir.x, pl = Math.hypot(px, pz) || 1;
    FX.slashLine({ x: c.x - (px / pl) * L, y: c.y - 0.3, z: c.z - (pz / pl) * L }, { x: c.x + (px / pl) * L, y: c.y + 0.3, z: c.z + (pz / pl) * L }, { w: 0.12, dur: 0.2 });
  }
  const big = e.heavy ? 2 : 1;
  FX.oil(c, 10 * big, { x: 0, y: 1, z: 0 }, 15.5);
  FX.sparks(c, 16 * big, null, TAU, 5.5, 23.6);
  FX.debris(c, 10 * big, e.def.debris, 15.5);
  FX.elec(c, 1.3 * big, 4);
  FX.light(c, '#ff5030', 4, 6 * big, 0.25);
  Sound.play('kill', {}, c);
  Game.onKill(e, o);
}

// A green health drop: it floats, then flies to you when you come near.
class Pickup {
  constructor(pos, kind) {
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.kind = kind;
    const a = rand(0, TAU);
    this.vel = { x: Math.cos(a) * rand(0, 5.5), y: 16.4, z: Math.sin(a) * rand(0, 5.5) };
    this.r = 0.27; this.h = 0.55; this.t = 0; this.dead = false; this.onGround = false;
  }
  update(dt) {
    this.t += dt;
    const p = Game.player, pc = p.center(), d = dist3(this.pos, pc);
    if (this.t > 0.4 && d < 5.5 && !p.dead) {
      const sp = 23.6;
      this.pos.x += ((pc.x - this.pos.x) / d) * sp * dt; this.pos.y += ((pc.y - this.pos.y) / d) * sp * dt; this.pos.z += ((pc.z - this.pos.z) / d) * sp * dt;
      if (d < 0.75) this.collect(p);
      return;
    }
    this.vel.y = Math.max(this.vel.y - 63.6 * dt, -27);
    if (this.onGround) { const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 27 * dt); this.vel.x = nx; this.vel.z = nz; }
    World.moveBody(this, dt);
    if (this.t > 14) this.dead = true;
  }
  collect(p) {
    this.dead = true;
    if (this.kind === 'hp') { p.heal(15); FX.text('+15', { x: p.pos.x, y: p.pos.y + 2.5, z: p.pos.z }, { c: '#7dff8a', always: true }); }
    Sound.play('pickup');
    FX.sparks(this.pos, 8, null, TAU, 3.6, 10.9, { c0: '#ffffff', c1: '#7dff8a', c2: '#1a7a3a' });
  }
}
