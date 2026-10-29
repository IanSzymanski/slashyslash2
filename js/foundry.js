'use strict';
// The Foundry's working parts (foundrymap.js lays the hall out), and the portal between the regions.
//   The molten river burns whatever goes into it and throws it back out onto a bank: you, an enemy you knock
//   in (a lot of damage), a crucible (it bursts). Enemies won't walk into it; they cross by the bridges.
//   Conveyors carry whatever stands on them. Crucibles of slag stand where the crossroads has red barrels and
//   work the same way (slash to light, tether to throw), but burst into a pool of molten slag that burns
//   whatever stands in it. Ladles of molten metal hang from the gantry cranes: hit one (a jumping slash
//   reaches it, so does a blast under it) or yank it on the tether, and it tips and pours, burning whatever
//   is under the pour and leaving a pool; it hangs empty until the next wave fills it again.
//   Embers rise off the river all over the hall.
// Endless travels between the regions: when a region's boss falls, a portal opens to the other one, and
// stepping into it takes the run there (Director, waves.js).

// the river: damage to you and to an enemy, how hard it throws a body up and out
const LAVA = { DMG: 14, EDMG: 42, UP: 15, OUT: 9 };
// a ladle's pour: how long it pours, its reach round the stream, damage to an enemy and to you, the pool it
// leaves (radius, seconds); a crucible's pool
const POUR = { DUR: 2.4, R: 1.6, EDMG: 48, DMG: 18, POOL: 3.6, LIFE: 6 };
// a slag pool's burn: to an enemy and to you, and how often
const SLAG = { EDMG: 9, DMG: 6, EVERY: 0.5, PEVERY: 0.8 };
const FOUNDRY_NAMES = ['SLAG HEAP', 'FURNACE FLOOR', 'MOLTEN RUN', 'IRON TIDE', 'CRUCIBLE', 'HOT METAL', 'ASH FALL', 'FORGE LINE'];
const MOLTEN = { c0: '#fff0c0', c1: '#ff7a1a', c2: '#6a1404' };
const SLAG_COLS = ['#3a3034', '#5a3a2a', '#ff7a1a', '#2a2226'];

// a crucible: a squat iron pot banded and handled, molten slag glowing in its mouth
MODELS.crucible = {
  bones: [['root', null, 0, 0, 0]],
  parts: [
    { bone: 'root', shape: 'hex', size: [0.98, 0.86, 0.98], at: [0, 0.43, 0], color: '#3a3234', taper: 0.86 },
    { bone: 'root', shape: 'hex', size: [1.04, 0.08, 1.04], at: [0, 0.3, 0], color: '#221e20' },
    { bone: 'root', shape: 'hex', size: [1.06, 0.1, 1.06], at: [0, 0.86, 0], color: '#4a4044' },
    { bone: 'root', shape: 'hex', size: [0.82, 0.05, 0.82], at: [0, 0.92, 0], color: '#ff7a1a', glow: true, plain: true, tag: 'melt' },
    { bone: 'root', size: [0.12, 0.2, 0.34], at: [-0.56, 0.72, 0], color: '#2a2426' },
    { bone: 'root', size: [0.12, 0.2, 0.34], at: [0.56, 0.72, 0], color: '#2a2426' },
    { bone: 'root', size: [0.3, 0.12, 0.08], at: [0, 0.6, -0.5], color: '#e8a030', plain: true },
  ],
};
// a ladle: a great iron pot on trunnions, swinging in a bail that hangs from the crane's hook; the pot bone
// tips about the trunnions toward +z, where its spout is
MODELS.ladle = {
  bones: [['bail', null, 0, 0, 0], ['pot', 'bail', 0, 1.6, 0]],
  parts: [
    { bone: 'pot', shape: 'hex', size: [2.5, 2.1, 2.5], at: [0, -0.55, 0], color: '#3a3438', taper: 0.84 },
    { bone: 'pot', shape: 'hex', size: [2.62, 0.18, 2.62], at: [0, -0.9, 0], color: '#26222a' },
    { bone: 'pot', shape: 'hex', size: [2.72, 0.22, 2.72], at: [0, 0.42, 0], color: '#4a4248' },
    { bone: 'pot', shape: 'hex', size: [2.2, 0.06, 2.2], at: [0, 0.5, 0], color: '#ff7a1a', glow: true, plain: true, tag: 'melt' },
    { bone: 'pot', size: [0.6, 0.24, 0.6], at: [0, 0.4, 1.4], color: '#4a4248' },
    { bone: 'pot', size: [0.34, 0.34, 0.34], at: [-1.38, 0, 0], color: '#22201e' },
    { bone: 'pot', size: [0.34, 0.34, 0.34], at: [1.38, 0, 0], color: '#22201e' },
    { bone: 'pot', size: [0.5, 0.12, 0.2], at: [0, -0.2, -1.3], color: '#e8a030', plain: true },
    { bone: 'bail', size: [0.2, 2.1, 0.28], at: [-1.5, 2.65, 0], color: '#2e2a2c' },
    { bone: 'bail', size: [0.2, 2.1, 0.28], at: [1.5, 2.65, 0], color: '#2e2a2c' },
    { bone: 'bail', size: [3.2, 0.28, 0.32], at: [0, 3.65, 0], color: '#2e2a2c' },
    { bone: 'bail', size: [0.44, 0.5, 0.22], at: [0, 3.95, 0], color: '#c8a020' },
  ],
};

