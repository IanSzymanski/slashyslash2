'use strict';
// Specialist enemies, each built around one of the player's moves:
//   shielder  - a riot shield blocks hits from the front; parry its bash, land a heavy, or get behind it
//   crawler   - armour shrugs off slashes; plunges, ground cuts and explosions crack it
//   grenadier - lobs a small pulse grenade; tether it and kick it back
//   sniper    - perches on rooftops and relocates by tether; tether up to it
// Ported from the 2D specialists.js. With no text in play, each state reads on the model: a shield
// knocked aside hangs low, cracked armour glows through its seams.

Object.assign(ENEMY_DEFS, {
  shielder: { hp: 60, r: 0.5, h: 1.73, speed: 6.4, score: 180, mass: 1.4, dmg: 14, debris: ['#3a4250', '#6a7a8a', '#d8b040', '#2a3038'] },
  crawler: { hp: 70, r: 0.7, h: 0.9, speed: 5.6, score: 170, mass: 2, dmg: 12, debris: ['#4a4a56', '#7a7a86', '#2a2a32', '#ff7a2a'] },
  grenadier: { hp: 50, r: 0.5, h: 1.64, speed: 5.0, score: 200, mass: 1.2, dmg: 12, debris: ['#3a5a5a', '#2a3a3a', '#4af0ff', '#6a8a7a'] },
  sniper: { hp: 40, r: 0.45, h: 1.73, speed: 0, score: 220, mass: 1, dmg: 18, debris: ['#5a2a3a', '#3a1a24', '#2a2a30', '#ff3a52'] },
});
Object.assign(ENEMY_BASE_STATE, { shielder: 'chase', crawler: 'crawl', grenadier: 'move', sniper: 'perch' });

// Hits that ignore the shielder's shield and crack the crawler's armour.
const ARMOR_BREAKERS = new Set(['plunge', 'groundcut', 'rock', 'barrel', 'saw']);
const SHIELD_BYPASS = new Set(['plunge', 'chain', 'barrel', 'saw']);
const SNIPER_BOLT = { outer: '#ff3a52', core: '#ffe0e8', light: '#ff3048' };
// the shield covers 60 degrees either side of where it faces
const SHIELD_COS = Math.cos((60 * Math.PI) / 180);

Enemy.prototype.initType = function () {
  this.guardBrokenT = 0; this.turnT = 0; this.crackT = 0; this.fleeCD = 0; this.blockedT = 0; this.grenade = null; this.zipTo = null;
  if (this.type === 'sniper') this.cd = rand(1.2, 2);
  if (this.type === 'grenadier') this.cd = rand(1.5, 2.5);
};

// ---------- damage hooks (hurtEnemy calls these) ----------
Enemy.prototype.shielded = function (o = {}) {
  if (this.type === 'shielder') {
    if (this.guardBrokenT > 0 || SHIELD_BYPASS.has(o.cause)) return false;
    // projectiles are judged by the way they travel, everything else by where the player stands
    const f = this.fwd();
    let fx, fz;
    if ((o.cause === 'reflect' || o.cause === 'rock') && o.dir) { fx = -o.dir.x; fz = -o.dir.z; }
    else { fx = Game.player.pos.x - this.pos.x; fz = Game.player.pos.z - this.pos.z; }
    const l = Math.hypot(fx, fz);
    return l < 1e-3 || (fx * f.x + fz * f.z) / l > SHIELD_COS;
  }
  if (this.type === 'crawler') {
    if (this.crackT > 0) return false;
    if (ARMOR_BREAKERS.has(o.cause)) { this.crackArmor(); return false; }
    return true;
  }
  return false;
};
Enemy.prototype.shieldHit = function (o = {}) {
  const p = Game.player, away = { x: this.pos.x - p.pos.x, z: this.pos.z - p.pos.z }, al = Math.hypot(away.x, away.z) || 1;
  // a heavy knocks the riot shield aside instead of bouncing off it
  if (this.type === 'shielder' && o.guardBreak && this.guardBrokenT <= 0) {
    this.stagger(1.3, { x: (away.x / al) * 12.7, y: 0, z: (away.z / al) * 12.7 });
    Sound.play('shieldDeflect', {}, this.center());
    Game.shake(0.2);
    return;
  }
  const at = this.type === 'shielder' ? this.glintPoint() : { x: this.pos.x, y: this.pos.y + this.h * 0.7, z: this.pos.z };
  if (this.type === 'shielder') at.y -= 0.5;
  FX.sparks(at, 9, { x: -away.x / al, y: 0.3, z: -away.z / al }, 1.6, 5.5, 18.2, { c0: '#ffffff', c1: '#ffe080', c2: '#6a5a3a' });
  FX.light(at, '#ffe080', 2.5, 3, 0.1);
  Sound.play('shieldDeflect', {}, at);
  // bounced off: a little shove back
  if (distXZ(p.pos, this.pos) < 4 && !p.ult) { p.vel.x -= (away.x / al) * 8.2; p.vel.z -= (away.z / al) * 8.2; }
};
Enemy.prototype.crackArmor = function () {
  this.crackT = 4;
  const c = this.center();
  FX.debris(c, 10, this.def.debris, 16.4);
  FX.sparks(c, 14, { x: 0, y: 1, z: 0 }, 2, 7.3, 21.8, { c0: '#ffffff', c1: '#ffb040', c2: '#7a3e28' });
  FX.light(c, '#ff7a2a', 3, 4, 0.3);
  Sound.play('barrelHit', {}, c);
};
const baseStagger = Enemy.prototype.stagger;
Enemy.prototype.stagger = function (dur, kv) {
  // a parried bash or a heavy knocks the shield aside
  if (this.type === 'shielder' && dur >= 1.2 && this.guardBrokenT <= 0) {
    this.guardBrokenT = 2.6;
    const at = this.glintPoint();
    FX.sparks(at, 16, { x: 0, y: 1, z: 0 }, 2.2, 7.3, 23.6, { c0: '#ffffff', c1: '#ffe080', c2: '#6a5a3a' });
    FX.ring(at, 0.2, 1.4, 0.25, { c: '#ffd070', flat: false });
    Sound.play('reflect', {}, at);
  }
  return baseStagger.call(this, dur, kv);
};
// a grenade kicked back onto its own thrower
Enemy.prototype.pulseHit = function () {
  hurtEnemy(this, 90, { cause: 'barrel', heavy: true, kv: { x: 0, y: 20, z: 0 }, dir: { x: 0, y: 1, z: 0 }, crit: true });
};

