'use strict';
// Enemies, pickups, and hit and kill handling: the scrapper, gunner, drone and brute. The specialists
// (shield scrapper, crawler, grenadier, sniper) are in specialists.js, as in 2D. Behaviour and timings
// follow the 2D enemies.js; distances and speeds are converted at PX = 1/11. Ground enemies walk the
// nav graph in world.js, jumping between surfaces; drones fly.

const ENEMY_DEFS = {
  scrapper: { hp: 44, r: 0.45, h: 1.64, speed: 7.45, score: 100, mass: 1, dmg: 12, debris: ['#6b4a3a', '#3e2a24', '#8e6a52', '#8a8a90'] },
  gunner: { hp: 32, r: 0.45, h: 1.73, speed: 5.6, score: 130, mass: 1, dmg: 10, debris: ['#4a5a3a', '#3e4a32', '#2a2a30', '#6a7a52'] },
  drone: { hp: 22, r: 0.5, h: 0.8, speed: 11.4, score: 90, mass: 0.7, dmg: 12, flying: true, debris: ['#5a5a66', '#8a8a96', '#3a3a44', '#ffd040'] },
  // brutes are too big to jump between surfaces: steps and kerbs only
  brute: { hp: 250, r: 0.9, h: 2.82, speed: 3.8, score: 450, mass: 3.5, dmg: 22, heavy: true, climb: 2.0, debris: ['#3a3a44', '#55555f', '#24242c', '#7a3e28', '#ff7a2a'] },
};
const ENEMY_BASE_STATE = { scrapper: 'chase', gunner: 'move', drone: 'hover', brute: 'walk' };
const WINDUP_STATES = new Set(['windup', 'aim', 'tele', 'punchWind', 'slamWind', 'bashWind', 'lungeWind', 'throwWind']);
// The melee glint flashes this long before a hit lands, so a reaction to it lands inside the parry window.
const GLINT_LEAD = 0.28;
// where each type's glint sits: a bone of its model and a lift above it
const GLINT_AT = { scrapper: ['weapon', 0.25], brute: ['handR', 0.15], shielder: ['shield', 0.5], crawler: ['head', 0.2], drone: ['body', 0.1] };
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
const ENEMY_G = 81.8;