const Foundry = {
  on() { return !!(World.def && World.def.lava); },
  // whether the way from a to b crosses molten metal (enemies take the bridges instead)
  crosses(a, b) {
    const L = World.def && World.def.lava;
    if (!L) return false;
    for (const R of L) if (segRect(a.x, a.z, b.x, b.z, 0.5, R.min.x, R.min.z, R.max.x - R.min.x, R.max.z - R.min.z)) return true;
    return false;
  },
  // the molten river under (x, z), or null
  lavaAt(x, z) {
    for (const R of (World.def && World.def.lava) || []) if (x > R.min.x && x < R.max.x && z > R.min.z && z < R.max.z) return R;
    return null;
  },
  update(dt) {
    const D = World.def;
    if (!D || !D.lava) return;
    const P = Game.player;
    // the river burns what's in it and throws it out onto the nearer bank
    if (!P.dead) { const R = this.lavaAt(P.pos.x, P.pos.z); if (R && P.pos.y < R.y + 0.45) this.burn(P, R); }
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.flying || e.dying) continue;
      const R = this.lavaAt(e.pos.x, e.pos.z);
      if (R && e.pos.y < R.y + 0.45) this.burn(e, R);
    }
    for (const pr of Game.props) {
      if (pr.dead || pr.kind !== 'barrel' || pr.towed) continue;
      const R = this.lavaAt(pr.pos.x, pr.pos.z);
      if (R && pr.pos.y < R.y + 0.45) pr.explode();
    }
    // conveyors carry what stands on them
    for (const C of D.conveyors || []) {
      const b = C.box, sx = C.dir.x * C.speed * dt, sz = C.dir.z * C.speed * dt;
      const carry = (o) => {
        if (!o.onGround || Math.abs(o.pos.y - b.max.y) > 0.06 || o.pos.x < b.min.x || o.pos.x > b.max.x || o.pos.z < b.min.z || o.pos.z > b.max.z) return;
        const nx = o.pos.x + sx, nz = o.pos.z + sz;
        if (World.boxFree(nx, o.pos.y + 0.02, nz, o.r * 0.9, (o.h || 1.8) - 0.05)) { o.pos.x = nx; o.pos.z = nz; }
      };
      if (!P.dead) carry(P);
      for (const e of Game.enemies) if (!e.dead && !e.flying) carry(e);
      for (const pr of Game.props) if (!pr.dead && pr.kind === 'barrel') carry(pr);
    }
    // embers and spatters off the river near you
    for (const R of D.lava) {
      if (Math.random() < 0.5) {
        const x = clamp(P.pos.x + rand(-26, 26), R.min.x + 0.3, R.max.x - 0.3), z = rand(R.min.z + 0.3, R.max.z - 0.3);
        if (Math.random() < 0.7) FX.embers({ x, y: R.surface, z }, 1);
        else FX.sparks({ x, y: R.surface + 0.05, z }, 3, { x: 0, y: 1, z: 0 }, 0.6, 2, 6, Object.assign({ life: 0.8 }, MOLTEN));
      }
    }
    for (const Q of D.pours || []) if (Math.random() < 0.6) FX.sparks({ x: Q.b[0] + rand(-0.4, 0.4), y: Q.b[1] + 0.1, z: Q.b[2] + rand(-0.4, 0.4) }, 2, { x: 0, y: 1, z: 0 }, 1, 2, 7, Object.assign({ life: 0.8 }, MOLTEN));
  },
  // in the river: burned (not KRAG, who's made of the stuff) and thrown up onto the nearer bank
  burn(o, R) {
    if (o._lavaT > Game.time) return;
    o._lavaT = Game.time + 0.5;
    const mid = (R.min.z + R.max.z) / 2, side = o.pos.z < mid ? -1 : 1, P = Game.player;
    if (o === P) {
      P.takeHit({ dmg: LAVA.DMG, from: { x: o.pos.x, y: o.pos.y - 1, z: o.pos.z - side }, kind: 'hazard', source: null, knock: 0, unparryable: true, through: true });
      if (!P.dead) { P.vel.y = LAVA.UP; P.vel.z = side * LAVA.OUT; P.vel.x *= 0.3; P.onGround = false; }
    } else if (o.type === 'krag') {
      o.vel.y = LAVA.UP; o.vel.z = side * LAVA.OUT; o.onGround = false;
    } else {
      hurtEnemy(o, LAVA.EDMG, { kv: { x: 0, y: LAVA.UP, z: side * LAVA.OUT }, dir: { x: 0, y: 1, z: side }, heavy: true, cause: 'lava', stagger: 0.6 });
      if (!o.dead) { o.vel.y = LAVA.UP; o.vel.z = side * LAVA.OUT; o.onGround = false; }
    }
    const at = { x: o.pos.x, y: R.surface + 0.2, z: o.pos.z };
    FX.sparks(at, 22, { x: 0, y: 1, z: 0 }, 0.9, 5, 16, Object.assign({ life: 1 }, MOLTEN));
    FX.embers(at, 10);
    FX.dust(at, 4, { c: '#3a3036', smax: 2, rise: 3, life: 1.2 });
    FX.light(at, '#ff8a2a', 4, 6, 0.3);
    Sound.play('lavaBurn', {}, at);
  },
  // the hall's own props each wave: ladles full again on their hooks
  resetProps() {
    const D = World.def;
    if (!D || !D.ladles) return;
    for (const L of D.ladles) {
      let la = Game.props.find((p) => p.kind === 'ladle' && p.spot === L);
      if (!la) { la = new Ladle(L); Game.props.push(la); }
      la.refill();
    }
  },

  // ---------- travelling between the regions ----------
  // A portal opens at the arena's portal spot, leading to `to`.
  openPortal(to) {
    const at = World.def.portalAt || World.def.playerStart, y = World.groundAt(at.x, at.z, at.y + 1);
    const pt = new Portal({ x: at.x, y: y > -Infinity ? y : at.y, z: at.z }, to);
    Game.hazards.push(pt);
    return pt;
  },
  // Through the portal: the run goes on in the other region (score, wave, upgrades, health, shield and the
  // ultimate's charge all carry over); everything else is left behind.
  travel(to) {
    const P = Game.player;
    if (P.tether) P.releaseTether();
    P.stopAllLoops();
    FX.clear();
    Game.enemies = []; Game.projectiles = []; Game.hazards = []; Game.pickups = []; Game.cuts = []; Game.props = [];
    Game.endBulletTime();
    Arena.setBlackout(false);
    Arena.load(to);
    const s = World.def.arrival || World.def.playerStart, np = makePlayer(SaveData.character, s);
    np.hp = P.hp; np.shield = P.shield; if ('ultCharge' in P) np.ultCharge = P.ultCharge;
    Game.player = np;
    Camera.yaw = s.yaw || 0; Camera.snap(np);
    Game.resetProps(true);
    // the way you came in, closing behind you
    const back = new Portal({ x: s.x, y: s.y, z: s.z + 1.6 }, null);
    back.exit = true;
    Game.hazards.push(back);
    FX.flash('#ffd0a0', 0.9);
    Game.shake(0.4);
    Game.announcements = [];
    Sound.play('portalEnter');
    Game.announce(World.def.name.toUpperCase(), to === 'foundry' ? 'KRAG WAITS IN THE FORGE' : 'BACK TO THE STREETS', to === 'foundry' ? '#ff9a5a' : '#4af0ff', 2.6);
  },
};