// ---------- shielder: turns slowly, so getting behind it works ----------
Enemy.prototype.shielder = function (dt) {
  const p = Game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3, dy = p.pos.y - this.pos.y;
  if (this.guardBrokenT > 0) this.guardBrokenT -= dt;
  const f = this.fwd(), behind = (dx * f.x + dz * f.z) / d < SHIELD_COS;
  // it tracks you inside its shield's cover, and is slow to come round once you're past it
  this.turnT = behind ? this.turnT + dt : 0;
  switch (this.state) {
    case 'chase': {
      const token = meleeTokensFree(this);
      const yaw0 = this.yaw;
      this.groundChase(dt, this.scaleSpeed() * (token ? 1 : 0.6), token ? 1.8 : 4.4);
      // groundChase turns it freely; the shield arm can't
      const rate = behind ? (this.turnT > 0.3 ? 3.2 : 0) : 4.5;
      this.yaw = yaw0 + clamp(angDiff(yaw0, yawOf(dx, dz)), -rate * dt, rate * dt);
      if (!token && d < 3.6 && this.onGround && !this.hop) { const [nx, nz] = approach2(this.vel.x, this.vel.z, (-dx / d) * 3.6, (-dz / d) * 3.6, 54.5 * dt); this.vel.x = nx; this.vel.z = nz; }
      if (token && !behind && this.guardBrokenT <= 0 && d < 3.1 && Math.abs(dy) < 2.2 && this.cd <= 0 && !p.dead && this.onGround) this.startWind('bashWind', 0.8);
      break;
    }
    case 'bashWind':
      this.brake(dt);
      if (this.st < this.tele(0.5) * 0.7) this.turnToward(p.pos.x, p.pos.z, 3, dt);
      if (this.st >= this.tele(0.5)) {
        this.setState('bash'); this.struck = false;
        this.vel.x = f.x * 20.9; this.vel.z = f.z * 20.9;
        Sound.play('enemyMelee', {}, this.center());
      }
      break;
    case 'bash':
      this.meleeCheck(2.0, 0.8, 0.18, 1.73, this.dmg(), 21.8);
      if (this.st > 0.16) this.setState('recover');
      break;
    case 'recover':
      this.brake(dt);
      if (this.st > 0.55) { this.setState('chase'); this.cd = rand(1.0, 1.8); this.windMul = 1; }
      break;
  }
};

