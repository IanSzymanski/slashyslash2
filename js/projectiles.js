'use strict';
// Projectiles, props and hazards, in metres: gunner bolts (a slash or a parry sends them back), the
// slide attack's rubble, pulse grenades (tether one and kick it home), red barrels (slash to light,
// tether to swing and throw) and the heavy slam's ground ring. Ports of the 2D enemies.js, rival.js and
// upgrades.js classes; render.js draws them.

const GRENADE_G = 54.5, GRENADIER_G = 38.2;
const GRIT = ['#4a4252', '#5c5464', '#3a3442', '#6e6678'];

// a point inside a standing body's hull (feet at pos, radius r, height h), grown by pad
function pointInBody(p, b, pad = 0) {
  const dx = p.x - b.pos.x, dz = p.z - b.pos.z, R = b.r + pad;
  return dx * dx + dz * dz < R * R && p.y > b.pos.y - pad && p.y < b.pos.y + b.h + pad;
}
// two standing bodies overlap
function bodiesTouch(a, b, pad = 0) {
  const R = a.r + b.r + pad;
  return (a.pos.x - b.pos.x) ** 2 + (a.pos.z - b.pos.z) ** 2 < R * R && a.pos.y < b.pos.y + b.h && b.pos.y < a.pos.y + a.h;
}
const unit = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };

// ---------- gunner bolt ----------
class Bolt {
  constructor(pos, dir, speed, dmg, col) {
    this.kind = 'bolt';
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.vel = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
    this.dmg = dmg; this.hostile = true; this.life = 3; this.dead = false;
    this.col = col || { outer: '#ff7a2a', core: '#fff0a0', light: '#ffb040' };
  }
  // sent back toward a point (where the crosshair is), at least as fast as it came
  reflect(to, mul, dmg) {
    const p = this.pos, d = unit(to.x - p.x, to.y - p.y, to.z - p.z);
    const sp = Math.max(27.3, Math.hypot(this.vel.x, this.vel.y, this.vel.z) * mul);
    this.vel = { x: d.x * sp, y: d.y * sp, z: d.z * sp };
    this.hostile = false; this.dmg = dmg; this.life = 2;
    FX.sparks(p, 10, d, 1, 7.3, 21.8, { c0: '#ffffff', c1: '#ff5a6a', c2: '#8a0c22' });
    FX.ring(p, 0.15, 0.9, 0.15, { flat: false });
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const v = this.vel, p = this.pos;
    for (let i = 0; i < 3; i++) {
      p.x += (v.x * dt) / 3; p.y += (v.y * dt) / 3; p.z += (v.z * dt) / 3;
      if (World.pointSolid(p.x, p.y, p.z)) {
        this.dead = true;
        const back = unit(-v.x, -v.y, -v.z);
        FX.sparks(p, 6, back, 1.4, 3.6, 12.7, this.hostile ? { c0: '#fff4d0', c1: '#ffb040', c2: '#a04010' } : {});
        return;
      }
      if (this.hostile) {
        const P = Game.player;
        if (!P.dead && pointInBody(p, P, 0.18)) {
          const r = P.takeHit({ dmg: this.dmg, from: { x: p.x - v.x * 0.05, y: p.y, z: p.z - v.z * 0.05 }, kind: 'projectile', proj: this, knock: 10.9 });
          if (r === 'hit' || r === 'immune') { this.dead = true; FX.sparks(p, 8, unit(-v.x, -v.y, -v.z), 1.4, 3.6, 14.5); return; }
          if (r === 'parried') return;
        }
      } else {
        for (const e of Game.enemies) {
          if (e.dead || e.spawning || !pointInBody(p, e, 0.18)) continue;
          const d = unit(v.x, v.y, v.z);
          hurtEnemy(e, this.dmg, { kv: { x: v.x * 0.3, y: 7.3, z: v.z * 0.3 }, dir: d, heavy: true, cause: 'reflect', stagger: 0.5, hitstop: 0.03 });
          this.dead = true;
          return;
        }
      }
    }
  }
}

