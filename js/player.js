'use strict';
// The cyborg swordsman: input, light and heavy strings, dash slash, parry and counter, shield and health,
// on the shared controller. Rules and timings follow the 2D player.js; reach and speeds are converted at
// PX = 1/11. Tether, plunge, slide attacks, wall kick and the utility arrive in Phase 2. There's no
// model yet: the stand-in figure in gfx.js stands where the player is.

const PC = Object.assign({}, MOVE, {
  HEIGHT: MOVE.H, RADIUS: MOVE.R, CHEST: 1.15,
  TETHER_RANGE: 21, TETHER_COST: 15,
  MAX_HP: 100, MAX_SHIELD: 100, SHIELD_DELAY: 3.0, SHIELD_RATE: 38,
  PARRY_COST: 15, PARRY_CD: 0.4, PARRY_CD_HIT: 0.25, STANCE_MAX: 0.9,
  // presses made while an action is busy are remembered this long
  INPUT_BUF: 0.12,
  // a dash that cancels an attack waits this long, so swinging isn't free
  CANCEL_RECOVERY: 0.1,
  // re-pressing parry within this time shrinks the window (to 50% at most)
  PARRY_SPAM_DECAY: 0.6,
  // below this much shield, a hit that breaks it carries its leftover damage
  SHIELD_OVERFLOW_AT: 25,
  // holding attack this long turns the press into a heavy; shorter presses are lights
  HEAVY_HOLD: 0.15,
  // the body turns to the aim while attacking or parrying, and for this long after
  FACE_AIM: 0.6,
  // melee aim assist: a swing turns onto the nearest enemy within this cone of the aim, out to reach times ASSIST_REACH
  ASSIST_CONE: (30 * Math.PI) / 180, ASSIST_REACH: 1.5,
});


// r: reach (m), span: arc (rad), band: half-height of the hit area around the chest, knock/launch/lunge: m/s.
// tilt: how far the trail's plane tips from horizontal.
const SWINGS = {
  1: { dur: 0.22, sweep: 0.075, act0: 0, act1: 0.11, span: 2.7, r: 3.27, band: 1.2, dmg: 14, knock: 10.9, hitstop: 0.035, shake: 0.08, fade: 0.14, tilt: 0.35 },
  3: { dur: 0.38, sweep: 0.12, act0: 0.03, act1: 0.18, span: 4.1, r: 4.9, band: 1.6, dmg: 32, knock: 30.9, hitstop: 0.08, shake: 0.28, fade: 0.22, lunge: 19.1, tilt: 0.55 },
};
// Heavy swings (hold attack). Times count from the start of the wind-up; act0/act1 bound the hit window.
// rise opens a string, crescent is a mid-string heavy, slam ends one.
const HEAVIES = {
  rise: { wind: 0.08, dur: 0.44, sweep: 0.12, act0: 0.08, act1: 0.21, span: 3.0, r: 4.18, band: 1.8, dmg: 30, knock: 16.4, launch: 30, hitstop: 0.07, shake: 0.24, fade: 0.24, lunge: 7.3, tilt: Math.PI / 2 },
  crescent: { wind: 0.08, dur: 0.46, sweep: 0.13, act0: 0.08, act1: 0.23, span: 3.7, r: 4.9, band: 1.6, dmg: 34, knock: 34.5, launch: 10, hitstop: 0.08, shake: 0.3, fade: 0.26, lunge: 18.2, tilt: 0.08 },
  slam: { wind: 0.11, dur: 0.58, sweep: 0.12, act0: 0.11, act1: 0.25, span: 3.4, r: 4.73, band: 1.8, dmg: 46, knock: 27.3, launch: 20, hitstop: 0.1, shake: 0.42, fade: 0.3, lunge: 10.9, quake: true, finisher: true, tilt: Math.PI / 2 },
};
// Drawn slashes: the dash attack, and the counter released after a parry. len: draw distance, path: cut radius.
const IAIDO = {
  dash: { len: 7.45, path: 1.27, dmg: 26, arcR: 4.18, span: 3.0, lineW: 0.22, delayed: false, empowered: false, chain: false, post: 0.16, flash: 0.08, shake: 0.18 },
  dashHeavy: { len: 10.9, path: 1.5, dmg: 42, arcR: 5.27, span: 3.6, lineW: 0.36, delayed: true, empowered: false, chain: false, post: 0.22, flash: 0.14, shake: 0.32, heavy: true },
  counter: { len: 15, path: 2.0, dmg: 135, arcR: 10.45, span: 4.4, lineW: 0.5, delayed: true, empowered: true, chain: true, post: 0.32, flash: 0.35, shake: 0.6 },
};