// A crucible of slag: the red barrel's place in the Foundry. It lights, throws and bursts the same way, but
// bursts into a pool of molten slag that burns what stands in it.
class Crucible extends Barrel {
  constructor(pos) {
    super(pos);
    this.model = 'crucible'; this.r = 0.5; this.h = 1.05;
    this.q.r = 0.46; this.q.y1 = pos.y + this.h;
  }
  explode() {
    if (this.dead) return;
    this.dead = true;
    const c = this.center(), R = 4.4;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ec = e.center(), d = dist3(c, ec);
      if (d >= R + e.r) continue;
      const u = unit(ec.x - c.x, 0, ec.z - c.z);
      hurtEnemy(e, 55 * (1 - (d / (R + e.r)) * 0.5), { kv: { x: u.x * 24, y: 22, z: u.z * 24 }, dir: { x: u.x, y: 0.6, z: u.z }, heavy: true, cause: 'barrel', stagger: 1 });
    }
    for (const pr of Game.props) {
      if (pr === this || pr.dead || dist3(c, pr.center()) >= R + 1) continue;
      const u = unit(pr.pos.x - c.x, 0, pr.pos.z - c.z);
      pr.hit(10, { heavy: true, kv: { x: u.x * 16, y: 16, z: u.z * 16 } });
    }
    const P = Game.player, pc = P.center(), pd = dist3(c, pc);
    if (pd < R * 0.8 && !P.dead && !P.ult) {
      const u = unit(pc.x - c.x, 0, pc.z - c.z);
      P.vel.x += u.x * 16; P.vel.z += u.z * 16; P.vel.y = Math.max(P.vel.y, 13); P.onGround = false;
    }
    // the slag spreads where it stood
    const gy = World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    if (gy > -Infinity && !Foundry.lavaAt(this.pos.x, this.pos.z)) Game.hazards.push(new SlagPool({ x: this.pos.x, y: gy, z: this.pos.z }, 3.2, 4.5));
    FX.ring({ x: c.x, y: this.pos.y + 0.05, z: c.z }, 0.4, R, 0.35, { c: '#ff7a2a' });
    FX.ring(c, 0.4, R * 0.8, 0.3, { c: '#ffd070', flat: false });
    FX.sparks(c, 40, { x: 0, y: 1, z: 0 }, 1.6, 6, 22, MOLTEN);
    FX.dust(c, 12, { c: '#2a2026', smax: 6, life: 1.4, rise: 2.4 });
    FX.embers(c, 18);
    FX.debris(c, 14, SLAG_COLS, 16);
    if (typeof KragViews !== 'undefined') KragViews.fireball(c, 2.6, 0.4);
    FX.light(c, '#ff8a3a', 7, 12, 0.4);
    FX.flash('#ff8a3a', 0.2);
    Sound.play('crucibleBurst', {}, c);
    Game.shake(0.45);
    Game.hitstop(0.04);
  }
}