// ---------- rubble from the slide attack ----------
class Rock {
  constructor(pos, vel, dmg) {
    this.kind = 'rock';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.vel = { x: vel.x, y: vel.y, z: vel.z };
    this.dmg = dmg; this.hostile = false; this.dead = false; this.life = 1.2;
    this.size = Math.random() < 0.4 ? 0.27 : 0.18;
    this.color = pick(['#5c5464', '#6e6678', '#4a4252', '#7a6a5a']);
    this.spin = { x: rand(-12, 12), y: rand(-12, 12), z: rand(-12, 12) };
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = this.pos, v = this.vel;
    v.y -= 56.4 * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (World.pointSolid(p.x, p.y, p.z)) {
      this.dead = true;
      FX.dust({ x: p.x, y: World.groundAt(p.x, p.z, p.y + 0.5), z: p.z }, 1, { smax: 1.8, c: '#6a5a5a' });
      return;
    }
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || !pointInBody(p, e, 0.09)) continue;
      hurtEnemy(e, this.dmg, { kv: { x: v.x * 0.4, y: 7.3, z: v.z * 0.4 }, dir: unit(v.x, v.y, v.z), cause: 'rock', stagger: 0.3, hitstop: 0.01 });
      FX.debris(p, 3, [this.color], 7.3);
      this.dead = true;
      return;
    }
  }
}

