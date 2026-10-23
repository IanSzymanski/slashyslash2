'use strict';
// Orbital strikes: a probe flies on an arc and lands, pulses on the ground under a siren, then the ground
// erupts in a column of light. AEGIS's ultimate calls one big strike down where it aims and holds everything
// inside it; AEGIS-07 (the rival) calls small ones on the street ahead of you when you run from it, a
// controlled version of the eruption it arrives in. aegisviews.js draws them.

// R: radius (m); beacon: seconds pulsing before it erupts; erupt: seconds the column stands. The player's
// strike hits everything inside every tick seconds (first on the first tick, dmg after, bosses take bossMul);
// the rival's hits you once as it bursts out of the ground.
const STRIKE = {
  ult: { R: 7.5, beacon: 1.5, erupt: 2.4, tick: 0.2, first: 110, dmg: 55, bossMul: 0.35, pulses: 3, g: 30 },
  boss: { R: 3.4, beacon: 1.25, erupt: 0.75, dmg: 22, pulses: 2, g: 34 },
};
// AEGIS's own light is cyan, the rival's a deeper blue
const STRIKE_COL = {
  ult: { glow: '#21b8ff', hi: '#a8ecff', core: '#e8fbff', spark: { c0: '#ffffff', c1: '#8ae8ff', c2: '#0e4a6a' } },
  boss: { glow: '#2f6bff', hi: '#9cc4ff', core: '#e0ecff', spark: { c0: '#ffffff', c1: '#8ab8ff', c2: '#1a3a8a' } },
};

// The probe: a dense ball of energy on a ballistic arc. It ignores bodies and lands on whatever surface it
// meets; where it lands, the strike begins.
class StrikeProbe {
  constructor(pos, vel, o) {
    this.kind = 'probe';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.vel = { x: vel.x, y: vel.y, z: vel.z };
    this.owner = o.owner || null; this.hostile = !!o.hostile; this.cfg = o.cfg; this.col = o.hostile ? STRIKE_COL.boss : STRIKE_COL.ult;
    this.g = o.cfg.g; this.t = 0; this.dead = false; this.size = o.hostile ? 0.7 : 1;
  }
  center() { return this.pos; }
  update(dt) {
    this.t += dt;
    if (this.t > 4) { this.land(); return; }
    const p = this.pos, v = this.vel;
    v.y -= this.g * dt;
    for (let i = 0; i < 3; i++) {
      p.x += (v.x * dt) / 3; p.y += (v.y * dt) / 3; p.z += (v.z * dt) / 3;
      if (World.pointSolid(p.x, p.y, p.z)) { p.x -= (v.x * dt) / 3; p.y -= (v.y * dt) / 3; p.z -= (v.z * dt) / 3; this.land(); return; }
    }
    if (p.y < -5) { this.land(); return; }
    if (Math.random() < 0.8) FX.sparks(p, 1, null, TAU, 1.5, 4.5, Object.assign({ g: 0, life: 0.6 }, this.col.spark));
  }
  land() {
    if (this.dead) return;
    this.dead = true;
    const p = this.pos;
    let gy = World.groundAt(p.x, p.z, p.y + 0.5);
    if (gy === -Infinity) gy = World.def.groundY;
    const at = { x: p.x, y: gy, z: p.z };
    Game.hazards.push(new OrbitalStrike(at, { owner: this.owner, hostile: this.hostile, cfg: this.cfg }));
    const up = { x: at.x, y: at.y + 0.06, z: at.z };
    FX.ring(up, 0.2, 1.6 * this.size, 0.25, { c: this.col.hi });
    FX.sparks({ x: at.x, y: at.y + 0.2, z: at.z }, 12, { x: 0, y: 1, z: 0 }, 1.6, 4, 12, this.col.spark);
    FX.dust(at, 5, { smax: 3 });
    Sound.play('probeLand', { big: !this.hostile }, at);
  }
}