// ---------- crawler: low and armoured, lunges from a few metres ----------
Enemy.prototype.crawler = function (dt) {
  const p = Game.player, d = distXZ(p.pos, this.pos), dy = p.pos.y - this.pos.y;
  if (this.crackT > 0) this.crackT -= dt;
  switch (this.state) {
    case 'crawl': {
      const token = meleeTokensFree(this);
      this.groundChase(dt, this.scaleSpeed() * (token ? 1 : 0.6), token ? 2.4 : 4.7);
      if (token && d < 5.5 && Math.abs(dy) < 1.8 && this.cd <= 0 && !p.dead && this.onGround && !this.hop) this.startWind('lungeWind', 0.75);
      break;
    }
    case 'lungeWind':
      this.brake(dt);
      if (this.st < this.tele(0.45) * 0.7) this.turnToward(p.pos.x, p.pos.z, 5, dt);
      if (this.st >= this.tele(0.45)) {
        this.setState('lunge'); this.struck = false;
        const f = this.fwd();
        this.vel.x = f.x * 23.6; this.vel.z = f.z * 23.6; this.vel.y = 13.6; this.onGround = false;
        Sound.play('enemyMelee', {}, this.center());
      }
      break;
    case 'lunge':
      this.meleeCheck(1.3 + this.r, 0.8, -0.1, 1.1, this.dmg(), 16.4);
      if ((this.onGround && this.st > 0.1) || this.st > 0.6) this.setState('recover');
      break;
    case 'recover':
      this.brake(dt);
      if (this.st > 0.6) { this.setState('crawl'); this.cd = rand(1.2, 2.0); this.windMul = 1; }
      break;
  }
};

// ---------- grenadier: lobs a small pulse grenade with its landing marked; tether it and kick it back ----------
// the charge cell in the gauntlet at the top of the wind-up, behind the right shoulder
Enemy.prototype.orbPos = function () {
  const Y = this.yaw;
  return { x: this.pos.x - fwdX(Y) * 0.3 + Math.cos(Y) * 0.45, y: this.pos.y + 1.68, z: this.pos.z - fwdZ(Y) * 0.3 - Math.sin(Y) * 0.45 };
};
Enemy.prototype.grenadier = function (dt) {
  const p = Game.player, d = distXZ(p.pos, this.pos);
  if (this.grenade && this.grenade.dead) this.grenade = null;
  switch (this.state) {
    case 'move':
      this.keepRange(dt, 10, 20, this.scaleSpeed());
      if (this.cd <= 0 && d < 27.3 && !p.dead && this.onGround && !this.grenade) this.startWind('throwWind', 0.6);
      break;
    case 'throwWind': {
      this.brake(dt);
      this.turnToward(p.pos.x, p.pos.z, 9, dt);
      // the arc tracks you through the wind-up: aimed where you stand, a little above your feet
      const o = this.orbPos(), tx = p.pos.x, ty = p.pos.y + 0.55, tz = p.pos.z;
      const T = clamp(Math.hypot(tx - o.x, ty - o.y, tz - o.z) / 15.5, 0.8, 1.4);
      this.plan = { o, T, v: { x: (tx - o.x) / T, y: (ty - o.y) / T + 0.5 * GRENADIER_G * T, z: (tz - o.z) / T } };
      if (Math.random() < 0.5) FX.elec(o, 0.45 + this.st * 0.55, 1, { outer: '#2ab8d8', core: '#ffffff' });
      if (this.st >= this.tele(1.0)) {
        this.grenade = new PulseGrenade(o, this.plan.v, this, { g: GRENADIER_G, R: 3.6, dmg: 12, disable: 0, size: 0.75 });
        Game.projectiles.push(this.grenade);
        Sound.play('throw', {}, o);
        this.plan = null;
        this.setState('cool');
      }
      break;
    }
    case 'cool':
      this.brake(dt);
      if (this.st > 0.6) { this.setState('move'); this.cd = rand(3.5, 5.5); this.windMul = 1; }
      break;
  }
};

