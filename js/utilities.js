'use strict';
// Character utilities, bound to F: one ability per character on a cooldown. CHARACTERS names which one
// each character uses; a character without one simply has nothing on F. A utility with charge: true is held:
// player.js calls begin when it starts, hold every tick while F is down, release when F comes up, interrupt
// when a hit lands first, and cancel when another action takes over the body.

const UTILITIES = {};
function registerUtility(def) { UTILITIES[def.id] = def; }
function getUtility(id) { return UTILITIES[id] || null; }
// aegisplayer.js adds AEGIS-07, whose F switches its weapon mode instead.
const CHARACTERS = { ronin: { id: 'ronin', name: 'RONIN', utility: 'swordBeam', make: (pos) => new Player(pos) } };
// the player for a run, as the character picked on the title screen
function makePlayer(id, pos) { const C = CHARACTERS[id] || CHARACTERS.ronin; return C.make(pos); }

// RONIN's sword beam. A tap throws a small, quick blade of light that breaks on the first thing it meets.
// Held to full charge, the release throws a massive wave at the crosshair: it widens as it travels, cuts
// through everything in its path and burns bolts and strike probes out of the air, and once it comes down to
// the ground it runs on along it. A hit while charging breaks the charge; a dash, a slash, the parry stance or
// the tether drop it at no cost.
const SWORD_BEAM = {
  FULL: 1.1, // seconds of holding for the massive wave
  CD: 8, BREAK_CD: 2, // cooldown after a release, and after a charge a hit broke
  // a tap, and the most a partial charge reaches before the jump to full
  TAP: { dmg: 12, W: 1.1, H: 0.3, speed: 44, life: 0.5, grow: 0 },
  HALF: { dmg: 22, W: 1.8, H: 0.42, speed: 46, life: 0.55, grow: 0 },
  MAX: { dmg: 55, W: 3.2, H: 1.5, speed: 30, life: 1.5, grow: 4.2 },
  // the massive wave's middle rides RIDE above the ground; past where it was aimed, one heading down, level, or
  // up by no more than SETTLE_UP (the sine of its climb) settles onto ground up to SETTLE below its ride height
  RIDE: 1.2, SETTLE_UP: 0.15, SETTLE: 1.5,
};
const BEAM_SPARK = { c0: '#ffffff', c1: '#ff8a9a', c2: '#a0101e' };
const BEAM_GOLD = { c0: '#ffffff', c1: '#ffd070', c2: '#ff3a2a' };