// A ladle of molten metal hanging from a gantry crane by its bail. Hit it, or yank it on the tether, and it
// tips toward the side the blow came from and pours; then it hangs empty until refilled.
class Ladle {
  constructor(L) {
    this.kind = 'ladle'; this.spot = L; this.model = 'ladle';
    this.pos = { x: L.x, y: L.y, z: L.z }; this.r = 1.3; this.h = 2.3; this.grabR = 1.6;
    this.dead = false; this.tethered = false; this.state = 'full'; this.t = 0; this.tilt = 0; this.dir = { x: 0, z: 1 }; this.yank = null; this.pour = null;
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h / 2, z: this.pos.z }; }
  refill() { this.state = 'full'; this.t = 0; this.tilt = 0; this.pour = null; }
  // the blow's direction, or from you to it
  hit(dmg, o = {}) {
    const P = Game.player, kv = o.kv && Math.hypot(o.kv.x, o.kv.z) > 0.5 ? o.kv : { x: this.pos.x - P.pos.x, z: this.pos.z - P.pos.z };
    this.tip(kv);
  }
  grab(p) { this.tip({ x: p.pos.x - this.pos.x, z: p.pos.z - this.pos.z }); this.yank = p; }
  towTo() {}
  throwAt() {}
  tip(d) {
    FX.sparks(this.center(), 6, null, TAU, 3, 9);
    if (this.state !== 'full') { Sound.play('kragBlock', {}, this.center()); return; }
    const l = Math.hypot(d.x, d.z) || 1;
    this.dir = { x: d.x / l, z: d.z / l };
    this.state = 'tip'; this.t = 0;
    Sound.play('ladleTip', {}, this.center());
  }
  // where the pour comes down: off the lip on the side it tips to
  lip() { return { x: this.pos.x + this.dir.x * 1.5, y: this.pos.y + this.h - 0.2, z: this.pos.z + this.dir.z * 1.5 }; }
  update(dt) {
    this.t += dt;
    if (this.yank) { if (this.yank.tether && this.yank.tether.target === this) this.yank.releaseTether(); this.yank = null; }
    if (this.state === 'tip') {
      this.tilt = Math.min(1.9, this.tilt + dt * 3.4);
      if (!this.pour && this.tilt > 1.1) {
        const a = this.lip(), g = World.groundAt(a.x, a.z, a.y);
        this.pour = new SlagPour(a, g > -Infinity ? g : 0, this);
        Game.hazards.push(this.pour);
      }
      if (this.t > POUR.DUR + 0.6) { this.state = 'empty'; this.t = 0; }
    } else if (this.state === 'empty') this.tilt = Math.max(0.35, this.tilt - dt * 0.8);
    else if (Math.random() < 0.05) FX.embers({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, 1);
  }
}