// ---------- sniper: perches high, lays a red laser on you, and zips away when you come close ----------
Enemy.prototype.sniper = function (dt) {
  const p = Game.player;
  this.skipPhysics = this.state === 'zip';
  if (this.fleeCD > 0) this.fleeCD -= dt;
  switch (this.state) {
    case 'perch': {
      this.brake(dt, 54.5);
      this.turnToward(p.pos.x, p.pos.z, 9, dt);
      this.trackAim();
      const close = distXZ(p.pos, this.pos) < 5.5 && Math.abs(p.pos.y - this.pos.y) < 2.7;
      if (close && this.fleeCD <= 0 && this.onGround) { this.relocate(); break; }
      const m = this.muzzle(), clear = this.clearShot(m);
      if (this.cd <= 0 && !p.dead && dist3(m, p.chest()) < 40 && clear) { this.startWind('aim', 0.5); this.blockedT = 0; }
      else if (!clear && this.cd <= 0) {
        this.blockedT += dt;
        if (this.blockedT > 2.5 && this.fleeCD <= 0 && this.onGround) this.relocate();
      }
      break;
    }
    case 'aim': {
      this.brake(dt, 54.5);
      const dur = this.tele(1.1);
      if (this.st < dur - 0.25) { this.trackAim(); this.turnToward(p.pos.x, p.pos.z, 12, dt); }
      if (this.st >= dur) {
        const a = this.aimDir, m = this.muzzle();
        const shot = new Bolt({ x: m.x + a.x * 0.36, y: m.y + a.y * 0.36, z: m.z + a.z * 0.36 }, a, 47.3 * S.enemies.speed, this.dmg(), SNIPER_BOLT);
        // a sniper round is no small bullet: it still knocks you off the tether
        shot.big = true;
        Game.projectiles.push(shot);
        Sound.play('bossGun', {}, m); Sound.play('enemyShoot', {}, m);
        FX.sparks(m, 8, a, 0.5, 7.3, 20, { c0: '#ffffff', c1: '#ff5a6a', c2: '#5a0c1a' });
        FX.light(m, '#ff3048', 4, 4, 0.1);
        this.setState('cool');
      }
      break;
    }
    case 'cool':
      this.brake(dt, 54.5);
      if (this.st > 0.8) { this.setState('perch'); this.cd = rand(2.2, 3.4); this.windMul = 1; }
      break;
    case 'zip': {
      // reels itself to another perch along its own tether: up off the ledge first, then along the line
      const T = this.zipUp || this.zipTo, dx = T.x - this.pos.x, dy = T.y - this.pos.y, dz = T.z - this.pos.z, d = Math.hypot(dx, dy, dz), step = 38.2 * dt;
      this.vel.x = this.vel.y = this.vel.z = 0;
      if (this.zipUp && d <= step) { this.pos.x = T.x; this.pos.y = T.y; this.pos.z = T.z; this.zipUp = null; }
      else if (d <= step || this.st > 1.6) {
        this.zipUp = null;
        this.pos.x = T.x; this.pos.y = T.y; this.pos.z = T.z; this.zipTo = null; this.skipPhysics = false;
        this.setState('perch'); this.cd = Math.max(this.cd, 0.8);
        FX.dust(this.pos, 4, { smax: 2.7 });
      } else {
        this.pos.x += (dx / d) * step; this.pos.y += (dy / d) * step; this.pos.z += (dz / d) * step;
        if (Math.hypot(dx, dz) > 0.1) this.yaw = yawOf(dx, dz);
      }
      break;
    }
  }
};
// A zip rises ZIP_RISE off the ledge, then runs straight to a point `lift` above the perch and drops onto
// it. The hull is checked every 0.1 m along that path, a little wider than the body. Returns the lowest
// lift that works, or 0.
const ZIP_LIFTS = [0.4, 1.5, 3], ZIP_RISE = 0.3;
Enemy.prototype.zipClear = function (q) {
  const x0 = this.pos.x, y0 = this.pos.y + ZIP_RISE, z0 = this.pos.z, r = this.r + 0.03;
  if (!World.boxFree(x0, this.pos.y + 0.01, z0, r, this.h + ZIP_RISE)) return 0;
  for (const lift of ZIP_LIFTS) {
    const y1 = q.y + lift, n = Math.ceil(Math.hypot(q.x - x0, y1 - y0, q.z - z0) / 0.1);
    if (!World.boxFree(q.x, q.y + 0.02, q.z, this.r, this.h + lift)) return 0;
    let ok = true;
    for (let i = 1; i <= n && ok; i++) ok = World.boxFree(lerp(x0, q.x, i / n), lerp(y0, y1, i / n), lerp(z0, q.z, i / n), r, this.h);
    if (ok) return lift;
  }
  return 0;
};
// Another perch well away from the player, reachable in a straight line, with a clear shot if possible.
Enemy.prototype.relocate = function () {
  const P = Game.player;
  const far = Arena.perches().filter((q) => distXZ(q, P.pos) > 15.5 && dist3(q, this.pos) > 5.5 && dist3(q, this.pos) < 47);
  for (let i = far.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [far[i], far[j]] = [far[j], far[i]]; }
  // perches with a shot at the player first; the path check is the costly part, so it runs last
  const shot = (q) => this.clearShot({ x: q.x, y: q.y + 1.42, z: q.z });
  let lift = 0;
  const q = far.find((q) => shot(q) && (lift = this.zipClear(q))) || far.find((q) => (lift = this.zipClear(q)));
  if (!q) { this.fleeCD = 2; return; }
  this.zipTo = { x: q.x, y: q.y + lift, z: q.z };
  this.zipUp = { x: this.pos.x, y: this.pos.y + ZIP_RISE, z: this.pos.z };
  this.setState('zip'); this.skipPhysics = true; this.fleeCD = 4.5; this.blockedT = 0; this.hop = null;
  Sound.play('tetherFire', {}, this.center());
};
