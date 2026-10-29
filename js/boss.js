'use strict';
// What the bosses share (AEGIS-07 in rival.js, KRAG in kragboss.js): their body frame and bones, turning and
// steering, the way they path to you (straight when it's clear, along the nav graph, with a leap over links
// they can't walk), getting unstuck, finding a clear spot, the open floor along a direction, leaps timed to
// land on a point, and the swing-arc test their blows use.

// a horizontal unit vector, and one turned deg degrees toward the right of it (s = 1) or the left (s = -1)
const flat = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
const turnFlat = (u, s, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a) * s; return { x: u.x * c - u.z * sn, z: u.z * c + u.x * sn }; };
// Whether a body is in a swing's arc: within reach in the swing's plane (tilted from level by a.tilt and
// pitched by a.pa), within the band either side of it, and inside the span.
function arcHits(c, a, reach, b, band = 0.9) {
  const pa = a.pa || 0, cp = Math.cos(pa), sp = Math.sin(pa), fx = fwdX(a.yaw), fz = fwdZ(a.yaw);
  const F = [fx * cp, sp, fz * cp], R = [Math.cos(a.yaw), 0, -Math.sin(a.yaw)], U = [-fx * sp, cp, -fz * sp];
  const ct = Math.cos(a.tilt), st = Math.sin(a.tilt);
  const A = [R[0] * ct + U[0] * st, R[1] * ct + U[1] * st, R[2] * ct + U[2] * st];
  const N = [F[1] * A[2] - F[2] * A[1], F[2] * A[0] - F[0] * A[2], F[0] * A[1] - F[1] * A[0]];
  for (const k of [0.2, 0.5, 0.85]) {
    const vx = b.pos.x - c.x, vy = b.pos.y + b.h * k - c.y, vz = b.pos.z - c.z;
    const f = vx * F[0] + vy * F[1] + vz * F[2], s = vx * A[0] + vy * A[1] + vz * A[2], n = vx * N[0] + vy * N[1] + vz * N[2];
    const d = Math.hypot(f, s);
    if (d - b.r > reach || Math.abs(n) > band + b.r) continue;
    if (d < b.r + 0.5 || Math.abs(Math.atan2(s, f)) <= a.span / 2 + Math.atan2(b.r, d)) return true;
  }
  return false;
}

class Boss extends Enemy {
  constructor(type, pos, scale = {}) {
    super(type, pos, scale);
    this.isBoss = true;
    // its gravity, m/s^2; a leap falls at LEAP_G of it
    this.G = ENEMY_G; this.LEAP_G = 0.6;
    this.faceYaw = this.yaw; this.want = null; this.leap = null;
    this.stuckT = 0; this.lastPos = { x: pos.x, z: pos.z };
  }

