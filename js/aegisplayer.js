'use strict';
// AEGIS-07 as a playable character: the rival's mech on the player's controller, with two weapon modes it
// switches between by holding F for a second (letting go, dashing, attacking or a hit cancels the switch).
//   Gunner (the default) zones: holding attack fires the forearm machine gun (single-target rounds from a
//   magazine, R or an empty magazine reloads); E fires the shoulder cannon's beam, which pierces everything on
//   its line and drains shield for as long as it's held, rooting you (hovering in the air). No heavy, no parry.
//   Melee gets enemies off you: a brutish string of lunging swipes from the wrist blade ending in a thrust, a
//   held overhead cleave, a slide attack and a jet plunge; E is a block on the raised blade that parries, and
//   holding it after a block draws the arm back to drive a focused pulse burst out of the blade on release.
// Either mode: jet dashes, a hover at the top of the double jump, the shared tether, and Q's orbital strike
// (hold to charge the shoulder cannon into bullet time with the arc shown, press again to fire the probe).
// Its light is cyan, apart from the rival's blue and RONIN's red.

// a taller, broader body than RONIN's on the same move rules; its run is a touch slower and its dash a jet boost
const AEGIS_MOVE = Object.assign({}, MOVE, {
  R: 0.48, H: 2.4, CROUCH_H: 1.65, SLIDE_H: 1.4, CHEST: 1.78,
  RUN: 9.0, SPRINT: 12.6, DASH_SPEED: 40, DASH_TIME: 0.16,
});
const AEGIS_P = { glow: '#21b8ff', hi: '#a8ecff', core: '#e8fbff', off: '#22262f', wire: '#2a2c36' };
const AEGIS_PSPARK = { c0: '#ffffff', c1: '#8ae8ff', c2: '#0e4a6a' };
const AEGIS_PELEC = { outer: '#21b8ff', core: '#ffffff' };
PALETTES.aegis = [[240, 252, 255], [140, 232, 255], [33, 184, 255], [8, 50, 90]];
PAL_LIN.aegis = PALETTES.aegis.map((c) => c.map(_lin));

// SWITCH: seconds F is held to change mode. HOVER: seconds of hover after a double jump, sinking HOVER_SINK m/s,
// moving at HOVER_SPEED of a run. The gun: MAG rounds at RATE a second, RELOAD seconds to refill, ROUND_DMG each,
// spread from SPREAD0 to SPREAD1 radians as it heats by HEAT a shot, drawn onto an enemy within ASSIST radians of the
// crosshair. The beam: COST shield to fire, DRAIN a second
// while held, CHARGE seconds of startup, at least MIN seconds once firing, DMG every TICK to everything within
// BEAM_R of its line, turning after the crosshair at BEAM_TURN rad/s. The pulse burst: BURST_LEN m long, from
// BURST_MIN damage on a quick release to BURST_MAX after BURST_FULL seconds held. The ultimate: ULT_HOLD seconds
// on Q to charge, ULT_AIM seconds of aiming at most (time runs at ULT_SLOW), landing up to ULT_RANGE m away.
const AP = {
  SWITCH: 1.0,
  HOVER: 1.4, HOVER_SINK: 0.5, HOVER_SPEED: 0.85,
  MAG: 40, RATE: 13, RELOAD: 1.5, ROUND_DMG: 7, ROUND_SPEED: 150, SPREAD0: 0.006, SPREAD1: 0.035, HEAT: 0.06, ASSIST: 0.055,
  BEAM_COST: 20, BEAM_DRAIN: 26, BEAM_CHARGE: 0.42, BEAM_MIN: 0.3, BEAM_TICK: 0.12, BEAM_DMG: 11, BEAM_R: 0.55, BEAM_TURN: 5, BEAM_RANGE: 70,
  BURST_LEN: 14, BURST_FULL: 0.55, BURST_MIN: 85, BURST_MAX: 160,
  ULT_HOLD: 0.45, ULT_AIM: 4, ULT_RANGE: 45, ULT_SLOW: 0.3,
};
// The melee string, in the same terms as RONIN's swings (player.js): two lunging swipes, then a thrust that
// drives through; the held cleave comes down over the top and throws a ring across the ground.
const AEGIS_SWINGS = {
  A1: { dur: 0.3, wind: 0.05, sweep: 0.1, act0: 0.05, act1: 0.17, cancelT: 0.19, span: 2.6, r: 3.2, band: 1.4, dmg: 20, knock: 16, hitstop: 0.05, shake: 0.12, fade: 0.16, lunge: 12, tilt: 0.25 },
  A2: { dur: 0.3, wind: 0.05, sweep: 0.1, act0: 0.05, act1: 0.17, cancelT: 0.19, span: 2.6, r: 3.2, band: 1.4, dmg: 20, knock: 16, hitstop: 0.05, shake: 0.12, fade: 0.16, lunge: 12, tilt: 0.25 },
  A3: { dur: 0.46, wind: 0.08, sweep: 0.08, act0: 0.08, act1: 0.22, span: 0.9, r: 4.4, band: 1.2, dmg: 42, knock: 36, hitstop: 0.09, shake: 0.3, fade: 0.2, lunge: 26, tilt: 0.05, finisher: true, thrust: true },
  AH: { heavy: true, wind: 0.14, dur: 0.66, sweep: 0.12, act0: 0.14, act1: 0.28, span: 2.8, r: 3.8, band: 1.8, dmg: 48, knock: 24, launch: 14, hitstop: 0.1, shake: 0.4, fade: 0.3, lunge: 9, quake: true, finisher: true, tilt: Math.PI / 2 },
};

CHARACTERS.aegis = { id: 'aegis', name: 'AEGIS-07', utility: null, make: (pos) => new AegisPlayer(pos) };

// A machine-gun round: fast and single-target. It stops on the first thing on its line: a wall, a body (shields
// and armour turn it), a barrel (lighting its fuse) or a hostile grenade (setting it off where it is).
class AegisRound {
  constructor(pos, dir, dmg) {
    this.kind = 'round';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.tail = { x: pos.x, y: pos.y, z: pos.z };
    this.dir = { x: dir.x, y: dir.y, z: dir.z }; this.vel = { x: dir.x * AP.ROUND_SPEED, y: dir.y * AP.ROUND_SPEED, z: dir.z * AP.ROUND_SPEED };
    this.dmg = dmg; this.life = 0.6; this.dead = false; this.hostile = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const o = this.pos, d = this.dir;
    this.tail.x = o.x; this.tail.y = o.y; this.tail.z = o.z;
    let best = AP.ROUND_SPEED * dt, hit = null, kind = null;
    const w = World.raycast(o, d, best);
    if (w) { best = w.t; kind = 'wall'; }
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const t = rayBody(o, d, best, e, 0.08);
      if (t >= 0 && t < best) { best = t; hit = e; kind = 'enemy'; }
    }
    for (const pr of Game.props) {
      if (pr.dead || !pr.grabR) continue;
      const t = rayBody(o, d, best, pr, 0.05);
      if (t >= 0 && t < best) { best = t; hit = pr; kind = 'prop'; }
    }
    for (const g of Game.projectiles) {
      if (g.dead || g.kind !== 'grenade' || !g.hostile) continue;
      const vx = g.pos.x - o.x, vy = g.pos.y - o.y, vz = g.pos.z - o.z, t = clamp(vx * d.x + vy * d.y + vz * d.z, 0, best);
      if (Math.hypot(vx - d.x * t, vy - d.y * t, vz - d.z * t) < 0.45 && t < best) { best = t; hit = g; kind = 'grenade'; }
    }
    o.x += d.x * best; o.y += d.y * best; o.z += d.z * best;
    if (!kind) return;
    this.dead = true;
    const back = { x: -d.x, y: -d.y, z: -d.z };
    if (kind === 'enemy') {
      const dealt = hurtEnemy(hit, this.dmg, { kv: { x: d.x * 2.5, y: 1.2, z: d.z * 2.5 }, dir: d, cause: 'round', noStagger: true, ranged: true, hitstop: 0 });
      if (dealt) FX.sparks(o, 3, back, 1.2, 3, 9, AEGIS_PSPARK);
    } else if (kind === 'prop') hit.hit(this.dmg, { kv: { x: d.x * 4, y: 2, z: d.z * 4 } });
    else if (kind === 'grenade') hit.onSlash();
    else {
      FX.sparks(o, 3, back, 1.4, 3, 10, { c0: '#ffffff', c1: '#a8ecff', c2: '#3a4a5a' });
      if (Math.random() < 0.25) FX.dust(o, 1, { smax: 1.4 });
    }
  }
}

