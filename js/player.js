'use strict';
// The cyborg swordsman: input, light and heavy strings, slide attacks, plunge, dash slash, parry and
// counter, the tether, the grenade kick, the utility, shield and health, on the shared controller. Rules
// and timings follow the 2D player.js; reach and speeds are converted at PX = 1/11.

const PC = Object.assign({}, MOVE, {
  HEIGHT: MOVE.H, RADIUS: MOVE.R, CHEST: 1.15,
  TETHER_RANGE: 21, TETHER_COST: 15, TETHER_SPEED: 104.5, ZIP_SPEED: 43.6, ZIP_ACCEL: 254.5, FLING: 38.2,
  // the tether snaps to an enemy, barrel or grenade this close to the crosshair's line
  TETHER_ASSIST: (4 * Math.PI) / 180,
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
    // body lean from acceleration (forward, and toward the inside of a turn), and the landing roll
    this.accF = 0; this.accL = 0; this.bank = 0; this.tilt = 0; this.rollT = 0; this.rollDur = 0.4;
    this.charId = 'ronin'; this.utilCD = 0; this.utilT = 0; this.utilFlash = 0;
    this.plunge = null; this.kickAnim = null; this.ghostT = 0; this.bulletT = 0;
    this.onMove = (ev, d) => this.moveEvent(ev, d);
    this.initScarf();
  }
  center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.55, z: this.pos.z }; }
  chestH() { return this.h >= PC.H ? PC.CHEST : this.h * 0.62; }
  chest() { return { x: this.pos.x, y: this.pos.y + this.chestH(), z: this.pos.z }; }
  head() { return { x: this.pos.x + fwdX(this.yaw) * 0.15, y: this.pos.y + this.h - 0.15, z: this.pos.z + fwdZ(this.yaw) * 0.15 }; }
  stopLoop(k) { if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; } }
  stopAllLoops() { for (const k in this.loops) this.stopLoop(k); }
  // where the line leaves the right hand (the model's hand is close to this)
  hand() {
    const c = this.chest(), Y = this.yaw;
    return { x: c.x + Math.cos(Y) * 0.3 + fwdX(Y) * 0.25, y: c.y + 0.1, z: c.z - Math.sin(Y) * 0.3 + fwdZ(Y) * 0.25 };
  }

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
      crouch: Input.isDown('crouch'), crouchPressed: Input.wasPressed('crouch'), aim: this.aimDir,
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
    for (const k of ['iframes', 'hurtT', 'attackCD', 'postPose', 'parryCD', 'parryFlash', 'shieldOffT', 'shieldFlash', 'parryBuf', 'dashHold', 'shieldFullFlash', 'aimHold', 'spinT', 'landSquash', 'blinkT', 'utilT', 'utilFlash', 'bulletT', 'rollT']) dec(k);
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
    if (this.utilCD > 0) {
      this.utilCD -= dt;
      if (this.utilCD <= 0) { this.utilCD = 0; Sound.play('utilReady'); FX.ring(this.center(), 0.4, 1.5, 0.25, { c: '#ff3a52', flat: false }); }
    }

    if (this.dead) { this.updateDead(dt); return; }

    const I = this.intent();
    this.updateSheathe(dt);
    if (Input.wasPressed('dash')) { this.dashBuf = PC.INPUT_BUF; if (this.attack && !this.dashHold) this.dashHold = PC.CANCEL_RECOVERY; }
    this.updateDashBuffer(dt, I);
    this.updateTetherInput();
    this.updateTether(dt);
    if (Input.wasPressed('attack')) this.onAttackPressed(I.crouch);
    this.updateAttackInput(dt);
    if (Input.wasPressed('utility')) this.tryUtility();
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

    const reeled = this.rebounding() || this.zipping();
    this.dashRechargeExtra = Game.has('emberWake') ? 0.25 : 0;
    if (this.dashT > 0) { Controller.moveDash(this, dt); if (Game.has('emberWake') && this.dashHits) this.emberWake(); }
    else if (this.iaido) this.moveIaido(dt);
    else if (this.rebounding()) this.moveRebound(dt);
    else if (this.zipping()) this.moveZip(dt);
    else if (this.plunge) this.movePlunge(dt, I);
    else if (!this.mantle && !this.vault) Controller.moveNormal(this, dt, I);
    const vx0 = this.vel.x, vz0 = this.vel.z;
    const col = Controller.integrate(this, dt, reeled ? null : I, { mantle: !this.attack && !this.iaido && !this.sheathe && !this.plunge && !reeled, step: this.plunge ? 0 : undefined });
    this.updateLean(dt, vx0, vz0);
    if (this.iaido && col.wall) this.iaido.t = this.iaido.dur;
    // a zip to a wall or a ledge ends when the body meets the surface near the anchor
    if (this.zipping() && this.tether.kind === 'world' && (col.wall || col.ceil || col.ground) && dist3(this.tether.pos, this.chest()) < 2.4) this.arriveZip();
    if (this.wallSliding) {
      this.yaw = yawOf(this.wallN.x, this.wallN.z);
      if (Math.random() < 0.2) FX.dust({ x: this.pos.x - this.wallN.x * 0.35, y: this.pos.y + 0.9, z: this.pos.z - this.wallN.z * 0.35 }, 1, { smax: 0.9 });
    }

    this.updateAttack(dt);
    this.updateKick(dt);
    this.updateGhosts(dt);
    this.updateFacing(dt);
    const hs = Controller.hspeed(this);
    // strides lengthen as the sprint builds, so the cadence rises less than the speed
    if (this.onGround && hs > 1.4) this.runPhase += hs * dt * (1.155 - 0.22 * this.sprintK);
    // a slide throws sparks back off the leading boot and a little grit, as in 2D
    if (this.sliding && hs > 0.5) {
      const p = this.pos, dx = this.vel.x / hs, dz = this.vel.z / hs;
      if (Math.random() < 0.6) FX.sparks({ x: p.x + dx * 0.36, y: p.y + 0.06, z: p.z + dz * 0.36 }, 1, { x: -dx, y: 0.36, z: -dz }, 0.6, 3.6, 10.9, { life: 0.6, g: 18 });
      if (Math.random() < 0.3) FX.dust(p, 1, { smax: 2.3 });
    }
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
  // How the body leans: forward with acceleration and speed, and into turns by the sideways acceleration
  // (as a runner banks), smoothed so it never snaps.
  updateLean(dt, vx0, vz0) {
    const ax = (this.vel.x - vx0) / dt, az = (this.vel.z - vz0) / dt, Y = this.yaw;
    const ground = this.onGround && !this.sliding && !this.vault && !this.mantle && this.dashT <= 0;
    const af = ground ? ax * fwdX(Y) + az * fwdZ(Y) : 0, al = ground ? ax * -Math.cos(Y) + az * Math.sin(Y) : 0;
    this.accF = damp(this.accF, clamp(af / 70, -1, 1), 10, dt);
    this.accL = damp(this.accL, clamp(al / 90, -1, 1), 8, dt);
    const k = clamp(Controller.hspeed(this) / PC.SPRINT, 0, 1);
    this.bank = damp(this.bank, ground ? this.accL * 0.3 * k : 0, 10, dt);
    this.tilt = damp(this.tilt, ground && !this.attack ? -0.06 * k * k : 0, 8, dt);
  }
  // While attacking or parrying (and for FACE_AIM after) the body faces the aim; otherwise where it's going.
  updateFacing(dt) {
    const T = this.tether;
    if (this.attack || this.sheathe || this.atkPend || this.iaido || (T && (T.phase === 'fly' || T.mode === 'tow'))) this.aimHold = PC.FACE_AIM;
    let want = null;
    if (this.kickAnim || this.wallSliding) return;
    if (this.iaido) want = yawOf(this.iaido.dir.x, this.iaido.dir.z);
    else if (T && T.phase === 'attached' && (T.mode === 'zip' || T.mode === 'rebound')) want = yawOf(T.pos.x - this.pos.x, T.pos.z - this.pos.z);
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
      this.spinT = this.spinDur = 0.32;
      Sound.play('djump');
      FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.2, 1.1, 0.22, { c: '#ff3a52' });
      FX.sparks(p, 6, { x: 0, y: -1, z: 0 }, 2.2, 3.6, 10.9);
    } else if (ev === 'slide') {
      Sound.play('slide');
      const hs = Controller.hspeed(this) || 1;
      FX.dust(p, 5, { dir: { x: -this.vel.x / hs, y: 0.25, z: -this.vel.z / hs }, spread: 1.2, smax: 4.5 });
    }
    else if (ev === 'walljump') {
      // kicked off a wall: face away from it
      this.yaw = yawOf(d.x, d.z);
      this.aimHold = 0;
      const w = { x: p.x - d.x * 0.36, y: p.y + 0.75, z: p.z - d.z * 0.36 };
      Sound.play('walljump');
      FX.dust(w, 5, { dir: { x: d.x, y: 0.3, z: d.z }, spread: 1, smax: 4.5 });
      FX.sparks(w, 4, { x: d.x, y: 0.4, z: d.z }, 1.4, 3.6, 12.7);
    } else if (ev === 'bulletjump') {
      this.spinT = this.spinDur = 0.45; this.bulletT = 0.4;
      this.yaw = yawOf(d.x, d.z);
      Sound.play('bulletjump');
      FX.dust(p, 8, { smax: 6.4, rise: 0.9 });
      FX.ring({ x: p.x, y: p.y + 0.55, z: p.z }, 0.25, 1.6, 0.25, { flat: false });
      FX.sparks({ x: p.x, y: p.y + 0.35, z: p.z }, 10, { x: -d.x, y: -d.y, z: -d.z }, 1.3, 5.5, 18.2);
      Game.shake(0.08);
    } else if (ev === 'land') {
      this.spinT = 0; this.bulletT = 0;
      if (this.kickAnim && this.kickAnim.t > 0.1) this.kickAnim = null;
      if (this.plunge) { this.plungeImpact(); return; }
      const hs = Controller.hspeed(this);
      // a hard landing at a run rolls through it instead of absorbing it
      if (d.vy < -22 && hs > 7 && !this.attack && !this.sheathe && !Input.isDown('crouch')) {
        this.rollT = this.rollDur; Sound.play('land', { v: 0.5 }); FX.dust(p, 6, { smax: 4.5 });
      } else if (d.vy < -16) { this.landSquash = 0.12; Sound.play('land', { v: clamp(-d.vy / 32, 0.4, 1.2) }); FX.dust(p, 4 + ((-d.vy / 9) | 0), { smax: 3.6 }); }
      if (Input.isDown('crouch') && Controller.hspeed(this) > PC.SLIDE_MIN && !this.attack && !this.sheathe && !this.iaido) Controller.startSlide(this);
    } else if (ev === 'dash') {
      Sound.play('dash');
      const c = this.chest();
      FX.ring(c, 0.2, 1.3, 0.18, { c: '#ff3a52', flat: false });
      FX.sparks(c, 8, { x: -d.x, y: 0, z: -d.z }, 1.2, 5.5, 18);
      FX.light(c, '#ff3048', 3, 4, 0.15);
      Game.shake(0.06);
    } else if (ev === 'mantle') Sound.play('step');
    else if (ev === 'vault') {
      // a hand on the top, legs swept over
      Sound.play('step'); Sound.play('slide');
      FX.dust(d.plant, 4, { smax: 2.7, rise: 0.5 });
    } else if (ev === 'skid') {
      Sound.play('slide');
      FX.dust(p, 6, { dir: { x: d.x, y: 0.2, z: d.z }, spread: 0.9, smax: 5.5 });
      FX.sparks({ x: p.x, y: p.y + 0.05, z: p.z }, 4, { x: d.x, y: 0.3, z: d.z }, 0.8, 3.6, 9);
    }
  }

  // ---------- dash ----------
  // Finishers, heavies and slide attacks can't be cancelled until their blade has done its work.
  committed() {
    const a = this.attack;
    return !!a && (a.finisher || a.heavy || a.groundCut) && a.t <= a.act1;
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
    if (this.tether) this.releaseTether();
    this.attack = null; this.attackQueued = null; this.postPose = 0; this.landLag = 0; this.plunge = null; this.kickAnim = null;
    if (!Controller.tryDash(this, dx, dz)) return;
    this.iframes = Math.max(this.iframes, PC.DASH_IFRAMES);
    this.yaw = yawOf(dx, dz);
    this.dashHits = new Set();
  }
  // Ember Wake: a dash cuts what it passes through
  emberWake() {
    const c = this.center();
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || this.dashHits.has(e) || !bodiesTouch(this, e, 0.35)) continue;
      this.dashHits.add(e);
      const dl = Math.hypot(this.dashVX, this.dashVZ) || 1, ux = this.dashVX / dl, uz = this.dashVZ / dl;
      hurtEnemy(e, 20, { kv: { x: ux * 7.3, y: 5.5, z: uz * 7.3 }, dir: { x: ux, y: 0.2, z: uz }, cause: 'dash', stagger: 0.3, hitstop: 0.02 });
      FX.sparks(e.center(), 8, { x: ux, y: 0.2, z: uz }, 1, 5.5, 18.2, { c0: '#ffffff', c1: '#ffb040', c2: '#ff3048' });
    }
    if (Math.random() < 0.7) FX.embers(c, 1);
  }

  // ---------- melee ----------
  // A tap is a light, a hold (PC.HEAVY_HOLD) is a heavy. Dash attacks lock their context at the press.
  // Attack in the air with crouch held plunges straight down.
  onAttackPressed(down) {
    if (this.sheathe || this.iaido || this.ultHold > 0) return;
    const dashing = this.dashT > 0 || this.dashEndT > 0;
    if (!dashing && !this.onGround && down && !this.plunge && !this.mantle) { this.atkPend = null; this.startPlunge(); return; }
    if (this.plunge) return;
    this.atkPend = { t: 0, dash: dashing };
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
    if (this.sheathe || this.iaido || this.ultHold > 0 || this.plunge || this.dead) return;
    if (kind === 'H') {
      Sound.play('heavyDraw');
      const c = this.chest();
      FX.ring(c, 0.2, 1.1, 0.16, { c: '#ff3a52', flat: false });
      FX.light(c, '#ff3048', 3, 3, 0.12);
    }
    if (dash || this.dashT > 0 || this.dashEndT > 0) { this.dashAttack(kind); return; }
    if (this.attack || this.attackCD > 0) { this.attackQueued = kind; return; }
    if (this.sliding && this.onGround && !this.stringLive()) { this.startGroundCut(kind); return; }
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
      if (this.attackQueued && this.attackCD <= 0 && !this.sheathe && !this.iaido && !this.plunge && this.dashT <= 0) {
        const k = this.attackQueued;
        this.attackQueued = null;
        if (this.sliding && this.onGround && !this.stringLive()) this.startGroundCut(k);
        else this.startString(k, false);
      }
      return;
    }
    const a = this.attack;
    a.t += dt;
    if (a.groundCut) {
      this.updateGroundCut(a);
      if (this.attack === a && a.t >= a.dur) this.endGroundCut(a);
      return;
    }
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
      for (const pr of Game.props) {
        if (pr.dead || a.hit.has(pr) || !this.inSwing(a, c, reach, pr)) continue;
        a.hit.add(pr);
        pr.hit(a.dmg, { kv: { x: fx * 18.2, y: 10.9, z: fz * 18.2 }, heavy: big });
      }
      // bolts caught in the arc go back toward the crosshair; parry-only projectiles pass through
      const mid = c.y + clamp(a.pitch, -0.8, 0.8) * reach * 0.5;
      for (const b of Game.projectiles) {
        if (b.dead || !b.hostile || a.hit.has(b) || b.parryOnly || !(b.reflect || b.onSlash)) continue;
        const dx = b.pos.x - c.x, dz = b.pos.z - c.z, d = Math.hypot(dx, dz);
        if (d > reach || Math.abs(b.pos.y - mid) > a.band + 0.5) continue;
        if (d > 0.5 && Math.abs(angDiff(a.yaw, yawOf(dx, dz))) > a.span / 2) continue;
        a.hit.add(b);
        if (b.onSlash) { b.onSlash(this); continue; }
        b.reflect(Camera.aim, 1.5, 22);
        Sound.play('reflect', {}, b.pos);
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
  // The heavy finisher hits the street hard enough to send a ring running out over the ground.
  slamQuake() {
    const f = { x: this.pos.x + fwdX(this.yaw) * 1.3, y: this.pos.y + 0.05, z: this.pos.z + fwdZ(this.yaw) * 1.3 };
    Game.hazards.push(new SlamRing({ x: f.x, y: this.pos.y, z: f.z }, { cause: 'heavy' }));
    FX.ring(f, 0.4, 5.3, 0.35, { c: '#ff3048' });
    FX.dust(f, 12, { smax: 9, rise: 0.8 });
    FX.debris(f, 14, GRIT, 20);
    FX.decal('crack', f, { len: 3.2 });
    FX.light(f, '#ff3048', 5, 9, 0.3);
    FX.flash('#ff3048', 0.14);
    Sound.play('slam');
    Game.shake(0.3);
  }

  // ---------- slide attacks ----------
  // Light: the blade bites into the street and sprays rubble ahead. Heavy: it digs in deep and brakes
  // the slide, then rips upward through an eruption of rock that launches you and whatever it catches.
  startGroundCut(kind = 'L') {
    const hs = Controller.hspeed(this) || 1;
    const yaw = yawOf(this.vel.x, this.vel.z), fx = fwdX(yaw), fz = fwdZ(yaw);
    this.yaw = yaw;
    if (kind === 'H') {
      this.attack = { stage: 4, groundCut: true, heavy: true, t: 0, dur: 0.5, rip: 0.16, act0: 0.16, act1: 0.27, yaw, hit: new Set(), rocks: false, dug: false };
      const s = Math.max(hs * 0.45, 6.4);
      this.vel.x = fx * s; this.vel.z = fz * s;
      this.slideT = Math.max(this.slideT, 0.2);
    } else {
      this.attack = { stage: 4, groundCut: true, t: 0, dur: 0.36, act0: 0.02, act1: 0.22, yaw, hit: new Set(), rocks: false };
      this.slideT = Math.max(this.slideT, 0.32);
      const s = Math.max(hs, 15.5);
      this.vel.x = fx * s; this.vel.z = fz * s;
    }
    this.attackQueued = null; this.kickAnim = null;
    Sound.play('groundCut');
  }
  // where the buried blade breaks the surface
  bladeEntry(a) {
    const k = a.heavy ? 0.82 : 1.18;
    return { x: this.pos.x + fwdX(a.yaw) * k, y: this.pos.y + 0.05, z: this.pos.z + fwdZ(a.yaw) * k };
  }
  // enemies in a box ahead: along the slide from a to b, half-width w, up to height h; hit each once
  cutBox(a, from, to, w, h, fn) {
    const fx = fwdX(a.yaw), fz = fwdZ(a.yaw);
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || a.hit.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, along = dx * fx + dz * fz, side = Math.abs(dx * -fz + dz * fx);
      if (along < from - e.r || along > to + e.r || side > w + e.r || e.pos.y > this.pos.y + h || e.pos.y + e.h < this.pos.y - 0.2) continue;
      a.hit.add(e);
      fn(e, fx, fz);
    }
  }
  // a fan of rocks thrown forward: elevation lo..hi radians, up to spread to either side
  throwRocks(at, a, n, lo, hi, spread, smin, smax, dmg) {
    for (let i = 0; i < n; i++) {
      const y = a.yaw + rand(-spread, spread), el = rand(lo, hi), s = rand(smin, smax);
      const v = { x: fwdX(y) * Math.cos(el) * s, y: Math.sin(el) * s, z: fwdZ(y) * Math.cos(el) * s };
      Game.projectiles.push(new Rock({ x: at.x + rand(-0.2, 0.2), y: at.y + rand(0.05, 0.3), z: at.z + rand(-0.2, 0.2) }, v, dmg));
    }
  }
  updateGroundCut(a) {
    const E = this.bladeEntry(a), fx = fwdX(a.yaw), fz = fwdZ(a.yaw), back = { x: -fx, y: 0.4, z: -fz };
    if (a.heavy) { this.updateHeavyGroundCut(a, E, fx, fz, back); return; }
    if (a.t >= 0.04 && a.t < 0.27) {
      // the buried blade drags a furrow: sparks stream back, grit kicks up off the entry point
      FX.sparks(E, 2, back, 0.8, 5.5, 18.2, { life: 0.6 });
      if (Math.random() < 0.6) FX.debris(E, 1, GRIT, 13.6);
      if (Math.random() < 0.5) FX.dust(E, 1, { smax: 2.7, c: '#6a5a5a' });
    }
    if (a.t >= a.act0 && a.t <= a.act1) {
      this.cutBox(a, 0, 2.55, 0.9, 1.1, (e) => hurtEnemy(e, 12, { kv: { x: fx * 14.5, y: 15.5, z: fz * 14.5 }, dir: { x: fx, y: 0.4, z: fz }, cause: 'groundcut', stagger: 0.4, hitstop: 0.03 }));
    }
    if (!a.rocks && a.t >= 0.05) {
      a.rocks = true;
      this.throwRocks(E, a, 10, 0.12, 0.95, 0.4, 15.5, 30, 7);
      FX.debris(E, 12, GRIT, 18.2);
      FX.dust(E, 10, { dir: { x: fx, y: 0.5, z: fz }, spread: 0.8, smax: 12.7, rise: 0.9 });
      FX.sparks(E, 10, { x: fx, y: 0.5, z: fz }, 0.9, 7.3, 23.6);
      FX.decal('gouge', { x: E.x - fx * 1.0, y: this.pos.y, z: E.z - fz * 1.0 }, { len: 2.4, yaw: a.yaw, dur: 5 });
      Game.shake(0.12);
      Sound.play('rocks');
    }
  }
  updateHeavyGroundCut(a, E, fx, fz, back) {
    if (a.t < a.rip) {
      if (!a.dug && a.t >= 0.04) {
        a.dug = true;
        FX.debris(E, 8, GRIT, 13.6);
        FX.sparks(E, 10, back, 1, 5.5, 20, { life: 0.7 });
        FX.decal('gouge', { x: E.x - fx * 0.7, y: this.pos.y, z: E.z - fz * 0.7 }, { len: 1.3, yaw: a.yaw, dur: 5 });
        Sound.play('rocks');
        Game.shake(0.12);
      }
      if (a.dug && Math.random() < 0.7) FX.sparks(E, 1, { x: 0, y: 1, z: 0 }, 1.2, 3.6, 12.7, { life: 0.5 });
    } else if (!a.rocks) {
      a.rocks = true;
      this.throwRocks(E, a, 16, 0.5, 1.4, 0.55, 20, 36.4, 9);
      FX.debris(E, 22, GRIT, 27.3);
      FX.dust(E, 14, { dir: { x: fx * 0.5, y: 1, z: fz * 0.5 }, spread: 1, smax: 14.5, rise: 1.3 });
      FX.sparks(E, 18, { x: fx * 0.4, y: 1, z: fz * 0.4 }, 1.2, 9, 29);
      FX.ring({ x: E.x, y: this.pos.y + 0.06, z: E.z }, 0.3, 3.6, 0.3);
      FX.decal('crack', E, { len: 3.2 });
      FX.swoosh({ follow: this, oy: this.chestH(), yaw: a.yaw, tilt: Math.PI / 2, r: 2.7, span: 2.6, dir: 1, sweep: 0.08, dur: 0.3, thick: 0.5, trail: 1 });
      FX.light({ x: E.x, y: this.pos.y + 0.9, z: E.z }, '#ff3048', 6, 8.2, 0.3);
      FX.flash('#ff3048', 0.12);
      Sound.play('slam'); Sound.play('swing', { stage: 3 }); Sound.play('heavySwing');
      Game.shake(0.32);
      Game.hitstop(0.05);
      // the rip throws you up out of the slide, ready for an air string
      this.sliding = false; this.crouching = false;
      if (!Controller.setHeight(this, PC.H)) { this.crouching = true; Controller.setHeight(this, PC.CROUCH_H); }
      if (!this.crouching) { this.vel.y = 20.9; this.vel.x = fx * 4.5; this.vel.z = fz * 4.5; this.onGround = false; this.airJumps = 1; }
    }
    if (a.t >= a.act0 && a.t <= a.act1) {
      this.cutBox(a, -0.36, 3.27, 1.0, 2.55, (e) => hurtEnemy(e, 30, { kv: { x: fx * 10.9, y: 34.5, z: fz * 10.9 }, dir: { x: fx * 0.3, y: 1, z: fz * 0.3 }, heavy: true, cause: 'groundcut', stagger: 0.8, hitstop: 0.05, guardBreak: true }));
    }
  }
  // a slide attack opens a string: stand up out of it into lights or heavies
  endGroundCut(a) {
    this.attack = null;
    this.strN = 1; this.strLights = a.heavy ? 0 : 1; this.lastDir = a.heavy ? -1 : 1;
    this.comboTimer = a.heavy ? 0.5 : 0.42;
  }

  // ---------- plunge ----------
  // Crouch plus attack in the air: straight down, cutting through anything on the way, and a shockwave
  // on landing that grows with the height of the fall.
  startPlunge() {
    this.attack = null; this.attackQueued = null; this.atkPend = null; this.sliding = false; this.kickAnim = null;
    if (this.tether) this.releaseTether();
    if (this.sheathe) this.cancelSheathe();
    this.plunge = { startY: this.pos.y, t: 0, hit: new Set() };
    this.vel.x *= 0.2; this.vel.z *= 0.2; this.vel.y = -25.5;
    this.iframes = Math.max(this.iframes, 0.12);
    Sound.play('plungeStart');
    FX.ring(this.center(), 0.2, 1.3, 0.2, { flat: false });
  }
  movePlunge(dt, I) {
    const P = this.plunge;
    P.t += dt;
    this.vel.y = Math.max(this.vel.y - 254.5 * dt, -69.1);
    const [nx, nz] = approach2(this.vel.x, this.vel.z, I.mx * 4.1, I.mz * 4.1, 54.5 * dt);
    this.vel.x = nx; this.vel.z = nz;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || P.hit.has(e)) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > e.r + 0.45 || e.pos.y > this.pos.y + this.h || e.pos.y + e.h < this.pos.y - 1.1) continue;
      P.hit.add(e);
      hurtEnemy(e, 16, { kv: { x: (dx / (d || 1)) * 5.5, y: -18.2, z: (dz / (d || 1)) * 5.5 }, dir: { x: 0, y: -1, z: 0 }, cause: 'plunge', stagger: 0.4, hitstop: 0.02 });
    }
    if (Math.random() < 0.8) FX.sparks({ x: this.pos.x, y: this.pos.y - 0.5, z: this.pos.z }, 1, { x: 0, y: 1, z: 0 }, 0.5, 5.5, 12.7, { g: -18, life: 0.6 });
  }
  plungeImpact() {
    const P = this.plunge, p = this.pos;
    this.plunge = null;
    const fall = Math.max(0, P.startY - p.y), power = clamp(fall / 20, 0.15, 1);
    const R = 4.2 + power * 5.6, dmg = (22 + power * 42) * (Game.has('aftershock') ? 0.8 : 1);
    if (Game.has('aftershock')) Game.hazards.push(new SlamRing(p, { cause: 'plunge', speed: 25.5, dmg: 18 + power * 22 }));
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz), dy = e.pos.y - p.y;
      if (d > R + e.r || dy > 3.6 || dy + e.h < -2.2) continue;
      const fall2 = 1 - clamp(d / (R + e.r), 0, 1) * 0.45, ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
      hurtEnemy(e, dmg * fall2, { kv: { x: ux * (14.5 + power * 12.7), y: 21.8 + power * 14.5, z: uz * (14.5 + power * 12.7) }, dir: { x: ux, y: 0.6, z: uz }, heavy: true, cause: 'plunge', stagger: 0.7, hitstop: 0.02, shake: 0 });
    }
    for (const pr of Game.props) {
      if (pr.dead || distXZ(pr.pos, p) > R || Math.abs(pr.pos.y - p.y) > 3.6) continue;
      const dx = pr.pos.x - p.x, dz = pr.pos.z - p.z, d = Math.hypot(dx, dz) || 1;
      pr.hit(30, { kv: { x: (dx / d) * 18.2, y: 23.6, z: (dz / d) * 18.2 }, heavy: true });
    }
    const g = { x: p.x, y: p.y + 0.06, z: p.z }, c = this.center();
    FX.ring(g, 0.4, R, 0.35);
    FX.ring(g, 0.2, R * 0.7, 0.28, { c: '#ff7a3a' });
    FX.ring({ x: p.x, y: p.y + 0.9, z: p.z }, 0.2, 2 + power * 1.3, 0.22, { flat: false });
    FX.dust(p, 28 + power * 20, { dir: { x: 0, y: 0.15, z: 0 }, spread: TAU, smax: 14.5, rise: 0.5 });
    FX.debris(p, 16 + power * 12, GRIT, 16.4 + power * 7.3);
    FX.sparks({ x: p.x, y: p.y + 0.2, z: p.z }, 20, { x: 0, y: 1, z: 0 }, 2.4, 7.3, 23.6);
    FX.elec(c, 2.4, 6);
    FX.decal('crack', p, { len: 2.6 + power * 3.3 });
    FX.light(c, '#ff3048', 6, R * 1.6, 0.35);
    FX.flash('#ff3048', 0.18 + power * 0.12);
    Sound.play('shockwave', { power });
    Game.shake(0.32 + power * 0.32);
    Game.hitstop(0.06);
    this.landLag = 0.14; this.airJumps = 1;
  }

  // ---------- grenade kick ----------
  updateKick(dt) {
    const K = this.kickAnim;
    if (!K) return;
    K.t += dt;
    this.ghostT -= dt;
    if (this.ghostT <= 0) { this.ghostT = 0.03; this.makeGhost('#ffd070', 0.25, 0.45); }
    if (K.t >= K.dur) this.kickAnim = null;
  }
  // afterimages behind fast moves
  updateGhosts(dt) {
    if (this.dashT > 0 || this.bulletT > 0 || (this.plunge && this.plunge.t > 0.05)) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = this.dashT > 0 ? 0.018 : 0.035; this.makeGhost('#ff2a48', 0.24, 0.55); }
    }
  }
  makeGhost(color, dur, alpha) { FX.ghost(color, dur, alpha); }

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
    if (h.proj) h.proj.reflect(Camera.aim, 1.9, 40);
    else if (h.source && h.source.stagger) {
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
    const fx = fwdX(yaw), fz = fwdZ(yaw);
    for (const pr of Game.props) if (!pr.dead && this.inSwing(arc, c, cfg.arcR, pr)) pr.hit(60, { kv: { x: fx * 23.6, y: 13.6, z: fz * 23.6 }, heavy: true });
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || b.parryOnly || dist3(b.pos, c) >= cfg.arcR) continue;
      if (b.onSlash) b.onSlash(this);
      else if (b.reflect) b.reflect(Camera.aim, 1.6, 30);
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

  // ---------- tether ----------
  // Right mouse: a line fired from the hand down the crosshair's line (snapping to an enemy, barrel or
  // grenade within TETHER_ASSIST of it). Tap flings you toward the anchor, hold zips you in; an enemy
  // takes a zip strike, a barrel swings on the line until released at the crosshair, a grenade slows time.
  updateTetherInput() {
    if (!Input.wasPressed('tether')) return;
    if (this.tether) {
      if (this.tether.phase === 'attached' && this.tether.mode !== 'tow' && this.tether.mode !== 'rebound') this.releaseTether();
      return;
    }
    if (this.sheathe || this.iaido || this.ultHold > 0 || this.plunge) return;
    this.fireTether();
  }
  // the enemy, barrel or tetherable grenade nearest the crosshair's line, within the assist angle and in reach
  tetherTarget(hand) {
    const o = Camera.pos, d = Camera.dir, near = Camera.curDist;
    let best = null, ba = PC.TETHER_ASSIST;
    const consider = (obj, kind, c, r, range) => {
      const vx = c.x - o.x, vy = c.y - o.y, vz = c.z - o.z, l = Math.hypot(vx, vy, vz);
      if (l < near || dist3(c, hand) > range + r) return;
      const ang = Math.acos(clamp((vx * d.x + vy * d.y + vz * d.z) / l, -1, 1)) - Math.atan2(r, l);
      if (ang >= ba) return;
      const hd = dist3(c, hand), u = { x: (c.x - hand.x) / hd, y: (c.y - hand.y) / hd, z: (c.z - hand.z) / hd };
      if (World.raycast(hand, u, Math.max(0, hd - r))) return;
      ba = ang; best = { obj, kind };
    };
    for (const e of Game.enemies) if (!e.dead && !e.spawning) consider(e, 'enemy', e.center(), e.r, PC.TETHER_RANGE);
    for (const pr of Game.props) if (!pr.dead && pr.grabR && pr.tetherable !== false) consider(pr, 'object', pr.center(), pr.grabR, PC.TETHER_RANGE);
    for (const g of Game.projectiles) if (g.tetherable) consider(g, g.rebound ? 'grenade' : 'object', g.center(), g.grabR, this.ult ? 360 : PC.TETHER_RANGE + 2.7);
    return best;
  }
  fireTether() {
    const hand = this.hand(), target = this.tetherTarget(hand);
    // a grenade is the fight's key, so tethering one is always free
    const free = !!this.ult || (target && target.kind === 'grenade');
    if (!free && !S.gameplay.invincible && this.shield < PC.TETHER_COST) {
      Sound.play('noShield');
      this.shieldFlash = 0.5;
      FX.text('NO SHIELD', { x: this.pos.x, y: this.pos.y + 2.6, z: this.pos.z }, { c: '#5ad8ff', always: true, dur: 0.6, vy: 1.8 });
      return;
    }
    if (!free) { this.shield = Math.max(0, this.shield - PC.TETHER_COST); this.shieldDelay = Math.max(this.shieldDelay, 1.4); this.regenOn = false; }
    const to = target ? target.obj.center() : Camera.aim;
    const dx = to.x - hand.x, dy = to.y - hand.y, dz = to.z - hand.z, l = Math.hypot(dx, dy, dz) || 1;
    const spd = free ? 218 : PC.TETHER_SPEED;
    this.tether = {
      phase: 'fly', pos: hand, vel: { x: (dx / l) * spd, y: (dy / l) * spd, z: (dz / l) * spd }, dist: 0, max: free ? 360 : PC.TETHER_RANGE,
      target: null, kind: null, off: null, mode: null, firedAt: Game.time, t: 0, spd: 0,
      // a moving target pulls the line onto it while it travels
      homing: target ? target.obj : null, paid: !free,
    };
    this.yaw = yawOf(dx, dz);
    this.aimHold = PC.FACE_AIM;
    Sound.play('tetherFire');
    FX.sparks(hand, 4, { x: dx / l, y: dy / l, z: dz / l }, 0.8, 5.5, 16.4);
  }
  releaseTether() {
    const T = this.tether;
    if (!T) return;
    if (T.mode === 'rebound' && T.phase === 'attached') Game.endBulletTime();
    this.stopLoop('reel');
    if (T.target && T.target.tethered) T.target.tethered = false;
    T.phase = 'retract'; T.t = 0;
  }
  zipping() { return !!this.tether && this.tether.phase === 'attached' && this.tether.mode === 'zip'; }
  rebounding() { return !!this.tether && this.tether.phase === 'attached' && this.tether.mode === 'rebound'; }
  towing() { return !!this.tether && this.tether.phase === 'attached' && this.tether.mode === 'tow'; }
  attachTether(target, kind) {
    const T = this.tether;
    T.phase = 'attached'; T.t = 0; T.target = target; T.kind = kind;
    if (target) { T.off = { x: T.pos.x - target.pos.x, y: T.pos.y - target.pos.y, z: T.pos.z - target.pos.z }; target.tethered = true; }
    Sound.play('tetherAttach', {}, T.pos);
    FX.sparks(T.pos, 8, null, TAU, 3.6, 13.6);
    FX.elec(T.pos, 0.9, 3);
    FX.light(T.pos, '#ff3048', 3, 3, 0.2);
    if (kind === 'grenade') { this.beginRebound(target); return; }
    if (kind === 'object') {
      T.mode = 'tow';
      if (target.grab) target.grab(this);
      if (!Input.isDown('tether')) this.throwTowed();
      return;
    }
    if (kind === 'enemy') hurtEnemy(target, 4, { cause: 'tether', stagger: 0.25, noKnock: true, hitstop: 0.02, dir: { x: 0, y: 1, z: 0 } });
  }
  // the flying hook against enemies, barrels and grenades
  tetherHit(T) {
    for (const e of Game.enemies) if (!e.dead && !e.spawning && pointInBody(T.pos, e, 0.27)) { this.attachTether(e, 'enemy'); return true; }
    const grab = (o) => !o.dead && o.tetherable !== false && o.grabR && dist3(T.pos, o.center()) < o.grabR + 0.27;
    for (const o of Game.props) if (grab(o)) { this.attachTether(o, 'object'); return true; }
    for (const o of Game.projectiles) if (o.tetherable && grab(o)) { this.attachTether(o, o.rebound ? 'grenade' : 'object'); return true; }
    return false;
  }
  updateTether(dt) {
    const T = this.tether;
    if (!T) return;
    T.t += dt;
    const hand = this.hand();
    if (T.phase === 'fly') {
      const h = T.homing;
      if (h && !h.dead && h.tetherable !== false) {
        const c = h.center(), sp0 = Math.hypot(T.vel.x, T.vel.y, T.vel.z), dx = c.x - T.pos.x, dy = c.y - T.pos.y, dz = c.z - T.pos.z, l = Math.hypot(dx, dy, dz) || 1;
        T.vel = { x: (dx / l) * sp0, y: (dy / l) * sp0, z: (dz / l) * sp0 };
      }
      const sp = Math.hypot(T.vel.x, T.vel.y, T.vel.z), steps = Math.max(1, Math.ceil((sp * dt) / 0.36));
      for (let i = 0; i < steps; i++) {
        T.pos.x += (T.vel.x * dt) / steps; T.pos.y += (T.vel.y * dt) / steps; T.pos.z += (T.vel.z * dt) / steps; T.dist += (sp * dt) / steps;
        if (this.tetherHit(T)) return;
        if (World.pointSolid(T.pos.x, T.pos.y, T.pos.z)) {
          T.pos.x -= (T.vel.x * dt) / steps; T.pos.y -= (T.vel.y * dt) / steps; T.pos.z -= (T.vel.z * dt) / steps;
          this.attachTether(null, 'world');
          return;
        }
        if (T.dist > T.max || T.pos.y < -5) { T.phase = 'retract'; T.t = 0; Sound.play('tetherMiss'); return; }
      }
    } else if (T.phase === 'attached') {
      if (T.target) {
        if (T.target.dead) { this.releaseTether(); return; }
        if (T.kind === 'object' || T.kind === 'grenade') { const c = T.target.center(); T.pos = { x: c.x, y: c.y, z: c.z }; }
        else T.pos = { x: T.target.pos.x + T.off.x, y: T.target.pos.y + T.off.y, z: T.target.pos.z + T.off.z };
        if (T.target.isEnemy && Math.random() < 0.35) FX.elec(T.pos, 0.8, 1);
      }
      if (T.mode === 'tow') {
        T.target.towTo(hand, dt, this);
        if (!Input.isDown('tether') || T.t > 5) this.throwTowed();
        return;
      }
      if (T.mode === 'rebound') return;
      if (!T.mode) {
        const held = Input.isDown('tether'), since = Game.time - T.firedAt;
        if (!held) T.mode = 'fling';
        else if (since >= 0.16) T.mode = 'zip';
        if (T.mode) this.beginTetherMode();
      }
      if (T.mode === 'fling') {
        if (T.t > 0.06) this.releaseTether();
      } else if (T.mode === 'zip') {
        if (this.loops.reel) this.loops.reel.set(clamp(T.spd / 54.5, 0, 1));
        if (!this.ult && T.t > 2.2) this.releaseTether();
      }
    } else if (T.phase === 'retract') {
      const dx = hand.x - T.pos.x, dy = hand.y - T.pos.y, dz = hand.z - T.pos.z, d = Math.hypot(dx, dy, dz), step = 163.6 * dt;
      if (d <= step || T.t > 0.25) { this.tether = null; return; }
      T.pos.x += (dx / d) * step; T.pos.y += (dy / d) * step; T.pos.z += (dz / d) * step;
    }
  }
  // the towed barrel flies at the crosshair
  throwTowed() {
    const T = this.tether, o = T.target;
    if (o && !o.dead) {
      const c = o.center(), A = Camera.aim, dx = A.x - c.x, dy = A.y - c.y, dz = A.z - c.z, l = Math.hypot(dx, dy, dz) || 1;
      o.throwAt({ x: dx / l, y: dy / l, z: dz / l }, this);
    }
    Sound.play('throw');
    FX.ring(this.hand(), 0.15, 1.3, 0.18, { flat: false });
    Game.shake(0.1);
    this.releaseTether();
  }
  stand() {
    if (this.sliding || this.crouching) { this.sliding = false; this.crouching = false; if (!Controller.setHeight(this, PC.H)) Controller.setHeight(this, PC.SLIDE_H); }
  }
  beginTetherMode() {
    const T = this.tether;
    if (T.mode === 'fling') {
      const c = this.chest(), dx = T.pos.x - c.x, dy = T.pos.y - c.y, dz = T.pos.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
      const sp = this.ult ? 69 : PC.FLING;
      this.vel.x = (dx / d) * sp; this.vel.y = (dy / d) * sp + 6.4; this.vel.z = (dz / d) * sp;
      this.onGround = false; this.airJumps = 1;
      this.stand();
      Sound.play('zip');
    } else if (T.mode === 'zip') {
      Sound.play('zip');
      this.loops.reel = Sound.loop('reel');
      this.stand();
      this.onGround = false;
      T.spd = Math.max(13.6, Math.hypot(this.vel.x, this.vel.y, this.vel.z));
    }
  }
  moveZip(dt) {
    const T = this.tether, c = this.chest();
    const dx = T.pos.x - c.x, dy = T.pos.y - c.y, dz = T.pos.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
    T.spd = Math.min(this.ult ? 89 : PC.ZIP_SPEED, T.spd + PC.ZIP_ACCEL * dt);
    this.vel.x = (dx / d) * T.spd; this.vel.y = (dy / d) * T.spd; this.vel.z = (dz / d) * T.spd;
    this.ghostT -= dt;
    if (this.ghostT <= 0) { this.ghostT = 0.03; this.makeGhost('#ff2a48', 0.2, 0.4); }
    if (!Input.isDown('tether')) { this.releaseTether(); this.vel.x *= 1.05; this.vel.y *= 1.05; this.vel.z *= 1.05; return; }
    if (d < (T.kind === 'enemy' ? 1.36 : 0.9)) this.arriveZip();
  }
  arriveZip() {
    const T = this.tether;
    if (T.kind === 'enemy' && T.target && !T.target.dead) {
      const e = T.target, ec = e.center(), c = this.chest();
      const hx = ec.x - c.x, hz = ec.z - c.z, hl = Math.hypot(hx, hz) || 1, ux = hx / hl, uz = hz / hl;
      const dealt = hurtEnemy(e, 22, { kv: { x: ux * 14.5, y: 10.9, z: uz * 14.5 }, dir: { x: ux, y: 0.3, z: uz }, cause: 'tether', stagger: 0.7, hitstop: 0.05, shake: 0.15, heavy: true });
      // a tether strike that connects pays for itself
      if (Game.has('voltHook')) {
        for (const o of Game.enemies) {
          if (o === e || o.dead || o.spawning || dist3(o.center(), ec) > 3.6) continue;
          const u = { x: o.pos.x - e.pos.x, z: o.pos.z - e.pos.z }, l = Math.hypot(u.x, u.z) || 1;
          hurtEnemy(o, 30, { kv: { x: (u.x / l) * 18.2, y: 13.6, z: (u.z / l) * 18.2 }, dir: { x: u.x / l, y: 0.4, z: u.z / l }, cause: 'tether', stagger: 0.6 });
        }
        if (!e.dead) hurtEnemy(e, 30, { cause: 'tether', noKnock: true, dir: { x: 0, y: 1, z: 0 } });
        FX.ring(ec, 0.3, 3.6, 0.3, { c: '#ff3048', flat: false });
        FX.elec(ec, 2.7, 8);
        Sound.play('pulse', {}, ec);
      } else if (dealt > 0 && T.paid && this.shieldOffT <= 0) {
        this.shield = Math.min(PC.MAX_SHIELD, this.shield + PC.TETHER_COST);
        FX.text('+' + PC.TETHER_COST + ' SHIELD', { x: this.pos.x, y: this.pos.y + 3.2, z: this.pos.z }, { c: '#5ad8ff', always: true, dur: 0.7, vy: 1.6 });
      }
      this.yaw = yawOf(ux, uz);
      FX.swoosh({ follow: this, oy: this.chestH(), yaw: this.yaw, tilt: 0.3, r: 2.7, span: 3.2, dir: 1, sweep: 0.06, dur: 0.2, thick: 0.35 });
      Sound.play('swing', { stage: 1 });
      this.vel.y = 20.9; this.vel.x *= 0.25; this.vel.z *= 0.25;
    } else {
      this.vel.x *= 0.3; this.vel.z *= 0.3;
      this.vel.y = Math.max(this.vel.y * 0.3, 13.6);
    }
    this.airJumps = 1;
    this.releaseTether();
  }

  // Tethering a pulse grenade in flight: time slows, you reel yourself to it and kick it toward the crosshair.
  beginRebound(g) {
    const T = this.tether;
    T.mode = 'rebound'; T.spd = Math.max(23.6, Math.hypot(this.vel.x, this.vel.y, this.vel.z));
    g.catch(this);
    if (this.sheathe) this.cancelSheathe();
    this.attack = null; this.attackQueued = null; this.atkPend = null; this.plunge = null; this.dashT = 0;
    this.stand();
    this.onGround = false;
    this.iframes = Math.max(this.iframes, 0.6);
    Game.bulletTime(1.6, { kind: 'rebound' });
    Sound.play('timeSlow');
    FX.ring(g.pos, 0.2, 3.1, 0.35, { c: '#4af0ff', flat: false });
    FX.ring(g.pos, 3.6, 0.7, 0.3, { c: '#ffd070', flat: false });
    FX.elec(g.pos, 1.6, 6, { outer: '#2ab8d8', core: '#ffffff' });
  }
  moveRebound(dt) {
    const T = this.tether, g = T.target, c = this.chest();
    const dx = T.pos.x - c.x, dy = T.pos.y - c.y, dz = T.pos.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
    T.spd = Math.min(this.ult ? 100 : 74.5, T.spd + 327 * dt);
    this.vel.x = (dx / d) * T.spd; this.vel.y = (dy / d) * T.spd; this.vel.z = (dz / d) * T.spd;
    this.ghostT -= dt;
    if (this.ghostT <= 0) { this.ghostT = 0.02; this.makeGhost('#ffd070', 0.3, 0.5); }
    if (d < 1.64) this.reboundKick();
    else if (T.t > 0.6) { if (d < 3.6) this.reboundKick(); else this.releaseTether(); }
    else if (!g || g.dead) this.releaseTether();
  }
  // The blade never touches the grenade (a slash sets it off): you kick it toward the crosshair and
  // backflip off it.
  reboundKick() {
    const T = this.tether, g = T.target, A = Camera.aim;
    const dx = A.x - g.pos.x, dy = A.y - g.pos.y, dz = A.z - g.pos.z, l = Math.hypot(dx, dy, dz) || 1;
    const dir = { x: dx / l, y: dy / l, z: dz / l };
    g.kick(dir, this);
    this.releaseTether();
    Game.endBulletTime();
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    this.yaw = yawOf(dir.x, dir.z);
    this.kickAnim = { t: 0, dur: 0.5, dir };
    // pushing off the grenade sends you back and up
    const hl = Math.hypot(dir.x, dir.z) || 1;
    this.vel.x = (-dir.x / hl) * 13.6; this.vel.z = (-dir.z / hl) * 13.6; this.vel.y = 20.9 + Math.max(0, dir.y) * 8.2;
    this.airJumps = 1; this.hoverAvail = true;
    this.iframes = Math.max(this.iframes, 0.35);
    const p = g.pos;
    FX.slashLine(p, { x: p.x + dir.x * 4, y: p.y + dir.y * 4, z: p.z + dir.z * 4 }, { w: 0.18, dur: 0.22, pal: 'gold' });
    FX.ring(p, 0.27, 2.4, 0.25, { c: '#ffd070', flat: false });
    FX.ring(p, 0.2, 1.1, 0.16, { c: '#ffffff', flat: false });
    FX.sparks(p, 24, dir, 0.9, 10.9, 34.5, { c0: '#ffffff', c1: '#ffe080', c2: '#ff5a3a' });
    FX.flash('#ffffff', 0.22);
    Sound.play('kick');
    Sound.play('rebound');
    Game.hitstop(0.07);
    Game.shake(0.35);
  }

  // ---------- utility (F) ----------
  // Each character has one utility on a cooldown; CHARACTERS names it and js/utilities.js defines it.
  utility() { const c = CHARACTERS[this.charId]; return c && c.utility ? getUtility(c.utility) : null; }
  tryUtility() {
    const def = this.utility();
    if (!def || this.dead) return;
    if (this.utilCD > 0 || (def.canUse && !def.canUse(this))) { Sound.play('denied'); this.utilFlash = 0.35; return; }
    def.use(this);
    this.utilCD = def.cooldown;
  }

  // ---------- damage ----------
  // h: { dmg, from: {x,y,z}, kind, source, proj, knock (m/s), unparryable, through, pierce }
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
    this.attack = null; this.attackQueued = null; this.atkPend = null; this.postPose = 0; this.plunge = null; this.kickAnim = null;
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
  // A pulse hit knocks the shield out: it drops to zero and can't recharge for a while.
  disableShield(dur) {
    this.shield = 0; this.shieldOffT = dur;
    this.shieldDelay = Math.max(this.shieldDelay, dur); this.regenOn = false;
    Sound.play('shieldBreak');
    FX.text('SHIELD DISABLED', { x: this.pos.x, y: this.pos.y + 2.9, z: this.pos.z }, { c: '#5ad8ff', always: true, dur: 1.2, vy: 1.4 });
    FX.elec(this.center(), 1.3, 6, { outer: '#2ab8d8', core: '#ffffff' });
  }
  die() {
    this.hp = 0; this.dead = true; this.deadT = 0;
    this.stopAllLoops();
    if (this.tether && this.rebounding()) Game.endBulletTime();
    this.attack = null; this.sheathe = null; this.tether = null; this.iaido = null; this.atkPend = null; this.plunge = null; this.kickAnim = null;
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