class Player {
  constructor(pos) {
    Controller.init(this, pos);
    this.isPlayer = true;
    this.rp = { x: pos.x, y: pos.y, z: pos.z };
    this.yaw = pos.yaw || 0;
    this.hp = PC.MAX_HP; this.shield = PC.MAX_SHIELD; this.shieldDelay = 0; this.shieldFlash = 0; this.regenOn = false;
    this.iframes = 0; this.hurtT = 0;
    this.dashBuf = 0; this.dashHold = 0; this.parryBuf = 0; this.parrySpam = 0; this.shieldWasFull = true; this.shieldFullFlash = 0;
    this.attack = null; this.comboTimer = 0; this.attackQueued = null; this.attackCD = 0;
    this.atkPend = null; this.strN = 0; this.strLights = 0; this.lastDir = 1;
    this.postPose = 0; this.sheathe = null; this.parryCD = 0; this.parryFlash = 0; this.iaido = null; this.shieldOffT = 0;
    this.tether = null; this.ult = null; this.ultCharge = 0; this.ultHold = 0;
    this.dead = false; this.deadT = 0; this.hoverAvail = true; this.animT = 0; this.stepT = 0; this.aimHold = 0;
    this.aim = { x: pos.x, y: pos.y + 1, z: pos.z - 10 }; this.aimDir = { x: 0, y: 0, z: -1 }; this.aimYaw = 0;
    this.hitMarks = [];
    this.loops = {};
    // animation: run cycle phase, double-jump flip, landing squash, time spent at rest
    this.runPhase = 0; this.spinT = 0; this.spinDur = 0.32; this.landSquash = 0; this.idleT = 0; this.blinkT = 0;
    this.onMove = (ev, d) => this.moveEvent(ev, d);
    this.initScarf();
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.55, z: this.pos.z }; }
  chestH() { return this.h >= PC.H ? PC.CHEST : this.h * 0.62; }
  chest() { return { x: this.pos.x, y: this.pos.y + this.chestH(), z: this.pos.z }; }
  head() { return { x: this.pos.x + fwdX(this.yaw) * 0.15, y: this.pos.y + this.h - 0.15, z: this.pos.z + fwdZ(this.yaw) * 0.15 }; }
  stopLoop(k) { if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; } }
  stopAllLoops() { for (const k in this.loops) this.stopLoop(k); }
  zipping() { return false; }
  releaseTether() { this.tether = null; }
  utility() { return null; }

  // Movement intent from the keys, relative to where the camera faces.
  intent() {
    const Y = Camera.yaw, fx = fwdX(Y), fz = fwdZ(Y), rx = Math.cos(Y), rz = -Math.sin(Y);
    const fb = (Input.isDown('forward') ? 1 : 0) - (Input.isDown('back') ? 1 : 0);
    const lr = (Input.isDown('right') ? 1 : 0) - (Input.isDown('left') ? 1 : 0);
    let mx = fx * fb + rx * lr, mz = fz * fb + rz * lr;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    return {
      mx, mz, jump: Input.wasPressed('jump'), jumpHeld: Input.isDown('jump'), jumpReleased: Input.wasReleased('jump'),
      crouch: Input.isDown('crouch'), crouchPressed: Input.wasPressed('crouch'),
    };
  }
  // The aim point is where the camera's crosshair ray lands (camera.js).
  updateAim() {
    const A = Camera.aim, c = this.chest();
    const dx = A.x - c.x, dy = A.y - c.y, dz = A.z - c.z, l = Math.hypot(dx, dy, dz) || 1;
    this.aim = A;
    this.aimDir = { x: dx / l, y: dy / l, z: dz / l };
    this.aimYaw = Math.hypot(dx, dz) > 0.05 ? yawOf(dx, dz) : Camera.yaw;
  }

  // ================= update =================
  update(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.animT += dt;
    this.updateAim();
    const dec = (k) => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    for (const k of ['iframes', 'hurtT', 'attackCD', 'postPose', 'parryCD', 'parryFlash', 'shieldOffT', 'shieldFlash', 'parryBuf', 'dashHold', 'shieldFullFlash', 'aimHold', 'spinT', 'landSquash', 'blinkT']) dec(k);
    Controller.timers(this, dt);
    for (const m of this.hitMarks) m.t -= dt;
    this.hitMarks = this.hitMarks.filter((m) => m.t > 0);
    this.parrySpam = Math.max(0, this.parrySpam - dt / PC.PARRY_SPAM_DECAY);
    if (this.onGround) this.hoverAvail = true;
    this.shieldDelay -= dt;
    if (this.shieldDelay <= 0 && this.shieldOffT <= 0 && this.shield < PC.MAX_SHIELD && !this.dead) {
      if (!this.regenOn) { this.regenOn = true; Sound.play('shieldRegen'); FX.ring(this.center(), 1.3, 0.5, 0.25, { c: '#2a8ad0', flat: false }); }
      this.shield = Math.min(PC.MAX_SHIELD, this.shield + PC.SHIELD_RATE * dt);
      if (this.shield >= PC.MAX_SHIELD) this.onShieldFull();
    } else if (this.shieldDelay > 0) this.regenOn = false;
    if (this.shield < PC.MAX_SHIELD - 0.5) this.shieldWasFull = false;

    if (this.dead) { this.updateDead(dt); return; }

    const I = this.intent();
    this.updateSheathe(dt);
    if (Input.wasPressed('dash')) { this.dashBuf = PC.INPUT_BUF; if (this.attack && !this.dashHold) this.dashHold = PC.CANCEL_RECOVERY; }
    this.updateDashBuffer(dt, I);
    if (Input.wasPressed('attack')) this.onAttackPressed(I.crouch);
    this.updateAttackInput(dt);
    Controller.buffer(this, I);

    // what the stance and swings do to movement (the 2D moveNormal modifiers)
    let sp = 1;
    if (this.sheathe) sp = this.onGround ? 38 / 152 : 70 / 152;
    if (this.attack && this.onGround) sp *= this.attack.heavy && this.attack.t <= this.attack.act1 ? 0.25 : 0.45;
    if (this.landLag > 0 || this.postPose > 0.12) sp *= 0.2;
    this.speedMul = sp;
    let gk = Game.gravMul();
    if (this.attack && !this.onGround && this.vel.y < 0) gk *= 0.45;
    if (this.sheathe && !this.onGround && this.sheathe.hover > 0) { gk *= 0.12; this.vel.y = Math.max(this.vel.y, -2.3); this.sheathe.hover -= dt; }
    this.gravK = gk;
    this.canJump = !this.sheathe;
    this.canSlide = !this.attack && !this.sheathe;

    if (this.dashT > 0) Controller.moveDash(this, dt);
    else if (this.iaido) this.moveIaido(dt);
    else if (!this.mantle) Controller.moveNormal(this, dt, I);
    const col = Controller.integrate(this, dt, I, { mantle: !this.attack && !this.iaido && !this.sheathe });
    if (this.iaido && col.wall) this.iaido.t = this.iaido.dur;

    this.updateAttack(dt);
    this.updateFacing(dt);
    const hs = Controller.hspeed(this);
    if (this.onGround && hs > 1.4) this.runPhase += hs * dt * 1.155;
    const busy = this.attack || this.sheathe || this.iaido || this.atkPend || this.dashT > 0 || this.hurtT > 0;
    this.idleT = this.onGround && hs < 0.5 && !busy ? this.idleT + dt : 0;
    this.updateScarf(dt);
    if (this.onGround && hs > 3.6 && !this.sliding) {
      this.stepT -= (dt * hs) / 13.6;
      if (this.stepT <= 0) { this.stepT = 0.26; Sound.play('step'); if (Math.random() < 0.4) FX.dust(this.pos, 1, { smax: 1.8 }); }
    }
    // fell out of the world: back to the start
    if (this.pos.y < -25) {
      const s = Arena.playerStart();
      this.pos.x = this.prev.x = s.x; this.pos.y = this.prev.y = s.y; this.pos.z = this.prev.z = s.z;
      this.vel.x = this.vel.y = this.vel.z = 0;
    }
  }
  // While attacking or parrying (and for FACE_AIM after) the body faces the aim; otherwise where it's going.
  updateFacing(dt) {
    if (this.attack || this.sheathe || this.atkPend || this.iaido) this.aimHold = PC.FACE_AIM;
    let want = null;
    if (this.iaido) want = yawOf(this.iaido.dir.x, this.iaido.dir.z);
    else if (this.attack) want = this.attack.yaw;
    else if (this.dashT > 0) want = yawOf(this.dashVX, this.dashVZ);
    else if (this.aimHold > 0) want = this.aimYaw;
    else if (Controller.hspeed(this) > 1) want = yawOf(this.vel.x, this.vel.z);
    if (want !== null) this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * (this.attack || this.iaido ? 40 : 14));
  }
  moveEvent(ev, d) {
    const p = this.pos;
    if (ev === 'jump') { Sound.play('jump'); FX.dust(p, 4, { smax: 3.2, rise: 0.4 }); }
    else if (ev === 'djump') {
      this.spinT = this.spinDur;
      Sound.play('djump');
      FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.2, 1.1, 0.22, { c: '#ff3a52' });
      FX.sparks(p, 6, { x: 0, y: -1, z: 0 }, 2.2, 3.6, 10.9);
    } else if (ev === 'slide') { Sound.play('slide'); FX.dust(p, 5, { smax: 4.5 }); }
    else if (ev === 'land') {
      this.spinT = 0;
      if (d.vy < -18.2) { this.landSquash = 0.12; Sound.play('land', { v: clamp(-d.vy / 36.4, 0.4, 1.2) }); FX.dust(p, 4 + ((-d.vy / 9) | 0), { smax: 3.6 }); }
      if (Input.isDown('crouch') && Controller.hspeed(this) > PC.SLIDE_MIN && !this.attack && !this.sheathe && !this.iaido) Controller.startSlide(this);
    } else if (ev === 'dash') {
      Sound.play('dash');
      const c = this.chest();
      FX.ring(c, 0.2, 1.3, 0.18, { c: '#ff3a52', flat: false });
      FX.sparks(c, 8, { x: -d.x, y: 0, z: -d.z }, 1.2, 5.5, 18);
      FX.light(c, '#ff3048', 3, 4, 0.15);
      Game.shake(0.06);
    } else if (ev === 'mantle') Sound.play('step');
  }

  // ---------- dash ----------
  // Finishers and heavies can't be cancelled until their blade has done its work.
  committed() {
    const a = this.attack;
    return !!a && (a.finisher || a.heavy) && a.t <= a.act1;
  }
  updateDashBuffer(dt, I) {
    if (this.dashBuf <= 0) return;
    const waiting = this.committed() || this.dashHold > 0;
    if (!waiting && this.dashCharges > 0 && this.dashT <= 0 && !this.iaido) { this.dashBuf = 0; this.dashHold = 0; this.tryDash(I); return; }
    // a dash held back by an attack stays queued until the attack allows it
    if (!waiting) this.dashBuf -= dt;
  }
  // Along the held direction relative to the camera, or the camera's forward when none is held.
  tryDash(I) {
    if (this.dashCharges <= 0 || this.dashT > 0 || this.iaido) return;
    let dx = I.mx, dz = I.mz;
    if (Math.hypot(dx, dz) < 0.1) { dx = fwdX(Camera.yaw); dz = fwdZ(Camera.yaw); }
    if (this.sheathe) this.cancelSheathe();
    this.attack = null; this.attackQueued = null; this.postPose = 0; this.landLag = 0;
    if (!Controller.tryDash(this, dx, dz)) return;
    this.iframes = Math.max(this.iframes, PC.DASH_IFRAMES);
    this.yaw = yawOf(dx, dz);
  }

  // ---------- melee ----------
  // A tap is a light, a hold (PC.HEAVY_HOLD) is a heavy. Dash attacks lock their context at the press.
  onAttackPressed() {
    if (this.sheathe || this.iaido || this.ultHold > 0) return;
    this.atkPend = { t: 0, dash: this.dashT > 0 || this.dashEndT > 0 };
  }
  updateAttackInput(dt) {
    const P = this.atkPend;
    if (!P) return;
    P.t += dt;
    const held = Input.isDown('attack');
    if (held && P.t < PC.HEAVY_HOLD) return;
    this.atkPend = null;
    this.resolveAttack(held ? 'H' : 'L', P.dash);
  }
  resolveAttack(kind, dash) {
    if (this.sheathe || this.iaido || this.ultHold > 0 || this.dead) return;
    if (kind === 'H') {
      Sound.play('heavyDraw');
      const c = this.chest();
      FX.ring(c, 0.2, 1.1, 0.16, { c: '#ff3a52', flat: false });
      FX.light(c, '#ff3048', 3, 3, 0.12);
    }
    if (dash || this.dashT > 0 || this.dashEndT > 0) { this.dashAttack(kind); return; }
    if (this.attack || this.attackCD > 0) { this.attackQueued = kind; return; }
    this.startString(kind, false);
  }
  stringLive() { return this.comboTimer > 0 && this.strN > 0 && this.strN < 4; }
  // Attacking during (or right after) a dash turns it into a drawn slash along the aim.
  dashAttack(kind = 'L') {
    this.dashT = 0; this.dashEndT = 0;
    this.attack = null; this.attackQueued = null;
    this.startIaido(kind === 'H' ? IAIDO.dashHeavy : IAIDO.dash);
    this.iaido.kind = kind;
  }
  // The basic string: up to four hits mixing lights and heavies (L H L, H L L H, L L H...).
  // Three lights in a row, or a light fourth hit, end in the lunging finisher; a heavy third or fourth hit ends in a slam.
  startString(kind, chained) {
    const cont = (chained || this.comboTimer > 0) && this.strN > 0 && this.strN < 4;
    const n = cont ? this.strN + 1 : 1, lights = cont ? this.strLights : 0;
    let type;
    if (kind === 'L') type = lights >= 2 || n >= 4 ? 'L3' : 'L';
    else type = n >= 3 ? 'slam' : n === 1 ? 'rise' : 'crescent';
    this.startSwing(type, cont);
    this.strN = n; this.strLights = kind === 'L' ? lights + 1 : 0;
    if (this.attack.finisher) { this.strN = 0; this.strLights = 0; }
  }
  // Melee aim assist: the nearest enemy within the cone of the aim and reach times ASSIST_REACH.
  assistTarget(reach) {
    const c = this.chest();
    let best = null, bd = Infinity;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz) - e.r;
      if (d > reach * PC.ASSIST_REACH || Math.abs(e.pos.y + e.h / 2 - c.y) > 3) continue;
      if (d > 0.4 && Math.abs(angDiff(this.aimYaw, yawOf(dx, dz))) > PC.ASSIST_CONE) continue;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  startSwing(type, cont) {
    const heavy = type !== 'L' && type !== 'L3';
    const d = heavy ? HEAVIES[type] : SWINGS[type === 'L3' ? 3 : 1];
    const target = this.assistTarget(d.r);
    const yaw = target ? yawOf(target.pos.x - this.pos.x, target.pos.z - this.pos.z) : this.aimYaw;
    this.yaw = yaw;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, PC.H)) { this.crouching = true; Controller.setHeight(this, PC.CROUCH_H); } }
    // lights alternate direction; a rising heavy sweeps upward, a slam comes down over the top
    let dir = 1;
    if (type === 'L' || type === 'crescent') dir = cont ? -this.lastDir : 1;
    else if (type === 'slam') dir = -1;
    this.lastDir = dir;
    const tilt = d.tilt === Math.PI / 2 ? d.tilt : -d.tilt * dir;
    this.attack = Object.assign({ type, heavy, finisher: type === 'L3', stage: type === 'L3' ? 3 : 1, wind: 0, t: 0, yaw, dir, pitch: this.aimDir.y, target, hit: new Set(), swept: false }, d, { tilt });
    this.attackQueued = null; this.postPose = 0;
    if (!heavy) this.beginSweep(this.attack);
    else if (type === 'rise' && !this.onGround) this.vel.y = Math.max(this.vel.y, 5.5);
  }
  // The blade starts moving: lights at once, heavies after their wind-up.
  beginSweep(a) {
    a.swept = true;
    FX.swoosh({
      follow: this, oy: this.chestH(), yaw: a.yaw, tilt: a.tilt, r: a.r, span: a.span, dir: a.dir,
      sweep: a.sweep, dur: a.sweep + a.fade, thick: a.heavy ? 0.5 : 0.35, pal: 'red', trail: a.heavy ? 1 : a.stage === 3 ? 0.95 : 0.85,
    });
    Sound.play('swing', { stage: a.stage === 3 || a.heavy ? 3 : 1 });
    if (a.heavy) Sound.play('heavySwing');
    const fx = fwdX(a.yaw), fz = fwdZ(a.yaw);
    // with an assisted target, close the gap to it rather than overshoot (ground friction stops a lunge in ~v^2/300 m)
    const gap = a.target ? distXZ(a.target.pos, this.pos) - a.target.r - this.r - a.r * 0.5 : Infinity;
    const close = gap === Infinity ? Infinity : Math.sqrt(300 * Math.max(0, gap));
    if (a.lunge) {
      const L = Math.min(a.lunge, close);
      this.vel.x = this.vel.x * 0.3 + fx * L; this.vel.z = this.vel.z * 0.3 + fz * L;
      if (!this.onGround) this.vel.y = Math.max(this.vel.y, a.pitch * a.lunge * 0.6);
      Game.shake(a.heavy ? 0.1 : 0.06);
    } else if (close < Infinity && close > 3.6) {
      const L = Math.min(12, close);
      this.vel.x = fx * L; this.vel.z = fz * L;
    } else if (this.onGround) { this.vel.x += fx * 3.6; this.vel.z += fz * 3.6; }
    if (a.type === 'rise' && !this.onGround) this.vel.y = Math.max(this.vel.y, 13.6);
    if (!this.onGround && this.vel.y < 0) this.vel.y *= 0.4;
    const c = this.chest();
    FX.light({ x: c.x + fx * a.r * 0.6, y: c.y, z: c.z + fz * a.r * 0.6 }, '#ff2040', 3.5, a.r * (a.heavy ? 2 : 1.6), a.sweep + a.fade);
  }
  // A sector in front of the chest within reach, inside a vertical band around the aimed height.
  inSwing(a, c, reach, e) {
    const dx = e.pos.x - c.x, dz = e.pos.z - c.z, d = Math.hypot(dx, dz);
    if (d - e.r > reach) return false;
    const mid = c.y + clamp(a.pitch, -0.8, 0.8) * reach * 0.5;
    if (e.pos.y > mid + a.band || e.pos.y + e.h < mid - a.band) return false;
    if (d < e.r + 0.4) return true;
    return Math.abs(angDiff(a.yaw, yawOf(dx, dz))) <= a.span / 2 + Math.atan2(e.r, d);
  }
  updateAttack(dt) {
    if (!this.attack) {
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) { this.strN = 0; this.strLights = 0; } }
      if (this.attackQueued && this.attackCD <= 0 && !this.sheathe && !this.iaido && this.dashT <= 0) {
        const k = this.attackQueued;
        this.attackQueued = null;
        this.startString(k, false);
      }
      return;
    }
    const a = this.attack;
    a.t += dt;
    if (!a.swept && a.t >= a.wind) this.beginSweep(a);
    if (a.swept && a.t >= a.act0 && a.t <= a.act1) {
      const c = this.chest(), reach = a.r + 0.27;
      const big = a.finisher || a.heavy, brk = Game.has('breaker');
      const fx = fwdX(a.yaw), fz = fwdZ(a.yaw);
      let any = false;
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || a.hit.has(e) || !this.inSwing(a, c, reach, e)) continue;
        a.hit.add(e);
        any = true;
        const mul = brk ? (a.finisher || a.type === 'slam' ? 1.6 : a.heavy ? 1 : 0.8) : 1;
        let up;
        if (a.heavy) up = a.type === 'slam' && !this.onGround ? -18.2 : a.launch + (brk && a.type === 'slam' ? 13.6 : 0);
        else up = a.pitch * a.knock * 0.5 + (big ? (brk ? 27.3 : 12.7) : 4.5);
        hurtEnemy(e, a.dmg * mul, {
          kv: { x: fx * a.knock, y: up, z: fz * a.knock }, dir: { x: fx, y: 0.2, z: fz }, heavy: big, cause: a.heavy ? 'heavy' : 'slash', heavyAtk: a.heavy,
          stagger: a.heavy ? 0.7 : big ? 0.55 : 0.22, hitstop: a.hitstop, shake: a.shake, guardBreak: a.heavy,
        });
      }
      if (any && !this.onGround) { this.vel.y = Math.max(this.vel.y, 6.8); this.airJumps = Math.max(this.airJumps, 0); }
    }
    if (a.quake && !a.quaked && a.swept && a.t >= a.act0 + 0.04) {
      a.quaked = true;
      if (this.onGround) this.slamQuake();
    }
    const cancelT = a.heavy ? a.act1 + 0.05 : 0.13;
    if (this.attackQueued && a.t >= cancelT && !a.finisher) { const k = this.attackQueued; this.attackQueued = null; this.startString(k, true); return; }
    if (a.t >= a.dur) {
      this.attack = null;
      this.comboTimer = a.finisher ? 0 : a.heavy ? 0.5 : 0.42;
      if (a.finisher) { this.strN = 0; this.strLights = 0; this.attackCD = a.heavy ? 0.16 : 0.1; }
    }
  }
  // The heavy finisher hits the street hard. Its ground wave (an expanding ring) arrives in Phase 2.
  slamQuake() {
    const f = { x: this.pos.x + fwdX(this.yaw) * 1.3, y: this.pos.y + 0.05, z: this.pos.z + fwdZ(this.yaw) * 1.3 };
    FX.ring(f, 0.4, 5.3, 0.35, { c: '#ff3048' });
    FX.dust(f, 12, { smax: 9, rise: 0.8 });
    FX.debris(f, 14, ['#4a4252', '#5c5464', '#3a3442', '#6e6678'], 20);
    FX.light(f, '#ff3048', 5, 9, 0.3);
    FX.flash('#ff3048', 0.14);
    Sound.play('slam');
    Game.shake(0.3);
  }

  // ---------- parry stance / iaido ----------
  // E opens a parry stance that costs shield. It only attacks after a successful parry.
  updateSheathe(dt) {
    if (Input.wasPressed('sheathe')) {
      if (this.parryCD > PC.INPUT_BUF && !this.sheathe) { Sound.play('denied'); this.parryFlash = 0.35; }
      else this.parryBuf = PC.INPUT_BUF;
    }
    if (this.parryBuf > 0 && !this.sheathe && !this.iaido && this.dashT <= 0 && this.ultHold <= 0 && this.parryCD <= 0) {
      this.parryBuf = 0;
      this.tryStance();
    }
    const s = this.sheathe;
    if (!s) return;
    s.t += dt;
    const sp = { x: this.pos.x - fwdX(this.yaw) * 0.45, y: this.pos.y + 0.65, z: this.pos.z - fwdZ(this.yaw) * 0.45 };
    if (s.empowered) {
      if (Math.random() < 0.8) FX.elec(sp, 0.9, 1, { outer: '#ffb040', core: '#ffffff' });
      if (Math.random() < 0.4) FX.sparks(sp, 1, { x: 0, y: 1, z: 0 }, 1.5, 1.8, 5.5, { g: -5, c1: '#ffd070' });
    } else if (s.t <= s.parryUntil && Math.random() < 0.5) FX.elec(sp, 0.5, 1);
    const maxT = s.empowered ? s.parriedAt + 1.0 : PC.STANCE_MAX;
    if (!Input.isDown('sheathe') || s.releaseQueued || s.t >= maxT) this.releaseSheathe();
  }
  tryStance() {
    if (this.parryCD > 0) { Sound.play('denied'); this.parryFlash = 0.35; return; }
    if (!S.gameplay.invincible && this.shield < PC.PARRY_COST) {
      Sound.play('noShield');
      this.shieldFlash = 0.5;
      FX.text('NO SHIELD', { x: this.pos.x, y: this.pos.y + 2.6, z: this.pos.z }, { c: '#5ad8ff', always: true, dur: 0.6, vy: 1.8 });
      return;
    }
    this.shield = Math.max(0, this.shield - PC.PARRY_COST);
    this.shieldDelay = Math.max(this.shieldDelay, 1.4); this.regenOn = false;
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, PC.H)) { this.crouching = true; Controller.setHeight(this, PC.CROUCH_H); } }
    // pressing again right after a stance shrinks the window, so mashing is worse than timing
    const win = S.gameplay.parryWindow * (Game.has('openGuard') ? 1.6 : 1) * (1 - 0.25 * Math.min(2, Math.ceil(this.parrySpam - 0.01)));
    this.parrySpam = Math.min(3, this.parrySpam + 1);
    this.sheathe = { t: 0, charge: 0, empowered: false, parryUntil: win, hover: this.hoverAvail ? 1.0 : 0, parried: 0, parriedAt: 0, refunded: false, releaseQueued: false };
    if (!this.onGround) this.hoverAvail = false;
    Sound.play('sheathe');
    this.eyeGlint('#ffe0a0', 0.6);
  }
  // Parry tells are a quick glint from the eye, never a ring around the body (rings read as shields).
  eyeGlint(c, size) {
    FX.glint(this.head(), { c, size, dur: 0.22, follow: () => this.head() });
  }
  parryActive() { return !!this.sheathe && this.sheathe.t <= this.sheathe.parryUntil; }
  cancelSheathe() {
    this.stopLoop('charge');
    this.sheathe = null;
    this.parryCD = Math.max(this.parryCD, PC.PARRY_CD);
  }
  releaseSheathe() {
    const s = this.sheathe;
    // A tap still holds the stance through the parry window, so tap-parrying works.
    if (s.t < s.parryUntil && !s.parried) { s.releaseQueued = true; return; }
    this.stopLoop('charge');
    this.sheathe = null;
    if (s.empowered) { this.parryCD = PC.PARRY_CD_HIT; this.startIaido(IAIDO.counter); }
    else { this.parryCD = s.parried ? PC.PARRY_CD_HIT : PC.PARRY_CD; Sound.play('unsheathe'); }
  }
  doParry(h) {
    const s = this.sheathe;
    s.parried++;
    this.parrySpam = 0;
    // some foes meet a parry blade to blade: no counter, they guard instead
    const clash = !!(h.source && h.source.clashes && h.source.clashes(h));
    if (!s.empowered && !clash) {
      s.empowered = true; s.parriedAt = s.t; s.charge = 1;
      this.loops.charge = Sound.loop('charge');
      this.loops.charge.set(1);
    }
    s.parryUntil = s.t + 0.32;
    if (!s.refunded && this.shieldOffT <= 0 && !Game.has('openGuard')) {
      s.refunded = true;
      this.shield = Math.min(PC.MAX_SHIELD, this.shield + PC.PARRY_COST);
    }
    Sound.play('parry');
    Game.slowmo(0.22, 0.42);
    Game.hitstop(0.07);
    Game.shake(0.28);
    FX.flash('#ffffff', 0.3);
    const c = this.chest(), from = h.from || { x: c.x + fwdX(this.yaw), y: c.y, z: c.z + fwdZ(this.yaw) };
    const dx = from.x - c.x, dy = from.y - c.y, dz = from.z - c.z, l = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / l, y: dy / l, z: dz / l };
    this.eyeGlint('#ffd070', 1.6);
    FX.sparks({ x: c.x + dir.x * 0.7, y: c.y + dir.y * 0.7, z: c.z + dir.z * 0.7 }, 22, dir, 1.6, 7.3, 27.3, { c0: '#ffffff', c1: '#ffe080', c2: '#ff5a3a' });
    FX.elec(c, 2, 6, { outer: '#ffb040', core: '#ffffff' });
    FX.light(c, '#ffe0a0', 5, 8, 0.4);
    if (h.source && h.source.stagger) {
      const hl = Math.hypot(dx, dz) || 1;
      h.source.stagger(1.3, { x: (dx / hl) * 20, y: 0, z: (dz / hl) * 20 });
    }
    this.iframes = Math.max(this.iframes, 0.2);
    Game.stats.parries++;
  }
  // A drawn slash along the aim, kept near level so it doesn't bury itself in the street.
  startIaido(cfg) {
    const s = this.chest();
    let dir = { x: this.aimDir.x, y: clamp(this.aimDir.y, -0.3, 0.55), z: this.aimDir.z };
    const t = this.assistTarget(cfg.len * 0.75);
    if (t) { const tc = t.center(); dir = { x: tc.x - s.x, y: clamp((tc.y - s.y) / (distXZ(tc, s) || 1), -0.3, 0.55), z: tc.z - s.z }; }
    const hl = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= hl; dir.z /= hl;
    const l = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    let len = cfg.len;
    // an assisted draw runs through its target
    if (t) len = clamp(dist3(t.center(), s) + 1.2, cfg.len * 0.5, cfg.len * 1.3);
    const hit = World.raycast(s, dir, len + 0.7, 0.3);
    if (hit) len = Math.max(0, hit.t - 0.7);
    this.yaw = yawOf(dir.x, dir.z);
    const D = 0.09;
    this.iaido = { t: 0, dur: D, dir, cfg, len, s, hit: new Set(), vx: (dir.x * len) / D, vy: (dir.y * len) / D, vz: (dir.z * len) / D };
    this.iframes = Math.max(this.iframes, cfg.empowered ? 0.5 : 0.3);
    if (this.crouching && Controller.canStand(this)) { this.crouching = false; Controller.setHeight(this, PC.H); }
    if (this.sliding) { this.sliding = false; Controller.setHeight(this, PC.H); }
    FX.slashLine(s, { x: s.x + dir.x * len, y: s.y + dir.y * len, z: s.z + dir.z * len }, { w: cfg.lineW, dur: cfg.empowered ? 0.45 : 0.3, pal: cfg.empowered ? 'gold' : 'red' });
    if (cfg.empowered) Sound.play('iaido', { power: 1, empowered: true });
    else Sound.play('quickdraw');
    if (cfg.heavy) Sound.play('heavySwing');
    Game.shake(cfg.shake);
    FX.flash(cfg.empowered ? '#fff4d0' : '#ff3048', cfg.flash);
    Game.hitstop(cfg.empowered ? 0.045 : 0.02);
    FX.light(s, cfg.empowered ? '#ffe0a0' : '#ff3048', 4, cfg.empowered ? 9 : 5, 0.3);
    if (cfg.empowered) Game.slowmo(0.3, 0.3);
  }
  moveIaido(dt) {
    const I = this.iaido;
    I.t += dt;
    this.vel.x = I.vx; this.vel.y = I.vy; this.vel.z = I.vz;
    const c = this.chest(), lo = Math.min(I.s.y, c.y) - 1.3, hi = Math.max(I.s.y, c.y) + 1.3;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || I.hit.has(e)) continue;
      if (segDistXZ(e.pos.x, e.pos.z, I.s.x, I.s.z, c.x, c.z) < e.r + I.cfg.path && e.pos.y < hi && e.pos.y + e.h > lo) {
        I.hit.add(e);
        this.iaidoMark(e);
      }
    }
    if (I.t >= I.dur) this.finishIaido();
  }
  finishIaido() {
    const I = this.iaido, cfg = I.cfg;
    this.iaido = null;
    this.vel.x *= 0.15; this.vel.z *= 0.15; this.vel.y = Math.max(this.vel.y * 0.15, 0);
    const c = this.chest(), yaw = yawOf(I.dir.x, I.dir.z);
    // the closing arc swings the other way from the last swing
    const dir = (this.lastDir = -this.lastDir);
    FX.swoosh({ x: c.x, y: c.y, z: c.z, oy: 0, yaw, tilt: cfg.empowered ? 0.2 : 0, r: cfg.arcR, span: cfg.span, dir, sweep: 0.08, dur: cfg.empowered ? 0.38 : 0.26, thick: 0.45, pal: cfg.empowered ? 'gold' : 'red', trail: 1 });
    const arc = { yaw, span: cfg.span, pitch: 0, band: 1.8 };
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || I.hit.has(e) || !this.inSwing(arc, c, cfg.arcR, e)) continue;
      I.hit.add(e);
      this.iaidoMark(e);
    }
    if (cfg.delayed && I.hit.size) {
      Game.slowmo(cfg.empowered ? 0.35 : 0.6, cfg.empowered ? 0.36 : 0.18);
      Game.queueCut(cfg.empowered ? 0.34 : 0.18, () => this.resolveIaido(I));
    } else this.resolveIaido(I);
    if (cfg.chain) this.chainLightning(c, I);
    this.postPose = cfg.post;
    // a dash slash opens a string: follow it with lights or heavies
    if (I.kind) { this.strN = 1; this.strLights = I.kind === 'L' ? 1 : 0; this.comboTimer = 0.45; }
    else { this.strN = 0; this.strLights = 0; }
  }
  iaidoMark(e) {
    if (e.isEnemy) e.cutMark = 1;
    FX.sparks(e.center(), 6, null, TAU, 3.6, 12.7);
  }
  resolveIaido(I) {
    const cfg = I.cfg;
    let n = 0, kills = 0;
    const hx = I.dir.x, hz = I.dir.z;
    for (const e of I.hit) {
      if (e.dead) continue;
      e.cutMark = 0;
      if (cfg.delayed) {
        const c = e.center(), a = rand(0, TAU), L = Math.max(e.r * 2, e.h) * 0.8 + 0.5;
        const ax = Math.cos(a) * fwdZ(this.yaw), az = -Math.cos(a) * fwdX(this.yaw), ay = Math.sin(a);
        FX.slashLine({ x: c.x - ax * L, y: c.y - ay * L, z: c.z - az * L }, { x: c.x + ax * L, y: c.y + ay * L, z: c.z + az * L }, { w: 0.16, dur: 0.25, grow: 0.03, pal: cfg.empowered ? 'gold' : 'red' });
      }
      const k = cfg.heavy ? 32.7 : 25.5;
      hurtEnemy(e, cfg.dmg, { kv: { x: hx * k, y: cfg.heavy ? 23.6 : 16.4, z: hz * k }, dir: { x: hx, y: 0.3, z: hz }, heavy: true, cause: 'iaido', stagger: cfg.empowered ? 0.9 : cfg.heavy ? 0.7 : 0.45, hitstop: 0, shake: 0, crit: cfg.empowered, guardBreak: cfg.heavy, heavyAtk: cfg.heavy && !cfg.empowered });
      if (cfg.empowered && (e.dead || e.dying)) kills++;
      n++;
    }
    if (kills) this.counterHeal(kills);
    if (n && cfg.delayed) {
      Sound.play('cut');
      Game.shake(0.25 + n * 0.05);
      Game.hitstop(0.06);
      FX.flash(cfg.empowered ? '#fff6e0' : '#ffffff', 0.2);
    } else if (n) Game.hitstop(0.04);
  }
  // kills from a parry counter (and its chain lightning) patch you up a little
  counterHeal(kills) {
    if (this.dead) return;
    const n = Math.min(12, kills * 4);
    this.heal(n);
    FX.text('+' + n + ' HP', { x: this.pos.x, y: this.pos.y + 3.2, z: this.pos.z }, { c: '#7dff8a', always: true, dur: 0.8, vy: 1.8 });
  }
  chainLightning(c, I) {
    const arc = Game.has('arc'), range = arc ? 27.3 : 18.2, chainDmg = arc ? 40 : 55;
    const targets = Game.enemies.filter((e) => !e.dead && !e.spawning && !I.hit.has(e) && dist3(e.center(), c) < range)
      .sort((a, b) => dist3(a.center(), c) - dist3(b.center(), c)).slice(0, arc ? 8 : 5);
    let from = c;
    targets.forEach((e, i) => {
      const to = e.center();
      FX.bolt(from, to, 0.25, { outer: '#ffb040', core: '#ffffff', jag: 0.5, w: 0.1 });
      Game.queueCut(0.12 + i * 0.06, () => {
        if (e.dead) return;
        const dx = to.x - c.x, dz = to.z - c.z, l = Math.hypot(dx, dz) || 1;
        hurtEnemy(e, chainDmg, { kv: { x: (dx / l) * 13.6, y: 10.9, z: (dz / l) * 13.6 }, dir: { x: dx / l, y: 0.5, z: dz / l }, cause: 'chain', stagger: 1.2, hitstop: 0.01 });
        if (e.dead || e.dying) this.counterHeal(1);
        FX.elec(e.center(), 1.3, 5, { outer: '#ffb040', core: '#ffffff' });
      });
      from = to;
    });
  }

  // ---------- damage ----------
  // h: { dmg, from: {x,y,z}, kind, source, knock (m/s), unparryable, through, pierce }
  takeHit(h) {
    if (this.dead || Game.cineActive()) return 'ignored';
    if (this.ult) return 'immune';
    // unparryable: a parry does nothing. through: i-frames don't help either (the red flash)
    if (this.parryActive() && !h.unparryable) { this.doParry(h); return 'parried'; }
    if ((this.iframes > 0 || this.iaido) && !h.through) return 'ignored';
    if (h.through) { this.iaido = null; this.dashT = 0; }
    let dmg = h.dmg * (Game.has('glass') ? 1.25 : 1);
    if (S.gameplay.invincible) dmg = 0;
    if (this.sheathe) this.cancelSheathe();
    if (this.tether && this.zipping()) this.releaseTether();
    this.attack = null; this.attackQueued = null; this.atkPend = null; this.postPose = 0;
    const c = this.center(), hadShield = this.shield > 0, shield0 = this.shield;
    // pierce: goes straight to health
    if (this.shield > 0 && !h.pierce) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed; dmg -= absorbed;
      if (this.shield <= 0.01) {
        // a healthy shield eats the whole hit when it breaks; a sliver doesn't
        this.shield = 0;
        if (shield0 >= PC.SHIELD_OVERFLOW_AT) dmg = 0;
        Sound.play('shieldBreak');
        FX.sparks(c, 16, null, TAU, 5.5, 18, { c0: '#ffffff', c1: '#5ad8ff', c2: '#1a6aa0' });
        FX.text('SHIELD BROKEN', { x: this.pos.x, y: this.pos.y + 2.6, z: this.pos.z }, { c: '#5ad8ff', always: true, dur: 0.8 });
        this.iframes = dmg > 0 ? 0.6 : 0.9;
      } else Sound.play('shieldHit');
      FX.ring(c, 0.5, 1.5, 0.18, { c: '#2a8ad0', flat: false });
    }
    if (dmg > 0) {
      this.hp -= dmg;
      Sound.play('hurt');
      FX.oil(c, 6, { x: 0, y: 1, z: 0 }, 9);
      FX.sparks(c, 8, null, TAU, 5.5, 16.4);
      FX.flash('#ff1030', 0.25);
    }
    this.shieldDelay = PC.SHIELD_DELAY + (Game.has('bloodline') ? 1 : 0); this.regenOn = false;
    this.iframes = Math.max(this.iframes, hadShield && this.shield > 0 ? 0.35 : 0.6);
    this.hurtT = 0.22;
    this.blinkT = this.iframes;
    Game.combo = 0; Game.comboT = 0; Game.styleHit();
    const from = h.from || { x: this.pos.x - fwdX(this.yaw), z: this.pos.z - fwdZ(this.yaw) };
    let dx = this.pos.x - from.x, dz = this.pos.z - from.z;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = -fwdX(this.yaw); dz = -fwdZ(this.yaw); } else { dx /= l; dz /= l; }
    const k = h.knock || 14.5;
    this.vel.x = dx * k; this.vel.z = dz * k; this.vel.y = Math.max(this.vel.y, 12.7);
    this.onGround = false; this.sliding = false; this.mantle = null;
    // the threat ring shows where it came from
    this.hitMarks.push({ yaw: yawOf(-dx, -dz), t: 0.7 });
    Game.shake(0.3);
    Game.hitstop(0.05);
    Game.stats.damageTaken += h.dmg;
    if (this.hp <= 0) this.die();
    return 'hit';
  }
  onShieldFull() {
    if (this.shieldWasFull) return;
    this.shieldWasFull = true; this.regenOn = false;
    this.shieldFullFlash = 0.45;
    Sound.play('shieldFull');
    FX.ring(this.center(), 0.5, 1.8, 0.3, { c: '#3ad0ff', flat: false });
  }
  heal(n) { this.hp = Math.min(PC.MAX_HP, this.hp + n); }
  die() {
    this.hp = 0; this.dead = true; this.deadT = 0;
    this.stopAllLoops();
    this.attack = null; this.sheathe = null; this.tether = null; this.iaido = null; this.atkPend = null;
    const c = this.center();
    FX.sparks(c, 30, null, TAU, 5.5, 23.6);
    FX.oil(c, 14, { x: 0, y: 1, z: 0 }, 14.5);
    FX.debris(c, 14, ['#454d63', '#7a849c', '#262a38', '#ff2a48'], 16.4);
    FX.flash('#ff1030', 0.5);
    Sound.play('explode', { big: true });
    Game.slowmo(0.3, 1.2, true);
    Game.shake(0.6);
    Game.onPlayerDeath();
  }
  updateDead(dt) {
    this.deadT += dt;
    this.vel.y = Math.max(this.vel.y - PC.GRAV * dt, -PC.MAX_FALL);
    if (this.onGround) { const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 54.5 * dt); this.vel.x = nx; this.vel.z = nz; }
    World.moveBody(this, dt);
    if (Math.random() < 0.15) FX.elec({ x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }, 0.7, 1);
    this.updateScarf(dt);
  }

  // ---------- scarf ----------
  // The 2D scarf in 3D: a verlet chain pinned behind the neck. It streams back and off to the left from
  // the body's motion (as in the concept art), flutters, stays out of the torso and above the street.
  // The pose pins its first point to the model.
  scarfAnchor() {
    const bx = -fwdX(this.yaw), bz = -fwdZ(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return { x: this.pos.x + bx * 0.16 - rx * 0.06, y: this.pos.y + this.h - 0.3, z: this.pos.z + bz * 0.16 - rz * 0.06 };
  }
  initScarf() {
    const a = this.scarfAnchor(), bx = -fwdX(this.yaw), bz = -fwdZ(this.yaw);
    this.scarf = [];
    for (let i = 0; i <= SCARF_N; i++) {
      const x = a.x + bx * i * 0.05, y = a.y - i * SCARF_SEG * 0.95, z = a.z + bz * i * 0.05;
      this.scarf.push({ x, y, z, px: x, py: y, pz: z });
    }
  }
  updateScarf(dt) {
    const pts = this.scarf, a = this.scarfAnchor();
    Object.assign(pts[0], { x: a.x, y: a.y, z: a.z, px: a.x, py: a.y, pz: a.z });
    const bx = -fwdX(this.yaw), bz = -fwdZ(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    // gravity 9 m/s^2, a wind blowing it back at 6 m/s^2 (more toward the tail), and a side flutter
    const dt2 = dt * dt, wind = Math.sin(this.animT * 7) * 3 * dt2;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.9, vy = (p.y - p.py) * 0.9, vz = (p.z - p.pz) * 0.9;
      p.px = p.x; p.py = p.y; p.pz = p.z;
      const back = 6 * dt2 * (1 + i * 0.25), left = -2.5 * dt2 * i;
      p.x += vx + bx * back + rx * (wind * i + left);
      p.y += vy - 9 * dt2;
      p.z += vz + bz * back + rz * (wind * i + left);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < pts.length; i++) {
        const A = pts[i - 1], B = pts[i];
        const dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.hypot(dx, dy, dz) || 1e-4, k = (d - SCARF_SEG) / d;
        if (i === 1) { B.x -= dx * k; B.y -= dy * k; B.z -= dz * k; }
        else { A.x += dx * k * 0.5; A.y += dy * k * 0.5; A.z += dz * k * 0.5; B.x -= dx * k * 0.5; B.y -= dy * k * 0.5; B.z -= dz * k * 0.5; }
      }
    }
    // keep out of the torso (a 0.24 m column) and above the street
    const top = this.pos.y + this.h - 0.1, bot = this.pos.y + 0.35;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p.y < top && p.y > bot) {
        const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.24) {
          const ux = d > 1e-3 ? dx / d : bx, uz = d > 1e-3 ? dz / d : bz;
          p.x = this.pos.x + ux * 0.24; p.z = this.pos.z + uz * 0.24;
        }
      }
      const g = World.groundAt(p.x, p.z, p.y + 0.3) + 0.02;
      if (p.y < g) p.y = g;
    }
  }
}