// ---------- pulse grenade ----------
// Thrown on an arc with its blast zone marked where it will land. Tether it in flight and time slows:
// reel in and kick it back toward the crosshair, and it curves onto whoever threw it.
// o: { g, R, dmg, disable (seconds the blast knocks your shield out), size } for smaller throwers
class PulseGrenade {
  constructor(pos, vel, owner, o = {}) {
    this.kind = 'grenade';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.vel = { x: vel.x, y: vel.y, z: vel.z }; this.owner = owner;
    this.fuse = 4; this.t = 0; this.state = 'flying';
    this.hostile = true; this.rebound = true; this.grabR = 1.0; this.tethered = false; this.dead = false;
    this.indicator = true; this.R = o.R || 5.1; this.impact = null; this.predT = 0;
    this.g = o.g || GRENADE_G; this.dmg = o.dmg || 14; this.disable = o.disable !== undefined ? o.disable : 6; this.size = o.size || 1;
  }
  center() { return this.pos; }
  get tetherable() { return this.state === 'flying' && !this.dead; }
  catch() { this.state = 'caught'; this.hostile = false; this.impact = null; }
  kick(dir) {
    this.state = 'kicked'; this.hostile = false;
    this.vel = { x: dir.x * 54.5, y: dir.y * 54.5, z: dir.z * 54.5 };
    this.fuse = Math.max(this.fuse, 2);
  }
  // a parry blocks it; a slash sets it off
  reflect() { this.explode({ blocked: true }); }
  onSlash() { this.explode(); }
  update(dt) {
    this.t += dt;
    if (this.state !== 'caught') this.fuse -= dt;
    if (this.fuse <= 0) { this.explode(); return; }
    const p = this.pos, v = this.vel;
    if (this.state === 'caught') {
      if (this.tethered) {
        // hangs in the air while you reel in
        const k = Math.max(0, 1 - 5 * dt);
        v.x *= k; v.y *= k; v.z *= k;
        p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
        if (Math.random() < 0.6) FX.elec(p, 0.8, 1, { outer: '#ffb040', core: '#ffffff' });
        return;
      }
      this.state = 'flying'; this.hostile = true;
    }
    const owner = this.owner, kicked = this.state === 'kicked';
    if (kicked && owner && !owner.dead && !owner.dying) {
      // light homing, so a rough kick still finds its thrower
      const c = owner.center(), sp = Math.hypot(v.x, v.y, v.z) || 1;
      const w = unit(c.x - p.x, c.y - p.y, c.z - p.z), cur = { x: v.x / sp, y: v.y / sp, z: v.z / sp };
      const ang = Math.acos(clamp(w.x * cur.x + w.y * cur.y + w.z * cur.z, -1, 1));
      if (ang < 1.0 && ang > 1e-4) {
        const k = Math.min(1, (2.2 * dt) / ang), n = unit(lerp(cur.x, w.x, k), lerp(cur.y, w.y, k), lerp(cur.z, w.z, k));
        v.x = n.x * sp; v.y = n.y * sp; v.z = n.z * sp;
      }
    }
    v.y -= (kicked ? 10.9 : this.g) * dt;
    for (let i = 0; i < 3; i++) {
      p.x += (v.x * dt) / 3; p.y += (v.y * dt) / 3; p.z += (v.z * dt) / 3;
      if (this.contact()) return;
    }
    if (this.hostile && (this.predT -= dt) <= 0) { this.predT = 0.05; this.impact = this.predict(); }
    if (Math.random() < 0.6) FX.sparks(p, 1, null, TAU, 1.8, 5.5, kicked ? { c0: '#ffffff', c1: '#ffd070', c2: '#ff3a52', g: 0 } : { c0: '#ffffff', c1: '#4af0ff', c2: '#145e6a', g: 0 });
  }
  // Explodes on terrain, barrels, the player (while hostile) or any enemy (once kicked back).
  contact() {
    const p = this.pos;
    if (World.pointSolid(p.x, p.y, p.z)) { this.explode(); return true; }
    const P = Game.player;
    if (this.hostile) {
      if (!P.dead && pointInBody(p, P, 0.36 * this.size)) {
        if (P.parryActive()) P.doParry({ from: { x: p.x, y: p.y, z: p.z }, proj: this });
        else this.explode();
        return true;
      }
    } else {
      for (const e of Game.enemies) if (!e.dead && !e.spawning && pointInBody(p, e, 0.55)) { this.explode(); return true; }
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && pointInBody(p, pr, 0.36)) { this.explode(); return true; }
    return false;
  }
  // where it will land, for the blast zone marker
  predict() {
    let x = this.pos.x, y = this.pos.y, z = this.pos.z, vy = this.vel.y;
    for (let i = 0; i < 120; i++) {
      vy -= this.g / 60; x += this.vel.x / 60; y += vy / 60; z += this.vel.z / 60;
      if (World.pointSolid(x, y, z)) {
        const g = World.groundAt(x, z, y + 0.6);
        return { x, y: g > y - 0.6 ? g : y, z };
      }
    }
    return null;
  }
  explode(o = {}) {
    if (this.dead) return;
    this.dead = true;
    const R = this.R, P = Game.player, owner = this.owner, c = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    if (!o.blocked) Props.blast(c, R * 0.8);
    if (o.blocked) {
      FX.ring(c, 0.3, 2.7, 0.3, { c: '#ffd070', flat: false });
      FX.sparks(c, 20, null, TAU, 5.5, 20, { c0: '#ffffff', c1: '#ffe080', c2: '#145e6a' });
      Sound.play('blocked', {}, c);
      Game.shake(0.2);
      return;
    }
    const friendly = this.state === 'kicked';
    if (friendly) {
      if (owner && !owner.dead && owner.pulseHit && dist3(c, owner.center()) < R + 0.55) owner.pulseHit();
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || e === owner) continue;
        const ec = e.center(), d = dist3(c, ec);
        if (d >= R + e.r) continue;
        const u = unit(ec.x - c.x, 0, ec.z - c.z);
        hurtEnemy(e, 50, { kv: { x: u.x * 23.6, y: 20, z: u.z * 23.6 }, dir: { x: u.x, y: 0.6, z: u.z }, heavy: true, cause: 'barrel' });
      }
    } else if (!P.dead && dist3(c, P.center()) < R) {
      const r = P.takeHit({ dmg: this.dmg * (owner ? owner.dmgMul : 1), from: c, kind: 'explosion', knock: 21.8 });
      if (r === 'hit' && this.disable > 0) P.disableShield(this.disable);
    }
    for (const pr of Game.props) {
      if (pr.dead || !pr.grabR || dist3(c, pr.center()) >= R) continue;
      const u = unit(pr.pos.x - c.x, 0, pr.pos.z - c.z);
      pr.hit(30, { heavy: true, kv: { x: u.x * 18.2, y: 18.2, z: u.z * 18.2 } });
    }
    const c1 = friendly ? '#ffd070' : '#2ab8d8', gy = World.groundAt(c.x, c.z, c.y + 0.3);
    for (const [r1, d] of [[R, 0.45], [R * 0.7, 0.35], [R * 0.4, 0.25]]) FX.ring(c, 0.3, r1, d, { c: c1, flat: false });
    if (c.y - gy < R) FX.ring({ x: c.x, y: gy + 0.05, z: c.z }, 0.3, R, 0.4, { c: c1 });
    for (let i = 0; i < 8; i++) {
      const d = coneDir(null, TAU), L = R * 0.8;
      FX.bolt(c, { x: c.x + d.x * L, y: c.y + d.y * L * 0.6, z: c.z + d.z * L }, 0.2, { outer: c1, core: '#ffffff', jag: 0.45, w: 0.08 });
    }
    FX.sparks(c, 30, null, TAU, 7.3, 27.3, { c0: '#ffffff', c1: friendly ? '#ffe080' : '#7af0ff', c2: '#145e6a' });
    FX.light(c, friendly ? '#ffd070' : '#4af0ff', 6, 12.7, 0.4);
    FX.flash('#bff8ff', 0.25);
    Sound.play('pulse', {}, c);
    Game.shake(0.45);
    Game.hitstop(0.04);
  }
}