registerUtility({
  id: 'swordBeam',
  name: 'Sword Beam',
  hud: 'BEAM',
  desc: 'Tap for a quick blade of light; hold to full charge for a massive wave. A hit while charging breaks it.',
  cooldown: SWORD_BEAM.CD,
  breakCD: SWORD_BEAM.BREAK_CD,
  charge: true,

  begin(p, C) {
    C.k = 0; C.full = false;
    p.stopLoop('beam');
    p.loops.beam = Sound.loop('beamHold');
    FX.ring(p.bladeAt(0.5), 0.1, 0.8, 0.18, { c: '#ff3a52', flat: false });
    Sound.play('beamStart');
  },
  hold(p, C, dt) {
    const k = (C.k = Math.min(1, C.t / SWORD_BEAM.FULL));
    if (p.loops.beam) p.loops.beam.set(k, C.full);
    // light gathers on the blade from all round, faster and hotter as it fills
    const b = p.bladeAt(rand(0.2, 1));
    if (Math.random() < 0.35 + 0.6 * k) {
      const a = rand(0, TAU), up = rand(-0.6, 0.8), R = (0.8 + 0.7 * k) * (Camera.fp ? 0.6 : 1);
      const from = { x: b.x + Math.cos(a) * R, y: b.y + up * R, z: b.z + Math.sin(a) * R };
      FX.sparks(from, 1, { x: b.x - from.x, y: b.y - from.y, z: b.z - from.z }, 0.15, R * 5, R * 6, Object.assign({ life: 0.2, g: 0 }, k >= 1 ? BEAM_GOLD : BEAM_SPARK));
    }
    // arcs crawl over it (small ones in first person, where the blade is right under the lens)
    const near = Camera.fp ? 0.3 : 1;
    if (Math.random() < (0.15 + 0.5 * k) * (Camera.fp ? 0.6 : 1)) FX.elec(p.bladeAt(rand(0.1, 1)), (0.25 + 0.35 * k) * near, 1, k >= 1 ? { outer: '#ffb040', core: '#ffffff' } : { outer: '#ff2a48', core: '#ffe8ee' });
    // embers rise round the body, and a pulse on the ground tightens onto the feet, faster as it fills
    if (Math.random() < 0.3 + 0.5 * k) {
      const a = rand(0, TAU), r = rand(0.35, 0.7);
      FX.sparks({ x: p.pos.x + Math.cos(a) * r, y: p.pos.y + rand(0.05, 0.6), z: p.pos.z + Math.sin(a) * r }, 1, { x: 0, y: 1, z: 0 }, 0.3, 1.5 + 2 * k, 3 + 3 * k, Object.assign({ life: 0.5, g: -4 }, k >= 1 ? BEAM_GOLD : BEAM_SPARK));
    }
    if (k >= 1 && !Camera.fp && Math.random() < 0.3) { const c = p.center(); FX.elec({ x: c.x + rand(-0.4, 0.4), y: c.y + rand(-0.6, 0.6), z: c.z + rand(-0.4, 0.4) }, 0.5, 1, { outer: '#ffb040', core: '#ffffff' }); }
    C.pulse = (C.pulse || 0) - dt;
    if (C.pulse <= 0) {
      C.pulse = lerp(0.32, 0.14, k);
      FX.ring({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z }, 2.4 - k, 0.4, 0.24, { c: k >= 1 ? '#ffd070' : '#ff3a52' });
    }
    if (!C.full && k >= 1) {
      C.full = true;
      const c = p.bladeAt(0.6);
      FX.ring(c, 0.2, 2.4, 0.3, { c: '#ffd070', flat: false });
      FX.ring({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z }, 0.3, 3.4, 0.35, { c: '#ffe0a0' });
      FX.sparks(c, 26, null, TAU, 5, 16, BEAM_GOLD);
      FX.glint(p.bladeAt(0.95));
      FX.light(c, '#ffd070', 5, 7, 0.3);
      Sound.play('beamFull');
      FPFX.kick('beamFull');
    }
  },
  release(p, C) {
    p.stopLoop('beam');
    const full = C.k >= 1, d = p.aimDir, c = p.chest();
    p.utilT = full ? 0.42 : 0.26;
    p.aimHold = Math.max(p.aimHold, 0.4);
    let dir, at, cfg;
    if (full) {
      // the massive wave flies at the crosshair; aimed at a floor, it comes down to ride above it there, and
      // aimed past anything else it rides the ground once it comes down to it
      const A = Camera.aim, floor = !Camera.aimEnemy && Math.abs(World.groundAt(A.x, A.z, A.y + 0.05) - A.y) < 0.05;
      const T = floor ? { x: A.x, y: A.y + SWORD_BEAM.RIDE, z: A.z } : A;
      const dx = T.x - c.x, dy = T.y - c.y, dz = T.z - c.z, l = Math.hypot(dx, dy, dz);
      if (l > 2) dir = { x: dx / l, y: dy / l, z: dz / l };
      else { const h = Math.hypot(d.x, d.z) || 1; dir = { x: d.x / h, y: 0, z: d.z / h }; }
      at = { x: c.x + dir.x * 1.2, y: c.y + dir.y * 1.2, z: c.z + dir.z * 1.2 };
      cfg = Object.assign({ rideAfter: Math.max(0, l - 1.2) }, SWORD_BEAM.MAX);
    } else {
      // a tap or a partial charge flies where you aim
      const k = C.k, T = SWORD_BEAM.TAP, H = SWORD_BEAM.HALF;
      dir = { x: d.x, y: d.y, z: d.z };
      at = { x: c.x + d.x * 0.9, y: c.y + d.y * 0.9, z: c.z + d.z * 0.9 };
      cfg = {};
      for (const key in T) cfg[key] = lerp(T[key], H[key], k);
    }
    Game.projectiles.push(new SwordBeam(at, dir, cfg, p, full));
    const yaw = yawOf(dir.x, dir.z);
    FX.swoosh({ x: c.x, y: c.y, z: c.z, oy: 0, yaw, tilt: 0, r: full ? 3.4 : 2.2, span: full ? 3.4 : 2.4, dir: -1, sweep: full ? 0.1 : 0.07, dur: full ? 0.34 : 0.22, thick: full ? 0.6 : 0.4, pal: full ? 'gold' : 'red', trail: 1, bolts: full ? 4 : 0 });
    if (full) {
      const g = { x: p.pos.x, y: p.pos.y + 0.06, z: p.pos.z };
      FX.ring(c, 0.4, 5.5, 0.4, { c: '#ffd070', flat: false });
      FX.ring(g, 0.5, 7, 0.45, { c: '#ff3a52' });
      FX.sparks(c, 40, dir, 1.2, 9, 30, BEAM_GOLD);
      FX.dust(g, 18, { smax: 9, rise: 1.4 });
      FX.decal('crack', g, { len: 2.6 });
      FX.light(c, '#ffb040', 8, 14, 0.4);
      FX.flash('#fff0d0', 0.25);
      Sound.play('beamMassive');
      Game.shake(0.5);
      Game.hitstop(0.06);
      FPFX.kick('beamMassive', { dir });
      // the wave's push sets you back a step
      if (p.onGround) { p.vel.x -= dir.x * 4; p.vel.z -= dir.z * 4; }
    } else {
      FX.sparks(at, 8, dir, 0.6, 5, 14, BEAM_SPARK);
      FX.light(at, '#ff3048', 2.5, 5, 0.15);
      Sound.play('beamTap', { power: C.k });
      FPFX.kick('beamTap', { dir });
    }
  },
  interrupt(p, C) {
    p.stopLoop('beam');
    // the gathered light shatters off the blade
    const c = p.bladeAt(0.6), n = 6 + Math.round(18 * C.k);
    FX.sparks(c, n, null, TAU, 4, 14 + 10 * C.k, C.full ? BEAM_GOLD : BEAM_SPARK);
    FX.ring(c, 0.2, 1 + C.k, 0.18, { c: '#ff8a9a', flat: false });
    Sound.play('beamBreak', { power: C.k });
  },
  cancel(p, C) {
    p.stopLoop('beam');
    FX.sparks(p.bladeAt(0.6), 4 + Math.round(6 * C.k), null, TAU, 2, 6, BEAM_SPARK);
  },
});