class Enemy {
  constructor(type, pos, scale = {}) {
    const d = ENEMY_DEFS[type];
    this.type = type; this.def = d; this.isEnemy = true;
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.prev = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: 0, y: 0, z: 0 }; this.r = d.r; this.h = d.h; this.onGround = false; this.col = null;
    this.maxHp = this.hp = Math.max(1, Math.round(d.hp * S.enemies.health * (scale.hp || 1)));
    this.dmgMul = scale.dmg || 1;
    this.heavy = !!d.heavy; this.flying = !!d.flying; this.mass = d.mass; this.climb = d.climb === undefined ? Nav.CLIMB : d.climb;
    this.state = ENEMY_BASE_STATE[type]; this.st = 0; this.cd = rand(0.6, 1.5);
    this.stun = 0; this.hitFlash = 0;
    const p = Game.player;
    this.yaw = p ? yawOf(p.pos.x - pos.x, p.pos.z - pos.z) : 0;
    this.spawning = true; this.spawnT = 0.75; this.dead = false; this.t = rand(0, 10);
    this.tethered = false; this.cutMark = 0; this.poise = 0; this.windMul = 1;
    this.speedVar = rand(0.88, 1.12); this.walk = 0; this.struck = false; this.fade = 1;
    this.model = null; this.side = chance(0.5) ? 1 : -1; this.seek = null; this.blockedT = 0; this.grenade = null; this.plan = null;
    this.hop = null; this.navTo = null; this.skipPhysics = false; this.orbit = p ? yawOf(pos.x - p.pos.x, pos.z - p.pos.z) : 0;
    this.aimDir = { x: fwdX(this.yaw), y: 0, z: fwdZ(this.yaw) };
    if (this.initType) this.initType();
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h / 2, z: this.pos.z }; }
  setState(s) { this.state = s; this.st = 0; this.glinted = false; }
  // Starts a wind-up: slower when the camera can't see it, with its sound placed where it is.
  startWind(state, pm = 1) {
    this.setState(state);
    this.windMul = Camera.offView(this.center()) ? OFFVIEW_WIND : 1;
    Sound.play('enemyWindup', { pm }, this.center());
  }
  // Wind-up length of the current melee attack, or 0 when none is coming.
  meleeWind() {
    const s = this.state, t = this.type;
    if (t === 'scrapper' && s === 'windup') return this.tele(0.45);
    if (t === 'brute' && s === 'punchWind') return this.tele(0.55);
    // a drone's hit lands after its flight, so its glint is timed to the impact
    if (t === 'drone' && s === 'tele') return this.tele(0.5) + this.diveTime();
    if (t === 'drone' && s === 'dive' && !this.struck) return this.st + this.diveTime();
    if (t === 'shielder' && s === 'bashWind') return this.tele(0.5);
    if (t === 'crawler' && s === 'lungeWind') return this.tele(0.45);
    if (t === 'dummy' && s === 'windup') return this.tele(DUMMY.WIND);
    return 0;
  }
  glintPoint() {
    const at = GLINT_AT[this.type];
    if (at && this.model && this.model.bones[at[0]]) {
      const v = Rig.boneWorld(this.model, at[0], new THREE.Vector3());
      return { x: v.x, y: v.y + at[1], z: v.z };
    }
    return { x: this.pos.x, y: this.pos.y + this.h + 0.3, z: this.pos.z };
  }
  checkGlint() {
    const w = this.meleeWind();
    if (!w || this.glinted || this.st < Math.max(0, w - GLINT_LEAD)) return;
    this.glinted = true;
    const g = this.glintPoint();
    FX.glint(g, { c: '#ffe8a0', size: this.heavy ? 1.1 : 0.8, follow: () => this.glintPoint(), threat: this });
    Sound.play('glint', {}, g);
  }
  // seconds until a dive from here reaches the player's chest
  diveTime() { return dist3(this.center(), Game.player.chest()) / (29.1 * S.enemies.speed); }
  windingUp() { return WINDUP_STATES.has(this.state); }
  // kv: knock velocity { x, y, z } in m/s
  stagger(dur, kv) {
    if (this.heavy && dur < 1) dur *= 0.5;
    this.stun = Math.max(this.stun, dur);
    if (kv) { this.vel.x += kv.x / this.mass; this.vel.z += kv.z / this.mass; }
    if (this.state !== ENEMY_BASE_STATE[this.type]) this.setState(ENEMY_BASE_STATE[this.type]);
    this.skipPhysics = false; this.hop = null;
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
        FX.ring({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 0.2, 1.6, 0.25, { c: '#ff7a3a', flat: !this.flying });
        FX.sparks(c, 10, null, TAU, 3.6, 12.7, { c0: '#fff4d0', c1: '#ff9a3a', c2: '#7a2a10' });
        if (!this.flying) FX.dust(this.pos, 5, { smax: 3.6 });
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
    if (!this.skipPhysics) this.physics(dt, false);
  }
  physics(dt, stunned) {
    const v = this.vel;
    if (this.flying && !stunned) {
      World.moveBody(this, dt);
      // drones keep off the ground below them, except when they dive at it
      const g = World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.1);
      if (this.state !== 'dive' && this.pos.y < g + 0.7) v.y = Math.max(v.y, (g + 0.7 - this.pos.y) * 8);
    } else {
      v.y = Math.max(v.y - ENEMY_G * dt * Game.gravMul() * (this.flying ? 0.6 : 1), -47.3);
      if (stunned) {
        const [nx, nz] = approach2(v.x, v.z, 0, 0, (this.onGround ? 63.6 : 10.9) * dt);
        v.x = nx; v.z = nz;
      }
      World.moveBody(this, dt, { step: stunned ? 0 : 1.0 });
    }
    const B = Arena.bounds();
    this.pos.x = clamp(this.pos.x, B.minX + this.r, B.maxX - this.r);
    this.pos.z = clamp(this.pos.z, B.minZ + this.r, B.maxZ - this.r);
    if (this.pos.y < -20) { this.dead = true; Game.onKill(this, { cause: 'fall' }); }
  }

  // ---------- getting around ----------
  // Steer at the player: straight when it's on your level and the way is clear, else along the nav graph,
  // jumping and dropping between surfaces where the graph says to.
  groundChase(dt, spd, stopDist) {
    if (this.inHop(dt)) return;
    const p = Game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    let mx = dx / d, mz = dz / d, go = d > stopDist;
    const level = Math.abs(p.pos.y - this.pos.y) < 1.2;
    const knee = { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z };
    if (!level || (d > 2.5 && World.raycast(knee, { x: mx, y: 0, z: mz }, d))) {
      const s = this.onGround ? Nav.steer(this, this.climb) : null;
      if (s) {
        if (s.kind === Nav.JUMP) { this.startHop(s.to, s.via, spd); return; }
        mx = s.x; mz = s.z; go = true; this.navTo = s.to;
      } else if (!this.onGround && this.navTo) {
        // walked off an edge: keep heading for where the drop lands
        const tx = this.navTo.x - this.pos.x, tz = this.navTo.z - this.pos.z, tl = Math.hypot(tx, tz);
        if (tl > 0.2) { mx = tx / tl; mz = tz / tl; go = true; }
      }
    }
    if (this.onGround) this.navTo = null;
    if (go) this.steer(dt, mx, mz, spd);
    else this.brake(dt);
    // close up it faces you; further off it faces where it's going
    if (d < 6 && level) this.turnToward(p.pos.x, p.pos.z, 9, dt);
    else this.turnToward(this.pos.x + mx, this.pos.z + mz, 7, dt);
  }
  // A jump along a nav link: up high enough to clear the landing, out past an overhang first if the link
  // says so, then across onto the far surface.
  startHop(to, via, spd) {
    const g = ENEMY_G * Game.gravMul(), rise = to.y - this.pos.y, h = Math.max(rise, 0) + 1.0;
    const vy = Math.sqrt(2 * g * h), T = (vy + Math.sqrt(Math.max(0, vy * vy - 2 * g * rise))) / g;
    const L = (via ? Math.hypot(via.x - this.pos.x, via.z - this.pos.z) + Math.hypot(to.x - via.x, to.z - via.z) : Math.hypot(to.x - this.pos.x, to.z - this.pos.z));
    this.hop = { to, via, spd: clamp(L / T, 5, Math.max(9, spd * 1.5)), t: 0 };
    this.vel.y = vy; this.onGround = false;
    Sound.play('jump', {}, this.pos);
    FX.dust(this.pos, 4, { smax: 2.7 });
  }
  inHop(dt) {
    const H = this.hop;
    if (!H) return false;
    H.t += dt;
    if ((this.onGround && H.t > 0.08) || H.t > 2.5) { this.hop = null; return false; }
    // through the waypoint until above the landing, then onto it
    const wp = H.via && this.pos.y < H.to.y + 0.25 ? H.via : H.to;
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
    const s = d > 0.15 ? Math.min(H.spd, d * 12) : 0;
    this.vel.x = d > 1e-3 ? (dx / d) * s : 0; this.vel.z = d > 1e-3 ? (dz / d) * s : 0;
    if (d > 0.3) this.turnToward(wp.x, wp.z, 10, dt);
    return true;
  }
  // Walk toward a direction on the ground (unit mx, mz) at spd.
  steer(dt, mx, mz, spd) {
    const [nx, nz] = approach2(this.vel.x, this.vel.z, mx * spd, mz * spd, 63.6 * dt);
    this.vel.x = nx; this.vel.z = nz;
    const hs = Math.hypot(nx, nz);
    if (hs > 0.9 && this.onGround) this.walk += hs * dt * 1.43;
  }
  brake(dt, rate = 81.8) {
    const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, rate * dt);
    this.vel.x = nx; this.vel.z = nz;
  }
  // Ranged types hold a band of distance: back off when close, close in when far, drift sideways between.
  // A wall in the way of backing off turns it into a sidestep.
  keepRange(dt, near, far, spd) {
    if (this.inHop(dt)) return;
    const p = Game.player, dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / d, uz = dz / d, knee = { x: this.pos.x, y: this.pos.y + 0.5, z: this.pos.z };
    if (this.seek) {
      const sx = this.seek.x - this.pos.x, sz = this.seek.z - this.pos.z, sd = Math.hypot(sx, sz);
      if (sd < 0.6 || this.st > 2.5) this.seek = null;
      else {
        this.steer(dt, sx / sd, sz / sd, spd);
        this.turnToward(this.seek.x, this.seek.z, 7, dt);
        return;
      }
    }
    if (d > far) { this.groundChase(dt, spd, far - 1); return; }
    let mx = -uz * this.side * 0.5, mz = ux * this.side * 0.5;
    if (d < near) { mx = -ux; mz = -uz; }
    if (World.raycast(knee, { x: mx, y: 0, z: mz }, 1.2)) {
      this.side = -this.side;
      mx = -uz * this.side; mz = ux * this.side;
    }
    this.steer(dt, mx, mz, spd * (d < near ? 1 : 0.55));
    this.turnToward(p.pos.x, p.pos.z, 9, dt);
  }
  // A clear line from a point to the player's chest.
  clearShot(from) {
    const c = Game.player.chest(), dx = c.x - from.x, dy = c.y - from.y, dz = c.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
    return !World.raycast(from, { x: dx / d, y: dy / d, z: dz / d }, d - 0.3);
  }
  // A spot at ground level near the player with a clear shot, nearest this enemy first.
  findFiringSpot(height) {
    const p = Game.player, g = World.def.groundY;
    let best = null, bd = Infinity;
    for (const r of [8, 11, 14]) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU, x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r, t = World.groundAt(x, z, g + 0.5);
        if (t < g - 0.01 || !World.boxFree(x, t, z, this.r, this.h)) continue;
        if (!this.clearShot({ x, y: t + height, z })) continue;
        const d = Math.hypot(x - this.pos.x, z - this.pos.z);
        if (d < bd) { bd = d; best = { x, z }; }
      }
    }
    return best;
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
        if (!token && d < 3.6 && this.onGround && !this.hop) {
          const [nx, nz] = approach2(this.vel.x, this.vel.z, (-dx / (d || 1)) * 3.6, (-dz / (d || 1)) * 3.6, 54.5 * dt);
          this.vel.x = nx; this.vel.z = nz;
        }
        if (token && d < 2.7 && Math.abs(dy) < 2.2 && this.cd <= 0 && !p.dead && this.onGround) this.startWind('windup');
        break;
      }
      case 'windup':
        this.brake(dt);
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
      case 'strike':
        this.meleeCheck(2.2, 0.75, 0.25, 1.55, this.dmg(), 15.5);
        if (this.st > 0.15) this.setState('recover');
        break;
      case 'recover':
        this.brake(dt);
        if (this.st > 0.5) { this.setState('chase'); this.cd = rand(0.9, 1.7); this.windMul = 1; }
        break;
    }
  }

  // ---------- drone: circles above head height and dives at you in a straight line ----------
  drone(dt) {
    const p = Game.player, pc = p.chest(), c = this.center(), v = this.vel;
    const fly = (tx, ty, tz, spd, acc) => {
      const dx = tx - c.x, dy = ty - c.y, dz = tz - c.z, d = Math.hypot(dx, dy, dz) || 1, s = Math.min(spd, d * 3);
      const k = acc * dt;
      v.x = approach(v.x, (dx / d) * s, k); v.y = approach(v.y, (dy / d) * s, k); v.z = approach(v.z, (dz / d) * s, k);
    };
    switch (this.state) {
      case 'hover': {
        // a slow orbit to one side of you, 5 m up; a wall in the way sends it round the other way
        this.orbit += this.side * 0.45 * dt;
        const R = 5.6 + Math.sin(this.t * 0.8) * 1.8;
        const tx = p.pos.x + Math.cos(this.orbit) * R, tz = p.pos.z + Math.sin(this.orbit) * R, ty = p.pos.y + 5.3 + Math.sin(this.t * 2.2) * 0.7;
        if (World.pointSolid(tx, ty, tz, 0.7) && (this.flipT = (this.flipT || 0) - dt) <= 0) { this.side = -this.side; this.flipT = 1; }
        fly(tx, ty, tz, this.scaleSpeed(), 36.4);
        this.turnToward(p.pos.x, p.pos.z, 8, dt);
        if (this.cd <= 0 && dist3(c, pc) < 18.2 && !p.dead && meleeTokensFree(this)) this.startWind('tele', 1.3);
        break;
      }
      case 'tele':
        v.x = approach(v.x, 0, 45.5 * dt); v.z = approach(v.z, 0, 45.5 * dt); v.y = approach(v.y, 0.9, 45.5 * dt);
        this.turnToward(p.pos.x, p.pos.z, 10, dt);
        if (this.st >= this.tele(0.5)) {
          const dx = pc.x - c.x, dy = pc.y - c.y, dz = pc.z - c.z, d = Math.hypot(dx, dy, dz) || 1, sp = 29.1 * S.enemies.speed;
          v.x = (dx / d) * sp; v.y = (dy / d) * sp; v.z = (dz / d) * sp;
          this.yaw = yawOf(dx, dz);
          // one glint per attack, whether it came in the wind-up or the dive
          const g = this.glinted;
          this.setState('dive'); this.struck = false; this.glinted = g;
          Sound.play('droneDive', {}, c);
        }
        break;
      case 'dive': {
        if (!this.struck && !p.dead && pointInBody(c, p, 0.45)) {
          this.struck = true;
          p.takeHit({ dmg: this.dmg(), from: c, kind: 'melee', source: this, knock: 13.6 });
        }
        if (Math.random() < 0.6) FX.sparks(c, 1, { x: -v.x, y: -v.y, z: -v.z }, 0.4, 2.7, 7.3, { c0: '#fff4d0', c1: '#ffb040', c2: '#a04010' });
        const col = this.col;
        if (this.st > 0.6 || this.struck || (col && (col.wall || col.ground || col.ceil))) { this.setState('recover'); this.side = -this.side; }
        break;
      }
      case 'recover':
        v.x = approach(v.x, 0, 36.4 * dt); v.z = approach(v.z, 0, 36.4 * dt); v.y = approach(v.y, 8.2, 54.5 * dt);
        if (this.st > 0.6) { this.setState('hover'); this.cd = rand(1.6, 2.8); this.windMul = 1; this.orbit = yawOf(c.x - p.pos.x, c.z - p.pos.z); }
        break;
    }
  }

  // ---------- brute: punches when close, slams a ground wave you jump from further off ----------
  brute(dt) {
    const p = Game.player, d = distXZ(p.pos, this.pos), dy = p.pos.y - this.pos.y;
    switch (this.state) {
      case 'walk':
        this.groundChase(dt, this.scaleSpeed(), 2.6);
        if (this.cd <= 0 && !p.dead && this.onGround && !this.hop) {
          if (d < 3.4 && Math.abs(dy) < 3.1 && meleeTokensFree(this)) this.startWind('punchWind', 0.5);
          else if (d < 15.5 && Math.abs(dy) < 4.5 && chance(0.02)) this.startWind('slamWind', 0.4);
        }
        break;
      case 'punchWind':
        this.brake(dt);
        if (this.st < this.tele(0.55) * 0.7) this.turnToward(p.pos.x, p.pos.z, 3, dt);
        if (this.st >= this.tele(0.55)) {
          this.setState('punch'); this.struck = false;
          const f = this.fwd();
          this.vel.x = f.x * 10.9; this.vel.z = f.z * 10.9;
          Sound.play('enemyMelee', {}, this.center());
        }
        break;
      case 'punch':
        this.meleeCheck(3.0, 1.0, 0.55, 2.4, this.dmg(), 25.5);
        if (this.st > 0.18) this.setState('recover');
        break;
      case 'slamWind':
        this.brake(dt);
        this.turnToward(p.pos.x, p.pos.z, 2, dt);
        if (this.st >= this.tele(0.85)) {
          this.setState('slam');
          const f = this.fwd(), at = { x: this.pos.x + f.x * 1.2, y: this.pos.y, z: this.pos.z + f.z * 1.2 };
          Game.hazards.push(new GroundWave(at, 20.9 * S.enemies.speed, this.dmg() * 0.8, this));
          Sound.play('slam', {}, at);
          Game.shake(0.3);
          FX.dust(at, 16, { dir: { x: 0, y: 0.2, z: 0 }, spread: TAU, smax: 10.9 });
          FX.debris(at, 12, ['#4a4252', '#5c5464', '#3a3442'], 14.5);
          FX.decal('crack', at, { len: 3.6 });
          FX.ring({ x: at.x, y: at.y + 0.06, z: at.z }, 0.3, 3.6, 0.3, { c: '#ff7a2a' });
          FX.light({ x: at.x, y: at.y + 0.8, z: at.z }, '#ff7a2a', 5, 8, 0.3);
        }
        break;
      case 'slam':
        if (this.st > 0.2) this.setState('recover');
        break;
      case 'recover':
        this.brake(dt);
        if (this.st > 0.7) { this.setState('walk'); this.cd = rand(1.0, 1.9); this.windMul = 1; }
        break;
    }
  }
}