// ---------- red barrel ----------
// A slash lights its fuse (a heavy hit sets it off almost at once); the tether swings it on the line
// and throws it at the crosshair, where it bursts on the first enemy it meets.
class Barrel {
  constructor(pos) {
    this.kind = 'barrel';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.prev = { x: pos.x, y: pos.y, z: pos.z }; this.vel = { x: 0, y: 0, z: 0 };
    this.r = 0.45; this.h = 1.27; this.grabR = 0.82;
    this.fuse = -1; this.dead = false; this.thrown = 0; this.tethered = false; this.isEnemy = false; this.heavy = false;
    this.onGround = false; this.towed = false; this.col = null; this.yaw = rand(0, TAU); this.spin = 0;
    // its round collider: bodies slide round it, can stand on it, and shove it when they run into it
    this.q = { x: pos.x, z: pos.z, r: 0.42, y0: pos.y, y1: pos.y + this.h, on: true, top: true, owner: this };
  }
  bump(b, vn, ux, uz) {
    if (vn < 2 || this.towed) return;
    const k = Math.min(vn, 12) * 0.55;
    this.vel.x -= ux * k; this.vel.z -= uz * k; this.vel.y = Math.max(this.vel.y, 1.5); this.spin = 6;
    if (vn > 5) Sound.play('barrelHit', {}, this.center());
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h / 2, z: this.pos.z }; }
  hit(dmg, o = {}) {
    if (this.dead) return;
    if (o.kv) { this.vel.x += o.kv.x * 0.5; this.vel.z += o.kv.z * 0.5; this.vel.y = Math.max(this.vel.y, o.kv.y * 0.5); }
    if (this.fuse < 0) { this.fuse = o.heavy ? 0.12 : 0.38; Sound.play('barrelHit', {}, this.center()); }
    FX.sparks(this.center(), 5, null, TAU, 3.6, 12.7);
  }
  grab() { this.towed = true; this.onGround = false; }
  // swings on the line a couple of metres from the hand
  towTo(hand, dt, p) {
    const c = this.center(), dx = c.x - hand.x, dy = c.y - hand.y, dz = c.z - hand.z, d = Math.hypot(dx, dy, dz) || 1;
    const L = Math.min(d, 2.4), tx = hand.x + (dx / d) * L, ty = hand.y + (dy / d) * L + 0.55, tz = hand.z + (dz / d) * L;
    this.vel.x = (tx - c.x) * 14 + p.vel.x * 0.5; this.vel.y = (ty - c.y) * 14 + p.vel.y * 0.5; this.vel.z = (tz - c.z) * 14 + p.vel.z * 0.5;
    this.spin = 6;
  }
  throwAt(dir) {
    this.towed = false;
    this.vel = { x: dir.x * 36.4, y: dir.y * 36.4 + 5.5, z: dir.z * 36.4 };
    this.thrown = 1.4; this.onGround = false; this.spin = 14;
    if (this.fuse < 0) this.fuse = 1.3;
  }
  update(dt) {
    if (this.dead) return;
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.yaw += this.spin * dt;
    this.spin = approach(this.spin, 0, (this.onGround ? 30 : 2) * dt);
    if (this.towed && !this.tethered) this.towed = false;
    if (!this.towed) {
      this.vel.y = Math.max(this.vel.y - 81.8 * dt, -47.3);
      if (this.onGround) { const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 45.5 * dt); this.vel.x = nx; this.vel.z = nz; }
    }
    World.moveBody(this, dt);
    const B = Arena.bounds();
    this.pos.x = clamp(this.pos.x, B.minX + 1, B.maxX - 1); this.pos.z = clamp(this.pos.z, B.minZ + 1, B.maxZ - 1);
    if (this.pos.y < -20) { this.dead = true; return; }
    const Q = this.q;
    Q.x = this.pos.x; Q.z = this.pos.z; Q.y0 = this.pos.y; Q.y1 = this.pos.y + this.h; Q.on = !this.towed && this.thrown <= 0;
    if (this.thrown > 0) {
      this.thrown -= dt;
      if (Math.hypot(this.vel.x, this.vel.y, this.vel.z) > 10.9) {
        for (const e of Game.enemies) if (!e.dead && !e.spawning && bodiesTouch(this, e, 0.1)) { this.explode(); return; }
      }
    }
    if (this.fuse >= 0) {
      this.fuse -= dt;
      if (Math.random() < 0.4) FX.sparks({ x: this.pos.x, y: this.pos.y + this.h + 0.1, z: this.pos.z }, 1, { x: 0, y: 1, z: 0 }, 1, 1.8, 5.5, { c0: '#fff4d0', c1: '#ffb040', c2: '#a04010' });
      if (this.fuse <= 0) this.explode();
    }
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    const c = this.center(), R = 5.3;
    Props.blast(c, R * 0.8);
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ec = e.center(), d = dist3(c, ec);
      if (d >= R + e.r) continue;
      const u = unit(ec.x - c.x, 0, ec.z - c.z);
      hurtEnemy(e, 70 * (1 - (d / (R + e.r)) * 0.5), { kv: { x: u.x * 29, y: 27.3, z: u.z * 29 }, dir: { x: u.x, y: 0.6, z: u.z }, heavy: true, cause: 'barrel', stagger: 1 });
    }
    for (const pr of Game.props) {
      if (pr === this || pr.dead || dist3(c, pr.center()) >= R) continue;
      const u = unit(pr.pos.x - c.x, 0, pr.pos.z - c.z);
      pr.hit(10, { heavy: true, kv: { x: u.x * 18.2, y: 18.2, z: u.z * 18.2 } });
    }
    const P = Game.player, pc = P.center(), pd = dist3(c, pc);
    if (pd < R * 0.8 && !P.dead && !P.ult) {
      const u = unit(pc.x - c.x, 0, pc.z - c.z);
      P.vel.x += u.x * 18.2; P.vel.z += u.z * 18.2; P.vel.y = Math.max(P.vel.y, 14.5); P.onGround = false;
    }
    FX.ring({ x: c.x, y: this.pos.y + 0.05, z: c.z }, 0.4, R, 0.35, { c: '#ff7a2a' });
    FX.ring(c, 0.4, R * 0.8, 0.3, { c: '#ffe080', flat: false });
    FX.sparks(c, 30, null, TAU, 7.3, 27.3, { c0: '#ffffff', c1: '#ffb040', c2: '#a03010' });
    FX.dust(c, 16, { c: '#2a2026', smax: 8.2, life: 1.6, rise: 2.3 });
    FX.embers(c, 14);
    FX.debris(c, 12, ['#8a1a1a', '#c8a040', '#3a1a1a'], 20);
    FX.decal('scorch', this.pos, { r: 1.6 });
    FX.light(c, '#ff8a3a', 7, 12.7, 0.4);
    FX.flash('#ff8a3a', 0.25);
    Sound.play('explode', { big: true }, c);
    Game.shake(0.5);
    Game.hitstop(0.05);
  }
}