// The beam in flight: a crescent of light across its path, its band W wide and H tall either side of its
// middle, spanned across (side) and up (up) from its line of flight. It hits each enemy once. The small one
// breaks on the first enemy or bolt it meets; the massive one cuts through all of them, widening as it goes,
// and once it has flown rideAfter metres (past where it was aimed) heading down, level or only a little up,
// over ground close enough below, it settles onto the ground and rides it over steps and down drops. Only its
// middle meets the world: its edges pass through walls, and a wall in the middle of its path stops it.
class SwordBeam {
  constructor(pos, dir, cfg, owner, full) {
    this.kind = 'swordbeam';
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.W = cfg.W; this.H = cfg.H; this.grow = cfg.grow; this.dmg = cfg.dmg; this.speed = cfg.speed;
    this.life = this.life0 = cfg.life; this.full = full; this.owner = owner;
    this.hostile = false; this.dead = false; this.t = 0; this.hit = new Set();
    // the heading it rides the ground along (its owner's facing if it was thrown straight down)
    const hl = Math.hypot(dir.x, dir.z);
    this.head = hl > 1e-3 ? { x: dir.x / hl, y: 0, z: dir.z / hl } : { x: fwdX(owner.yaw), y: 0, z: fwdZ(owner.yaw) };
    this.setDir(dir);
    this.ground = false; this.flown = 0;
    this.rideAfter = cfg.rideAfter === undefined ? Infinity : cfg.rideAfter;
  }
  setDir(dir) {
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1, d = (this.dir = { x: dir.x / l, y: dir.y / l, z: dir.z / l }), hl = Math.hypot(d.x, d.z);
    this.side = hl > 1e-3 ? { x: -d.z / hl, y: 0, z: d.x / hl } : { x: -this.head.z, y: 0, z: this.head.x };
    const s = this.side;
    this.up = { x: s.y * d.z - s.z * d.y, y: s.z * d.x - s.x * d.z, z: s.x * d.y - s.y * d.x };
    this.vel = { x: d.x * this.speed, y: d.y * this.speed, z: d.z * this.speed };
  }
  // down onto the ground: it turns level along its heading, and a steep one hits the street hard
  land(g) {
    const steep = this.dir.y < -0.25;
    this.ground = true;
    this.setDir(this.head);
    if (!steep) return;
    const q = { x: this.pos.x, y: g + 0.06, z: this.pos.z };
    FX.ring(q, 0.4, this.W + 1.5, 0.3, { c: '#ffd070' });
    FX.dust(q, 12, { smax: 7, rise: 1.2 });
    FX.decal('crack', q, { len: 2.2 });
    FX.light(q, '#ffb040', 4, 8, 0.2);
    Game.shake(0.2);
  }
  // a point on its band: u metres across from the middle, v up
  pointOn(u, v) {
    const s = this.side, w = this.up, p = this.pos;
    return { x: p.x + s.x * u + w.x * v, y: p.y + s.y * u + w.y * v, z: p.z + s.z * u + w.z * v };
  }
  // where q sits in the band's frame: along its flight, across, and up
  local(q) {
    const rx = q.x - this.pos.x, ry = q.y - this.pos.y, rz = q.z - this.pos.z, d = this.dir, s = this.side, w = this.up;
    return { a: rx * d.x + ry * d.y + rz * d.z, b: rx * s.x + ry * s.y + rz * s.z, c: rx * w.x + ry * w.y + rz * w.z };
  }
  meets(q, r, hh) {
    const L = this.local(q);
    return Math.abs(L.a) < 0.5 + r && Math.abs(L.b) < this.W + r && Math.abs(L.c) < this.H + hh;
  }
  fizzle(hard) {
    if (this.dead) return;
    this.dead = true;
    const n = this.full ? 22 : 7;
    for (let i = 0; i < n; i++) {
      const q = this.pointOn(rand(-this.W, this.W), rand(-this.H, this.H));
      FX.sparks(q, 1, null, TAU, 2.7, 11, this.full ? BEAM_GOLD : BEAM_SPARK);
    }
    if (hard && this.full) {
      FX.ring(this.pos, 0.4, 3.4, 0.3, { c: '#ffd070', flat: false });
      FX.light(this.pos, '#ffb040', 5, 9, 0.25);
      Sound.play('beamImpact', {}, this.pos);
      Game.shake(0.25);
    }
  }
  strike(e) {
    this.hit.add(e);
    const d = this.dir, kn = this.full ? 26 : 9;
    const kv = { x: d.x * kn, y: this.full ? 10 : 3, z: d.z * kn };
    const dealt = hurtEnemy(e, this.dmg, { kv, dir: { x: d.x, y: 0.15, z: d.z }, cause: this.full ? 'beamFull' : 'beam', full: this.full, ranged: true, heavy: this.full, stagger: this.full ? 1.2 : 0.35, hitstop: this.full ? 0.03 : 0.01 });
    const c = e.center();
    FX.sparks(c, this.full ? 16 : 6, { x: d.x, y: 0.2, z: d.z }, 1, 6, this.full ? 26 : 16, this.full ? BEAM_GOLD : BEAM_SPARK);
    if (this.full) {
      const L = e.r + 0.8, s = this.side;
      FX.slashLine({ x: c.x - s.x * L, y: c.y, z: c.z - s.z * L }, { x: c.x + s.x * L, y: c.y, z: c.z + s.z * L }, { w: 0.14, dur: 0.22, pal: 'gold' });
    }
    return dealt;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.fizzle(false); return; }
    this.W += this.grow * dt;
    const step = (this.speed * dt) / 3, R = SWORD_BEAM.RIDE;
    for (let i = 0; i < 3 && !this.dead; i++) {
      let d = this.dir;
      this.pos.x += d.x * step; this.pos.y += d.y * step; this.pos.z += d.z * step;
      this.flown += step;
      // past where it was aimed, it settles onto the ground it comes down to
      if (this.full && !this.ground && this.flown >= this.rideAfter - 0.05 && d.y <= SWORD_BEAM.SETTLE_UP) {
        const g = World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
        if (g > -Infinity && this.pos.y - g <= R + SWORD_BEAM.SETTLE) { this.land(g); d = this.dir; }
      }
      // then it keeps its feet on the ground: up steps, down drops
      if (this.ground) {
        const g = World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
        if (g > -Infinity) this.pos.y = damp(this.pos.y, g + R, g + R < this.pos.y ? 6 : 40, dt / 3);
      }
      // only its middle meets the world
      if (World.pointSolid(this.pos.x + d.x * 0.3, this.pos.y + d.y * 0.3, this.pos.z + d.z * 0.3)) { this.fizzle(true); return; }
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || e.dying || this.hit.has(e)) continue;
        if (!this.meets(e.center(), e.r, e.h / 2)) continue;
        this.strike(e);
        if (!this.full) { this.fizzle(false); return; }
      }
      this.clash();
    }
    if (this.dead) return;
    // lamps in its path come down
    const P = this.pos, d = this.dir;
    Props.slash((q) => { const L = this.local(q.center()); return Math.abs(L.a) < 0.5 + q.r && Math.abs(L.b) < this.W + q.r && P.y + this.H > q.pos.y && P.y - this.H < q.pos.y + q.h; }, P.y, d);
    const n = this.full ? 3 : 1;
    for (let i = 0; i < n; i++) if (Math.random() < 0.7) FX.sparks(this.pointOn(rand(-this.W, this.W), rand(-this.H, this.H)), 1, { x: -d.x, y: 0, z: -d.z }, 0.4, 1.8, 5.5, Object.assign({ g: 0 }, this.full ? BEAM_GOLD : BEAM_SPARK));
    if (this.full && Math.random() < 0.6) {
      const q = this.pointOn(rand(-this.W, this.W), -this.H);
      if (Math.abs(World.groundAt(q.x, q.z, q.y + 0.6) - q.y) < 0.8) FX.dust({ x: q.x, y: q.y + 0.1, z: q.z }, 1, { smax: 4, rise: 2 });
    }
  }
  // hostile bolts and the rival's strike probes it meets: the massive one burns through them, the small one
  // breaks with them
  clash() {
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || (b.kind !== 'bolt' && b.kind !== 'probe') || !this.meets(b.pos, 0.3, 0.3)) continue;
      b.dead = true;
      FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, this.full ? BEAM_GOLD : BEAM_SPARK);
      if (!this.full) { Sound.play('clash', {}, b.pos); this.fizzle(false); return; }
    }
  }
}