// ---------- gunner: holds its distance, lays a laser on you, fires a bolt you can slash back ----------
// the rifle pivots at the right shoulder; its muzzle sits this far along the aim, as the model holds it
const MUZZLE_LEN = { gunner: 1.35, sniper: 1.62 };
Enemy.prototype.shoulder = function () {
  const Y = this.yaw;
  return { x: this.pos.x + Math.cos(Y) * 0.26, y: this.pos.y + 1.42, z: this.pos.z - Math.sin(Y) * 0.26 };
};
Enemy.prototype.muzzle = function () {
  const s = this.shoulder(), a = this.aimDir, L = MUZZLE_LEN[this.type] || 1.35;
  return { x: s.x + a.x * L, y: s.y + a.y * L, z: s.z + a.z * L };
};
// keeps the rifle on the player's chest
Enemy.prototype.trackAim = function () {
  const c = Game.player.chest(), s = this.shoulder(), l = dist3(c, s) || 1;
  this.aimDir = { x: (c.x - s.x) / l, y: (c.y - s.y) / l, z: (c.z - s.z) / l };
};
Enemy.prototype.gunner = function (dt) {
  const p = Game.player, d = distXZ(p.pos, this.pos);
  switch (this.state) {
    case 'move': {
      this.keepRange(dt, 9, 16.8, this.scaleSpeed());
      // between shots the rifle follows you, so the clear-shot test looks from where it will fire
      this.trackAim();
      const clear = this.clearShot(this.muzzle());
      if (this.cd <= 0 && d < 25.5 && !p.dead && this.onGround && clear) {
        this.startWind('aim', 0.7);
        this.blockedT = 0; this.seek = null;
      } else if (this.cd <= 0 && d < 25.5 && !p.dead && !clear) {
        // blocked by a car or a ledge: find a spot with a clear shot
        this.blockedT += dt;
        if (this.blockedT > 1.5 && !this.seek) { this.blockedT = 0; this.seek = this.findFiringSpot(1.42); this.st = 0; }
      }
      break;
    }
    case 'aim': {
      this.brake(dt);
      const dur = this.tele(0.75);
      // tracks you, then locks for the last 0.2 s: the laser turns white
      if (this.st < dur - 0.2) { this.trackAim(); this.turnToward(p.pos.x, p.pos.z, 12, dt); }
      if (this.st >= dur) {
        const a = this.aimDir, m = this.muzzle();
        Game.projectiles.push(new Bolt({ x: m.x + a.x * 0.36, y: m.y + a.y * 0.36, z: m.z + a.z * 0.36 }, a, 22.3 * S.enemies.speed, this.dmg()));
        Sound.play('enemyShoot', {}, m);
        FX.sparks(m, 5, a, 0.6, 5.5, 14.5, { c0: '#fff4d0', c1: '#ffb040', c2: '#a04010' });
        FX.light(m, '#ffb040', 3, 3, 0.1);
        this.vel.x = -fwdX(this.yaw) * 3.6; this.vel.z = -fwdZ(this.yaw) * 3.6;
        this.setState('cool');
      }
      break;
    }
    case 'cool':
      this.brake(dt, 54.5);
      if (this.st > 0.45) { this.setState('move'); this.cd = rand(1.4, 2.5); this.windMul = 1; }
      break;
  }
};
// the laser's state for views.js: 0 off, 1 tracking, 2 locked
Enemy.prototype.laser = function () {
  if (this.state !== 'aim') return 0;
  if (this.type === 'gunner') return this.st >= this.tele(0.75) - 0.2 ? 2 : 1;
  if (this.type === 'sniper') return this.st >= this.tele(1.1) - 0.25 ? 2 : 1;
  return 0;
};