// The stream of molten metal out of a tipped ladle: it burns whatever is under it as it comes down, and
// spreads into a pool.
class SlagPour {
  constructor(lip, ground, owner) {
    this.kind = 'pour'; this.owner = owner;
    this.pos = { x: lip.x, y: ground, z: lip.z }; this.top = lip.y; this.t = 0; this.dead = false; this.hit = new Set();
    Game.hazards.push(new SlagPool({ x: lip.x, y: ground, z: lip.z }, POUR.POOL, POUR.LIFE, 0.8));
    Sound.play('slagPour', {}, this.pos);
  }
  update(dt) {
    this.t += dt;
    const c = this.pos, P = Game.player, live = this.t < POUR.DUR;
    if (live) {
      FX.sparks({ x: c.x + rand(-0.4, 0.4), y: c.y + 0.2, z: c.z + rand(-0.4, 0.4) }, 3, { x: 0, y: 1, z: 0 }, 1.1, 3, 11, Object.assign({ life: 0.9 }, MOLTEN));
      if (Math.random() < 0.4) FX.embers({ x: c.x, y: c.y + rand(0.5, this.top - c.y), z: c.z }, 1);
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || this.hit.has(e) || distXZ(e.pos, c) > POUR.R + e.r || e.pos.y > this.top || e.pos.y + e.h < c.y) continue;
        this.hit.add(e);
        if (e.type === 'krag') continue;
        const u = unit(e.pos.x - c.x, 0, e.pos.z - c.z);
        hurtEnemy(e, POUR.EDMG, { kv: { x: u.x * 10, y: 12, z: u.z * 10 }, dir: { x: u.x, y: -0.5, z: u.z }, heavy: true, cause: 'lava', stagger: 0.8 });
      }
      if (!P.dead && !this.hit.has(P) && distXZ(P.pos, c) < POUR.R + P.r && P.pos.y < this.top && P.pos.y + P.h > c.y) {
        this.hit.add(P);
        const u = unit(P.pos.x - c.x, 0, P.pos.z - c.z);
        if (P.takeHit({ dmg: POUR.DMG, from: { x: c.x, y: this.top, z: c.z }, kind: 'hazard', source: null, knock: 0 }) === 'hit') { P.vel.x += u.x * 10; P.vel.z += u.z * 10; P.vel.y = Math.max(P.vel.y, 8); P.onGround = false; }
      }
    }
    if (this.t > POUR.DUR + 0.3) this.dead = true;
  }
}

// A pool of molten slag on the floor: it burns whatever stands in it, a little at a time, until it cools.
class SlagPool {
  constructor(pos, R, life, grow = 0.25) {
    this.kind = 'slagpool'; this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.R = R; this.life = life; this.grow = grow;
    this.t = 0; this.dead = false; this.tick = new Map();
  }
  radius() { return this.R * Math.min(1, this.t / this.grow); }
  update(dt) {
    this.t += dt;
    if (this.t >= this.life) { this.dead = true; return; }
    const c = this.pos, r = this.radius(), hot = this.t < this.life - 1, P = Game.player;
    if (Math.random() < 0.5) { const a = rand(0, TAU), q = rand(0, r); FX.sparks({ x: c.x + Math.cos(a) * q, y: c.y + 0.05, z: c.z + Math.sin(a) * q }, 1, { x: 0, y: 1, z: 0 }, 0.5, 1.5, 5, Object.assign({ life: 0.7 }, MOLTEN)); }
    if (!hot) return;
    const burns = (o) => distXZ(o.pos, c) < r && o.pos.y < c.y + 0.4 && o.pos.y > c.y - 0.6;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.flying || e.type === 'krag' || !burns(e) || (this.tick.get(e) || 0) > this.t) continue;
      this.tick.set(e, this.t + SLAG.EVERY);
      hurtEnemy(e, SLAG.EDMG, { kv: { x: 0, y: 5, z: 0 }, dir: { x: 0, y: 1, z: 0 }, cause: 'lava', stagger: 0.25, noKnock: true });
      FX.sparks(e.center(), 4, { x: 0, y: 1, z: 0 }, 1, 2, 7, MOLTEN);
    }
    if (!P.dead && burns(P) && (this.tick.get(P) || 0) <= this.t) {
      this.tick.set(P, this.t + SLAG.PEVERY);
      if (P.takeHit({ dmg: SLAG.DMG, from: { x: P.pos.x, y: c.y - 1, z: P.pos.z }, kind: 'hazard', source: null, knock: 0 }) === 'hit') { P.vel.y = Math.max(P.vel.y, 6); P.onGround = false; }
      Sound.play('slagHiss', {}, P.pos);
    }
  }
}

