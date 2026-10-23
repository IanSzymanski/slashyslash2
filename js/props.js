'use strict';
// Street lamps that come down. A slash through the pole or a blast beside it cuts it in two: the lamp's
// light goes out (a local rebake), its pole stops colliding, and the top topples about the cut, smashes on
// whatever it lands on and is gone, leaving a stump. Anything the falling pole lands on takes a hit. Lamps
// stand again on a new run or arena. The lamp list is the arena's (def.lamps, collider L.q from world.js).

const LAMP_H = 5.65, LAMP_R = 0.16;

const Props = {
  falling: [],
  lamps() { return (World.def && World.def.lamps) || []; },
  gfx() { return typeof Gfx !== 'undefined' && Gfx.renderer && Gfx.level; },

  // every lamp standing and lit
  reset() {
    let any = false;
    for (const L of this.lamps()) {
      if (L.state && L.state !== 'up') any = true;
      L.state = 'up'; L.light.off = false;
      if (L.q) L.q.on = true;
    }
    this.falling = [];
    if (this.gfx()) { Gfx.resetLamps(); if (any) Gfx.rebakeAll(); }
  },
  // a lamp's pole as a body, for the swing tests
  pole(L) { return { pos: { x: L.x, y: L.y0, z: L.z }, r: LAMP_R, h: LAMP_H, center: () => ({ x: L.x, y: L.y0 + 2.5, z: L.z }) }; },
  standing() { return this.lamps().filter((L) => L.state === 'up'); },

  // A blade through the poles that test(pole) says it meets: cut at height y, toppling along dir.
  slash(test, y, dir) {
    let n = 0;
    for (const L of this.standing()) if (test(this.pole(L))) { this.cut(L, y, dir); n++; }
    return n;
  },
  // A blast of radius R at c: lamps within it come down away from it, cut low.
  blast(c, R) {
    for (const L of this.standing()) {
      const dx = L.x - c.x, dz = L.z - c.z, d = Math.hypot(dx, dz);
      if (d > R + LAMP_R || c.y < L.y0 - 2.5 || c.y > L.y0 + LAMP_H + 1) continue;
      this.cut(L, L.y0 + clamp(c.y - L.y0, 0.6, 1.4), d > 1e-3 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 });
    }
  },
  cut(L, y, dir) {
    if (L.state !== 'up') return;
    const cy = clamp(y, L.y0 + 0.4, L.y0 + 4.6), l = Math.hypot(dir.x, dir.z);
    const dx = l > 1e-3 ? dir.x / l : 1, dz = l > 1e-3 ? dir.z / l : 0;
    L.state = 'falling'; L.light.off = true;
    if (L.q) L.q.on = false;
    const F = { L, t: 0, cy, len: L.y0 + LAMP_H - cy, dx, dz, ang: 0.04, av: 1.3, mesh: null };
    this.falling.push(F);
    const at = { x: L.x, y: cy, z: L.z }, head = { x: L.x, y: L.y0 + 5.5, z: L.z };
    // the cut: hot sparks off the blade's line, and the power arcing out at the head
    FX.sparks(at, 14, { x: dx, y: 0.3, z: dz }, 1.4, 4.5, 16, { c0: '#ffffff', c1: '#ffd070', c2: '#a03010' });
    FX.elec(head, 0.8, 4, { outer: '#ffd8a0', core: '#ffffff' });
    FX.sparks(head, 10, { x: 0, y: -1, z: 0 }, 2.4, 2, 7, { c0: '#ffffff', c1: '#ffe0a0', c2: '#6a4a20', g: 18, life: 1.4 });
    FX.light(head, '#ffe0a0', 5, 9, 0.18);
    Sound.play('lampCut', {}, at);
    if (this.gfx()) { F.mesh = Gfx.breakLamp(L, cy); Gfx.rebakeAround(L.light.x, L.light.y, L.light.z, L.light.range + 0.5); }
  },
  // the tip of a falling top, F.ang from upright toward F.d
  tip(F, k = 1) {
    const s = Math.sin(F.ang), c = Math.cos(F.ang), L = F.len * k;
    return { x: F.L.x + F.dx * L * s, y: F.cy + L * c, z: F.L.z + F.dz * L * s };
  },
  update(dt) {
    if (!this.falling.length) return;
    for (const F of this.falling) {
      F.t += dt;
      // a rod toppling about its foot: angular acceleration 3g sin(a) / 2L, with a lively g
      F.av += ((1.5 * 32) / Math.max(1, F.len)) * Math.sin(F.ang) * dt;
      F.ang += F.av * dt;
      // it comes down on whatever is under its length first: the street, a car, a wall
      let hitAt = null;
      for (const k of [1, 0.66, 0.33]) {
        const p = this.tip(F, k), g = World.groundAt(p.x, p.z, p.y + 0.3);
        if (p.y <= g + 0.12 || World.pointSolid(p.x, p.y, p.z)) { hitAt = p; break; }
      }
      if (hitAt || F.ang > Math.PI * 0.75 || F.t > 3) this.crash(F, hitAt || this.tip(F));
      else if (F.mesh) Gfx.poseLampTop(F);
    }
    this.falling = this.falling.filter((F) => !F.done);
  },
  // the top hits: glass bursts from the head, the pole breaks up, and what it landed on takes the blow
  crash(F, at) {
    F.done = true; F.L.state = 'down';
    const head = this.tip(F), base = { x: F.L.x, y: F.cy, z: F.L.z };
    FX.sparks(head, 18, { x: 0, y: 1, z: 0 }, 2.6, 4, 12, { c0: '#ffffff', c1: '#fff0c0', c2: '#8a8070', life: 0.9 });
    FX.debris(head, 10, ['#d8d0b8', '#ffe8b0', '#8a8070'], 9);
    FX.dust(at, 10, { smax: 5, rise: 0.6 });
    FX.debris(at, 8, GRIT, 8);
    FX.light(head, '#ffe0a0', 3, 6, 0.15);
    Sound.play('lampCrash', {}, at);
    Game.shake(0.12);
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const d = segDistXZ(e.pos.x, e.pos.z, base.x, base.z, head.x, head.z);
      const lo = Math.min(base.y, head.y) - 0.5, hi = Math.max(base.y, head.y) + 0.5;
      if (d > e.r + 0.45 || e.pos.y > hi || e.pos.y + e.h < lo) continue;
      hurtEnemy(e, 30, { kv: { x: F.dx * 9, y: 10.9, z: F.dz * 9 }, dir: { x: F.dx, y: -0.5, z: F.dz }, heavy: true, cause: 'lamp', stagger: 0.6, hitstop: 0.03 });
    }
    if (F.mesh) Gfx.smashLampTop(F);
  },
};