// Keep grounded enemies from stacking: the 2D push, around in a circle instead of along a line.
function separateEnemies(dt) {
  const es = Game.enemies;
  for (let i = 0; i < es.length; i++) {
    const a = es[i];
    if (a.dead || a.spawning || a.flying || a.skipPhysics) continue;
    for (let j = i + 1; j < es.length; j++) {
      const b = es[j];
      if (b.dead || b.spawning || b.flying || b.skipPhysics) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz), minD = (a.r + b.r) * 0.84;
      if (d < minD && Math.abs(a.pos.y - b.pos.y) < 1.1) {
        const ux = d > 1e-4 ? dx / d : 1, uz = d > 1e-4 ? dz / d : 0, push = (minD - d) * 4 * dt;
        // the lighter one gives way more
        const ka = b.mass / (a.mass + b.mass), kb = 1 - ka;
        if (World.boxFree(a.pos.x - ux * push * 2 * ka, a.pos.y + 0.01, a.pos.z - uz * push * 2 * ka, a.r, a.h - 0.05)) { a.pos.x -= ux * push * 2 * ka; a.pos.z -= uz * push * 2 * ka; }
        if (World.boxFree(b.pos.x + ux * push * 2 * kb, b.pos.y + 0.01, b.pos.z + uz * push * 2 * kb, b.r, b.h - 0.05)) { b.pos.x += ux * push * 2 * kb; b.pos.z += uz * push * 2 * kb; }
      }
    }
  }
}