// A portal between the regions: a ring of molten light standing on the street that opens over a second;
// step into it to go through. An exit portal (the one you came out of) only closes.
class Portal {
  constructor(pos, to) {
    this.kind = 'portal'; this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.to = to;
    this.t = 0; this.open = 0; this.entered = false; this.dead = false; this.exit = false;
    if (to) { Sound.play('portalOpen', {}, this.pos); FX.flash('#ffb070', 0.3); Game.shake(0.3); }
  }
  center() { return { x: this.pos.x, y: this.pos.y + 2.1, z: this.pos.z }; }
  update(dt) {
    this.t += dt;
    this.open = this.exit ? clamp(1 - this.t / 1.6, 0, 1) : clamp(this.t / 1.2, 0, 1);
    if (this.exit && this.t > 1.6) { this.dead = true; return; }
    const c = this.center();
    if (Math.random() < 0.8 * this.open) {
      const a = rand(0, TAU), q = { x: c.x + Math.cos(a) * 1.6, y: c.y + Math.sin(a) * 2.1, z: c.z };
      FX.sparks(q, 1, { x: (c.x - q.x) * 0.5, y: (c.y - q.y) * 0.5, z: 0 }, 0.4, 1.5, 4, { c0: '#ffffff', c1: '#ffb040', c2: '#a03a10', g: 0, life: 0.9 });
    }
    const P = Game.player;
    if (!this.exit && this.open >= 1 && !P.dead && distXZ(P.pos, this.pos) < 1.5 && P.pos.y > this.pos.y - 0.6 && P.pos.y < this.pos.y + 3.2) this.entered = true;
  }
}

