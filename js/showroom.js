'use strict';
// The showroom: the character select screen's stage. While it's open the title screen's arena becomes a stage:
// the picked character stands on the arena's start spot on a ring of its own light, and the camera turns slowly
// round it (drag to turn it, the wheel to come in or pull back). It isn't a model on a turntable but the
// character itself: its class from the roster (roster.js), played by a script of inputs, so every animation
// and effect is the real one. On its own it idles through its idle demos (resting, a flourish, KRAG beating its
// fist into its palm); a skill picked on the screen plays that skill's demo on a loop. Each clip starts a fresh
// body on its mark, so nothing one clip does carries into the next.
// While it runs, Game.player is the body on the stage, so the renderer, the views and the afterimages draw it as
// they draw the player; Game.state stays 'menu', so no HUD, waves or enemies.

const Showroom = {
  active: false, id: null, puppet: null, stage: null, clip: null, demo: null, idleI: 0,
  down: new Set(), pressed: new Set(), released: new Set(), pending: [], move: { f: 0, r: 0 }, aim: null,
  orbit: 0.55, pitch: -0.12, zoom: 1, dist: 6, dragging: false, idleT: 0, built: false, ring: null, disc: null,
  // the steps of a demo that's playing, for the screen to show which skill is up
  onClip: null,

  // ---------- opening and closing ----------
  open(id) {
    if (!this.built) this.build();
    this.active = true;
    Game.upgrades = new Set();
    const s = World.def.playerStart, gy = World.groundAt(s.x, s.z, s.y + 1);
    this.stage = { x: s.x, y: gy === -Infinity ? s.y : gy, z: s.z, yaw: s.yaw || 0 };
    this.orbit = 0.55; this.pitch = -0.12; this.zoom = 1; this.idleT = 0;
    this.show(id);
    const C = Camera, P = this.puppet;
    C.pivot.x = P.pos.x; C.pivot.y = P.pos.y + P.M.H * 0.58; C.pivot.z = P.pos.z;
    C.curDist = this.dist = this.frameDist();
  },
  close() {
    if (!this.active) return;
    this.active = false;
    this.clear();
    if (this.puppet) this.puppet.stopAllLoops();
    if (Game.player === this.puppet) Game.player = null;
    this.puppet = null;
    for (const m of [this.ring, this.disc]) m.visible = false;
    // lamps a demo cut down stand again
    Props.reset();
  },
  // the stage cleared: sounds stopped, slow motion over, what the last clip left behind gone
  clear() {
    if (this.puppet) this.puppet.stopAllLoops();
    Game.endBulletTime();
    Game.slowScale = 1; Game.slowT = 0; Game.freezeT = 0; Game.cuts = [];
    Sound.setSlow(false);
    Game.projectiles = []; Game.hazards = [];
    FX.clear();
    this.release();
  },
  release() { this.down.clear(); this.pressed.clear(); this.released.clear(); this.pending = []; this.move = { f: 0, r: 0 }; this.aim = null; },
  // a different character on the stage, idling
  show(id) {
    this.id = charDef(id).id;
    this.demo = null; this.idleI = 0;
    this.clear();
    this.start(this.nextIdle());
  },
  // A skill's demo, on a loop; picked again, back to idling. Returns the demo now playing, if any.
  play(name) {
    const D = charDef(this.id).demos;
    this.demo = this.demo === name || !D[name] ? null : name;
    this.clear();
    this.start(this.demo || this.nextIdle());
    return this.demo;
  },
  nextIdle() { const L = charDef(this.id).idle || ['rest']; return L[this.idleI++ % L.length]; },

  // ---------- clips ----------
  start(name) {
    const d = charDef(this.id).demos[name] || [2];
    this.clip = { name, steps: Array.isArray(d) ? d : d.steps, view: (!Array.isArray(d) && d.view) || 1, i: 0, wait: 0 };
    Game.endBulletTime();
    this.release();
    this.spawn();
    if (this.onClip) this.onClip(this.demo);
  },
  finish() { this.start(this.demo || this.nextIdle()); },
  // a fresh body on its mark, in the state its roster entry puts it in
  spawn() {
    if (this.puppet) this.puppet.stopAllLoops();
    const S = this.stage, C = charDef(this.id), p = C.make({ x: S.x, y: S.y, z: S.z });
    p.yaw = S.yaw; p.hp = PC.MAX_HP; p.shield = PC.MAX_SHIELD; p.ultCharge = 0; p.onGround = true;
    // RONIN's blade sheathed, as at rest
    p.idleT = 3;
    if (C.prep) C.prep(p);
    this.puppet = p;
    Game.player = p;
  },
  // A clip's steps, in real seconds (so bullet time doesn't stretch them). A number waits that long.
  //   ['press', a] / ['release', a]: hold an action down / let it go; ['tap', a]: press it for a moment;
  //   ['hold', a, s]: hold it s seconds; ['move', forward, right]: walk (-1 to 1, from how it stands on its mark);
  //   ['aim', ahead, up, right]: the crosshair there, from where it stands; ['hit', dmg]: a blow lands on it from
  //   in front; ['set', fn]: fn(body); ['emote', name, s]: a pose by name (krag.js) for s seconds.
  run(realDt) {
    const C = this.clip, P = this.puppet;
    for (const q of this.pending) if ((q.t -= realDt) <= 0) this.up(q.a);
    this.pending = this.pending.filter((q) => q.t > 0);
    C.wait -= realDt;
    while (C.wait <= 0) {
      if (C.i >= C.steps.length) { this.finish(); return; }
      const s = C.steps[C.i++];
      if (typeof s === 'number') { C.wait += s; continue; }
      const [op, a, b, c] = s;
      if (op === 'press') this.press(a);
      else if (op === 'release') this.up(a);
      else if (op === 'tap') { this.press(a); this.pending.push({ a, t: 0.05 }); }
      else if (op === 'hold') { this.press(a); this.pending.push({ a, t: b }); C.wait += b; }
      else if (op === 'move') this.move = { f: a, r: b };
      else if (op === 'aim') this.aim = { f: a, u: b, r: c || 0 };
      else if (op === 'hit') this.blow(a);
      else if (op === 'set') a(P);
      else if (op === 'emote') { P.emote = { kind: a, t: 0, dur: b }; C.wait += b; }
    }
  },
  press(a) { if (!this.down.has(a)) { this.down.add(a); this.pressed.add(a); } },
  up(a) { if (this.down.has(a)) { this.down.delete(a); this.released.add(a); } },
  // the stage's frame: forward and right from how it stands on its mark
  axes() { const Y = this.stage.yaw; return { f: { x: fwdX(Y), z: fwdZ(Y) }, r: { x: Math.cos(Y), z: -Math.sin(Y) } }; },
  // a blow from an unseen attacker in front of it: a red streak across, then the hit
  blow(dmg) {
    const P = this.puppet, { f, r } = this.axes(), y = P.pos.y + P.chestH();
    const at = { x: P.pos.x + f.x * 1.8, y, z: P.pos.z + f.z * 1.8 };
    FX.slashLine({ x: at.x - r.x * 1.2, y: y + 0.5, z: at.z - r.z * 1.2 }, { x: at.x + r.x * 1.2, y: y - 0.3, z: at.z + r.z * 1.2 }, { w: 0.14, dur: 0.18, pal: 'red' });
    P.takeHit({ dmg, from: at, kind: 'melee', source: null, knock: 12 });
  },
  aimPoint() {
    const P = this.puppet, S = this.stage, { f, r } = this.axes(), A = this.aim || { f: 14, u: P.chestH(), r: 0 };
    return { x: P.pos.x + f.x * A.f + r.x * A.r, y: S.y + A.u, z: P.pos.z + f.z * A.f + r.z * A.r };
  },
  // The body's update runs on the script's input and a camera standing behind it on its mark looking at the
  // aim point; the real ones are put back after.
  withPuppet(fn) {
    const I = Input, C = Camera, P = this.puppet;
    const save = { isDown: I.isDown, wasPressed: I.wasPressed, wasReleased: I.wasReleased, yaw: C.yaw, pitch: C.pitch, pos: C.pos, dir: C.dir, aim: C.aim, aimEnemy: C.aimEnemy, curDist: C.curDist, fp: C.fp };
    const M = this.move, moving = { forward: M.f > 0.3, back: M.f < -0.3, right: M.r > 0.3, left: M.r < -0.3 };
    I.isDown = (a) => this.down.has(a) || !!moving[a];
    I.wasPressed = (a) => this.pressed.has(a);
    I.wasReleased = (a) => this.released.has(a);
    const { f } = this.axes(), A = this.aimPoint(), eye = { x: P.pos.x - f.x * 4, y: P.pos.y + P.chestH() + 0.6, z: P.pos.z - f.z * 4 };
    const dx = A.x - eye.x, dy = A.y - eye.y, dz = A.z - eye.z, l = Math.hypot(dx, dy, dz) || 1;
    C.yaw = this.stage.yaw; C.pitch = Math.asin(dy / l); C.pos = eye; C.dir = { x: dx / l, y: dy / l, z: dz / l };
    C.aim = A; C.aimEnemy = null; C.curDist = 4; C.fp = false;
    try { fn(); } finally {
      I.isDown = save.isDown; I.wasPressed = save.wasPressed; I.wasReleased = save.wasReleased;
      C.yaw = save.yaw; C.pitch = save.pitch; C.pos = save.pos; C.dir = save.dir; C.aim = save.aim; C.aimEnemy = save.aimEnemy; C.curDist = save.curDist; C.fp = save.fp;
    }
  },

  // ---------- time ----------
  // Game.step's clock without the waves, enemies or HUD: slow motion, hitstop and queued cuts in real time, the
  // body and what it throws at 120 Hz.
  step(realDt) {
    const G = Game;
    if (G.btT > 0) { G.btT -= realDt; if (G.btT <= 0) { G.btT = 0; G.btKind = null; G.btOwner = null; } }
    if (G.slowT > 0) { G.slowT -= realDt; if (G.slowT <= 0) { G.slowScale = 1; Sound.setSlow(false); } }
    for (let i = G.cuts.length - 1; i >= 0; i--) { const c = G.cuts[i]; if ((c.t -= realDt) <= 0) { G.cuts.splice(i, 1); c.fn(); } }
    this.run(realDt);
    if (G.freezeT > 0) { G.freezeT -= realDt; return; }
    G.acc += realDt * G.slowScale;
    const STEP = 1 / 120;
    let n = 0;
    while (G.acc >= STEP && n < 10) { this.tick(STEP); G.acc -= STEP; n++; }
    if (n >= 10) G.acc = 0;
  },
  tick(dt) {
    Game.time += dt;
    World.dyn.length = 0;
    const P = this.puppet;
    if (P.emote && (P.emote.t += dt) >= P.emote.dur) P.emote = null;
    this.withPuppet(() => P.update(dt));
    this.pressed.clear(); this.released.clear();
    // it can't fall off the stage for good: back on its mark
    if (P.dead || P.pos.y < this.stage.y - 30) { this.start(this.clip.name); return; }
    for (const b of Game.projectiles) b.update(dt);
    for (const h of Game.hazards) h.update(dt);
    Props.update(dt);
    FX.update(dt);
    Game.projectiles = Game.projectiles.filter((b) => !b.dead);
    Game.hazards = Game.hazards.filter((h) => !h.dead);
  },

  // ---------- the view ----------
  frameDist() { const P = this.puppet; return (P.M.H * 1.35 + 1.6) * this.zoom * (this.clip ? this.clip.view : 1); },
  // one rendered frame: the stage runs, and the camera circles the body (on its own, slowly, once you let go)
  frame(realDt) {
    this.step(realDt);
    Render.interp();
    const P = this.puppet, r = P.rp || P.pos, C = Camera;
    if (!this.dragging && (this.idleT += realDt) > 3) this.orbit += realDt * 0.12;
    this.dist = damp(this.dist, this.frameDist(), 4, realDt);
    C.base = null; C.fp = false;
    C.pivot.x = damp(C.pivot.x, r.x, 5, realDt); C.pivot.z = damp(C.pivot.z, r.z, 5, realDt);
    C.pivot.y = damp(C.pivot.y, r.y + P.M.H * 0.58, 5, realDt);
    C.yaw = this.stage.yaw + Math.PI + this.orbit; C.pitch = this.pitch;
    C.update(realDt, this.dist);
  },
  // dragging the stage turns the view round the body and tips it up and down; the wheel comes in and out
  drag(dx, dy) { this.orbit -= dx * 0.008; this.pitch = clamp(this.pitch - dy * 0.005, -0.7, 0.3); this.idleT = 0; },
  wheel(d) { this.zoom = clamp(this.zoom * Math.exp(d * 0.0012), 0.55, 1.8); this.idleT = 0; },
  // its ring of light on the street, and a key light from the camera's side with a rim in its own colour behind
  build() {
    const add = BossViews.add, G = BossViews.geos;
    this.built = true;
    this.ring = new THREE.Mesh(G.flatRing, add('#ffffff', { opacity: 0.8 }));
    this.disc = new THREE.Mesh(G.disc, add('#ffffff', { opacity: 0.12 }));
    for (const m of [this.ring, this.disc]) { m.visible = false; m.renderOrder = 2; Gfx.scene.add(m); }
  },
  sync() {
    if (!this.built) return;
    const on = this.active && !!this.puppet;
    this.ring.visible = this.disc.visible = on;
    if (!on) return;
    const S = this.stage, C = charDef(this.id), k = 0.5 + 0.5 * Math.sin(Game.realTime * 2), R = this.puppet.r * 2.6 + 0.4;
    this.ring.position.set(S.x, S.y + 0.04, S.z); this.disc.position.set(S.x, S.y + 0.035, S.z);
    this.ring.scale.setScalar(R); this.disc.scale.setScalar(R);
    this.ring.material.color.set(C.color); this.disc.material.color.set(C.color);
    this.ring.material.opacity = 0.55 + 0.3 * k; this.disc.material.opacity = 0.08 + 0.05 * k;
  },
  pushLights() {
    if (!this.active || !this.puppet) return;
    const P = this.puppet, r = P.rp || P.pos, C = charDef(this.id), cp = Camera.pos, H = P.M.H;
    const dx = cp.x - r.x, dz = cp.z - r.z, l = Math.hypot(dx, dz) || 1;
    Gfx.light(r.x + (dx / l) * 2.5, r.y + H + 1.2, r.z + (dz / l) * 2.5, '#fff2e8', 3.2, 9);
    Gfx.light(r.x - (dx / l) * 2, r.y + H * 0.8, r.z - (dz / l) * 2, C.color, 2.6, 6);
  },
};