class OrbitalStrike {
  // pos: on the ground; o: { owner, hostile, cfg: one of STRIKE }
  constructor(pos, o) {
    this.kind = 'strike';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.owner = o.owner || null; this.hostile = !!o.hostile;
    this.cfg = o.cfg; this.R = o.cfg.R; this.col = this.hostile ? STRIKE_COL.boss : STRIKE_COL.ult;
    this.t = 0; this.phase = 'beacon'; this.dead = false; this.pulse = 0; this.erupted = 0; this.tick = 0;
    this.hit = new Set(); this.hitPlayer = false; this.siren = false;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 1, z: this.pos.z }; }
  // 0..1 through the beacon, 1 once it erupts
  charge() { return this.phase === 'beacon' ? clamp(this.t / this.cfg.beacon, 0, 1) : 1; }
  inside(b) { return distXZ(b.pos, this.pos) < this.R + b.r * 0.5 && b.pos.y < this.pos.y + 40 && b.pos.y + b.h > this.pos.y - 1.2; }
  update(dt) {
    this.t += dt;
    const C = this.cfg, g = this.pos, col = this.col;
    if (this.phase === 'beacon') {
      if (!this.siren) { this.siren = true; Sound.play('siren', { dur: C.beacon, small: this.hostile }, g); }
      const k = this.charge();
      // the probe pulses, faster as the eruption nears, each pulse a ring out to the edge of the zone
      if ((this.pulse -= dt) <= 0) {
        this.pulse = (C.beacon / (C.pulses + 0.5)) * lerp(1, 0.5, k);
        FX.ring({ x: g.x, y: g.y + 0.07, z: g.z }, 0.3, this.R, 0.35, { c: col.hi });
        FX.light({ x: g.x, y: g.y + 0.6, z: g.z }, col.glow, 3 + 3 * k, this.R * 1.4, 0.2);
        FX.sparks({ x: g.x, y: g.y + 0.25, z: g.z }, 6, { x: 0, y: 1, z: 0 }, 1.2, 3, 9, col.spark);
        Sound.play('probePulse', { pm: 1 + k * 0.5 }, g);
        // the ground starts to shake under it
        const P = Game.player;
        if (P && distXZ(P.pos, g) < this.R + 12) Game.shake((0.04 + 0.08 * k) * (this.hostile ? 0.5 : 1));
      }
      // motes rise off the street inside the zone
      if (Math.random() < 0.5 + k) {
        const a = rand(0, TAU), r = Math.sqrt(Math.random()) * this.R;
        FX.sparks({ x: g.x + Math.cos(a) * r, y: g.y + 0.05, z: g.z + Math.sin(a) * r }, 1, { x: 0, y: 1, z: 0 }, 0.3, 2 + 6 * k, 5 + 10 * k, Object.assign({ g: -2, life: 1.2 }, col.spark));
      }
      if (this.t >= C.beacon) this.erupt();
      return;
    }
    this.erupted += dt;
    // the column roars: sparks streaming up it, rock thrown out of its foot, lightning in it
    const big = !this.hostile;
    for (let i = 0; i < (big ? 4 : 2); i++) {
      const a = rand(0, TAU), r = Math.sqrt(Math.random()) * this.R * 0.9;
      FX.sparks({ x: g.x + Math.cos(a) * r, y: g.y + rand(0, big ? 6 : 3), z: g.z + Math.sin(a) * r }, 1, { x: 0, y: 1, z: 0 }, 0.3, 14, 30, Object.assign({ g: -6, life: 0.8 }, col.spark));
    }
    if (Math.random() < (big ? 0.4 : 0.15)) {
      const a = rand(0, TAU), at = { x: g.x + Math.cos(a) * this.R, y: g.y + 0.1, z: g.z + Math.sin(a) * this.R };
      FX.debris(at, 2, GRIT, 14);
    }
    if (big && Math.random() < 0.3) {
      const a = rand(0, TAU), y0 = g.y + rand(1, 12);
      FX.bolt({ x: g.x + Math.cos(a) * this.R * 0.3, y: y0, z: g.z + Math.sin(a) * this.R * 0.3 }, { x: g.x + Math.cos(a) * this.R * 1.1, y: y0 + rand(-2, 2), z: g.z + Math.sin(a) * this.R * 1.1 }, 0.1, { outer: col.glow, core: '#ffffff', jag: 0.6, forks: 2 });
    }
    // a rumble under the column (shake decays faster than this adds, so it fades from the eruption's jolt)
    if (big) Game.shake(0.006);
    this.damage(dt);
    if (this.erupted >= C.erupt) {
      this.dead = true;
      FX.dust(g, big ? 18 : 6, { smax: big ? 9 : 4, rise: 1.2, c: '#3a3442', life: 1.4 });
    }
  }
  // the column bursts out of the ground
  erupt() {
    this.phase = 'erupt'; this.erupted = 0; this.tick = 0;
    const g = this.pos, up = { x: g.x, y: g.y + 0.06, z: g.z }, c = { x: g.x, y: g.y + 1.2, z: g.z }, col = this.col, big = !this.hostile, R = this.R;
    FX.ring(up, 0.4, R * 1.5, 0.5, { c: col.hi });
    FX.ring(up, 0.3, R, 0.4, { c: '#ffffff' });
    FX.ring({ x: g.x, y: g.y + 3, z: g.z }, R * 0.5, R * 1.3, 0.4, { c: col.glow, flat: false });
    FX.debris(up, big ? 40 : 14, GRIT, big ? 30 : 18);
    FX.dust(up, big ? 30 : 10, { smax: big ? 18 : 8, rise: 1.4, life: 1.3 });
    FX.sparks(c, big ? 60 : 20, { x: 0, y: 1, z: 0 }, 1.0, 12, big ? 44 : 26, col.spark);
    FX.decal('crack', g, { len: R * (big ? 1.6 : 1.3), dur: big ? 12 : 6 });
    if (big) FX.decal('scorch', g, { r: R * 0.8, dur: 12 });
    FX.light({ x: g.x, y: g.y + 4, z: g.z }, col.glow, big ? 10 : 6, R * 4, 0.5);
    FX.flash(big ? '#e0f8ff' : '#c8dcff', big ? 0.5 : 0.18);
    Sound.play('eruption', { big }, g);
    Game.shake(big ? 0.8 : 0.3);
    if (big) Game.hitstop(0.06);
    // street lamps in it come down; barrels go up
    Props.blast(c, R);
    for (const pr of Game.props) {
      if (pr.dead || !pr.grabR || distXZ(pr.pos, g) > R + 0.5 || Math.abs(pr.pos.y - g.y) > 3) continue;
      pr.hit(30, { heavy: true, kv: { x: 0, y: 26, z: 0 } });
    }
  }
  damage(dt) {
    const C = this.cfg, g = this.pos;
    if (this.hostile) {
      // one hit, as it bursts out of the ground: be out of the ring by then
      const P = Game.player;
      if (this.hitPlayer || this.erupted > 0.18 || P.dead || !this.inside(P)) return;
      const r = P.takeHit({ dmg: C.dmg * (this.owner ? this.owner.dmgMul : 1), from: { x: g.x, y: g.y, z: g.z }, kind: 'blast', knock: 14, unparryable: true });
      if (r === 'ignored') return;
      this.hitPlayer = true;
      if (r === 'hit') { P.vel.y = Math.max(P.vel.y, 20); P.onGround = false; }
      return;
    }
    if ((this.tick -= dt) > 0) return;
    this.tick = C.tick;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.dying || !this.inside(e)) continue;
      const first = !this.hit.has(e);
      this.hit.add(e);
      // the rival's shield goes at once, as a kicked-back grenade breaks it
      if (first && e.isBoss && e.shield && e.pulseHit) { e.pulseHit(); continue; }
      const dx = e.pos.x - g.x, dz = e.pos.z - g.z, l = Math.hypot(dx, dz) || 1;
      // held in the light: lifted and drawn in toward its middle
      hurtEnemy(e, (first ? C.first : C.dmg) * (e.isBoss ? C.bossMul : 1), {
        kv: { x: (-dx / l) * 3, y: first ? 16 : 8, z: (-dz / l) * 3 }, dir: { x: 0, y: 1, z: 0 }, heavy: true, cause: 'strike', stagger: 0.45, hitstop: 0, crit: first, ranged: true,
      });
    }
  }
}