// ---------- the heavy slam's ground ring ----------
// The 2D slam sends a wave each way along the street; in 3D it's one ring running out over the ground,
// hitting each enemy on that level once, unless a wall stands between.
class SlamRing {
  constructor(pos, o = {}) {
    this.kind = 'slamring';
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.speed = o.speed || 27.3; this.dur = o.dur || 0.6; this.dmg = o.dmg || 16; this.cause = o.cause || 'heavy';
    this.t = 0; this.dead = false; this.hit = new Set();
    FX.ring({ x: pos.x, y: pos.y + 0.06, z: pos.z }, 0.3, this.speed * this.dur, this.dur, { c: o.c || '#ff3048', ease: false });
  }
  update(dt) {
    this.t += dt;
    if (this.t > this.dur) { this.dead = true; return; }
    const r = this.speed * this.t, c = this.pos;
    for (let i = 0; i < 2; i++) {
      const a = rand(0, TAU), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(World.groundAt(x, z, c.y + 0.5) - c.y) < 0.1) FX.dust({ x, y: c.y, z }, 1, { smax: 2.7, rise: 2.7, c: '#6a5a5a' });
    }
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || this.hit.has(e) || Math.abs(e.pos.y - c.y) > 0.8) continue;
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
      if (d - e.r > r) continue;
      const u = d > 1e-3 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
      if (d > 0.5 && World.raycast({ x: c.x, y: c.y + 0.5, z: c.z }, { x: u.x, y: 0, z: u.z }, d)) continue;
      this.hit.add(e);
      hurtEnemy(e, this.dmg, { kv: { x: u.x * 12.7, y: 20, z: u.z * 12.7 }, dir: { x: u.x, y: 1, z: u.z }, cause: this.cause, heavyAtk: this.cause === 'heavy', stagger: 0.5, hitstop: 0.01 });
    }
  }
}

