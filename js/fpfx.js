'use strict';
// First person's screen effects. Swings, dashes, hits and parries punch the field of view and roll the view
// on springs; the screen's edges flare gold on a parry or the counter and white on a dodge, darken red toward
// whatever hit you, and pulse at low health; speed lines streak in from the edges at a dash, a zip or a
// sprint. All of it is off in third person, in menus and in cutscenes. Camera.update steps it each frame.
// FOV punches and roll follow the "widen the view" setting; edge flares follow the flashes setting.

const FPFX = {
  BASE_FOV: 5,
  // springs: x is the offset, v its velocity; k the stiffness, z the damping ratio
  fovS: { x: 0, v: 0, k: 170, z: 0.5 }, rollS: { x: 0, v: 0, k: 260, z: 0.45 },
  energy: 0, eCol: [255, 214, 120], hurt: 0, hurtX: 50, hurtY: 50, guard: 0, speed: 0, kickSpeed: 0,
  lowT: 0, lines: [], lastImpact: 0, el: null, glow: null, live: false,
  // per kind: degrees of FOV (negative narrows), roll in radians, edge energy and its colour, hurt, speed.
  // Your own swings, dashes and slams get no edge colour: red at the edges means you were hurt, and only that.
  KICKS: {
    attack: { fov: 4, roll: 0.03 },
    finisher: { fov: 6, roll: 0.045 },
    heavy: { fov: 8, roll: 0.055 },
    draw: { fov: 10, roll: 0.025, speed: 0.9 },
    counter: { fov: 12, roll: 0.04, energy: 1, col: [255, 214, 120] },
    dash: { fov: 9, roll: 0.05, speed: 1 },
    jump: { fov: 3, speed: 0.4 },
    slam: { fov: -7, roll: 0.03 },
    impact: { fov: 1.6 },
    impactH: { fov: 3, roll: 0.012 },
    parry: { fov: -5, roll: 0.02, energy: 0.9, col: [255, 214, 120] },
    dodge: { fov: 7, energy: 0.7, col: [255, 255, 255], speed: 0.6 },
    hit: { fov: -8, roll: 0.075, hurt: 1 },
    guard: { fov: -4, roll: 0.04, guard: 1 },
  },
  on() { return Camera.fp && Game.state === 'playing' && !Game.cineActive(); },

  // kind from KICKS; o: { scale, side (-1 left .. 1 right, for the roll), dir (a world direction whose
  // sideways part sets the roll), from (a point a hit came from), col: [r, g, b] }
  kick(kind, o = {}) {
    if (!this.on()) return;
    const K = this.KICKS[kind];
    if (!K) return;
    const s = o.scale || 1;
    let side = o.side || 0;
    const rx = Math.cos(Camera.yaw), rz = -Math.sin(Camera.yaw), fx = fwdX(Camera.yaw), fz = fwdZ(Camera.yaw);
    if (o.dir) side = clamp(o.dir.x * rx + o.dir.z * rz, -1, 1);
    if (o.from) {
      const p = Game.player.pos, dx = o.from.x - p.x, dz = o.from.z - p.z, l = Math.hypot(dx, dz) || 1;
      side = (dx * rx + dz * rz) / l;
      const front = (dx * fx + dz * fz) / l;
      // the edge on the hit's side darkens most: the clear middle shifts away from it
      this.hurtX = 50 - side * 22; this.hurtY = 50 + Math.min(0, front) * -8;
    }
    if (K.fov) this.punch(this.fovS, K.fov * s);
    // a lean into a dash, a head knocked away from a hit, a tilt with the swing
    // (a hit from in front tips the head one way or the other at random)
    const hitSide = Math.abs(side) > 0.3 ? side : Math.random() < 0.5 ? -0.7 : 0.7;
    if (K.roll) this.punch(this.rollS, (kind === 'hit' || kind === 'guard' ? hitSide : kind === 'dash' ? -side : side || (Math.random() < 0.5 ? -1 : 1)) * K.roll * s);
    if (K.energy) {
      this.energy = Math.min(1, Math.max(this.energy, K.energy * s));
      this.eCol = o.col || K.col || [255, 214, 120];
    }
    if (K.hurt) this.hurt = Math.min(1, Math.max(this.hurt, K.hurt * s));
    if (K.guard) this.guard = Math.min(1, Math.max(this.guard, K.guard * s));
    if (K.speed) this.kickSpeed = Math.max(this.kickSpeed, K.speed * s);
  },
  // an enemy took damage: a small punch, at most every 50 ms
  impact(heavy) {
    if (Game.realTime - this.lastImpact < 0.05) return;
    this.lastImpact = Game.realTime;
    this.kick(heavy ? 'impactH' : 'impact');
  },
  // an impulse sized so the spring's first swing peaks at amount
  punch(S0, amount) {
    const w = Math.sqrt(S0.k), wd = w * Math.sqrt(1 - S0.z * S0.z), tp = Math.atan2(wd, S0.z * w) / wd;
    S0.v += amount / (Math.exp(-S0.z * w * tp) * Math.sin(wd * tp) / wd);
  },
  spring(S0, dt) {
    const w = Math.sqrt(S0.k);
    // substeps keep a stiff spring stable at a slow frame
    const n = Math.ceil(dt / 0.008), h = dt / n;
    for (let i = 0; i < n; i++) { S0.v += (-S0.k * S0.x - 2 * S0.z * w * S0.v) * h; S0.x += S0.v * h; }
  },
  get fov() { return S.camera.fovKick ? this.fovS.x : 0; },
  get roll() { return S.camera.fovKick ? this.rollS.x : 0; },
  reset() {
    this.fovS.x = this.fovS.v = this.rollS.x = this.rollS.v = 0;
    this.energy = this.hurt = this.guard = this.speed = this.kickSpeed = 0;
  },

  update(realDt) {
    const on = this.on(), p = Game.player;
    if (!on || !p) {
      this.reset();
      if (this.live) this.paint();
      return;
    }
    this.spring(this.fovS, realDt); this.spring(this.rollS, realDt);
    this.energy *= Math.exp(-realDt * 4.5);
    this.hurt *= Math.exp(-realDt * 2.4);
    this.guard *= Math.exp(-realDt * 4);
    this.kickSpeed *= Math.exp(-realDt * 3.5);
    // speed lines: dashes, drawn slashes, the tether's zip, a sprint, a long fall
    const hs = Controller.hspeed(p);
    let want = clamp((hs - PC.RUN) / (PC.SPRINT - PC.RUN), 0, 1) * 0.3;
    if (p.dashT > 0 || (p.iaido && !p.iaido.still)) want = 1;
    else if (p.zipping && p.zipping()) want = Math.max(want, 0.85);
    else if (!p.onGround && p.vel.y < -18) want = Math.max(want, clamp((-p.vel.y - 18) / 20, 0, 0.6));
    this.speed = damp(this.speed, want, want > this.speed ? 30 : 6, realDt);
    this.lowT += realDt;
    this.paint();
  },

  // the vignettes: a darkening layer (hits, low health) and a glowing one (energy), CSS gradients over the view
  paint() {
    if (!this.el) {
      this.el = document.getElementById('fpfx'); this.glow = document.getElementById('fpfx-glow');
      if (!this.el || !this.glow) return;
    }
    const p = Game.player, on = this.on() && p;
    const low = on && !p.dead ? clamp((40 - p.hp) / 40, 0, 1) : 0;
    let dark = '', lit = '';
    if (on) {
      const L = [];
      if (this.hurt > 0.01) L.push(`radial-gradient(ellipse at ${this.hurtX.toFixed(1)}% ${this.hurtY.toFixed(1)}%, rgba(150,0,16,0) 40%, rgba(150,0,16,${(0.75 * this.hurt).toFixed(3)}) 90%)`);
      if (low > 0) {
        // a heartbeat, faster as health falls
        const ph = (this.lowT * (1 + low * 0.6)) % 1, beat = Math.exp(-ph * 10) + (ph > 0.2 ? 0.6 * Math.exp(-(ph - 0.2) * 10) : 0);
        L.push(`radial-gradient(ellipse at center, rgba(90,0,10,0) 42%, rgba(90,0,10,${(low * (0.4 + 0.35 * beat)).toFixed(3)}) 100%)`);
      }
      dark = L.join(',');
      const G = [];
      if (S.visuals.flashes) {
        if (this.energy > 0.01) { const c = this.eCol; G.push(`radial-gradient(ellipse at center, rgba(${c[0]},${c[1]},${c[2]},0) 45%, rgba(${c[0]},${c[1]},${c[2]},${(0.75 * this.energy).toFixed(3)}) 100%)`); }
        if (this.guard > 0.01) G.push(`radial-gradient(ellipse at center, rgba(70,190,255,0) 42%, rgba(70,190,255,${(0.7 * this.guard).toFixed(3)}) 100%)`);
      }
      lit = G.join(',');
    }
    this.live = !!(dark || lit);
    if (this.el._bg !== dark) { this.el._bg = dark; this.el.style.background = dark; this.el.style.display = dark ? 'block' : 'none'; }
    if (this.glow._bg !== lit) { this.glow._bg = lit; this.glow.style.background = lit; this.glow.style.display = lit ? 'block' : 'none'; }
  },

  // speed lines on the HUD: thin wedges from the screen's edge toward its middle, redrawn as they flicker
  render(ctx, realDt) {
    const k = this.on() ? Math.max(this.speed, this.kickSpeed) : 0;
    if (k < 0.04) return;
    const cx = VIEW_W / 2, cy = VIEW_H / 2, R = Math.hypot(cx, cy);
    while (this.lines.length < 34) this.lines.push({ t: 0 });
    ctx.fillStyle = '#ffffff';
    for (const s of this.lines) {
      s.t -= realDt;
      if (s.t <= 0) { s.t = rand(0.05, 0.12); s.a = rand(0, TAU); s.r0 = rand(0.5, 0.78); s.w = rand(0.5, 1.6); s.o = rand(0.35, 1); }
      const r0 = R * (s.r0 + (1 - k) * 0.2), ca = Math.cos(s.a), sa = Math.sin(s.a), w = s.w * (0.6 + k);
      ctx.globalAlpha = k * s.o * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * R - sa * w * 2, cy + sa * R + ca * w * 2);
      ctx.lineTo(cx + ca * R + sa * w * 2, cy + sa * R - ca * w * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