class AegisPlayer extends Player {
  constructor(pos) {
    super(pos, AEGIS_MOVE);
    this.charId = 'aegis';
    this.mode = 'gun'; this.swap = null;
    this.gun = { ammo: AP.MAG, reload: 0, cool: 0, heat: 0, flash: 0, firing: false };
    this.beamAct = null; this.hover = null; this.hoverArm = false;
    this.ultAim = null; this.ultCharging = 0; this.ultFlash = 0; this.probeT = 0;
    this.bladeOut = 0; this.burstT = 0; this.burstDir = null; this.thrust = 0; this.jetT = 0; this.t = 0; this.swapFlash = 0;
  }
  // no scarf on a mech
  initScarf() { this.scarf = null; }
  updateScarf() {}
  timerKeys() { return AegisPlayer.TIMERS; }

  // ---------- where its parts are ----------
  fwd() { return { x: fwdX(this.yaw), z: fwdZ(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  // a point in its body frame: x to its right, y up from its feet (scaled down while crouched), f forward
  local(x, y, f) {
    const F = this.fwd(), R = this.right(), k = Math.min(1, this.h / this.M.H);
    return { x: this.pos.x + R.x * x + F.x * f, y: this.pos.y + y * k, z: this.pos.z + R.z * x + F.z * f };
  }
  // the right forearm's muzzle, down the aim from the shoulder
  muzzle() { const s = this.local(0.45, 2.0, 0.05), a = this.aimDir; return { x: s.x + a.x * 1.0, y: s.y + a.y * 1.0, z: s.z + a.z * 1.0 }; }
  // the shoulder cannon's lens, on the left shoulder
  lens() { return this.local(-0.42, 2.45, 0.3); }
  // the left hand, where the tether leaves from
  hand() {
    const c = this.chest(), Y = this.yaw;
    return { x: c.x - Math.cos(Y) * 0.45 + fwdX(Y) * 0.3, y: c.y + 0.05, z: c.z + Math.sin(Y) * 0.45 + fwdZ(Y) * 0.3 };
  }
  // the blade emitter on the right wrist
  emitter() { const f = this.fwd(), c = this.chest(), R = this.right(); return { x: c.x + R.x * 0.35 + f.x * 0.5, y: c.y + 0.1, z: c.z + R.z * 0.35 + f.z * 0.5 }; }
  footfall() { FX.dust(this.pos, 1, { smax: 1.4 }); }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    super.update(dt);
    this.bladeOut = approach(this.bladeOut, this.mode === 'blade' && !this.dead ? 1 : 0, dt * 6);
    this.updateJets(dt);
  }
  updateCombat(dt, I) {
    this.updateSwap(dt);
    if (this.mode === 'blade') this.updateSheathe(dt);
    else this.updateBeam(dt);
    if (Input.wasPressed('dash')) { this.dashBuf = PC.INPUT_BUF; if (this.attack && !this.dashHold) this.dashHold = PC.CANCEL_RECOVERY; }
    this.updateDashBuffer(dt, I);
    this.updateTetherInput();
    this.updateTether(dt);
    if (Input.wasPressed('attack')) this.onAttackPressed();
    this.updateAttackInput(dt);
    this.updateGun(dt);
    this.updateUlt(dt);
  }
  moveMods(dt, I) {
    super.moveMods(dt, I);
    // firing on the ground is a steadier walk with no sprint; holding F slows it a little
    if (this.gun.firing && this.onGround) this.speedMul *= 0.72;
    if (this.swap) this.speedMul *= 0.85;
    this.updateHover(dt, I);
    if (this.beamAct) { this.canJump = false; this.canSlide = false; this.canCling = false; }
  }
  // The beam roots it where it stands (hanging in the air on its jets if it fired there).
  moveSpecial(dt) {
    if (!this.beamAct) return false;
    const [nx, nz] = approach2(this.vel.x, this.vel.z, 0, 0, 70 * dt);
    this.vel.x = nx; this.vel.z = nz;
    this.vel.y = this.onGround ? 0 : approach(this.vel.y, 0, 45 * dt);
    return true;
  }
  canMantle(reeled) { return super.canMantle(reeled) && !this.beamAct; }
  updateFacing(dt) {
    if (!Camera.fp) {
      // the cannon is on the left shoulder, so the body turns that shoulder in
      const B = this.beamAct, want = B ? yawOf(B.dir.x, B.dir.z) - 0.35 : this.ultAim || this.ultCharging > 0 ? this.aimYaw - 0.3 : null;
      if (want !== null) { this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 16); this.aimHold = PC.FACE_AIM; return; }
    }
    super.updateFacing(dt);
  }

  // ---------- the hover: the jets hold it at the top of a double jump ----------
  updateHover(dt, I) {
    const T = this.tether;
    if (this.onGround || this.dashT > 0 || this.cling || this.mantle || this.vault || this.plunge || this.beamAct || (T && T.phase === 'attached')) {
      this.endHover();
      if (this.onGround) this.hoverArm = false;
    }
    if (this.hoverArm && !this.hover && !this.onGround && this.vel.y <= 1.5 && !this.beamAct) {
      this.hoverArm = false;
      this.hover = { t: 0 };
      this.loops.jets = Sound.loop('jets');
      Sound.play('jetBurst', { soft: true });
      FX.ring(this.local(0, 1.2, -0.3), 0.2, 1.4, 0.22, { c: AEGIS_P.hi });
    }
    const H = this.hover;
    if (!H) return;
    H.t += dt;
    if (I.crouchPressed || H.t >= AP.HOVER) { this.endHover(); return; }
    this.gravK = 0;
    this.vel.y = damp(this.vel.y, -AP.HOVER_SINK, 8, dt);
    this.speedMul *= AP.HOVER_SPEED;
    this.canCling = false;
    // a wash of heat under it
    if (Math.random() < 0.5) FX.sparks(this.local(rand(-0.2, 0.2), 1.0, -0.35), 1, { x: 0, y: -1, z: 0 }, 0.5, 6, 12, Object.assign({ g: -4, life: 0.5 }, AEGIS_PSPARK));
  }
  endHover() {
    if (!this.hover) return;
    this.hover = null;
    this.stopLoop('jets');
  }
  hovering() { return !!this.hover || (!!this.beamAct && !this.onGround) || (!!this.ultAim && !this.onGround); }
  // how hard its back jets burn this tick (aegisviews.js draws them)
  updateJets(dt) {
    this.jetT = Math.max(0, this.jetT - dt);
    const want = this.dead ? 0 : this.dashT > 0 || this.plunge ? 1 : this.jetT > 0 ? 0.9 : this.hover ? 0.75 : this.hovering() ? 0.6
      : !this.onGround && this.vel.y > 2 ? 0.25 : this.onGround ? 0.05 + 0.15 * this.sprintK : 0.1;
    this.thrust = approach(this.thrust, want, dt * 8);
  }

  // ---------- moves on the controller ----------
  moveEvent(ev, d) {
    const p = this.pos;
    if (ev === 'djump') {
      // the second jump lights the jets, and they hold it at the top
      this.hoverArm = true; this.jetT = 0.3;
      Sound.play('djump'); Sound.play('jetBurst');
      FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.2, 1.6, 0.25, { c: AEGIS_P.hi });
      FX.sparks(this.local(0, 1.1, -0.35), 10, { x: 0, y: -1, z: 0 }, 0.8, 6, 16, AEGIS_PSPARK);
      FX.light(this.local(0, 1.2, -0.4), AEGIS_P.glow, 3, 5, 0.2);
      FPFX.kick('jump');
      return;
    }
    if (ev === 'dash') {
      // a jet boost off the back
      Sound.play('dash'); Sound.play('jetBurst');
      const c = this.chest(), back = this.local(0, 1.9, -0.45);
      FX.ring(c, 0.2, 1.5, 0.2, { c: AEGIS_P.hi, flat: false });
      FX.sparks(back, 12, { x: -d.x, y: -0.2, z: -d.z }, 0.7, 7, 20, AEGIS_PSPARK);
      FX.light(back, AEGIS_P.glow, 3.5, 5, 0.15);
      if (this.onGround) FX.dust(p, 4, { smax: 3.6 });
      Game.shake(0.07);
      FPFX.kick('dash', { dir: d });
      return;
    }
    if (ev === 'bulletjump') {
      this.bulletT = 0.4; this.jetT = 0.4;
      this.yaw = yawOf(d.x, d.z);
      Sound.play('bulletjump'); Sound.play('jetBurst');
      FX.dust(p, 8, { smax: 6.4, rise: 0.9 });
      FX.ring({ x: p.x, y: p.y + 0.55, z: p.z }, 0.25, 1.8, 0.25, { flat: false, c: AEGIS_P.hi });
      FX.sparks(this.local(0, 1.4, -0.35), 12, { x: -d.x, y: -d.y, z: -d.z }, 1.2, 6, 18, AEGIS_PSPARK);
      Game.shake(0.09);
      FPFX.kick('dash', { scale: 0.7, dir: d });
      return;
    }
    if (ev === 'land') {
      this.endHover(); this.hoverArm = false;
      this.spinT = 0; this.bulletT = 0;
      if (this.kickAnim && this.kickAnim.t > 0.1) this.kickAnim = null;
      if (this.plunge) { this.plungeImpact(); return; }
      // too heavy to roll: a hard landing thuds and kicks up the street
      if (d.vy < -16) {
        this.landSquash = 0.12;
        Sound.play('land', { v: clamp(-d.vy / 28, 0.5, 1.3) });
        FX.dust(p, 5 + ((-d.vy / 8) | 0), { smax: 4.2 });
        if (d.vy < -26) { FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.3, 2.2, 0.25, { c: AEGIS_P.hi }); Game.shake(0.12); }
      }
      if (Input.isDown('crouch') && Controller.hspeed(this) > this.M.SLIDE_MIN && !this.attack && !this.sheathe && !this.beamAct) Controller.startSlide(this);
      return;
    }
    super.moveEvent(ev, d);
  }
  tryDash(I) {
    if (this.dashCharges <= 0 || this.dashT > 0 || this.iaido) return;
    if (this.beamAct) this.endBeam();
    this.endHover();
    super.tryDash(I);
  }
  updateGhosts(dt) {
    if (this.dashT > 0 || this.bulletT > 0 || (this.plunge && this.plunge.t > 0.05)) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = this.dashT > 0 ? 0.022 : 0.04; this.makeGhost(AEGIS_P.glow, 0.22, 0.45); }
    }
  }

  // ---------- F: holding it switches weapon modes ----------
  swapBlocked() { return this.dead || !!this.beamAct || !!this.sheathe || this.ultHold > 0 || this.ultCharging > 0 || !!this.kickAnim || this.rebounding(); }
  updateSwap(dt) {
    const W = this.swap;
    if (!W) {
      if (!Input.wasPressed('utility')) return;
      if (this.swapBlocked()) { Sound.play('denied'); this.utilFlash = 0.35; return; }
      this.swap = { t: 0, to: this.mode === 'gun' ? 'blade' : 'gun' };
      this.loops.swap = Sound.loop('charge');
      this.loops.swap.set(0);
      Sound.play('modeCharge');
      return;
    }
    if (!Input.isDown('utility') || this.swapBlocked() || ['attack', 'sheathe', 'dash', 'ultimate', 'tether'].some((a) => Input.wasPressed(a))) { this.cancelSwap(); return; }
    W.t += dt;
    const k = W.t / AP.SWITCH;
    if (this.loops.swap) this.loops.swap.set(k);
    // the forearm housing opens up: sparks and arcs off it, faster as it nears
    if (Math.random() < 0.3 + 0.6 * k) FX.sparks(this.emitter(), 1, null, TAU, 1.5, 4 + 6 * k, Object.assign({ g: 0, life: 0.5 }, AEGIS_PSPARK));
    if (Math.random() < 0.15 + 0.4 * k) FX.elec(this.emitter(), 0.3 + 0.4 * k, 1, AEGIS_PELEC);
    if (W.t >= AP.SWITCH) this.finishSwap();
  }
  cancelSwap() {
    if (!this.swap) return;
    this.swap = null;
    this.stopLoop('swap');
    FX.sparks(this.emitter(), 4, null, TAU, 1.5, 5, AEGIS_PSPARK);
  }
  finishSwap() {
    const to = this.swap.to;
    this.swap = null;
    this.stopLoop('swap');
    this.mode = to;
    this.atkPend = null; this.attackQueued = null; this.attack = null; this.strN = 0; this.strLights = 0; this.comboTimer = 0;
    this.gun.firing = false;
    this.utilT = 0.3; this.swapFlash = 0.3;
    const e = this.emitter(), c = this.chest();
    FX.ring(c, 0.3, 2.2, 0.28, { c: AEGIS_P.hi, flat: false });
    FX.sparks(e, 18, this.aimDir, 1.6, 4, 14, AEGIS_PSPARK);
    FX.elec(e, 0.9, 4, AEGIS_PELEC);
    FX.light(e, AEGIS_P.glow, 4, 5, 0.25);
    Sound.play('modeSwitch', { blade: to === 'blade' });
    Game.shake(0.08);
  }

  // ---------- gunner: the machine gun ----------
  canFire() {
    return this.mode === 'gun' && !this.swap && !this.beamAct && this.ultHold <= 0 && this.ultCharging <= 0 && !this.kickAnim && !this.rebounding()
      && !this.mantle && !this.vault && !this.cling && this.hurtT <= 0.1 && !this.dead;
  }
  startReload() {
    const G = this.gun;
    if (G.reload > 0 || G.ammo >= AP.MAG) return;
    G.reload = AP.RELOAD;
    Sound.play('reload');
    FX.sparks(this.local(0.42, 1.7, 0), 6, { x: 0, y: 1, z: 0 }, 1.2, 2, 6, Object.assign({ life: 0.6 }, AEGIS_PSPARK));
  }
  updateGun(dt) {
    const G = this.gun;
    G.heat = Math.max(0, G.heat - dt * 1.6);
    G.flash = Math.max(0, G.flash - dt);
    if (G.reload > 0) {
      G.reload -= dt;
      if (G.reload <= 0) { G.reload = 0; G.ammo = AP.MAG; Sound.play('reloadDone'); }
    }
    if (Input.wasPressed('reload') && this.mode === 'gun') this.startReload();
    const want = Input.isDown('attack') && this.canFire();
    if (want && Input.wasPressed('attack') && G.reload > 0) Sound.play('dryFire');
    G.firing = want && G.reload <= 0 && G.ammo > 0;
    if (want && G.reload <= 0 && G.ammo <= 0) this.startReload();
    if (!G.firing) { G.cool = Math.max(0, G.cool - dt); return; }
    this.aimHold = PC.FACE_AIM;
    G.cool -= dt;
    while (G.cool <= 0 && G.ammo > 0) { this.fireRound(); G.cool += 1 / AP.RATE; }
    if (G.ammo <= 0) this.startReload();
  }
  // a little aim assist: the middle of an enemy within ASSIST of the crosshair's line that the muzzle can see,
  // so rounds from the shoulder-high forearm don't pass over a head the crosshair is on
  gunTarget(m) {
    const o = Camera.pos, d = Camera.dir;
    let best = null, ba = AP.ASSIST;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const c = e.center(), vx = c.x - o.x, vy = c.y - o.y, vz = c.z - o.z, l = Math.hypot(vx, vy, vz);
      if (l < Camera.curDist || l > 70) continue;
      const ang = Math.acos(clamp((vx * d.x + vy * d.y + vz * d.z) / l, -1, 1)) - Math.atan2(e.r, l);
      if (ang >= ba) continue;
      const mx = c.x - m.x, my = c.y - m.y, mz = c.z - m.z, ml = Math.hypot(mx, my, mz) || 1;
      if (World.raycast(m, { x: mx / ml, y: my / ml, z: mz / ml }, Math.max(0, ml - e.r))) continue;
      ba = ang; best = c;
    }
    return best;
  }
  fireRound() {
    const G = this.gun, m = this.muzzle(), A = this.gunTarget(m) || Camera.aim;
    let dx = A.x - m.x, dy = A.y - m.y, dz = A.z - m.z, l = Math.hypot(dx, dy, dz);
    if (l < 2) { dx = Camera.dir.x; dy = Camera.dir.y; dz = Camera.dir.z; l = 1; }
    const d = coneDir({ x: dx / l, y: dy / l, z: dz / l }, lerp(AP.SPREAD0, AP.SPREAD1, Math.min(1, G.heat)) * 2);
    G.heat = Math.min(1, G.heat + AP.HEAT); G.ammo--; G.flash = 0.05;
    Game.projectiles.push(new AegisRound({ x: m.x + d.x * 0.2, y: m.y + d.y * 0.2, z: m.z + d.z * 0.2 }, d, AP.ROUND_DMG));
    FX.sparks(m, 2, d, 0.5, 6, 16, AEGIS_PSPARK);
    if (Math.random() < 0.5) FX.light(m, AEGIS_P.glow, 2.2, 4, 0.05);
    Sound.play('aegisGun');
  }

  // ---------- gunner: E fires the shoulder cannon's beam ----------
  beamWant() {
    const o = this.lens(), A = Camera.aim, dx = A.x - o.x, dy = A.y - o.y, dz = A.z - o.z, l = Math.hypot(dx, dy, dz);
    return l < 2 ? { x: Camera.dir.x, y: Camera.dir.y, z: Camera.dir.z } : { x: dx / l, y: dy / l, z: dz / l };
  }
  tryBeam() {
    if (this.beamAct || this.swap || this.ultHold > 0 || this.ultCharging > 0 || this.dead || this.kickAnim || this.rebounding() || this.mantle || this.vault || this.dashT > 0) return;
    if (!S.gameplay.invincible && this.shield < AP.BEAM_COST) { Sound.play('noShield'); this.shieldFlash = 0.5; return; }
    if (!S.gameplay.invincible) this.shield -= AP.BEAM_COST;
    this.shieldDelay = Math.max(this.shieldDelay, 1.4); this.regenOn = false;
    if (this.tether) this.releaseTether();
    Controller.dropCling(this);
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    this.endHover();
    this.atkPend = null; this.gun.firing = false;
    this.beamAct = { phase: 'charge', t: 0, dir: this.beamWant(), o: this.lens(), len: 0, tick: 0, cut: 0, release: false };
    Sound.play('laserCharge', { dur: AP.BEAM_CHARGE });
  }
  updateBeam(dt) {
    if (Input.wasPressed('sheathe') && !this.beamAct) this.tryBeam();
    const B = this.beamAct;
    if (!B) return;
    B.t += dt;
    this.shieldDelay = Math.max(this.shieldDelay, 1.2); this.regenOn = false;
    if (!Input.isDown('sheathe')) B.release = true;
    const o = this.lens();
    B.o = o;
    B.dir = turnDir(B.dir, this.beamWant(), AP.BEAM_TURN * dt);
    if (B.phase === 'charge') {
      // energy drawn into the lens from all round it
      const k = clamp(B.t / AP.BEAM_CHARGE, 0, 1);
      for (let i = 0; i < 2 + Math.round(k * 2); i++) {
        const u = coneDir(null, TAU), R = lerp(2.2, 0.9, k), q = { x: o.x + u.x * R, y: o.y + u.y * R, z: o.z + u.z * R };
        FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3.4, R * 4, Object.assign({ g: 0, life: 0.6 }, AEGIS_PSPARK));
      }
      if (Math.random() < 0.5) FX.elec(o, 0.4 + 0.4 * k, 1, AEGIS_PELEC);
      if (B.t >= AP.BEAM_CHARGE) {
        B.phase = 'fire'; B.t = 0;
        FX.ring(o, 0.2, 2.2, 0.22, { c: AEGIS_P.hi, flat: false });
        FX.light(o, '#e0f8ff', 5, 10, 0.2);
        Game.shake(0.12);
        this.loops.beam = Sound.loop('beam');
      }
      return;
    }
    if (!S.gameplay.invincible) this.shield = Math.max(0, this.shield - AP.BEAM_DRAIN * dt);
    const d = B.dir, wall = World.raycast(o, d, AP.BEAM_RANGE);
    B.len = wall ? wall.t : AP.BEAM_RANGE;
    const end = { x: o.x + d.x * B.len, y: o.y + d.y * B.len, z: o.z + d.z * B.len };
    if (wall) {
      if (Math.random() < 0.8) FX.sparks(end, 2, { x: -d.x, y: -d.y, z: -d.z }, 1.6, 5.5, 18, AEGIS_PSPARK);
      if (Math.random() < 0.1) FX.decal('scorch', end, { r: 0.45, dur: 3 });
    }
    // street lamps in its path are cut down, and it burns bolts and probes out of the air and sets off grenades
    if ((B.cut -= dt) <= 0) {
      B.cut = 0.1;
      Props.slash((q) => rayBody(o, d, B.len, q, 0.3) >= 0, o.y, { x: d.x, z: d.z });
      for (const b of Game.projectiles) {
        if (b.dead || !b.hostile) continue;
        const vx = b.pos.x - o.x, vy = b.pos.y - o.y, vz = b.pos.z - o.z, t = clamp(vx * d.x + vy * d.y + vz * d.z, 0, B.len);
        if (Math.hypot(vx - d.x * t, vy - d.y * t, vz - d.z * t) > AP.BEAM_R + 0.4) continue;
        if (b.onSlash) b.onSlash(this);
        else { b.dead = true; FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, AEGIS_PSPARK); }
      }
    }
    if ((B.tick -= dt) <= 0) {
      B.tick = AP.BEAM_TICK;
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || rayBody(o, d, B.len, e, AP.BEAM_R) < 0) continue;
        hurtEnemy(e, AP.BEAM_DMG, { kv: { x: d.x * 5, y: 2, z: d.z * 5 }, dir: d, cause: 'beam', stagger: 0.15, hitstop: 0, ranged: true });
      }
      for (const pr of Game.props) if (!pr.dead && pr.grabR && rayBody(o, d, B.len, pr, AP.BEAM_R) >= 0) pr.hit(12, { kv: { x: d.x * 6, y: 4, z: d.z * 6 } });
    }
    Game.shake(0.012);
    const dry = !S.gameplay.invincible && this.shield <= 0;
    if ((B.release && B.t >= AP.BEAM_MIN) || dry) this.endBeam(dry);
  }
  endBeam(dry) {
    const B = this.beamAct;
    if (!B) return;
    this.beamAct = null;
    this.stopLoop('beam');
    if (B.o) FX.sparks(B.o, 8, B.dir, 1.4, 3, 9, AEGIS_PSPARK);
    if (dry) { Sound.play('noShield'); this.shieldFlash = 0.5; }
  }

  // ---------- melee: the string, the cleave, the slide attack ----------
  onAttackPressed() {
    if (this.mode !== 'blade' || this.swap) return;
    super.onAttackPressed();
  }
  resolveAttack(kind, dash) {
    if (this.mode !== 'blade' || this.sheathe || this.iaido || this.ultHold > 0 || this.plunge || this.dead) return;
    if (kind === 'H') { Sound.play('heavyDraw'); FX.light(this.chest(), AEGIS_P.glow, 3, 3, 0.12); }
    // out of a dash: the jets drive the thrust
    if (dash || this.dashT > 0 || this.dashEndT > 0) {
      this.dashT = 0; this.dashEndT = 0; this.attack = null; this.attackQueued = null;
      this.startSwing('A3', false, { boost: true });
      this.strN = 0; this.strLights = 0;
      return;
    }
    if (this.attack || this.attackCD > 0) { this.attackQueued = kind; return; }
    if (this.sliding && this.onGround && !this.stringLive()) { this.startGroundCut(kind); return; }
    this.startString(kind, false);
  }
  // swipe, backhand, thrust; a hold is the cleave
  startString(kind, chained) {
    const cont = (chained || this.comboTimer > 0) && this.strN > 0 && this.strN < 3;
    const n = cont ? this.strN + 1 : 1;
    const type = kind === 'H' ? 'AH' : n >= 3 ? 'A3' : n === 2 ? 'A2' : 'A1';
    this.startSwing(type, cont);
    this.strN = n; this.strLights = kind === 'L' ? n : 0;
    if (this.attack.finisher) { this.strN = 0; this.strLights = 0; }
  }
  startSwing(type, cont, o = {}) {
    const d = AEGIS_SWINGS[type], heavy = !!d.heavy;
    const target = this.assistTarget(d.r);
    const yaw = target ? yawOf(target.pos.x - this.pos.x, target.pos.z - this.pos.z) : this.aimYaw;
    this.yaw = yaw;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    const dir = type === 'A2' ? -1 : type === 'AH' ? -1 : 1;
    this.lastDir = dir;
    const tilt = d.tilt === Math.PI / 2 ? d.tilt : -d.tilt * dir, pa = this.swingPitch(target);
    this.attack = Object.assign({ type, heavy, finisher: !!d.finisher, stage: type === 'A3' ? 3 : 1, wind: 0, t: 0, yaw, dir, pa, pitch: Math.sin(pa), target, hit: new Set(), swept: false, boost: !!o.boost }, d, { tilt });
    this.attackQueued = null; this.postPose = 0;
    if (!this.attack.wind) this.beginSweep(this.attack);
  }
  // The blade sweeps: wide and heavy, stepping in behind it; the thrust drives straight through.
  beginSweep(a) {
    a.swept = true;
    const big = a.heavy || a.finisher;
    FX.swoosh({
      follow: this, oy: this.chestH(), yaw: a.yaw, tilt: a.tilt, pitch: a.pa || 0, r: a.r, span: a.span, dir: a.dir,
      sweep: a.sweep, dur: a.sweep + a.fade, thick: big ? 0.6 : 0.5, pal: 'aegis', trail: 1, bolts: big ? 2 : 1, boltPal: null,
    });
    const fx = fwdX(a.yaw), fz = fwdZ(a.yaw), c = this.chest();
    if (a.thrust) {
      const end = { x: c.x + fx * a.r * 1.1, y: c.y + Math.sin(a.pa || 0) * a.r, z: c.z + fz * a.r * 1.1 };
      FX.slashLine(c, end, { w: 0.32, dur: 0.22, pal: 'aegis', grow: 0.03 });
      FX.bolt(c, end, 0.16, { outer: AEGIS_P.glow, core: '#ffffff', jag: 0.2, w: 0.07, forks: 2 });
    }
    Sound.play('swing', { stage: big ? 3 : 1 });
    Sound.play('heavySwing');
    FPFX.kick(a.heavy ? 'heavy' : a.finisher ? 'finisher' : 'attack', { side: a.dir || 1 });
    // with an assisted target, close the gap to it rather than overshoot (ground friction stops a lunge in ~v^2/300 m)
    const gap = a.target ? distXZ(a.target.pos, this.pos) - a.target.r - this.r - a.r * 0.5 : Infinity;
    const close = gap === Infinity ? Infinity : Math.sqrt(300 * Math.max(0, gap));
    const lunge = (a.lunge || 0) + (a.boost ? 12 : 0);
    if (lunge) {
      const L = Math.min(lunge, close);
      this.vel.x = this.vel.x * 0.3 + fx * L; this.vel.z = this.vel.z * 0.3 + fz * L;
      if (!this.onGround) this.vel.y = Math.max(this.vel.y, a.pitch * lunge * 0.6);
      Game.shake(big ? 0.12 : 0.07);
      if (a.boost || a.thrust) { this.jetT = 0.2; FX.sparks(this.local(0, 1.9, -0.45), 8, { x: -fx, y: -0.2, z: -fz }, 0.7, 6, 16, AEGIS_PSPARK); }
    }
    if (!this.onGround && this.vel.y < 0) this.vel.y *= 0.4;
    FX.light({ x: c.x + fx * a.r * 0.6, y: c.y, z: c.z + fz * a.r * 0.6 }, AEGIS_P.glow, 3.5, a.r * 1.8, a.sweep + a.fade);
  }
  // each blow lands with a punch of force
  swingHit(a, e) {
    const c = e.center();
    FX.ring(c, 0.2, a.heavy || a.finisher ? 2.2 : 1.4, 0.16, { c: AEGIS_P.hi, flat: false });
    FX.sparks(c, 6, { x: fwdX(a.yaw), y: 0.2, z: fwdZ(a.yaw) }, 1.2, 5, 15, AEGIS_PSPARK);
  }
  // slide attack: the blade scythes low across the slide, launching what it catches
  startGroundCut() {
    const hs = Controller.hspeed(this) || 1, yaw = yawOf(this.vel.x, this.vel.z), fx = fwdX(yaw), fz = fwdZ(yaw);
    this.yaw = yaw;
    this.attack = { stage: 4, groundCut: true, scythe: true, t: 0, dur: 0.42, act0: 0.05, act1: 0.24, yaw, dir: 1, span: 2.8, tilt: 0.15, r: 3.2, pa: -0.15, sweep: 0.12, hit: new Set(), gouged: false };
    this.slideT = Math.max(this.slideT, 0.3);
    const s = Math.max(hs, 14);
    this.vel.x = fx * s; this.vel.z = fz * s;
    this.attackQueued = null; this.kickAnim = null;
    Sound.play('groundCut'); Sound.play('swing', { stage: 3 });
    FX.swoosh({ follow: this, oy: 0.7, yaw, tilt: 0.15, pitch: -0.1, r: 3.2, span: 2.8, dir: 1, sweep: 0.12, dur: 0.3, thick: 0.55, pal: 'aegis', trail: 1, bolts: 1 });
  }
  updateGroundCut(a) {
    const fx = fwdX(a.yaw), fz = fwdZ(a.yaw), tip = { x: this.pos.x + fx * 1.4, y: this.pos.y + 0.08, z: this.pos.z + fz * 1.4 };
    if (a.t < 0.26) {
      FX.sparks(tip, 2, { x: -fx, y: 0.4, z: -fz }, 0.8, 5, 16, Object.assign({ life: 0.5 }, AEGIS_PSPARK));
      if (Math.random() < 0.5) FX.debris(tip, 1, GRIT, 12);
    }
    if (!a.gouged && a.t >= 0.05) {
      a.gouged = true;
      FX.decal('gouge', { x: tip.x - fx * 0.8, y: this.pos.y, z: tip.z - fz * 0.8 }, { len: 2.6, yaw: a.yaw, dur: 5 });
      Game.shake(0.12);
    }
    if (a.t >= a.act0 && a.t <= a.act1) {
      Props.slash((q) => this.inCutBox(a, q, 0, 3.2, 1.2, 1.8), this.pos.y + 0.5, { x: fx, z: fz });
      this.cutBox(a, 0, 3.2, 1.2, 1.8, (e) => {
        hurtEnemy(e, 26, { kv: { x: fx * 16, y: 24, z: fz * 16 }, dir: { x: fx, y: 0.6, z: fz }, heavy: true, cause: 'groundcut', stagger: 0.6, hitstop: 0.04 });
        this.swingHit(a, e);
      });
    }
  }

  // ---------- melee: E blocks on the raised blade; a block charges the pulse burst ----------
  // 0..1: how long the arm has been held back since the block, in real time (the parry's slow motion doesn't
  // make it charge slower)
  burstCharge(s) { return s && s.empowered ? clamp((s.heldReal || 0) / AP.BURST_FULL, 0, 1) : 0; }
  stanceFX(s) {
    const e = this.emitter();
    if (s.empowered) s.heldReal = (s.heldReal || 0) + this.realStep();
    if (s.empowered) {
      // drawn back and building: the blade crackles harder the longer it's held
      const k = this.burstCharge(s);
      if (Math.random() < 0.5 + 0.5 * k) FX.elec(e, 0.5 + 0.7 * k, 1, AEGIS_PELEC);
      if (Math.random() < 0.3 + 0.4 * k) FX.sparks(e, 1, null, TAU, 1.5, 3 + 6 * k, Object.assign({ g: 0 }, AEGIS_PSPARK));
      if (this.loops.charge) this.loops.charge.set(0.4 + 0.6 * k);
    } else if (s.t <= s.parryUntil && Math.random() < 0.5) FX.elec(e, 0.4, 1, AEGIS_PELEC);
  }
  doParry(h) {
    const was = this.sheathe && this.sheathe.empowered;
    super.doParry(h);
    // the blow meets the blade: a cyan flare on top of the parry's gold
    const e = this.emitter();
    FX.ring(e, 0.2, 1.6, 0.2, { c: AEGIS_P.hi, flat: false });
    FX.elec(e, 1.1, 4, AEGIS_PELEC);
    Sound.play('blockHit');
    if (!was && this.sheathe && this.sheathe.empowered) { this.sheathe.heldReal = 0; if (this.loops.charge) this.loops.charge.set(0.4); }
  }
  // released after a block: the blade drives forward and a focused pulse bursts out of it, stronger the
  // longer the arm was held back
  releaseCounter(s) { this.pulseBurst(this.burstCharge(s)); }
  pulseBurst(k) {
    const c = this.chest();
    // driven out near level along the aim, so it runs along the street rather than into it
    let dir = { x: this.aimDir.x, y: clamp(this.aimDir.y, -0.12, 0.35), z: this.aimDir.z };
    const t = this.assistTarget(AP.BURST_LEN * 0.6);
    if (t) { const tc = t.center(); dir = { x: tc.x - c.x, y: clamp((tc.y - c.y) / (distXZ(tc, c) || 1), -0.12, 0.35), z: tc.z - c.z }; }
    const hl = Math.hypot(dir.x, dir.z) || 1;
    dir.x /= hl; dir.z /= hl;
    const l = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
    // out of the blade at the full reach of the thrust, in front of the body
    const s = { x: c.x + dir.x * 0.9, y: c.y + 0.1 + dir.y * 0.9, z: c.z + dir.z * 0.9 };
    const wall = World.raycast(s, dir, AP.BURST_LEN + 0.3, 0.2), len = wall ? Math.max(1.2, wall.t - 0.2) : AP.BURST_LEN;
    const end = { x: s.x + dir.x * len, y: s.y + dir.y * len, z: s.z + dir.z * len };
    const rad = lerp(1.1, 1.6, k), dmg = lerp(AP.BURST_MIN, AP.BURST_MAX, k);
    this.yaw = yawOf(dir.x, dir.z); this.burstT = 0.34; this.burstDir = dir;
    this.iframes = Math.max(this.iframes, 0.4);
    this.vel.x -= dir.x * 6; this.vel.z -= dir.z * 6;
    // what's in it: near its line on the ground, and within reach of it up and down
    const dl2 = dir.x * dir.x + dir.z * dir.z || 1, hlen = len * Math.sqrt(dl2);
    const inBurst = (b, pad) => {
      if (segDistXZ(b.pos.x, b.pos.z, s.x, s.z, end.x, end.z) > b.r + pad) return false;
      const u = clamp(((b.pos.x - s.x) * dir.x + (b.pos.z - s.z) * dir.z) / dl2, 0, hlen / Math.sqrt(dl2)), ly = s.y + dir.y * u;
      return ly > b.pos.y - pad - 0.4 && ly < b.pos.y + b.h + pad;
    };
    const hit = new Set();
    let kills = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || !inBurst(e, rad)) continue;
      hit.add(e);
      hurtEnemy(e, dmg, { kv: { x: dir.x * 34, y: 12, z: dir.z * 34 }, dir, heavy: true, cause: 'burst', stagger: 0.9, hitstop: 0, crit: true, guardBreak: true });
      if (e.dead || e.dying) kills++;
    }
    // the far end explodes, catching what stood beside the line
    const R = 2.2 + k * 0.8;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || hit.has(e) || dist3(e.center(), end) > R + e.r) continue;
      const u = { x: e.pos.x - end.x, z: e.pos.z - end.z }, ul = Math.hypot(u.x, u.z) || 1;
      hurtEnemy(e, dmg * 0.45, { kv: { x: (u.x / ul) * 20, y: 14, z: (u.z / ul) * 20 }, dir: { x: u.x / ul, y: 0.4, z: u.z / ul }, heavy: true, cause: 'burst', stagger: 0.6, hitstop: 0 });
      if (e.dead || e.dying) kills++;
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && (inBurst(pr, rad) || dist3(pr.center(), end) < R)) pr.hit(40, { heavy: true, kv: { x: dir.x * 20, y: 10, z: dir.z * 20 } });
    Props.slash((q) => inBurst(q, rad), s.y, { x: dir.x, z: dir.z });
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || !inBurst({ pos: { x: b.pos.x, y: b.pos.y - 0.3, z: b.pos.z }, r: 0.3, h: 0.6 }, rad)) continue;
      if (b.onSlash) b.onSlash(this); else { b.dead = true; FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, AEGIS_PSPARK); }
    }
    if (kills) this.counterHeal(kills);
    // a focused column of light out of the blade, rings running down it and a blast at its end
    FX.slashLine(s, end, { w: 0.55 + 0.55 * k, dur: 0.42, pal: 'aegis', grow: 0.04 });
    FX.slashLine(s, end, { w: 0.18 + 0.12 * k, dur: 0.3, pal: 'gold', grow: 0.03 });
    for (let i = 0; i < 3; i++) FX.bolt(s, end, 0.3, { outer: AEGIS_P.glow, core: '#ffffff', jag: 0.25 + i * 0.1, w: 0.08, forks: 2 });
    FX.ring(s, 0.3, 2.4, 0.25, { c: AEGIS_P.hi, flat: false });
    for (let i = 1; i <= 5; i++) {
      const q = { x: s.x + dir.x * len * (i / 5), y: s.y + dir.y * len * (i / 5), z: s.z + dir.z * len * (i / 5) };
      Game.queueCut(0.02 * i, () => { FX.ring(q, 0.2, rad * 1.4, 0.2, { c: AEGIS_P.hi, flat: false }); FX.sparks(q, 6, dir, 1.6, 5, 16, AEGIS_PSPARK); });
    }
    Game.queueCut(0.12, () => {
      FX.ring(end, 0.4, R * 1.6, 0.32, { c: '#ffffff', flat: false });
      FX.sparks(end, 30, null, TAU, 6, 22, AEGIS_PSPARK);
      FX.elec(end, R, 6, AEGIS_PELEC);
      FX.light(end, AEGIS_P.glow, 6, 10, 0.3);
    });
    FX.light(s, '#e0f8ff', 7, 14, 0.3);
    FX.flash('#e0f8ff', 0.28);
    Sound.play('pulseBurst', { power: k });
    Game.shake(0.4 + 0.3 * k);
    Game.hitstop(0.06);
    Game.slowmo(0.35, 0.25);
    FPFX.kick('counter', { scale: 0.9 + 0.3 * k, col: [140, 232, 255] });
  }

  // ---------- Q: the orbital strike ----------
  ultBlocked() { return this.dead || !!this.beamAct || !!this.sheathe || !!this.kickAnim || this.rebounding() || Game.cineActive(); }
  // the real seconds one tick stands for (more than a tick's game time in slow motion); nothing passes while paused
  realStep() { return (1 / 120) / Math.max(0.05, Game.slowScale); }
  updateUlt(dt) {
    this.ultFlash = Math.max(0, this.ultFlash - dt);
    this.probeT = Math.max(0, this.probeT - dt);
    if (this.ultAim) { this.runAim(); return; }
    if (Input.wasPressed('ultimate') && this.ultCharging <= 0) {
      if (this.ultCharge < 1 || this.ultBlocked()) { Sound.play('denied'); this.ultFlash = 0.35; return; }
      this.cancelSwap();
      this.ultCharging = 1e-4;
      this.loops.ult = Sound.loop('ultHold');
    }
    if (this.ultCharging <= 0) return;
    if (!Input.isDown('ultimate') || this.ultBlocked()) { this.ultCharging = 0; this.ultHold = 0; this.stopLoop('ult'); return; }
    // the shoulder cannon charges: energy drawn into its lens
    this.ultCharging += dt; this.ultHold = this.ultCharging;
    const k = clamp(this.ultCharging / AP.ULT_HOLD, 0, 1), o = this.lens();
    if (this.loops.ult) this.loops.ult.set(k);
    for (let i = 0; i < 2; i++) {
      const u = coneDir(null, TAU), R = lerp(2.6, 1, k), q = { x: o.x + u.x * R, y: o.y + u.y * R, z: o.z + u.z * R };
      FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3.4, R * 4, Object.assign({ g: 0, life: 0.6 }, AEGIS_PSPARK));
    }
    if (this.ultCharging >= AP.ULT_HOLD) this.beginAim();
  }
  // Bullet time and the arc: it can't be backed out of, only fired (or it fires itself after ULT_AIM seconds).
  beginAim() {
    this.ultCharging = 0; this.stopLoop('ult');
    this.ultAim = { real: 0, plan: null };
    this.ultHold = 1;
    this.attack = null; this.attackQueued = null; this.atkPend = null; this.gun.firing = false;
    Game.bulletTime(AP.ULT_AIM + 0.4, { kind: 'aim', scale: AP.ULT_SLOW, owner: this });
    Sound.play('timeSlow'); Sound.play('aimLock');
    const o = this.lens();
    FX.ring(o, 0.2, 2.6, 0.3, { c: AEGIS_P.hi, flat: false });
    FX.light(o, AEGIS_P.glow, 5, 8, 0.3);
    this.planStrike();
  }
  runAim() {
    this.ultHold = 1;
    this.aimHold = PC.FACE_AIM;
    this.ultAim.real += this.realStep();
    this.planStrike();
    if (Input.wasPressed('ultimate') || this.ultAim.real >= AP.ULT_AIM) this.fireProbe();
  }
  // where the probe lands: the crosshair's spot (within reach), on the arc the cannon throws it on, or the first
  // thing that arc runs into
  planStrike() {
    const A = this.ultAim, o = this.lens(), P = this.pos, C = Camera;
    const q = { x: C.aim.x - C.dir.x * 0.3, y: C.aim.y - C.dir.y * 0.3, z: C.aim.z - C.dir.z * 0.3 };
    const dx = q.x - P.x, dz = q.z - P.z, dh = Math.hypot(dx, dz);
    if (dh > AP.ULT_RANGE) { q.x = P.x + (dx / dh) * AP.ULT_RANGE; q.z = P.z + (dz / dh) * AP.ULT_RANGE; }
    let gy = World.groundAt(q.x, q.z, q.y + 0.5);
    if (gy === -Infinity) gy = World.groundAt(q.x, q.z, P.y + 0.5);
    if (gy === -Infinity) gy = World.def.groundY;
    let land = { x: q.x, y: gy, z: q.z };
    const g = STRIKE.ult.g, T = clamp(dist3(o, land) / 26, 0.55, 1.5);
    const v = { x: (land.x - o.x) / T, y: (land.y - o.y) / T + 0.5 * g * T, z: (land.z - o.z) / T };
    // the first thing along the arc
    const N = 24, pts = [o];
    let at = o, tEnd = T;
    for (let i = 1; i <= N; i++) {
      const tt = (i / N) * T, b = { x: o.x + v.x * tt, y: o.y + v.y * tt - 0.5 * g * tt * tt, z: o.z + v.z * tt };
      const sx = b.x - at.x, sy = b.y - at.y, sz = b.z - at.z, sl = Math.hypot(sx, sy, sz) || 1e-6;
      const hit = i < N ? World.raycast(at, { x: sx / sl, y: sy / sl, z: sz / sl }, sl) : null;
      if (hit) {
        const hp = { x: at.x + (sx / sl) * hit.t, y: at.y + (sy / sl) * hit.t, z: at.z + (sz / sl) * hit.t };
        pts.push(hp);
        const hg = World.groundAt(hp.x - (sx / sl) * 0.05, hp.z - (sz / sl) * 0.05, hp.y + 0.3);
        land = { x: hp.x, y: hg === -Infinity ? hp.y : hg, z: hp.z };
        tEnd = tt;
        break;
      }
      pts.push(b);
      at = b;
    }
    A.plan = { o, v, g, T: tEnd, land, pts };
  }
  fireProbe() {
    const A = this.ultAim;
    this.ultAim = null; this.ultHold = 0;
    if (Game.btOwner === this) Game.endBulletTime();
    if (!A || !A.plan) return;
    this.ultCharge = 0;
    Game.stats.ults++;
    const o = this.lens(), v = A.plan.v;
    Game.projectiles.push(new StrikeProbe(o, v, { owner: this, cfg: STRIKE.ult }));
    const vl = Math.hypot(v.x, v.y, v.z) || 1, d = { x: v.x / vl, y: v.y / vl, z: v.z / vl };
    FX.ring(o, 0.2, 1.8, 0.2, { c: AEGIS_P.hi, flat: false });
    FX.sparks(o, 16, d, 0.8, 6, 20, AEGIS_PSPARK);
    FX.light(o, '#e0f8ff', 6, 9, 0.2);
    this.probeT = 0.35;
    this.vel.x -= d.x * 4; this.vel.z -= d.z * 4;
    Sound.play('probeFire');
    Game.shake(0.2);
    FPFX.kick('heavy');
  }

  // ---------- damage, pauses, cutscenes ----------
  // on the beam, a bullet only hurts; aiming the strike, nothing knocks it off its aim
  steadyAgainst(h) { return super.steadyAgainst(h) || !!this.ultAim || (!!this.beamAct && this.smallBolt(h)); }
  takeHit(h) {
    const steady = this.steadyAgainst(h);
    const r = super.takeHit(h);
    if (r === 'hit') {
      this.cancelSwap();
      if (!steady) { this.endBeam(); this.endHover(); if (this.ultCharging > 0) { this.ultCharging = 0; this.ultHold = 0; this.stopLoop('ult'); } }
    }
    return r;
  }
  // a cutscene or a blast stops whatever it was holding; an aimed strike isn't spent
  cancelActions() {
    this.cancelSwap();
    this.endBeam();
    this.endHover();
    if (this.ultAim || this.ultCharging > 0) {
      this.ultAim = null; this.ultCharging = 0; this.ultHold = 0;
      this.stopLoop('ult');
      if (Game.btOwner === this) Game.endBulletTime();
    }
    this.gun.firing = false;
  }
  onPause() {
    super.onPause();
    for (const k of ['beam', 'jets', 'swap']) this.stopLoop(k);
  }
  onResume() {
    super.onResume();
    if (this.beamAct && this.beamAct.phase === 'fire') this.loops.beam = Sound.loop('beam');
    if (this.hover) this.loops.jets = Sound.loop('jets');
    if (this.swap) { this.loops.swap = Sound.loop('charge'); this.loops.swap.set(this.swap.t / AP.SWITCH); }
  }

  // ---------- the model's lights (AegisPose reads these) ----------
  tints() {
    const P = this._tint || (this._tint = {}), C = AEGIS_P, G = this.gun, t = this.t;
    if (this.dead) {
      for (const k of ['visor', 'core', 'lens', 'jet', 'gun', 'muzzle']) P[k] = C.off;
      P.wire = C.wire;
      for (let i = 0; i < 3; i++) P['lim' + i] = AEGIS_COL.G;
      return P;
    }
    const gun = this.mode === 'gun', B = this.beamAct, charging = (B && B.phase === 'charge') || this.ultCharging > 0 || !!this.ultAim;
    P.visor = this.hurtT > 0 ? '#ffffff' : '#7ad8ff';
    P.core = this.shield <= 0 && ((t * 8) | 0) % 2 ? C.off : C.glow;
    P.lens = B && B.phase === 'fire' ? '#e0f8ff' : charging ? (((t * 20) | 0) % 2 ? '#ffffff' : C.glow) : C.glow;
    P.gun = this.swap ? (((t * (8 + 20 * this.swap.t)) | 0) % 2 ? C.hi : C.off) : gun ? (G.firing ? C.hi : G.reload > 0 ? (((t * 6) | 0) % 2 ? C.glow : C.off) : C.glow) : C.off;
    P.muzzle = gun && G.flash > 0 ? '#ffffff' : gun ? C.glow : C.off;
    P.jet = this.thrust > 0.5 ? '#c8f4ff' : C.glow;
    P.wire = C.wire;
    for (let i = 0; i < 3; i++) P['lim' + i] = AEGIS_COL.G;
    return P;
  }
}
AegisPlayer.TIMERS = Player.TIMERS.concat(['burstT', 'swapFlash']);
// the camera sits this much further back, so the mech doesn't fill the view
AegisPlayer.prototype.camScale = 1.22;
AegisPlayer.prototype.fxCol = {
  main: AEGIS_P.glow, ring: AEGIS_P.hi, hot: '#e0fbff', ghost: AEGIS_P.glow, elec: AEGIS_PELEC, spark: AEGIS_PSPARK, stance: 'blockUp', lower: 'blockDown',
};