// ---------- the brute's ground wave ----------
// The 2D slam sends a shockwave each way along the street. In 3D it's a ring running out over the ground
// that hits you once if your feet are down as it passes: jump it, dash through it or parry it. Walls stop it.
class GroundWave {
  constructor(pos, speed, dmg, owner) {
    this.kind = 'wave';
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.speed = speed; this.dmg = dmg; this.owner = owner;
    this.t = 0; this.dur = 0.8; this.dead = false; this.hit = false;
  }
  radius() { return 0.6 + this.speed * this.t; }
  update(dt) {
    this.t += dt;
    if (this.t > this.dur) { this.dead = true; return; }
    const c = this.pos, r = this.radius();
    for (let i = 0; i < 3; i++) {
      const a = rand(0, TAU), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (Math.abs(World.groundAt(x, z, c.y + 0.5) - c.y) < 0.1) {
        FX.dust({ x, y: c.y, z }, 1, { smax: 2.7, rise: 2.7, c: '#6a5a5a' });
        if (Math.random() < 0.4) FX.debris({ x, y: c.y + 0.1, z }, 1, ['#4a4252', '#5c5464'], 10.9);
      }
    }
    const P = Game.player;
    if (this.hit || P.dead) return;
    const dx = P.pos.x - c.x, dz = P.pos.z - c.z, d = Math.hypot(dx, dz);
    if (Math.abs(d - r) > 0.73 + P.r || P.pos.y > c.y + 0.64 || P.pos.y < c.y - 0.4) return;
    const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
    if (d > 0.6 && World.raycast({ x: c.x, y: c.y + 0.4, z: c.z }, { x: ux, y: 0, z: uz }, d)) return;
    const from = { x: c.x + ux * (r - 1), y: c.y + 0.4, z: c.z + uz * (r - 1) };
    const res = P.takeHit({ dmg: this.dmg, from, kind: 'shockwave', source: this.owner && !this.owner.dead ? this.owner : null, knock: 18.2 });
    if (res !== 'ignored') this.hit = true;
  }
}