// ---------- drawing it ----------
// The molten river and the furnace's pour (built with the level, their molten metal flowing), the belts
// running, ladles, pours, slag pools and portals (through Views), and their lights.
const FoundryViews = {
  ready: false, kinds: new Set(['ladle', 'pour', 'slagpool', 'portal']), flows: [],

  init() {
    const add = BossViews.add;
    this.lava = this.lavaTexture();
    // the molten metal: a plain surface over the river's bed, its texture drifting downstream
    this.lavaMat = new THREE.MeshBasicMaterial({ map: this.lava, color: '#ffffff' });
    // its glow and the pours' shells, additive
    this.haloMat = add('#ff6a1a', { opacity: 0.35 });
    this.pourGeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true).translate(0, -0.5, 0);
    this.ringGeo = new THREE.RingGeometry(0.9, 1, 48);
    this.discGeo = new THREE.CircleGeometry(1, 32);
    this.swirl = this.swirlTexture();
    this.ready = true;
  },
  // Molten iron as a tiling texture: plates of dark crust drifting on it, cracked open on the bright metal.
  lavaTexture() {
    const N = 128, c = makeCanvas(N, N), g = c.ctx, R = mulberry32(9011), pts = [];
    for (let i = 0; i < 26; i++) pts.push([R() * N, R() * N]);
    for (let y = 0; y < N; y += 2) {
      for (let x = 0; x < N; x += 2) {
        let d1 = 1e9, d2 = 1e9;
        for (const [px, py] of pts) {
          let dx = Math.abs(x - px), dy = Math.abs(y - py);
          dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1), n = R();
        let col;
        if (edge < 2.2) col = n < 0.3 ? '#fff4c0' : '#ffd060';
        else if (edge < 4.5) col = n < 0.5 ? '#ff9a2a' : '#ff7a1a';
        else if (edge < 7) col = n < 0.6 ? '#c8400e' : '#a8300a';
        else col = n < 0.15 ? '#7a2408' : n < 0.6 ? '#4a1a0a' : '#3a1408';
        g.fillStyle = col; g.fillRect(x, y, 2, 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  // a portal's heart: a spiral of molten light, white on black for additive glow
  swirlTexture() {
    const N = 64, c = makeCanvas(N, N), g = c.ctx;
    g.fillStyle = '#000000'; g.fillRect(0, 0, N, N);
    for (let y = 0; y < N; y += 2) {
      for (let x = 0; x < N; x += 2) {
        const dx = x - N / 2 + 1, dy = y - N / 2 + 1, r = Math.hypot(dx, dy) / (N / 2), a = Math.atan2(dy, dx);
        if (r > 1) continue;
        const s = 0.5 + 0.5 * Math.sin(a * 3 + r * 9), k = clamp((1 - r) * 1.4, 0, 1) * (0.35 + 0.65 * s);
        const v = Math.round(255 * k);
        g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  // a flowing copy of the molten texture: rx, ry metres per repeat
  flowMat(w, l) {
    const tex = this.lava.clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 6, l / 6);
    return new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' });
  },
  // the level's molten metal, added to its group so it goes when the level does
  build(def) {
    this.flows = [];
    if (!def.lava && !def.pours) return;
    if (!this.ready) this.init();
    const grp = Gfx.level;
    for (const R of def.lava || []) {
      const L = R.max.x - R.min.x, W = R.max.z - R.min.z, m = this.flowMat(L, W);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2), m);
      mesh.position.set((R.min.x + R.max.x) / 2, R.surface, (R.min.z + R.max.z) / 2);
      grp.add(mesh);
      this.flows.push({ tex: m.map, u: 0.12, v: 0, mat: m });
    }
    for (const Q of def.pours || []) {
      const dx = Q.b[0] - Q.a[0], dy = Q.b[1] - Q.a[1], dz = Q.b[2] - Q.a[2], len = Math.hypot(dx, dy, dz);
      const m = this.flowMat(1, len * 2), core = new THREE.Mesh(new THREE.CylinderGeometry(Q.r, Q.r * 1.15, len, 8, 1, true), m);
      const halo = new THREE.Mesh(new THREE.CylinderGeometry(Q.r * 2, Q.r * 2.4, len, 8, 1, true), this.haloMat);
      for (const o of [core, halo]) {
        o.position.set((Q.a[0] + Q.b[0]) / 2, (Q.a[1] + Q.b[1]) / 2, (Q.a[2] + Q.b[2]) / 2);
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
        grp.add(o);
      }
      this.flows.push({ tex: m.map, u: 0, v: 1.6, mat: m });
    }
  },
  prewarmShow(group) {
    if (!this.ready) this.init();
    // the molten metal opaque (the river, pours) and see-through (slag pools fading), the portal's parts
    const a = new THREE.Mesh(this.discGeo, this.flowMat(1, 1)), a2 = new THREE.Mesh(this.discGeo, this.flowMat(1, 1)), b = new THREE.Mesh(this.ringGeo, BossViews.add('#ffb040', { opacity: 0.9 }));
    a2.material.transparent = true;
    const c = new THREE.Mesh(this.discGeo, BossViews.add('#ffffff', { map: this.swirl, opacity: 0.9 }));
    group.add(a, a2, b, c);
  },
  prewarmHide() {},

  // ---------- ladles, pours, pools and portals, through Views ----------
  make(o) {
    const add = BossViews.add;
    if (o.kind === 'ladle') {
      const R = Rig.build(MODELS.ladle);
      Gfx.scene.add(R.mesh);
      return { foundry: true, rig: R };
    }
    const g = new THREE.Group();
    if (o.kind === 'pour') {
      const core = new THREE.Mesh(this.pourGeo, this.flowMat(1, 4)), halo = new THREE.Mesh(this.pourGeo, add('#ff6a1a', { opacity: 0.35 }));
      g.add(core, halo);
      g.userData = { core, halo };
    } else if (o.kind === 'slagpool') {
      const pool = new THREE.Mesh(this.discGeo, this.flowMat(2, 2)), ring = new THREE.Mesh(BossViews.geos.flatRing, add('#ff7a1a', { opacity: 0.7 }));
      pool.rotation.x = -Math.PI / 2;
      pool.material.transparent = true;
      g.add(pool, ring);
      g.userData = { pool, ring };
    } else if (o.kind === 'portal') {
      const ring = new THREE.Mesh(this.ringGeo, add('#ffb040', { opacity: 0.9 })), ring2 = new THREE.Mesh(this.ringGeo, add('#ff5a1a', { opacity: 0.6 }));
      const heart = new THREE.Mesh(this.discGeo, add('#ffffff', { map: this.swirl, opacity: 0.9 })), glow = new THREE.Mesh(this.discGeo, add('#ff7a2a', { opacity: 0.25 }));
      g.add(glow, heart, ring, ring2);
      for (const m of g.children) m.renderOrder = 3;
      g.userData = { ring, ring2, heart, glow };
    } else return null;
    Gfx.scene.add(g);
    return { foundry: true, g };
  },
  update(o, v, t) {
    if (o.kind === 'ladle') {
      const R = v.rig;
      R.mesh.position.set(o.pos.x, o.pos.y, o.pos.z);
      // it tips about its trunnions, toward the side it pours to
      R.mesh.rotation.set(0, Math.atan2(o.dir.x, o.dir.z), 0);
      if (R.bones.pot) R.bones.pot.rotation.x = o.tilt;
      Rig.tint(R, 'melt', o.state === 'empty' ? '#2a1a14' : ((t * 6) | 0) % 2 ? '#ff9a3a' : '#ff7a1a');
      if (!v.lit) { Render.feet(R.feet, o.center()); v.lit = true; }
      return;
    }
    const U = v.g.userData;
    if (o.kind === 'pour') {
      const len = Math.max(0.1, o.top - o.pos.y), k = o.t < 0.15 ? o.t / 0.15 : o.t > POUR.DUR ? clamp(1 - (o.t - POUR.DUR) / 0.3, 0, 1) : 1;
      v.g.position.set(o.pos.x, o.top, o.pos.z);
      U.core.scale.set(0.32 * k, len * Math.min(1, o.t / 0.15), 0.32 * k); U.halo.scale.set(0.7 * k, len, 0.7 * k);
      U.core.material.map.offset.y = t * 2.4;
      U.halo.material.opacity = 0.35 * k;
    } else if (o.kind === 'slagpool') {
      const r = o.radius(), fade = clamp((o.life - o.t) / 1, 0, 1), cool = clamp((o.life - o.t) / (o.life * 0.6), 0, 1);
      v.g.position.set(o.pos.x, o.pos.y + 0.03, o.pos.z);
      U.pool.scale.setScalar(Math.max(0.01, r)); U.ring.scale.setScalar(Math.max(0.01, r));
      U.pool.material.opacity = fade; U.pool.material.color.setRGB(0.5 + 0.5 * cool, 0.35 + 0.65 * cool, 0.3 + 0.7 * cool);
      U.pool.material.map.offset.x = t * 0.05;
      U.ring.material.opacity = 0.6 * fade * cool;
    } else if (o.kind === 'portal') {
      const c = o.center(), k = easeOutCubic(o.open), cp = Gfx.camera.position;
      v.g.position.set(c.x, c.y, c.z);
      // it turns to face you, an upright oval
      v.g.rotation.set(0, Math.atan2(cp.x - c.x, cp.z - c.z), 0);
      U.ring.scale.set(1.5 * k, 2.1 * k, 1.5 * k); U.ring2.scale.set(1.62 * k, 2.25 * k, 1.62 * k);
      U.ring2.rotation.z = t * 0.6;
      U.heart.scale.set(1.45 * k, 2.0 * k, 1); U.heart.rotation.z = -t * 2.4;
      U.glow.scale.set(2.6 * k, 3.4 * k, 1);
      U.heart.material.opacity = 0.85 * k; U.glow.material.opacity = 0.25 * k * (0.8 + 0.2 * Math.sin(t * 5));
    }
  },
  dispose(v) {
    if (v.rig) { Gfx.scene.remove(v.rig.mesh); v.rig.geo.dispose(); v.rig.mat.dispose(); v.rig.outline.material.dispose(); return; }
    Gfx.scene.remove(v.g);
    for (const m of v.g.children) { if (m.material.map && m.material.map !== this.swirl) m.material.map.dispose(); m.material.dispose(); }
  },
  // every frame: the metal flowing, the belts running
  sync() {
    if (!this.ready) return;
    const t = Game.realTime, dt = clamp(t - (this._t || t), 0, 0.1) * (Game.state === 'playing' ? Game.slowScale : 0);
    this._t = t;
    for (const F of this.flows) { F.tex.offset.x += F.u * dt; F.tex.offset.y += F.v * dt; }
    const D = World.def;
    for (const C of (D && D.conveyors) || []) {
      const tex = Gfx.texCache.get(C.style);
      if (tex) tex.offset.x -= (C.dir.x * C.speed * dt) / 2;
    }
  },
  pushLights() {
    for (const h of Game.hazards) {
      if (h.dead) continue;
      if (h.kind === 'pour' && h.t < POUR.DUR) Gfx.light(h.pos.x, h.pos.y + 1.2, h.pos.z, '#ff7a2a', 5, 11);
      else if (h.kind === 'portal') { const c = h.center(); Gfx.light(c.x, c.y, c.z, '#ffa040', 5 * h.open, 12); }
    }
  },
};