// o: { kv: knock velocity {x,y,z} m/s, dir: hit direction (for sparks), heavy, heavyAtk, cause, stagger, hitstop, shake, crit, guardBreak, noKnock }
function hurtEnemy(e, dmg, o = {}) {
  if (e.dead || e.spawning || e.dying) return 0;
  if (e.shielded && e.shielded(o)) { e.shieldHit(o); return 0; }
  // the rival's own parries and the phase change, and its evasive boosts
  if (e.intercept && e.intercept(o)) return 0;
  if (e.dodging && e.dodging()) {
    if (!e._missT || Game.time > e._missT) { e._missT = Game.time + 0.4; FX.sparks(e.center(), 5, null, TAU, 3.6, 9, { c0: '#ffffff', c1: '#7aa8ff', c2: '#1a3a8a' }); }
    return 0;
  }
  let d = dmg * (e.damageTakenMul ? e.damageTakenMul() : 1) * (Game.has('glass') ? 1.35 : 1);
  if (e.tethered) d *= 1.25;
  d = Math.max(1, Math.round(d));
  // the rival's first phase can't be skipped: its health stops at half until the limiters come off
  if (e.gateDamage) { d = e.gateDamage(d); if (d <= 0) return 0; }
  if (e.noteHurt) e.noteHurt(d);
  if (e.onHurt) e.onHurt(d, o);
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
  } else if (!steady && !o.noStagger) e.stagger(Math.max(o.stagger || 0.2, 0.12));
  const c = e.center();
  const dir = o.dir || { x: c.x - Game.player.pos.x, y: 0.3, z: c.z - Game.player.pos.z };
  FX.sparks(c, o.heavy ? 12 : 7, dir, 1.3, 5.5, 21.8);
  FX.oil(c, o.heavy ? 5 : 2, dir, 10.9);
  FX.text(String(d), { x: c.x, y: e.pos.y + e.h + 0.4, z: c.z }, { c: o.crit ? '#ffd070' : o.heavy || d >= 30 ? '#ff8a9a' : '#ffffff', scale: o.crit || d >= 60 ? 2 : 1 });
  FX.light(c, '#ff3048', 2.5, 4, 0.1);
  Sound.play('hit', { heavy: o.heavy || d >= 30 }, c);
  FPFX.impact(o.heavy || d >= 30);
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
  const cut = ['slash', 'heavy', 'iaido', 'saw', 'tether', 'plunge', 'chain', 'groundcut', 'beam', 'beamFull'].includes(o.cause);
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
  // drones and brutes go up: a blast ring, smoke and embers
  if (e.flying || e.heavy) {
    FX.ring(c, 0.3, 2 * big, 0.3, { c: '#ff7a2a', flat: false });
    FX.dust(c, 8 * big, { c: '#2a2026', smax: 5.5, life: 1.5, rise: 1.8 });
    FX.embers(c, 8 * big);
    Sound.play('explode', { big: e.heavy }, c);
    Game.shake(e.heavy ? 0.45 : 0.15);
    if (e.heavy) { Game.hitstop(0.08); FX.flash('#ff7a3a', 0.2); FX.decal('scorch', e.pos, { r: 1.5 }); }
  }
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
    if (this.kind === 'hp') { p.heal(15); FX.text('+15', { x: p.pos.x, y: p.pos.y + 2.5, z: p.pos.z }, { c: '#7dff8a' }); }
    Sound.play('pickup');
    FX.sparks(this.pos, 8, null, TAU, 3.6, 10.9, { c0: '#ffffff', c1: '#7dff8a', c2: '#1a7a3a' });
  }
}