  // ---------- where its parts are ----------
  center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.55, z: this.pos.z }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  // a point in its body frame: x to its right, y up from its feet, f forward
  local(x, y, f) { const F = this.fwd(), R = this.right(); return { x: this.pos.x + R.x * x + F.x * f, y: this.pos.y + y, z: this.pos.z + R.z * x + F.z * f }; }
  // a point in a bone's frame, in the model's unscaled units, or null before the model is built
  boneAt(name, x, y, z) {
    const R = this.model;
    if (!R || !R.bones[name]) return null;
    const v = this._bv || (this._bv = new THREE.Vector3()), S = R.scale || 1;
    R.bones[name].updateWorldMatrix(true, false);
    v.set(x * S, y * S, z * S).applyMatrix4(R.bones[name].matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }
  yawTo(q) { return yawOf(q.x - this.pos.x, q.z - this.pos.z); }
  groundY() { return World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3); }
  aimFrom(o, c) { const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, l = Math.hypot(dx, dy, dz) || 1; return { x: dx / l, y: dy / l, z: dz / l }; }
  clearShot(from) {
    const c = Game.player.chest(), dx = c.x - from.x, dy = c.y - from.y, dz = c.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
    return !World.raycast(from, { x: dx / d, y: dy / d, z: dz / d }, d - 0.4);
  }
  headroom(h) { return !World.raycast({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, { x: 0, y: 1, z: 0 }, h, 0.4); }
  // within 45 degrees of straight behind it
  inBackWedge(p) {
    const f = this.fwd(), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    return d > 0.3 && (dx * f.x + dz * f.z) / d < -Math.SQRT1_2;
  }
  eyeGlint(c, size) { FX.glint(this.visorPos(), { c, size, dur: 0.24, follow: () => this.visorPos(), threat: this }); }

  // ---------- getting around ----------
  face(q, rate) { this.faceYaw = this.yawTo(q); this.turnRate = rate; }
  steerTo(q, spd) { const u = flat(q.x - this.pos.x, q.z - this.pos.z); this.want = { x: u.x, z: u.z, spd }; }
  blockedAhead(m, L) {
    const knee = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z };
    if (World.raycast(knee, { x: m.x, y: 0, z: m.z }, L, 0.3)) return true;
    const ax = this.pos.x + m.x * L, az = this.pos.z + m.z * L;
    return World.groundAt(ax, az, this.pos.y + 0.6) < this.pos.y - 1.2;
  }
  // Toward the player: straight when on its level with the way clear, else along the nav graph; links it can't
  // walk it leaps.
  pathTo(p, spd) {
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    const level = Math.abs(p.pos.y - this.pos.y) < 1.2, knee = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z };
    if (level && !World.raycast(knee, { x: dx / d, y: 0, z: dz / d }, d, 0.25) && !Foundry.crosses(this.pos, p.pos)) { this.want = { x: dx / d, z: dz / d, spd }; return; }
    const s = this.onGround ? Nav.steer(this, 99) : null;
    if (s) {
      if (s.kind === Nav.JUMP && this.cds.leap <= 0) { this.leapTo(s.to); return; }
      this.want = { x: s.x, z: s.z, spd };
      return;
    }
    // off the graph: leap to where the player is, if it can
    if (this.onGround && this.cds.leap <= 0 && Math.abs(p.pos.y - this.pos.y) > 1.5) {
      const q = this.spotNear(p.pos, 2.5, 5.5, true);
      if (q) { this.leapTo(q); return; }
    }
    this.want = { x: dx / d, z: dz / d, spd };
  }
  // it hasn't got anywhere for a while: leap to a clear spot near the player
  unstick(dt, p, trying) {
    const moved = Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    if (moved > 0.6 || !trying) { this.stuckT = 0; this.lastPos.x = this.pos.x; this.lastPos.z = this.pos.z; return; }
    this.stuckT += dt;
    if (this.stuckT > 1.4 && this.onGround && this.cds.leap <= 0) {
      const q = this.spotNear(p.pos, 3, 7, Math.abs(p.pos.y - this.pos.y) > 1.5);
      if (q) this.leapTo(q);
      this.stuckT = 0;
    }
  }
  // a clear spot for its body near c, rMin to rMax away; level: on c's own surface
  spotNear(c, rMin, rMax, level) {
    const B = Arena.bounds();
    for (let i = 0; i < 28; i++) {
      const a = rand(0, TAU), r = rand(rMin, rMax), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      if (x < B.minX + 2 || x > B.maxX - 2 || z < B.minZ + 2 || z > B.maxZ - 2) continue;
      const y = World.groundAt(x, z, c.y + 0.6);
      if (y === -Infinity || (level && Math.abs(y - c.y) > 0.7)) continue;
      if (!World.boxFree(x, y + 0.02, z, this.r, this.h)) continue;
      return { x, y, z };
    }
    return null;
  }
  // A leap up over whatever is between and down onto q, timed so it lands there; o.lift raises the arc over the
  // higher end, o.gk scales its gravity.
  leapTo(q, o = {}) {
    const g = this.G * (o.gk || this.LEAP_G), top = Math.max(this.pos.y, q.y) + (o.lift || 2.5);
    const room = World.raycast({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, { x: 0, y: 1, z: 0 }, top - this.pos.y, 0.4);
    const apex = room ? this.pos.y + Math.max(0.5, room.t - 0.2) : top;
    const vy = Math.sqrt(2 * g * Math.max(0.3, apex - this.pos.y)), T = vy / g + Math.sqrt(2 * Math.max(0.05, apex - q.y) / g);
    this.leap = { to: q, t: 0, T, g, vx: (q.x - this.pos.x) / T, vz: (q.z - this.pos.z) / T, attack: !!o.attack };
    this.vel.y = vy; this.onGround = false;
    this.cds.leap = 1.2;
    this.faceYaw = this.yawTo(q);
    this.leapFX();
    return this.leap;
  }
  leapFX() { Sound.play('jump', {}, this.pos); FX.dust(this.pos, 8, { smax: 4.5 }); }
  // open floor along m from here, up to L metres
  legRoom(m, L) {
    let free = L;
    for (const y of [0.5, 1.6]) {
      const h = World.raycast({ x: this.pos.x, y: this.pos.y + y, z: this.pos.z }, { x: m.x, y: 0, z: m.z }, L + this.r, 0.25);
      if (h) free = Math.min(free, h.t - this.r - 0.1);
    }
    // stop short of a drop
    for (let s = 1; s <= free; s += 1) {
      if (World.groundAt(this.pos.x + m.x * s, this.pos.z + m.z * s, this.pos.y + 0.5) < this.pos.y - 1.5) { free = s - 0.6; break; }
    }
    const B = Arena.bounds();
    for (let s = 0.5; s <= free; s += 0.5) {
      const x = this.pos.x + m.x * s, z = this.pos.z + m.z * s;
      if (x < B.minX + 1.5 || x > B.maxX - 1.5 || z < B.minZ + 1.5 || z > B.maxZ - 1.5) { free = s - 0.5; break; }
    }
    return Math.max(0, free);
  }
}
