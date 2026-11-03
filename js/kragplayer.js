'use strict';
// KRAG as a playable character: the Foundry's brawler (its body is in krag.js) on the player's controller.
// Its heat is its resource: every blow it lands feeds it (a parry most), it cools once it stops fighting, and at
// full heat its blows hit harder and throw fire.
//   Attack: fast strings of jab, cross, hook and the haymaker finisher. Held: an uppercut that launches (opening
//   a string), a spinning backfist mid-string, and the hammer that ends one with a quake; at full heat the hammer
//   spends the heat in a line of molten vents along the aim. Its fists swat bolts back as a blade does. A slide
//   attack drives the onyx fist through the street in a burning furrow; a held attack in the air comes down as a
//   meteor; attack out of a dash is a shoulder charge that plows through what it meets and explodes.
//   E: the onyx arm raised as a guard, at no shield cost. Raised in time it parries (the blow feeds its heat),
//   and held after a parry the arm draws back for the molten counter, a cone of fire driven along the aim. Held,
//   the guard takes blows from the front for a fraction of their damage, wearing the arm until it breaks (no
//   guard for a while; it re-forms). At full heat a blow on the guard sets the arm off: everything round it is
//   blown away, and the heat is spent.
//   F: a leap. Held, a landing mark follows the crosshair (or the furthest spot short of it the body fits); let
//   go and it comes down there with a blast, a shockwave and a ring of vents.
//   Q: the Molten Fist, charged by kills like any ultimate. Hold to draw the arm back into bullet time with the
//   red cone it will split open shown on the street; press again or attack to drive it into the street.
// It's heavy: blows throw it less far, and its heavies and the shoulder charge carry on through hits.

// A bigger body on the same move rules, so every climb in every arena still works; a slower run and a shorter,
// heavier dash.
const KRAG_PMOVE = Object.assign({}, MOVE, {
  R: 0.55, H: 2.75, CROUCH_H: 1.9, SLIDE_H: 1.5, CHEST: 2.0,
  RUN: 8.8, SPRINT: 12.2, DASH_SPEED: 36, DASH_TIME: 0.17, SLIDE_BOOST: 10,
});
// Heat, 0 to MAX: HIT per point of damage a blow deals (at most HIT_CAP a blow), PARRY a parry, BLOCK a blow on
// the guard, HURT per point of damage taken. It cools COOL a second once REST seconds pass without any of that.
// At full heat its blows deal FULL_DMG times as much. Spending it leaves VENT seconds with no heat.
const KP_HEAT = { MAX: 100, HIT: 0.45, HIT_CAP: 9, PARRY: 20, BLOCK: 3, HURT: 0.4, REST: 3.5, COOL: 7, FULL_DMG: 1.25, VENT: 1.5 };
// what doesn't feed the heat: what spending it does, and the world's own hazards
const KP_NOHEAT = new Set(['kragBlast', 'eruption', 'fist', 'vent', 'lava', 'fall', 'pour', 'slag']);
// The onyx arm, 0 to MAX: worn WEAR per point of a blocked blow (at most CAP a blow), mending MEND a second once
// REST seconds pass without a block. Broken, there's no guard for DOWN seconds and it re-forms at BACK. MUL of a
// blocked blow gets through; COS is the cosine of the guard's half-width; WALK the speed behind it.
const KP_ARM = { MAX: 100, WEAR: 1.1, CAP: 30, MEND: 6, REST: 2.5, DOWN: 6, BACK: 50, MUL: 0.15, COS: 0.15, WALK: 0.4 };
// The arm going off at full heat: everything within R takes DMG (half at the edge), thrown KNOCK m/s; it costs
// the arm WEAR.
const KP_DET = { R: 6.5, DMG: 75, KNOCK: 38, WEAR: 30 };
// The hammer at full heat: N vents STEP apart along the aim from FROM, each DMG, R across.
const KP_ERUPT = { N: 6, STEP: 2.6, FROM: 3, DMG: 34, R: 1.6 };
// The molten counter: a cone LEN long and HALF wide either side (radians), DMG at its apex, from a tap (0) to
// full charge (1).
const KP_COUNTER = { LEN0: 7, LEN1: 12, HALF0: 0.42, HALF1: 0.62, DMG0: 30, DMG1: 130 };
// The shoulder charge out of a dash: SPEED m/s for LEN m (LEN_H held), DMG to what it plows through, and a blast
// at its end of BLAST within R (the held one's bigger).
const KP_SHOULDER = { SPEED: 32, LEN: 8.5, LEN_H: 13, DMG: 22, DMG_H: 30, BLAST: 18, BLAST_H: 30, R: 3, R_H: 4.2 };
// The leap: CD seconds of cooldown, out to RANGE m, up to UP m higher or DOWN m lower; it tops out LIFT m over the
// higher end at GK of gravity. The landing: DMG within R (falling off to 60%), and VENTS vents round it.
const KP_LEAP = { CD: 7, RANGE: 24, UP: 12, DOWN: 20, LIFT: 3.5, GK: 0.75, R: 4.2, DMG: 40, VENTS: 5 };
// The Molten Fist: HOLD seconds on Q to draw it back, AIM seconds of aiming at most at SLOW speed; DMG to everything
// the split reaches (bosses take BOSS of it), thrown KNOCK along the cone and LAUNCH up; its vents burn VENT_DMG.
const KP_FIST = { HOLD: 0.4, AIM: 3, SLOW: 0.3, DMG: 150, BOSS: 0.35, KNOCK: 30, LAUNCH: 26, VENT_DMG: 24 };
const KP_ELEC = { outer: '#ff8a2a', core: '#fff0c8' };
const KP_BLUE = { c0: '#ffffff', c1: '#7ad0ff', c2: '#1a4a9a' };

// Its blows, in the swing terms of player.js: pose names KragPose's limb motion (krag.js), limb where it lands
// from; wind is the wind-up (the hit window opens at act0); line a straight punch, spin all the way round.
// Lights: jab, cross, hook, then the haymaker finisher. Holds: the uppercut that opens a string and launches, the
// spinning backfist mid-string, the hammer that ends one.
const KP_BLOWS = {
  jab: { pose: 'jabR', limb: 'R', wind: 0.04, dur: 0.24, sweep: 0.06, act0: 0.04, act1: 0.12, span: 1.0, r: 2.9, band: 1.3, dmg: 13, knock: 9, hitstop: 0.035, shake: 0.06, lunge: 8, tilt: 0.05, line: true },
  cross: { pose: 'crossR', limb: 'R', wind: 0.05, dur: 0.27, sweep: 0.07, act0: 0.05, act1: 0.14, span: 1.0, r: 3.1, band: 1.3, dmg: 15, knock: 12, hitstop: 0.04, shake: 0.08, lunge: 9, tilt: 0.05, line: true },
  hook: { pose: 'hookL', limb: 'L', wind: 0.06, dur: 0.32, sweep: 0.1, act0: 0.06, act1: 0.17, span: 2.4, r: 3.1, band: 1.4, dmg: 17, knock: 17, hitstop: 0.045, shake: 0.1, lunge: 7, tilt: 0.12, dir: -1 },
  haymaker: { pose: 'hayL', limb: 'L', wind: 0.12, dur: 0.5, sweep: 0.12, act0: 0.12, act1: 0.26, span: 1.7, r: 3.4, band: 1.6, dmg: 36, knock: 30, hitstop: 0.09, shake: 0.3, lunge: 13, tilt: 1.15, dir: -1, finisher: true },
  uppercut: { pose: 'upL', limb: 'L', heavy: true, wind: 0.1, dur: 0.5, sweep: 0.12, act0: 0.1, act1: 0.22, span: 1.5, r: 3.1, band: 1.8, dmg: 30, knock: 12, launch: 30, hitstop: 0.07, shake: 0.24, lunge: 6, tilt: Math.PI / 2, dir: 1 },
  spin: { pose: 'spinL', limb: 'L', heavy: true, wind: 0.1, dur: 0.52, sweep: 0.2, act0: 0.1, act1: 0.3, span: TAU, r: 3.6, band: 1.5, dmg: 30, knock: 26, launch: 10, hitstop: 0.07, shake: 0.26, lunge: 4, tilt: 0.05, dir: 1, spin: true },
  hammer: { pose: 'hammer', limb: 'B', heavy: true, wind: 0.15, dur: 0.64, sweep: 0.12, act0: 0.15, act1: 0.27, span: 1.4, r: 3.4, band: 1.8, dmg: 48, knock: 22, launch: 18, hitstop: 0.1, shake: 0.4, lunge: 6, tilt: Math.PI / 2, dir: -1, quake: true, finisher: true },
};

CHARACTERS.krag = { id: 'krag', name: 'KRAG', utility: 'kragLeap', make: (pos) => new KragPlayer(pos) };

// F: hold to aim the leap (its landing mark follows the crosshair), let go to leap.
registerUtility({
  id: 'kragLeap',
  name: 'Leap',
  hud: 'LEAP',
  desc: 'Hold to aim a leap at the crosshair; let go to come down there with a blast, a shockwave and a ring of vents.',
  cooldown: KP_LEAP.CD,
  breakCD: 1,
  charge: true,
  canUse(p) { return !p.shoulder && !p.leap && !p.fistAim; },
  begin(p, C) {
    C.k = 0;
    p.leapAim = { t: 0, plan: null };
    p.planLeap();
    p.stopLoop('leapAim');
    p.loops.leapAim = Sound.loop('charge');
    p.loops.leapAim.set(0.1);
    Sound.play('kragGrunt', { pm: 0.8 });
  },
  hold(p, C) {
    const A = p.leapAim;
    if (!A) return;
    A.t = C.t;
    p.planLeap();
    if (p.loops.leapAim) p.loops.leapAim.set(clamp(0.1 + C.t * 1.4, 0, 0.85));
    // sunk into its legs: grit and sparks off the street round its feet
    if (p.onGround && Math.random() < 0.5) FX.sparks(p.local(rand(-0.5, 0.5), 0.05, rand(-0.4, 0.4)), 1, { x: 0, y: 1, z: 0 }, 0.6, 2, 6, KRAG_FIRE);
    if (p.onGround && Math.random() < 0.2) FX.dust(p.pos, 1, { smax: 1.5 });
  },
  release(p) { const A = p.leapAim; p.stopLoop('leapAim'); p.leapAim = null; p.startLeap(A && A.plan); },
  interrupt(p) { p.stopLoop('leapAim'); p.leapAim = null; },
  cancel(p) { p.stopLoop('leapAim'); p.leapAim = null; },
});

// A molten vent KRAG raises as the player: on the ground at `at`, inside the arena and off the molten river;
// it throws the enemies on it instead of you.
function kragVent(at, delay, owner, o = {}) {
  const B = Arena.bounds();
  if (at.x < B.minX + 1 || at.x > B.maxX - 1 || at.z < B.minZ + 1 || at.z > B.maxZ - 1) return null;
  const y = World.groundAt(at.x, at.z, at.y + 1.5);
  if (y === -Infinity || Math.abs(y - at.y) > 1.6 || Foundry.lavaAt(at.x, at.z)) return null;
  const v = new MoltenVent({ x: at.x, y, z: at.z }, delay, owner, Object.assign({ friendly: true }, o));
  Game.hazards.push(v);
  return v;
}

// The Molten Fist's chasm as KRAG throws it: the same split and vents as the boss's (kragboss.js), hitting every
// enemy it reaches instead of you.
class KragFistChasm extends MoltenChasm {
  constructor(owner, apex, f, fist) { super(owner, apex, f, fist); this.struck = new Set(); }
  strike() {
    const o = this.o, F = this.f;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || this.struck.has(e) || e.pos.y > o.y + CHASM.FLY || !this.inCone(e.pos, e.r) || this.local(e.pos).along > this.front + 0.6) continue;
      this.struck.add(e);
      hurtEnemy(e, KP_FIST.DMG * (e.isBoss ? KP_FIST.BOSS : 1), { kv: { x: F.x * KP_FIST.KNOCK, y: KP_FIST.LAUNCH, z: F.z * KP_FIST.KNOCK }, dir: { x: F.x, y: 0.6, z: F.z }, heavy: true, cause: 'fist', stagger: 1, hitstop: 0, crit: true, guardBreak: true });
      FX.sparks(e.center(), 16, { x: F.x, y: 0.7, z: F.z }, 1.2, 8, 26, KRAG_FIRE);
    }
    for (const pr of Game.props) {
      if (pr.dead || !pr.grabR || this.struck.has(pr) || !this.inCone(pr.pos) || this.local(pr.pos).along > this.front) continue;
      this.struck.add(pr);
      pr.hit(60, { heavy: true, kv: { x: F.x * 14, y: 18, z: F.z * 14 } });
    }
  }
  live() { return !!this.owner && !this.owner.dead; }
  ventOk() { return true; }
  vent(q) { return kragVent(q, VENT.TELL * 0.8, this.owner, { dmg: KP_FIST.VENT_DMG }); }
}

class KragPlayer extends Player {
  constructor(pos) {
    super(pos, KRAG_PMOVE);
    this.charId = 'krag'; this.t = 0;
    this.heat = 0; this.restT = 0; this.ventT = 0; this.flareT = 0; this.flared = false; this.pulseT = 0; this.steamT = 0;
    this.arm = KP_ARM.MAX; this.armRest = 0; this.armDown = 0; this.reformT = 0; this.armCreak = 2; this.blockT = 0;
    this.leapAim = null; this.leap = null; this.landT = 0; this.shoulder = null;
    this.counterT = 0; this.counterDir = null;
    this.fistAim = null; this.ultCharging = 0; this.ultFlash = 0; this.fistT = 0;
  }
  // a mohawk of flame instead of a scarf (kragviews.js)
  initScarf() { this.scarf = null; }
  updateScarf() {}
  timerKeys() { return KragPlayer.TIMERS; }

  // ---------- where its parts are ----------
  fwd() { return { x: fwdX(this.yaw), z: fwdZ(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  // a point in its body frame: x to its right, y up from its feet (scaled down while crouched), f forward
  local(x, y, f) {
    const F = this.fwd(), R = this.right(), k = Math.min(1, this.h / this.M.H);
    return { x: this.pos.x + R.x * x + F.x * f, y: this.pos.y + y * k, z: this.pos.z + R.z * x + F.z * f };
  }
  // a point in a bone's frame on the posed model, while the model is drawn as this body; null otherwise
  boneAt(name, x, y, z) {
    const R = typeof Render !== 'undefined' && Render.rigs && Render.rigs.krag;
    if (!R || Render.playerRig !== R || Game.player !== this || !R.mesh.visible) return null;
    const v = this._bv || (this._bv = new THREE.Vector3()), S = R.scale || 1;
    R.bones[name].updateWorldMatrix(true, false);
    v.set(x * S, y * S, z * S).applyMatrix4(R.bones[name].matrixWorld);
    if (Math.abs(v.x - this.pos.x) > 3 || Math.abs(v.z - this.pos.z) > 3 || Math.abs(v.y - this.pos.y) > 4) return null;
    return { x: v.x, y: v.y, z: v.z };
  }
  fistPos() { return this.boneAt('handL', 0, -0.2, -0.02) || this.local(-0.62, 1.45, 0.45); }
  fistR() { return this.boneAt('handR', 0, -0.1, -0.02) || this.local(0.55, 1.45, 0.35); }
  crestPos() { return this.boneAt('mohawk', 0, 0.05, 0) || this.local(0, 2.75, 0.05); }
  head() { return this.boneAt('head', 0, 0.12, -0.1) || this.local(0, 2.45, 0.15); }
  handPlant() { const p = this.local(-0.7, 0, 1.0), g = World.groundAt(p.x, p.z, p.y + 0.6); p.y = (g === -Infinity ? this.pos.y : g) + 0.12; return p; }
  // the chain (the tether) leaves from the right hand, as the boss's does
  hand() {
    const c = this.chest(), Y = this.yaw;
    return { x: c.x + Math.cos(Y) * 0.55 + fwdX(Y) * 0.35, y: c.y - 0.1, z: c.z - Math.sin(Y) * 0.55 + fwdZ(Y) * 0.35 };
  }
  // the counter's charge gathers on the onyx fist
  bladeAt() { return this.fistPos(); }
  heatK() { return clamp(this.heat / KP_HEAT.MAX, 0, 1); }
  charged() { return this.heat >= KP_HEAT.MAX; }
  // the onyx arm's wear: 0 whole, 1 about to break (1 while broken)
  wearK() { return this.armDown > 0 ? 1 : clamp(1 - this.arm / KP_ARM.MAX, 0, 1); }
  // what krag.js and kragviews.js read off the boss, from the player's state
  get walk() { return this.runPhase; }
  get stunT() { return this.dazeT; }
  get dying() { return this.dead; }
  get ko() { return this.dead && this.deadT > 0.7 ? KragPlayer.DOWN : null; }
  get act() { return this.flareT > 0 ? { kind: 'flare', t: 0.6 - this.flareT } : null; }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    super.update(dt);
    if (!this.dead) this.updateHeat(dt);
    this.updateArm(dt);
  }
  updateCombat(dt, I) {
    super.updateCombat(dt, I);
    this.updateUlt(dt);
  }
  // its ultimate is the Molten Fist, run from updateCombat, not RONIN's held sawblade
  updateUltHold() {}
  moveMods(dt, I) {
    super.moveMods(dt, I);
    // it walks in behind the raised arm, never hanging in the air on it
    if (this.sheathe && !this.sheathe.empowered) this.speedMul = this.onGround ? KP_ARM.WALK : 0.55;
    if (this.leapAim) { this.speedMul *= 0.6; this.canSlide = false; }
    if (this.fistAim || this.ultCharging > 0) { this.speedMul *= 0.35; this.canJump = false; this.canSlide = false; }
    if (this.counterT > 0 || this.landT > 0 || this.fistT > 0.3) this.speedMul *= 0.3;
    if (this.shoulder || this.leap) { this.canCling = false; this.canJump = false; this.canSlide = false; }
  }
  // the shoulder charge and the leap drive the body themselves
  moveSpecial(dt) {
    const S = this.shoulder;
    if (S) { this.moveShoulder(dt, S); return true; }
    const L = this.leap;
    if (!L) return false;
    if (this.mantle || this.vault) { this.leap = null; return false; }
    L.t += dt;
    this.vel.x = L.vx; this.vel.z = L.vz;
    this.vel.y = Math.max(this.vel.y - L.g * Game.gravMul() * dt, -PC.MAX_FALL * 1.4);
    if (Math.random() < 0.6) FX.sparks(this.fistPos(), 1, { x: 0, y: -1, z: 0 }, 0.8, 2, 6, KRAG_FIRE);
    // (a leap that never lands, off the edge of something, just falls)
    if (L.t > L.T + 1.5) this.leap = null;
    return true;
  }
  postMove(col) {
    if (this.shoulder && col.wall && this.shoulder.t > 0.03) this.endShoulder('wall');
    if (this.leap && col.wall) { this.leap.vx = 0; this.leap.vz = 0; }
  }
  canMantle(reeled) { return super.canMantle(reeled) && !this.shoulder && !this.fistAim; }
  // A spinning backfist turns the body a full circle; the Fist and the leap face where they're aimed; the
  // shoulder charge and the leap face where they're going.
  updateFacing(dt) {
    const a = this.attack, S = this.shoulder, L = this.leap;
    if (a && a.spin && a.swept) { this.yaw = a.yaw + clamp((a.t - a.wind) / (a.act1 - a.wind), 0, 1) * TAU * (a.dir || 1); this.aimHold = PC.FACE_AIM; return; }
    if (S) { this.yaw = yawOf(S.f.x, S.f.z); return; }
    if (L && Math.hypot(L.vx, L.vz) > 0.5) { this.yaw += angDiff(this.yaw, yawOf(L.vx, L.vz)) * Math.min(1, dt * 14); return; }
    if (!Camera.fp) {
      let want = null;
      if (this.fistAim) want = this.fistAim.yaw;
      else if (this.ultCharging > 0) want = this.aimYaw;
      else if (this.leapAim && this.leapAim.plan && distXZ(this.leapAim.plan, this.pos) > 0.6) want = yawOf(this.leapAim.plan.x - this.pos.x, this.leapAim.plan.z - this.pos.z);
      if (want !== null) { this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 14); this.aimHold = PC.FACE_AIM; return; }
    }
    super.updateFacing(dt);
  }
  updateGhosts(dt) {
    if (this.dashT > 0 || this.bulletT > 0 || this.shoulder || (this.leap && this.leap.t > 0.05) || (this.plunge && this.plunge.t > 0.05)) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = this.dashT > 0 || this.shoulder ? 0.025 : 0.045; this.makeGhost(this.charged() ? '#ffd070' : KRAG_ORANGE, 0.22, 0.45); }
    }
  }
  tryDash(I) {
    if (this.fistAim || this.ultCharging > 0 || this.shoulder) return;
    this.leap = null;
    super.tryDash(I);
  }
  // each footfall leaves a smouldering print; the stone thuds every other one
  footfall(side) {
    const q = this.local(side === 'R' ? 0.36 : -0.36, 0, -0.05);
    q.y = World.groundAt(q.x, q.z, this.pos.y + 0.5);
    this._fs = (this._fs || 0) + 1;
    if (this._fs % 2 === 0) Sound.play('kragStep', {}, this.pos);
    if (q.y === -Infinity || Math.abs(q.y - this.pos.y) > 0.4) return;
    if (Math.random() < 0.5) FX.dust(q, 1, { smax: 1.6 });
    if (this.charged() || chance(0.3)) FX.embers(q, 1);
    KragViews.footprint(q, this.yaw, side);
  }

  // ---------- moves on the controller ----------
  moveEvent(ev, d) {
    const p = this.pos;
    if (ev === 'djump') {
      // no flip: a burst of fire under the feet throws the weight up again
      Sound.play('djump'); Sound.play('kragLaunch');
      FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.3, 1.8, 0.25, { c: KRAG_ORANGE });
      FX.sparks({ x: p.x, y: p.y + 0.1, z: p.z }, 14, { x: 0, y: -1, z: 0 }, 1.1, 5, 14, KRAG_FIRE);
      FX.dust(p, 4, { smax: 3 });
      FX.light(p, '#ff8a2a', 3, 5, 0.2);
      FPFX.kick('jump');
      return;
    }
    if (ev === 'dash') {
      // a heavy lunge off one foot, fire streaming off the back
      Sound.play('dash'); Sound.play('kragSwing', { heavy: false });
      const c = this.chest();
      FX.ring(c, 0.3, 1.8, 0.2, { c: KRAG_ORANGE, flat: false });
      FX.sparks(c, 12, { x: -d.x, y: 0.1, z: -d.z }, 0.9, 5, 16, KRAG_FIRE);
      if (this.onGround) { FX.dust(p, 6, { smax: 4 }); FX.debris(p, 4, KRAG_STONE, 8); }
      FX.light(c, '#ff7a2a', 3, 5, 0.15);
      Game.shake(0.09);
      FPFX.kick('dash', { dir: d });
      return;
    }
    if (ev === 'bulletjump') {
      super.moveEvent(ev, d);
      this.spinT = 0;
      FX.sparks({ x: p.x, y: p.y + 0.2, z: p.z }, 14, { x: -d.x, y: -d.y, z: -d.z }, 1.2, 5, 16, KRAG_FIRE);
      KragViews.crack(p, { r: 2.2, life: 5 });
      return;
    }
    if (ev === 'land') {
      this.spinT = 0; this.bulletT = 0;
      if (this.kickAnim && this.kickAnim.t > 0.1) this.kickAnim = null;
      if (this.leap) { this.leapImpact(); return; }
      if (this.plunge) { this.plungeImpact(); return; }
      // too heavy to roll: a long fall lands with a blow of its own
      if (d.vy < -26) this.heavyLanding(clamp((-d.vy - 26) / 20, 0, 1));
      else if (d.vy < -14) { this.landSquash = 0.12; Sound.play('land', { v: clamp(-d.vy / 28, 0.5, 1.3) }); FX.dust(p, 5, { smax: 3.6 }); }
      if (Input.isDown('crouch') && Controller.hspeed(this) > this.M.SLIDE_MIN && !this.attack && !this.sheathe) Controller.startSlide(this);
      return;
    }
    super.moveEvent(ev, d);
  }
  heavyLanding(k) {
    const p = this.pos, g = { x: p.x, y: p.y + 0.05, z: p.z }, R = 2.4 + 1.6 * k;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > R + e.r || Math.abs(e.pos.y - p.y) > 1.5) continue;
      const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
      hurtEnemy(e, 8 + 10 * k, { kv: { x: ux * 12, y: 14, z: uz * 12 }, dir: { x: ux, y: 0.5, z: uz }, cause: 'smash', stagger: 0.4, hitstop: 0.01 });
    }
    FX.ring(g, 0.3, R * 1.4, 0.3, { c: KRAG_ORANGE });
    FX.dust(p, Math.round(10 + 10 * k), { smax: 5 + 4 * k });
    FX.debris(p, Math.round(6 + 8 * k), KRAG_STONE, 10 + 6 * k);
    FX.decal('crack', g, { len: 2 + 2 * k });
    KragViews.crack(g, { r: 2 + 2 * k, life: 5 });
    Sound.play('kragStomp', { big: k > 0.6 }, p);
    Game.shake(0.2 + 0.25 * k);
    FPFX.kick('slam', { scale: 0.5 + 0.5 * k });
    this.landSquash = 0.16; this.landLag = 0.08;
  }

  // ---------- the string ----------
  onAttackPressed() {
    if (this.shoulder || this.fistAim) return;
    super.onAttackPressed();
  }
  resolveAttack(kind, dash) {
    if (this.sheathe || this.iaido || this.ultHold > 0 || this.plunge || this.dead || this.shoulder) return;
    if (kind === 'H') { Sound.play('heavyDraw'); const f = this.fistPos(); FX.ring(f, 0.2, 1.2, 0.16, { c: KRAG_ORANGE, flat: false }); FX.light(f, '#ff8a2a', 3, 3, 0.12); }
    if (dash || this.dashT > 0 || this.dashEndT > 0) { this.dashAttack(kind); return; }
    if (this.attack || this.attackCD > 0) { this.attackQueued = kind; return; }
    if (this.sliding && this.onGround && !this.stringLive()) { this.startGroundCut(kind); return; }
    this.startString(kind, false);
  }
  // jab, cross, hook, haymaker; held, the uppercut opens, the backfist spins mid-string and the hammer ends it
  startString(kind, chained) {
    const cont = (chained || this.comboTimer > 0) && this.strN > 0 && this.strN < 4;
    const n = cont ? this.strN + 1 : 1;
    const type = kind === 'H' ? (n <= 1 ? 'uppercut' : n === 2 ? 'spin' : 'hammer') : ['jab', 'cross', 'hook', 'haymaker'][Math.min(n, 4) - 1];
    this.startSwing(type, cont);
    this.strN = n; this.strLights = kind === 'L' ? n : 0;
    if (this.attack.finisher) { this.strN = 0; this.strLights = 0; }
  }
  startSwing(type, cont) {
    const d = KP_BLOWS[type], heavy = !!d.heavy;
    const target = this.assistTarget(d.r);
    const yaw = target ? yawOf(target.pos.x - this.pos.x, target.pos.z - this.pos.z) : this.aimYaw;
    this.yaw = yaw;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    const dir = d.dir || (cont ? -this.lastDir : 1);
    this.lastDir = dir;
    const tilt = d.tilt === Math.PI / 2 ? d.tilt : -d.tilt * dir, pa = this.swingPitch(target), hot = this.charged();
    this.attack = Object.assign({ type, heavy, finisher: !!d.finisher, stage: d.finisher ? 3 : 1, t: 0, yaw, dir, pa, pitch: Math.sin(pa), target, hit: new Set(), swept: false, hot }, d, { tilt, dmg: d.dmg * (hot ? KP_HEAT.FULL_DMG : 1) });
    this.attackQueued = null; this.postPose = 0;
    Sound.play('kragGrunt', { pm: heavy ? 0.8 : 1.15 });
    if (!this.attack.wind) this.beginSweep(this.attack);
  }
  // where a limb throws its blow from
  limbAt(l) { return l === 'R' ? this.fistR() : l === 'B' ? this.local(0, 2.6, 0.3) : this.fistPos(); }
  // The blow: a streak of fire along a straight punch, a molten arc behind a swing, the body driven in behind it
  beginSweep(a) {
    a.swept = true;
    const big = a.heavy || a.finisher, c = this.chest(), pa = a.pa || 0, fx = fwdX(a.yaw), fz = fwdZ(a.yaw);
    if (a.line) {
      const s = this.limbAt(a.limb), end = { x: c.x + fx * a.r * Math.cos(pa), y: c.y + Math.sin(pa) * a.r, z: c.z + fz * a.r * Math.cos(pa) };
      FX.slashLine(s, end, { w: 0.16, dur: 0.14, pal: 'molten', grow: 0.02 });
    } else {
      FX.swoosh({ follow: this, oy: this.chestH(), yaw: a.yaw, tilt: a.tilt, pitch: pa, r: a.r * 0.85, span: a.spin ? TAU - 0.05 : a.span, dir: a.dir, sweep: a.sweep, dur: a.sweep + 0.14, thick: big ? 0.5 : 0.35, pal: 'molten', trail: 0.9, bolts: 0 });
    }
    FX.sparks(this.limbAt(a.limb), big ? 12 : 5, { x: fx, y: 0.1, z: fz }, 0.8, 4, 14, KRAG_FIRE);
    if (a.hot) FX.embers(this.limbAt(a.limb), 3);
    Sound.play('kragSwing', { heavy: big });
    if (big) Sound.play('heavySwing');
    FPFX.kick(a.heavy ? 'heavy' : a.finisher ? 'finisher' : 'attack', { side: a.dir || 1 });
    // with an assisted target, close the gap to it rather than overshoot (ground friction stops a lunge in ~v^2/300 m)
    const gap = a.target ? distXZ(a.target.pos, this.pos) - a.target.r - this.r - a.r * 0.5 : Infinity;
    const close = gap === Infinity ? Infinity : Math.sqrt(300 * Math.max(0, gap));
    if (a.lunge) {
      const L = Math.min(a.lunge, close);
      this.vel.x = this.vel.x * 0.3 + fx * L; this.vel.z = this.vel.z * 0.3 + fz * L;
      if (!this.onGround) this.vel.y = Math.max(this.vel.y, a.pitch * a.lunge * 0.6);
    }
    if (a.type === 'uppercut' && !this.onGround) this.vel.y = Math.max(this.vel.y, 12);
    if (!this.onGround && this.vel.y < 0) this.vel.y *= 0.4;
    if (big) Game.shake(0.1);
    FX.light({ x: c.x + fx * a.r * 0.6, y: c.y, z: c.z + fz * a.r * 0.6 }, a.hot ? '#ffb040' : '#ff7a2a', 3.5, a.r * 1.7, a.sweep + 0.14);
  }
  blowCause(a) { return a.heavy ? 'smash' : 'punch'; }
  // each blow lands in a burst of fire; at full heat, a fireball
  swingHit(a, e) {
    const c = e.center(), big = a.heavy || a.finisher;
    FX.ring(c, 0.2, big ? 2.4 : 1.4, 0.16, { c: a.hot ? '#ffd070' : KRAG_ORANGE, flat: false });
    FX.sparks(c, big ? 14 : 7, { x: fwdX(a.yaw), y: 0.3, z: fwdZ(a.yaw) }, 1.2, 5, big ? 20 : 15, KRAG_FIRE);
    if (big) { FX.debris(c, 6, KRAG_STONE, 10); Sound.play('kragHit', { heavy: true }, c); }
    if (a.hot) { KragViews.fireball(c, big ? 1.8 : 1, 0.3); FX.embers(c, 4); }
  }
  // the hammer comes down hard enough to send a ring over the ground and split it; at full heat, it erupts
  slamQuake() {
    const f = this.local(0, 0, 1.5);
    f.y = this.pos.y;
    if (this.charged()) this.eruption();
    Game.hazards.push(new SlamRing({ x: f.x, y: f.y, z: f.z }, { cause: 'smash', c: KRAG_ORANGE }));
    const g = { x: f.x, y: f.y + 0.05, z: f.z };
    FX.ring(g, 0.4, 5.5, 0.35, { c: KRAG_ORANGE });
    FX.dust(f, 14, { smax: 9, rise: 0.8 });
    FX.debris(f, 14, KRAG_STONE, 18);
    FX.sparks({ x: f.x, y: f.y + 0.3, z: f.z }, 16, { x: 0, y: 1, z: 0 }, 1.3, 5, 16, KRAG_FIRE);
    FX.decal('crack', g, { len: 3.2 });
    KragViews.crack(g, { r: 3.6, life: 6 });
    FX.light(g, '#ff8a2a', 6, 9, 0.3);
    Sound.play('kragStomp', {}, f);
    Game.shake(0.35);
    FPFX.kick('slam');
  }
  // the hammer at full heat: the heat goes into the street in a line of vents bursting out along the aim
  eruption() {
    const yaw = this.attack ? this.attack.yaw : this.yaw, fx = fwdX(yaw), fz = fwdZ(yaw), p = this.pos;
    this.spendHeat();
    for (let i = 0; i < KP_ERUPT.N; i++) {
      const s = KP_ERUPT.FROM + i * KP_ERUPT.STEP;
      kragVent({ x: p.x + fx * s, y: p.y, z: p.z + fz * s }, 0.06 + i * 0.07, this, { dmg: KP_ERUPT.DMG, R: KP_ERUPT.R, tall: 1.3 });
    }
    KragViews.crack({ x: p.x + fx * 1.5, y: p.y, z: p.z + fz * 1.5 }, { kind: 'line', yaw, len: KP_ERUPT.FROM + KP_ERUPT.N * KP_ERUPT.STEP, w: 4, life: 6, grow: 0.35 });
    FX.flash('#ff9a3a', 0.2);
    Sound.play('kragRumble', {}, p);
    Game.shake(0.3);
  }

  // ---------- slide attack: the furrow ----------
  // The onyx fist driven into the street ahead, tearing a burning furrow and throwing molten stone; held, it
  // digs in and rips upward, launching what it catches and you after it.
  startGroundCut(kind = 'L') {
    const hs = Controller.hspeed(this) || 1, yaw = yawOf(this.vel.x, this.vel.z), fx = fwdX(yaw), fz = fwdZ(yaw), heavy = kind === 'H';
    this.yaw = yaw;
    this.attack = { stage: 4, groundCut: true, heavy, t: 0, dur: heavy ? 0.55 : 0.4, act0: heavy ? 0.2 : 0.04, act1: heavy ? 0.32 : 0.24, rip: heavy ? 0.2 : 0, yaw, hit: new Set(), rocks: false, from: null, gouge: null };
    this.slideT = Math.max(this.slideT, heavy ? 0.22 : 0.32);
    const s = heavy ? Math.max(hs * 0.5, 6.4) : Math.max(hs, 14);
    this.vel.x = fx * s; this.vel.z = fz * s;
    this.attackQueued = null; this.kickAnim = null;
    Sound.play('groundCut'); Sound.play('kragSwing', { heavy: true });
  }
  updateGroundCut(a) {
    const fx = fwdX(a.yaw), fz = fwdZ(a.yaw), E = { x: this.pos.x + fx * 1.3, y: this.pos.y + 0.05, z: this.pos.z + fz * 1.3 };
    if (!a.from && a.t >= 0.03) { a.from = { x: E.x, y: this.pos.y, z: E.z }; a.gouge = FX.decal('gouge', a.from, { w: 0.6, len: 0.3, yaw: a.yaw, dur: 6 }); }
    if (a.gouge && a.t < (a.heavy ? a.rip : 0.3)) FX.stretchDecal(a.gouge, a.from, { x: E.x, y: this.pos.y, z: E.z });
    if (a.t < (a.heavy ? a.rip : 0.3)) {
      FX.sparks(E, 2, { x: -fx, y: 0.5, z: -fz }, 0.8, 5, 16, Object.assign({ life: 0.6 }, KRAG_FIRE));
      if (Math.random() < 0.5) FX.debris(E, 1, KRAG_STONE, 12);
    }
    if (!a.heavy && !a.rocks && a.t >= 0.05) {
      a.rocks = true;
      this.throwRocks(E, a, 10, 0.12, 0.9, 0.45, 15, 28, 8);
      KragViews.crack(E, { kind: 'line', yaw: a.yaw, len: 5, w: 2.4, life: 5, grow: 0.2 });
      FX.dust(E, 8, { dir: { x: fx, y: 0.5, z: fz }, spread: 0.8, smax: 10, rise: 0.9 });
      Game.shake(0.12);
      Sound.play('rocks');
    }
    if (a.heavy && !a.rocks && a.t >= a.rip) {
      // the rip: the onyx fist torn up out of the street in a burst of fire, throwing you up with it
      a.rocks = true;
      this.throwRocks(E, a, 14, 0.5, 1.4, 0.55, 18, 32, 9);
      KragViews.fireball({ x: E.x, y: E.y + 1, z: E.z }, 2.2, 0.4);
      KragViews.crack(E, { r: 3.2, life: 6 });
      FX.ring({ x: E.x, y: this.pos.y + 0.06, z: E.z }, 0.3, 3.8, 0.3, { c: KRAG_ORANGE });
      FX.swoosh({ follow: this, oy: this.chestH(), yaw: a.yaw, tilt: Math.PI / 2, r: 2.8, span: 2.4, dir: 1, sweep: 0.08, dur: 0.3, thick: 0.5, pal: 'molten', trail: 1, bolts: 0 });
      FX.light({ x: E.x, y: this.pos.y + 0.9, z: E.z }, '#ff8a2a', 6, 8, 0.3);
      Sound.play('kragStomp', {}, E); Sound.play('heavySwing');
      Game.shake(0.32); Game.hitstop(0.05);
      this.sliding = false; this.crouching = false;
      if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); }
      if (!this.crouching) { this.vel.y = 18; this.vel.x = fx * 4; this.vel.z = fz * 4; this.onGround = false; this.airJumps = 1; }
    }
    if (a.t >= a.act0 && a.t <= a.act1) {
      const len = a.heavy ? 3.4 : 2.8, w = a.heavy ? 1.1 : 1.0, h = a.heavy ? 2.6 : 1.4;
      Props.slash((q) => this.inCutBox(a, q, -0.3, len, w, h), this.pos.y + 0.5, { x: fx, z: fz });
      this.cutBox(a, -0.3, len, w, h, (e) => {
        hurtEnemy(e, a.heavy ? 32 : 16, { kv: { x: fx * (a.heavy ? 10 : 15), y: a.heavy ? 34 : 16, z: fz * (a.heavy ? 10 : 15) }, dir: { x: fx, y: a.heavy ? 1 : 0.4, z: fz }, heavy: a.heavy, cause: 'groundcut', stagger: a.heavy ? 0.8 : 0.45, hitstop: 0.04, guardBreak: a.heavy });
        FX.sparks(e.center(), 8, { x: fx, y: 0.5, z: fz }, 1, 5, 14, KRAG_FIRE);
      });
    }
  }

  // ---------- the meteor: a plunge that lands like KRAG ----------
  startPlunge() { this.leap = null; super.startPlunge(); }
  plungeImpact() {
    const P = this.plunge, p = this.pos, fall = P ? Math.max(0, P.startY - p.y) : 0, power = clamp(fall / 20, 0.15, 1);
    super.plungeImpact();
    const g = { x: p.x, y: p.y + 0.05, z: p.z };
    KragViews.crack(g, { r: 2.5 + power * 3, life: 7 });
    KragViews.fireball({ x: p.x, y: p.y + 1, z: p.z }, 1.6 + power * 2, 0.4);
    FX.debris(p, Math.round(10 + 12 * power), KRAG_STONE, 14 + 8 * power);
    Sound.play('kragStomp', { big: power > 0.6 }, p);
    // a high enough fall raises a ring of vents round where it came down
    if (power > 0.45) {
      const n = 4 + Math.round(power * 3), R = 3.2 + power * 2.5;
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rand(-0.2, 0.2); kragVent({ x: p.x + Math.cos(a) * R, y: p.y, z: p.z + Math.sin(a) * R }, 0.3 + rand(0, 0.15), this, { dmg: 20 }); }
    }
  }

  // ---------- out of a dash: the shoulder charge ----------
  dashAttack(kind = 'L') {
    this.dashT = 0; this.dashEndT = 0;
    this.attack = null; this.attackQueued = null;
    const heavy = kind === 'H', len = heavy ? KP_SHOULDER.LEN_H : KP_SHOULDER.LEN;
    const t = this.assistTarget(len);
    const yaw = t ? yawOf(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : this.aimYaw;
    this.yaw = yaw;
    if (this.sliding || this.crouching) { this.sliding = false; this.crouching = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    this.shoulder = { t: 0, dur: len / KP_SHOULDER.SPEED, f: { x: fwdX(yaw), z: fwdZ(yaw) }, heavy, hit: new Set(), from: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, gouge: this.onGround ? FX.decal('gouge', this.pos, { w: 0.7, len: 0.4, yaw, dur: 6 }) : null };
    this.iframes = Math.max(this.iframes, 0.2);
    const back = this.local(0, 1.6, -0.5);
    FX.sparks(back, 16, { x: -fwdX(yaw), y: 0.2, z: -fwdZ(yaw) }, 0.7, 6, 18, KRAG_FIRE);
    FX.ring(this.chest(), 0.3, 2.2, 0.2, { c: KRAG_ORANGE, flat: false });
    Sound.play('kragLaunch', {}, this.pos);
    Game.shake(0.15);
    FPFX.kick('draw', { scale: heavy ? 1.15 : 1 });
  }
  moveShoulder(dt, S) {
    S.t += dt;
    const V = KP_SHOULDER.SPEED, f = S.f;
    this.vel.x = f.x * V; this.vel.z = f.z * V;
    this.vel.y = this.onGround ? -1 : Math.max(this.vel.y - PC.GRAV * Game.gravMul() * dt, -PC.MAX_FALL);
    // what it meets is thrown aside; something heavy stops it
    const c = this.center();
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || S.hit.has(e) || distXZ(e.pos, this.pos) > this.r + e.r + 0.55 || e.pos.y > this.pos.y + this.h || e.pos.y + e.h < this.pos.y) continue;
      S.hit.add(e);
      if (e.heavy || e.isBoss) { this.endShoulder('heavy'); return; }
      const side = (e.pos.x - this.pos.x) * -f.z + (e.pos.z - this.pos.z) * f.x >= 0 ? 1 : -1;
      hurtEnemy(e, S.heavy ? KP_SHOULDER.DMG_H : KP_SHOULDER.DMG, { kv: { x: f.x * 18 - f.z * side * 14, y: 16, z: f.z * 18 + f.x * side * 14 }, dir: { x: f.x, y: 0.4, z: f.z }, heavy: true, cause: 'shoulder', stagger: 0.6, hitstop: 0.03 });
      FX.sparks(e.center(), 12, { x: f.x, y: 0.3, z: f.z }, 1.2, 6, 18, KRAG_FIRE);
      Sound.play('kragHit', { heavy: false }, e.center());
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && !S.hit.has(pr) && distXZ(pr.pos, this.pos) < this.r + 0.9) { S.hit.add(pr); pr.hit(30, { heavy: true, kv: { x: f.x * 20, y: 12, z: f.z * 20 } }); }
    // it smashes through the lamps in its way
    Props.blast(c, this.r + 0.4);
    FX.sparks(this.local(rand(-0.4, 0.4), rand(0.6, 2.2), -0.3), 2, { x: -f.x, y: 0.2, z: -f.z }, 0.5, 2, 7, Object.assign({ life: 0.8 }, KRAG_FIRE));
    if (this.onGround && Math.random() < 0.5) FX.dust(this.pos, 1, { smax: 2.5 });
    if (S.gouge && this.onGround) FX.stretchDecal(S.gouge, S.from, this.pos);
    if (S.t >= S.dur) this.endShoulder(null);
  }
  // It ends in an explosion off the shoulder: at its end, into a wall, or into something heavy.
  endShoulder(what) {
    const S = this.shoulder;
    if (!S) return;
    this.shoulder = null;
    const f = S.f, at = this.local(0, 1.4, 0.9), R = S.heavy ? KP_SHOULDER.R_H : KP_SHOULDER.R, dmg = S.heavy ? KP_SHOULDER.BLAST_H : KP_SHOULDER.BLAST;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || dist3(e.center(), at) > R + e.r) continue;
      const u = flat(e.pos.x - at.x, e.pos.z - at.z);
      hurtEnemy(e, dmg, { kv: { x: u.x * 20, y: 16, z: u.z * 20 }, dir: { x: u.x, y: 0.5, z: u.z }, heavy: true, cause: 'shoulder', stagger: 0.7, hitstop: 0.03 });
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && dist3(pr.center(), at) < R) pr.hit(30, { heavy: true, kv: { x: f.x * 16, y: 14, z: f.z * 16 } });
    Props.blast(at, R * 0.8);
    FX.ring(at, 0.3, 2 + 1.6 * R, 0.3, { c: KRAG_ORANGE, flat: false });
    FX.sparks(at, Math.round(20 + 8 * R), null, TAU, 4, 22, KRAG_FIRE);
    FX.dust(at, 10, { c: '#2a2026', smax: 4.5, rise: 1.5 });
    FX.debris(at, 8, KRAG_STONE, 12);
    KragViews.fireball(at, 1.4 + 0.4 * R, 0.35);
    if (what === 'wall') FX.decal('crack', this.local(0, 1.4, 1.0), { len: 3 });
    FX.light(at, '#ff8a2a', 7, 9, 0.28);
    Sound.play('explode', { big: S.heavy }, at);
    Game.shake(0.25 + 0.08 * R); Game.hitstop(0.04);
    const back = what === 'heavy' || what === 'wall' ? -6 : 0;
    this.vel.x = f.x * back + this.vel.x * 0.15; this.vel.z = f.z * back + this.vel.z * 0.15;
    this.postPose = 0.2;
    // it opens a string: follow it with lights or heavies
    this.strN = 1; this.strLights = S.heavy ? 0 : 1; this.comboTimer = 0.45;
  }

  // ---------- E: the guard on the onyx arm ----------
  stanceMax() { return Infinity; }
  // Raised at no cost: the first moment of it parries; held, it's a guard. A broken arm can't be raised.
  tryStance() {
    if (this.parryCD > 0 || this.armDown > 0) { Sound.play('denied'); this.parryFlash = 0.35; return; }
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    const win = S.gameplay.parryWindow * (Game.has('openGuard') ? 1.6 : 1) * (1 - 0.25 * Math.min(2, Math.ceil(this.parrySpam - 0.01)));
    this.parrySpam = Math.min(3, this.parrySpam + 1);
    // refunded: it cost nothing, so a parry gives nothing back
    this.sheathe = { t: 0, charge: 0, tier: 0, ringT: 0, empowered: false, parryUntil: win, hover: 0, parried: 0, parriedAt: 0, refunded: true, releaseQueued: false, guard: true };
    const f = this.fistPos();
    Sound.play(this.fxCol.stance);
    FX.ring(f, 0.2, 1.6, 0.2, { c: '#5ac0ff', flat: false });
    FX.sparks(f, 8, null, TAU, 2, 8, Object.assign({ g: 0, life: 0.4 }, KP_BLUE));
    this.eyeGlint('#5ac0ff', 0.7);
  }
  stanceFX(s, dt) {
    // after a parry: gold drawn into the fist as the counter charges (player.js)
    if (s.empowered) { super.stanceFX(s, dt); return; }
    const f = this.fistPos();
    if (s.t <= s.parryUntil && Math.random() < 0.5) FX.sparks(f, 1, null, TAU, 1, 3, Object.assign({ g: 0, life: 0.3 }, KP_BLUE));
    // a charged arm up to guard crackles: a blow on it sets it off
    if (this.charged() && Math.random() < 0.6) {
      FX.sparks(f, 2, null, TAU, 2, 8, Object.assign({ g: 0, life: 0.6 }, KRAG_FIRE));
      if (Math.random() < 0.2) FX.bolt(f, { x: f.x + rand(-0.7, 0.7), y: f.y + rand(-0.5, 0.7), z: f.z + rand(-0.7, 0.7) }, 0.06, { outer: '#ff8a2a', core: '#ffffff', jag: 0.25, w: 0.04 });
    }
  }
  doParry(h) {
    super.doParry(h);
    this.addHeat(KP_HEAT.PARRY);
    const f = this.fistPos();
    FX.sparks(f, 14, null, TAU, 4, 14, KRAG_FIRE);
    FX.ring(f, 0.2, 1.8, 0.2, { c: '#ffb040', flat: false });
    Sound.play('kragBlock', { heavy: true, wear: 0 }, f);
  }
  releaseCounter(s) { this.moltenCounter(s.charge || 0); }
  // The molten counter: the onyx fist driven out along the aim, a cone of fire bursting out ahead of it, longer,
  // wider and harder the longer it was charged.
  moltenCounter(pw) {
    const C = KP_COUNTER, len = lerp(C.LEN0, C.LEN1, pw), half = lerp(C.HALF0, C.HALF1, pw), dmg = lerp(C.DMG0, C.DMG1, pw);
    const t = this.assistTarget(len * 0.7);
    const yaw = t ? yawOf(t.pos.x - this.pos.x, t.pos.z - this.pos.z) : this.aimYaw, f = { x: fwdX(yaw), z: fwdZ(yaw) };
    const o = { x: this.pos.x - f.x * 0.4, y: this.pos.y, z: this.pos.z - f.z * 0.4 }, tanH = Math.tan(half);
    const along = (q) => (q.x - o.x) * f.x + (q.z - o.z) * f.z;
    const inCone = (q, r) => { const a = along(q), side = Math.abs((q.x - o.x) * -f.z + (q.z - o.z) * f.x); return a > -r && a < len + r && side < tanH * Math.max(0, a) + 1 + r; };
    const lo = this.pos.y - 1.5, hi = this.pos.y + 3.5;
    let kills = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.pos.y > hi || e.pos.y + e.h < lo || !inCone(e.pos, e.r)) continue;
      const k = 1 - 0.3 * clamp(along(e.pos) / len, 0, 1);
      hurtEnemy(e, dmg * k, { kv: { x: f.x * lerp(20, 36, pw), y: lerp(10, 18, pw), z: f.z * lerp(20, 36, pw) }, dir: { x: f.x, y: 0.3, z: f.z }, heavy: true, cause: 'kragCounter', stagger: lerp(0.5, 0.9, pw), hitstop: 0, crit: pw >= 1, guardBreak: true });
      FX.sparks(e.center(), 12, { x: f.x, y: 0.4, z: f.z }, 1.2, 6, 20, KRAG_FIRE);
      if (e.dead || e.dying) kills++;
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && pr.pos.y < hi && inCone(pr.pos, 0.4)) pr.hit(40 + 40 * pw, { heavy: true, kv: { x: f.x * 22, y: 14, z: f.z * 22 } });
    Props.slash((q) => q.pos.y < hi && inCone(q.pos, q.r), this.pos.y + 1, f);
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || b.pos.y > hi + 1 || !inCone(b.pos, 0.4)) continue;
      if (b.onSlash) b.onSlash(this); else { b.dead = true; FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, KRAG_FIRE); }
    }
    if (kills) this.counterHeal(kills);
    this.yaw = yaw; this.counterT = 0.4; this.counterDir = { x: f.x, y: 0, z: f.z };
    this.iframes = Math.max(this.iframes, 0.45);
    this.vel.x += f.x * 5; this.vel.z += f.z * 5;
    // fire streaming out along the cone and the street splitting under it
    const fist = this.local(-0.2, 1.8, 0.9), end = { x: fist.x + f.x * len, y: fist.y - 0.6, z: fist.z + f.z * len };
    FX.slashLine(fist, end, { w: 0.35 + 0.5 * pw, dur: 0.3, pal: 'molten', grow: 0.04 });
    FX.ring(fist, 0.3, 2 + 2 * pw, 0.25, { c: '#ffd070', flat: false });
    const n = 3 + Math.round(3 * pw);
    for (let i = 1; i <= n; i++) {
      const u = i / n, q = { x: fist.x + f.x * len * u, y: fist.y - 0.6 * u, z: fist.z + f.z * len * u };
      Game.queueCut(0.025 * i, () => {
        KragViews.fireball(q, 0.9 + (1 + 1.4 * pw) * u, 0.32);
        FX.sparks(q, 8, { x: f.x, y: 0.3, z: f.z }, 0.9, 5, 16, KRAG_FIRE);
        FX.ring(q, 0.2, (1.2 + 2 * u) * (0.7 + 0.5 * pw), 0.22, { c: '#ffb040', flat: false });
      });
    }
    KragViews.crack({ x: this.pos.x + f.x * 1.2, y: this.pos.y, z: this.pos.z + f.z * 1.2 }, { kind: 'line', yaw, len, w: 2 + 3 * pw, life: 5, grow: 0.15 });
    FX.light(fist, pw >= 1 ? '#fff0c8' : '#ffb040', 5 + 5 * pw, 8 + 8 * pw, 0.35);
    FX.flash(pw >= 1 ? '#fff0c8' : '#ffd0a0', 0.18 + 0.2 * pw);
    this.makeGhost('#ffd070', 0.35, 0.6);
    Sound.play('counterRelease', { power: pw });
    Sound.play(pw >= 0.66 ? 'kragPunch' : 'kragSwing', { heavy: true }, fist);
    Game.shake(0.3 + 0.5 * pw); Game.hitstop(lerp(0.03, 0.08, pw)); Game.slowmo(lerp(0.6, 0.3, pw), lerp(0.12, 0.35, pw));
    FPFX.kick('counter', { scale: lerp(0.85, 1.3, pw), col: [255, 170, 90] });
  }

  // ---------- damage ----------
  // whether the raised arm takes a blow: anything parryable that comes from the front
  guardBlocks(h) {
    if (h.unparryable || h.through || h.pierce) return false;
    if (!['melee', 'projectile', 'beam', 'explosion'].includes(h.kind || 'melee')) return false;
    if (!h.from) return true;
    const dx = h.from.x - this.pos.x, dz = h.from.z - this.pos.z, l = Math.hypot(dx, dz);
    return l < 0.25 || (dx * fwdX(this.yaw) + dz * fwdZ(this.yaw)) / l > KP_ARM.COS;
  }
  // its heavies, the shoulder charge and the Fist carry on through what hits it; anything that goes through a
  // guard still stops them
  steadyAgainst(h) {
    if (super.steadyAgainst(h) || !!this.fistAim) return true;
    if (h.through || h.daze) return false;
    const a = this.attack;
    return !!this.shoulder || (!!a && (a.heavy || a.finisher) && !a.groundCut && a.t <= a.act1);
  }
  takeHit(h) {
    if (this.dead || Game.cineActive() || this.ult) return super.takeHit(h);
    const s = this.sheathe;
    if (s && !s.empowered && !this.parryActive() && !(this.iframes > 0 && !h.through) && this.guardBlocks(h)) return this.blockHit(h);
    const steady = this.steadyAgainst(h);
    // heavy: thrown less far
    const r = super.takeHit(Object.assign({}, h, { knock: (h.knock || 14.5) * 0.6 }));
    if (r === 'hit') {
      this.addHeat(h.dmg * KP_HEAT.HURT);
      if (!steady) {
        this.shoulder = null; this.counterT = 0;
        if (this.ultCharging > 0) { this.ultCharging = 0; this.ultHold = 0; this.stopLoop('ult'); }
      }
    }
    return r;
  }
  // A blow on the guard: a fraction gets through (to the shield first) and it wears the arm; how it lands tells
  // you how worn the arm is. At full heat the arm goes off instead.
  blockHit(h) {
    if (h.proj) h.proj.dead = true;
    if (this.charged()) { this.detonate(h); return 'blocked'; }
    const dmg = h.dmg * (Game.has('glass') ? 1.25 : 1), small = h.kind === 'projectile' || h.kind === 'beam';
    this.arm = Math.max(0, this.arm - Math.min(KP_ARM.CAP, dmg * KP_ARM.WEAR * (small ? 0.6 : 1)));
    this.armRest = 0; this.blockT = 0.15;
    let chip = S.gameplay.invincible ? 0 : dmg * KP_ARM.MUL;
    if (Game.mode === 'training') chip = Math.min(chip, Math.max(0, this.hp + this.shield - 1));
    if (this.shield > 0) { const a = Math.min(this.shield, chip); this.shield -= a; chip -= a; }
    if (chip > 0) this.hp -= chip;
    this.shieldDelay = Math.max(this.shieldDelay, 1.4); this.regenOn = false;
    this.addHeat(KP_HEAT.BLOCK);
    Game.stats.damageTaken += dmg * KP_ARM.MUL;
    const w = this.wearK(), at = this.fistPos(), from = h.from || this.local(0, 1.6, 2);
    const u = flat(from.x - this.pos.x, from.z - this.pos.z), face = { x: at.x + u.x * 0.3, y: at.y, z: at.z + u.z * 0.3 };
    if (!small || !this._blkT || Game.time > this._blkT) {
      this._blkT = Game.time + 0.1;
      FX.sparks(face, Math.round((12 - 6 * w) * (small ? 0.4 : 1)), { x: u.x, y: 0.3, z: u.z }, 1.5, 5, 18, KRAG_SPARK);
      if (w > 0.2) FX.debris(face, Math.round(2 + 8 * w), ['#2e2834', '#1e1a24', '#463c50', '#7a6a62'], 6 + 8 * w);
      if (w > 0.45) FX.dust(face, Math.round(3 * w + 1), { c: '#4a4248', smax: 2, rise: 1.5, life: 1 });
      FX.light(at, '#ff8a2a', small ? 1.5 : 3.5, 6, 0.12);
      Sound.play('kragBlock', { heavy: !small && h.dmg >= 20, wear: w }, at);
      if (!small) { Game.hitstop(0.03); Game.shake(0.1); }
    }
    if (this.onGround) { this.vel.x -= u.x * (small ? 0.4 : 3); this.vel.z -= u.z * (small ? 0.4 : 3); }
    FPFX.kick('guard', { from: h.from, scale: small ? 0.3 : 0.6 });
    if (Touch.on()) Touch.buzz(15);
    if (this.hp <= 0) { this.die(); return 'hit'; }
    if (this.arm <= 0) this.breakArm();
    return 'blocked';
  }
  // the arm gives out: the guard shatters in onyx shards and it reels; no guard until it re-forms
  breakArm() {
    const at = this.fistPos();
    this.arm = 0; this.armDown = KP_ARM.DOWN;
    if (this.sheathe) this.cancelSheathe();
    this.parryCD = Math.max(this.parryCD, 0.6);
    FX.debris(at, 30, ['#2e2834', '#1e1a24', '#463c50', '#7a6a62', '#ff7a1a'], 18);
    FX.sparks(at, 40, null, TAU, 6, 24, KRAG_FIRE);
    FX.dust(at, 14, { c: '#3a3036', smax: 5, rise: 2, life: 1.4 });
    FX.ring(at, 0.3, 4.5, 0.4, { c: '#ffd0a0', flat: false });
    FX.light(at, '#ffb040', 8, 10, 0.4);
    FX.flash('#ffe0c0', 0.2);
    Sound.play('armBreak', {}, at);
    Game.shake(0.45); Game.hitstop(0.08);
    this.hurtT = 0.35;
    this.vel.x -= fwdX(this.yaw) * 5; this.vel.z -= fwdZ(this.yaw) * 5;
  }
  // re-formed: molten seams run through it and close, and it comes back part worn
  armReform() {
    this.armDown = 0; this.arm = KP_ARM.BACK; this.armRest = 0; this.reformT = 0.6;
    const at = this.fistPos();
    FX.sparks(at, 20, { x: 0, y: 1, z: 0 }, 1.4, 3, 10, Object.assign({ g: -3, life: 1 }, KRAG_FIRE));
    FX.dust(at, 6, { c: KRAG_STEAM, smax: 2, rise: 3, life: 1.2 });
    FX.light(at, '#ffb040', 4, 6, 0.4);
    Sound.play('armReform', {}, at);
  }
  // The charged arm takes a blow and all of its heat goes off: everything round it is blown away and burnt.
  detonate(h) {
    const p = this.pos, at = this.fistPos();
    this.spendHeat();
    this.arm = Math.max(1, this.arm - KP_DET.WEAR); this.armRest = 0;
    if (this.sheathe) this.cancelSheathe();
    this.iframes = Math.max(this.iframes, 0.6);
    let kills = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz), dy = e.pos.y - p.y;
      if (d > KP_DET.R + e.r || dy > 3.5 || dy + e.h < -2) continue;
      const k = 1 - 0.5 * clamp(d / KP_DET.R, 0, 1), ux = d > 1e-3 ? dx / d : fwdX(this.yaw), uz = d > 1e-3 ? dz / d : fwdZ(this.yaw);
      hurtEnemy(e, KP_DET.DMG * k, { kv: { x: ux * KP_DET.KNOCK, y: 20, z: uz * KP_DET.KNOCK }, dir: { x: ux, y: 0.5, z: uz }, heavy: true, cause: 'kragBlast', stagger: 1.2, hitstop: 0, crit: true, guardBreak: true });
      if (e.dead || e.dying) kills++;
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && distXZ(pr.pos, p) < KP_DET.R) { const u = flat(pr.pos.x - p.x, pr.pos.z - p.z); pr.hit(60, { heavy: true, kv: { x: u.x * 24, y: 18, z: u.z * 24 } }); }
    for (const b of Game.projectiles) { if (b.dead || !b.hostile || dist3(b.pos, this.center()) > KP_DET.R) continue; if (b.onSlash) b.onSlash(this); else b.dead = true; }
    Props.blast({ x: p.x, y: p.y + 1, z: p.z }, KP_DET.R * 0.8);
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + this.yaw + 0.4; kragVent({ x: p.x + Math.cos(a) * 4.2, y: p.y, z: p.z + Math.sin(a) * 4.2 }, 0.3, this, { dmg: 20 }); }
    if (kills) this.counterHeal(kills);
    const g = { x: p.x, y: p.y + 0.06, z: p.z };
    FX.ring(at, 0.4, 7.5, 0.5, { c: '#ffb040', flat: false });
    FX.ring(at, 0.3, 4, 0.35, { c: '#ffffff', flat: false });
    FX.ring(g, 0.5, KP_DET.R * 1.5, 0.5, { c: KRAG_ORANGE });
    FX.sparks(at, 60, null, TAU, 8, 32, KRAG_FIRE);
    FX.sparks(at, 24, { x: 0, y: 1, z: 0 }, 1.5, 6, 22, Object.assign({ g: -4, life: 1.6 }, KRAG_FIRE));
    FX.embers(at, 24);
    FX.dust(at, 18, { c: '#2a2026', smax: 9, life: 1.6, rise: 1.8 });
    FX.decal('scorch', p, { r: 2.6, dur: 10 });
    KragViews.fireball(at, 4.5, 0.55);
    KragViews.crack(p, { r: 4.5, life: 9 });
    FX.light(at, '#ffb040', 12, 20, 0.6);
    FX.flash('#ffd0a0', 0.5);
    Sound.play('detonate', {}, at);
    Game.shake(0.8); Game.hitstop(0.1);
    Game.slowmo(0.25, 0.6, true);
    FPFX.kick('counter', { scale: 1.4, col: [255, 170, 90] });
    const u = flat((h.from || at).x - p.x, (h.from || at).z - p.z);
    this.vel.x -= u.x * 6; this.vel.z -= u.z * 6;
  }

  // ---------- heat ----------
  updateHeat(dt) {
    this.restT += dt;
    if (this.restT > KP_HEAT.REST && this.heat > 0) {
      this.heat = Math.max(0, this.heat - KP_HEAT.COOL * dt);
      if (this.heat < KP_HEAT.MAX) this.flared = false;
    }
    this.heatFX(dt);
  }
  // true when this takes it to full
  addHeat(n) {
    if (this.ventT > 0 || this.dead || !(n > 0)) return false;
    this.restT = 0;
    const was = this.heat < KP_HEAT.MAX;
    this.heat = Math.min(KP_HEAT.MAX, this.heat + n);
    if (was && this.heat >= KP_HEAT.MAX) { this.onCharged(); return true; }
    return false;
  }
  // every blow it lands feeds it (core.js calls this for each one registered)
  onDealt(d, cause) { if (!KP_NOHEAT.has(cause)) this.addHeat(Math.min(KP_HEAT.HIT_CAP, d * KP_HEAT.HIT)); }
  // spent: the heat goes, with a hiss of steam off the body
  spendHeat() {
    this.heat = 0; this.flared = false; this.ventT = KP_HEAT.VENT; this.restT = 0;
    FX.dust(this.local(0, 2.3, -0.3), 8, { c: KRAG_STEAM, smax: 2.5, rise: 3, life: 1.4 });
  }
  // full heat: the mohawk tears up off its head with an orange pulse, and it roars
  onCharged() {
    this.flareT = 0.6; this.flared = true; this.pulseT = 0.9;
    const h = this.crestPos(), c = this.chest();
    FX.sparks(h, 30, { x: 0, y: 1, z: 0 }, 1.1, 6, 18, Object.assign({ g: -6, life: 1.3 }, KRAG_FIRE));
    FX.embers(h, 14);
    FX.ring(c, 0.5, 7, 0.5, { c: KRAG_ORANGE, flat: false });
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.5, 6, 0.45, { c: '#ffb040' });
    FX.light(h, '#ff8a2a', 7, 12, 0.5);
    FX.flash('#ff8a3a', 0.12);
    Sound.play('heatMax', {}, h);
    Sound.play('kragRoar', { pm: 1.1 }, c);
    Game.shake(0.25);
  }
  // steam, embers and sparks off the body by its heat; at full heat an orange pulse every so often (kept out of
  // the lens in first person)
  heatFX(dt) {
    const k = this.heatK(), fp = Camera.fp && Game.player === this && Game.state === 'playing';
    if (!fp && Math.random() < 0.05 + 0.35 * k) FX.embers(this.local(rand(-0.5, 0.5), rand(0.8, 2.5), rand(-0.4, 0.3)), 1);
    if ((this.steamT -= dt) <= 0) {
      this.steamT = lerp(0.8, 0.12, k);
      if (!fp && k > 0.15) FX.dust(this.local(chance(0.5) ? -0.25 : 0.25, 2.5, -0.45), 1 + Math.round(k), { c: KRAG_STEAM, smax: 0.7, rise: 2 + 2 * k, life: 1.2 });
    }
    if (!this.charged()) return;
    if (!fp && Math.random() < 0.35) FX.sparks(this.crestPos(), 2, { x: 0, y: 1, z: 0 }, 0.8, 3, 9, Object.assign({ g: -8, life: 1.1 }, KRAG_FIRE));
    if ((this.pulseT -= dt) <= 0) {
      this.pulseT = 1.1;
      const c = this.chest();
      FX.ring(c, 0.4, 3.2, 0.4, { c: KRAG_ORANGE, flat: false });
      FX.light(c, '#ff8a2a', 2.5, 7, 0.25);
    }
  }

  // ---------- the onyx arm ----------
  // it mends when it's left alone, and a broken one re-forms; a worn one smokes, sheds chips and creaks
  updateArm(dt) {
    if (this.armDown > 0) { this.armDown -= dt; if (this.armDown <= 0) this.armReform(); }
    else if (!this.sheathe && (this.armRest += dt) > KP_ARM.REST) this.arm = Math.min(KP_ARM.MAX, this.arm + KP_ARM.MEND * dt);
    if (this.dead) return;
    const w = this.wearK(), broken = this.armDown > 0;
    if (w < 0.3 && !broken) return;
    const f = this.local(-0.7, rand(1.2, 2.2), rand(-0.1, 0.4));
    if (Math.random() < (broken ? 0.4 : (w - 0.3) * 0.4)) FX.dust(f, 1, { c: broken ? '#2a2428' : '#5a5258', smax: 0.6, rise: 1.6 + w, life: 1.1 });
    if ((w > 0.55 || broken) && Math.random() < (broken ? 0.08 : (w - 0.55) * 0.15)) FX.debris(f, 1, ['#2e2834', '#463c50', '#7a6a62'], 2);
    if (!broken && w > 0.6 && (this.armCreak -= dt) <= 0) { this.armCreak = lerp(3.5, 1.4, (w - 0.6) / 0.4) * rand(0.8, 1.2); Sound.play('armCreak', { wear: w }, f); }
  }

  // ---------- F: the leap ----------
  // Where it would land: the crosshair's spot (pulled back off whatever it's on) within reach, on ground the
  // body fits on, off the molten river; else the furthest such spot back along the line toward it; else where it
  // stands (a leap in place).
  planLeap() {
    const A = this.leapAim;
    if (!A) return;
    const C = Camera, P = this.pos, q = { x: C.aim.x - C.dir.x * 0.4, y: C.aim.y - C.dir.y * 0.4, z: C.aim.z - C.dir.z * 0.4 };
    let dx = q.x - P.x, dz = q.z - P.z, dh = Math.hypot(dx, dz);
    if (dh < 0.05) { dx = fwdX(this.yaw); dz = fwdZ(this.yaw); dh = 1; q.y = P.y; }
    const ux = dx / dh, uz = dz / dh, L = Math.min(dh, KP_LEAP.RANGE), B = Arena.bounds();
    let plan = null;
    for (let s = L; s >= 0.5 && !plan; s -= 0.8) {
      const x = P.x + ux * s, z = P.z + uz * s;
      if (x < B.minX + 1.5 || x > B.maxX - 1.5 || z < B.minZ + 1.5 || z > B.maxZ - 1.5) continue;
      const gy = World.groundAt(x, z, P.y + (q.y - P.y) * (s / dh) + 1.5);
      if (gy === -Infinity || gy - P.y > KP_LEAP.UP || P.y - gy > KP_LEAP.DOWN || Foundry.lavaAt(x, z)) continue;
      if (!World.boxFree(x, gy + 0.05, z, this.r, this.M.H - 0.1)) continue;
      plan = { x, y: gy, z };
    }
    if (!plan) { const g = World.groundAt(P.x, P.z, P.y + 0.5); plan = { x: P.x, y: g === -Infinity ? P.y : g, z: P.z }; }
    A.plan = plan;
  }
  // up over whatever is between, timed to come down on q
  startLeap(q) {
    if (!q || this.dead) return;
    if (this.tether) this.releaseTether();
    Controller.dropCling(this);
    this.sliding = false;
    if (this.crouching && Controller.canStand(this)) { this.crouching = false; Controller.setHeight(this, this.M.H); }
    const P = this.pos, g = PC.GRAV * KP_LEAP.GK, d = distXZ(q, P);
    const top = Math.max(P.y, q.y) + KP_LEAP.LIFT * clamp(d / 10, 0.5, 1);
    const room = World.raycast({ x: P.x, y: P.y + this.h, z: P.z }, { x: 0, y: 1, z: 0 }, top - P.y + 0.1, 0.4);
    const apex = room ? P.y + Math.max(0.3, room.t - 0.2) : top;
    const vy = Math.sqrt(2 * g * Math.max(0.3, apex - P.y)), T = vy / g + Math.sqrt(2 * Math.max(0.05, apex - q.y) / g);
    this.leap = { to: { x: q.x, y: q.y, z: q.z }, t: 0, T, g, vx: (q.x - P.x) / T, vz: (q.z - P.z) / T };
    this.vel.x = this.leap.vx; this.vel.z = this.leap.vz; this.vel.y = vy; this.onGround = false; this.coyote = 0; this.airJumps = 0;
    if (d > 0.3) this.yaw = yawOf(q.x - P.x, q.z - P.z);
    const f = { x: P.x, y: P.y + 0.05, z: P.z };
    KragViews.crack(f, { r: 2.4, life: 5 });
    FX.dust(P, 10, { smax: 5, rise: 0.8 });
    FX.debris(P, 8, KRAG_STONE, 10);
    FX.ring(f, 0.3, 3, 0.3, { c: KRAG_ORANGE });
    FX.sparks({ x: P.x, y: P.y + 0.2, z: P.z }, 16, { x: 0, y: -1, z: 0 }, 1.2, 5, 16, KRAG_FIRE);
    Sound.play('kragLaunch', {}, P);
    Game.shake(0.22);
    FPFX.kick('dash', { scale: 0.8, dir: { x: (q.x - P.x) / (d || 1), y: 0.5, z: (q.z - P.z) / (d || 1) } });
  }
  // Coming down with all its weight: a blast round it, a shockwave over the ground and a ring of vents.
  leapImpact() {
    this.leap = null;
    const p = this.pos, R = KP_LEAP.R;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz), dy = e.pos.y - p.y;
      if (d > R + e.r || dy > 3 || dy + e.h < -1.5) continue;
      const k = 1 - 0.4 * clamp(d / R, 0, 1), ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
      hurtEnemy(e, KP_LEAP.DMG * k, { kv: { x: ux * 18, y: 22, z: uz * 18 }, dir: { x: ux, y: 0.6, z: uz }, heavy: true, cause: 'leap', stagger: 0.7, hitstop: 0.02 });
    }
    for (const pr of Game.props) if (!pr.dead && pr.grabR && distXZ(pr.pos, p) < R && Math.abs(pr.pos.y - p.y) < 3) { const u = flat(pr.pos.x - p.x, pr.pos.z - p.z); pr.hit(30, { heavy: true, kv: { x: u.x * 18, y: 20, z: u.z * 18 } }); }
    Props.blast({ x: p.x, y: p.y + 1, z: p.z }, R * 0.7);
    Game.hazards.push(new SlamRing(p, { cause: 'leap', c: KRAG_ORANGE, dmg: 14, speed: 24 }));
    for (let i = 0; i < KP_LEAP.VENTS; i++) { const a = (i / KP_LEAP.VENTS) * TAU + rand(-0.2, 0.2); kragVent({ x: p.x + Math.cos(a) * 4.8, y: p.y, z: p.z + Math.sin(a) * 4.8 }, 0.45, this, { dmg: 18 }); }
    const g = { x: p.x, y: p.y + 0.06, z: p.z };
    FX.ring(g, 0.4, 9, 0.45, { c: KRAG_ORANGE });
    FX.ring(g, 0.3, 5, 0.3, { c: '#ffd070' });
    FX.dust(p, 30, { smax: 12, rise: 1.2 });
    FX.debris(p, 22, KRAG_STONE, 20);
    FX.sparks({ x: p.x, y: p.y + 0.3, z: p.z }, 30, { x: 0, y: 1, z: 0 }, 1.4, 5, 20, KRAG_FIRE);
    FX.embers(p, 10);
    FX.decal('crack', g, { len: 5 });
    KragViews.crack(g, { r: 5, life: 8 });
    KragViews.fireball({ x: p.x, y: p.y + 1, z: p.z }, 2.6, 0.4);
    FX.light({ x: p.x, y: p.y + 1, z: p.z }, '#ff8a2a', 10, 14, 0.4);
    Sound.play('kragStomp', { big: true }, p);
    Game.shake(0.55); Game.hitstop(0.05);
    FPFX.kick('slam', { scale: 1.1 });
    this.landT = 0.3; this.landLag = 0.12;
  }

  // ---------- Q: the Molten Fist ----------
  ultBlocked() { return this.dead || !!this.sheathe || !!this.kickAnim || this.rebounding() || !!this.shoulder || !!this.leap || !!this.plunge || Game.cineActive(); }
  // the real seconds one tick stands for (more than a tick's game time in slow motion)
  realStep() { return (1 / 120) / Math.max(0.05, Game.slowScale); }
  updateUlt(dt) {
    this.ultFlash = Math.max(0, this.ultFlash - dt);
    if (this.fistAim) { this.runFistAim(); return; }
    if (Input.wasPressed('ultimate') && this.ultCharging <= 0) {
      if (this.ultCharge < 1 || this.ultBlocked()) { Sound.play('denied'); this.ultFlash = 0.35; return; }
      this.cancelCharge();
      this.attack = null; this.attackQueued = null; this.atkPend = null;
      this.ultCharging = 1e-4;
      this.loops.ult = Sound.loop('ultHold');
    }
    if (this.ultCharging <= 0) return;
    if (!Input.isDown('ultimate') || this.ultBlocked()) { this.ultCharging = 0; this.ultHold = 0; this.stopLoop('ult'); return; }
    // the onyx arm drawn back, fire drawn into the fist
    this.ultCharging += dt; this.ultHold = this.ultCharging;
    const k = clamp(this.ultCharging / KP_FIST.HOLD, 0, 1), f = this.fistPos();
    if (this.loops.ult) this.loops.ult.set(k);
    for (let i = 0; i < 2; i++) {
      const u = coneDir(null, TAU), R = lerp(2.6, 1, k), q = { x: f.x + u.x * R, y: f.y + u.y * R, z: f.z + u.z * R };
      FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3.4, R * 4, { c0: '#ffffff', c1: '#ff5a3a', c2: '#781e1a', g: 0, life: 0.6 });
    }
    if (this.ultCharging >= KP_FIST.HOLD) this.beginFistAim();
  }
  // Bullet time with the cone shown: it can't be backed out of, only thrown with Q or attack (or by itself after
  // AIM seconds).
  beginFistAim() {
    this.ultCharging = 0; this.stopLoop('ult');
    this.fistAim = { real: 0, yaw: Camera.fp ? Camera.yaw : this.aimYaw };
    this.ultHold = 1;
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    Game.bulletTime(KP_FIST.AIM + 0.4, { kind: 'aim', scale: KP_FIST.SLOW, owner: this });
    Sound.play('timeSlow'); Sound.play('kragCharge', { dur: KP_FIST.AIM * 0.6 }, this.pos);
    const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, c = this.chest();
    FX.ring(g, 0.5, 10, 0.45, { c: '#ff2a3a' });
    FX.sparks(c, 30, { x: 0, y: 1, z: 0 }, 1.2, 6, 20, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
    FX.light(c, '#ff2a3a', 6, 10, 0.4);
    KragViews.crack(g, { r: 4.5, red: true, grow: 0.6, life: KP_FIST.AIM + 2 });
    Game.shake(0.25);
  }
  runFistAim() {
    const A = this.fistAim, fist = this.fistPos();
    this.ultHold = 1; this.aimHold = PC.FACE_AIM;
    A.real += this.realStep();
    A.yaw = Camera.fp ? Camera.yaw : this.aimYaw;
    // red energy and fire streaming into the drawn-back fist; grit lifting off the street round it
    const u = coneDir(null, TAU), R = rand(1.4, 3.4);
    FX.sparks({ x: fist.x + u.x * R, y: fist.y + u.y * R * 0.8, z: fist.z + u.z * R }, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3, R * 3.6, { c0: '#ffffff', c1: '#ff4a3a', c2: '#781e1a', g: 0, life: 0.8 });
    if (Math.random() < 0.4) { const a = rand(0, TAU), r = rand(1.5, 5); FX.sparks({ x: this.pos.x + Math.cos(a) * r, y: this.pos.y + 0.05, z: this.pos.z + Math.sin(a) * r }, 1, { x: 0, y: 1, z: 0 }, 0.4, 2, 6, { c0: '#ffffff', c1: '#ff4a3a', c2: '#781e1a', g: -2, life: 0.9 }); }
    if (Input.wasPressed('ultimate') || Input.wasPressed('attack') || A.real >= KP_FIST.AIM) this.fireFist();
  }
  // The fist goes into the street and the whole cone splits open into a molten chasm (KragFistChasm does the
  // rest: the split racing out, what it hits, the vents after).
  fireFist() {
    const A = this.fistAim;
    this.fistAim = null; this.ultHold = 0;
    if (Game.btOwner === this) Game.endBulletTime();
    if (!A) return;
    this.ultCharge = 0; this.ultReadyPlayed = false;
    Game.stats.ults++;
    const f = { x: fwdX(A.yaw), z: fwdZ(A.yaw) }, P = this.pos;
    this.yaw = A.yaw;
    const gy = this.onGround ? P.y : World.groundAt(P.x, P.z, P.y + 0.3), y = gy === -Infinity ? P.y : gy;
    const apex = { x: P.x - f.x * 0.6, y, z: P.z - f.z * 0.6 }, g = { x: P.x + f.x * 1.6, y, z: P.z + f.z * 1.6 }, fist = { x: g.x, y: y + 0.5, z: g.z };
    Game.hazards.push(new KragFistChasm(this, apex, f, g));
    KragViews.fireball(fist, 5, 0.55);
    FX.ring({ x: g.x, y: y + 0.06, z: g.z }, 0.5, 14, 0.55, { c: '#ff2a3a' });
    FX.ring({ x: g.x, y: y + 0.07, z: g.z }, 0.3, 7, 0.35, { c: '#ffffff' });
    FX.ring(fist, 0.4, 9, 0.45, { c: '#ffb040', flat: false });
    FX.sparks(fist, 60, { x: f.x, y: 0.5, z: f.z }, 1.2, 10, 40, KRAG_FIRE);
    FX.sparks(fist, 30, null, TAU, 6, 22, KRAG_FIRE);
    FX.embers(fist, 30);
    FX.debris(fist, 28, KRAG_STONE, 22);
    FX.dust(fist, 20, { c: '#2a2026', smax: 10, rise: 2, life: 1.8 });
    FX.decal('scorch', g, { r: 3.4, dur: 14 });
    FX.light(fist, '#ffa040', 14, 26, 0.6);
    FX.flash('#ffb070', 0.45);
    Props.blast(fist, 5);
    Sound.play('kragPunch', {}, fist);
    Game.shake(1); Game.hitstop(0.06);
    FPFX.kick('slam', { scale: 1.3 });
    this.fistT = 0.7; this.landLag = 0.2;
    this.vel.x = 0; this.vel.z = 0;
  }

  // ---------- cutscenes, pauses ----------
  // a cutscene or a blast stops whatever it was holding; a drawn-back Fist isn't spent
  cancelActions() {
    this.stopLoop('leapAim');
    this.leapAim = null; this.leap = null; this.shoulder = null; this.counterT = 0;
    if (this.fistAim || this.ultCharging > 0) {
      this.fistAim = null; this.ultCharging = 0; this.ultHold = 0;
      this.stopLoop('ult');
      if (Game.btOwner === this) Game.endBulletTime();
    }
  }
  onPause() { super.onPause(); this.stopLoop('leapAim'); }
  onResume() {
    super.onResume();
    if (this.leapAim) { this.loops.leapAim = Sound.loop('charge'); this.loops.leapAim.set(0.6); }
    if (this.ultCharging > 0) { this.loops.ult = Sound.loop('ultHold'); this.loops.ult.set(clamp(this.ultCharging / KP_FIST.HOLD, 0, 1)); }
  }

  // ---------- the model's lights (KragPose reads these) ----------
  // Its molten light by its heat, dull red cold to white hot and flickering at full; the onyx arm a step hotter,
  // and white while it's drawn back for the Fist or charged up to guard; dark once it's down.
  tints() {
    const P = this._tint || (this._tint = {}), C = KRAG_COL, k = this.heatK();
    Krag.prototype.armTints.call(this, P);
    if (this.dead && this.deadT > 0.6) {
      for (const t of ['vein', 'avein', 'visor', 'core', 'toe', 'knuck', 'frac1', 'frac2']) P[t] = C.off;
      return P;
    }
    const ramp = ['#5a1606', '#8a2a0a', '#b8400e', '#e05414', '#ff6a1a', '#ff8a2a', '#ffa840', '#ffc460', '#ffd890'];
    const at = (u) => ramp[clamp(Math.round(u * (ramp.length - 1)), 0, ramp.length - 1)];
    const flick = ((this.t * 18) | 0) % 2, max = this.charged();
    const hotArm = !!this.fistAim || this.ultCharging > 0 || (!!this.sheathe && (max || (this.sheathe.empowered && this.sheathe.charge >= 1)));
    P.vein = max && flick ? '#ffe8b0' : at(0.35 + 0.6 * k);
    P.avein = hotArm ? (flick ? '#ffffff' : '#ffd060') : this.fistT > 0.2 ? '#3a1408' : max && flick ? '#fff0c8' : at(0.45 + 0.55 * k);
    P.knuck = P.avein;
    P.visor = this.hurtT > 0 ? '#ffffff' : this.fistAim && flick ? '#ffffff' : '#ff9a30';
    P.core = max ? (flick ? '#ffffff' : '#ffd060') : at(0.55 + 0.45 * k);
    P.toe = at(0.4 + 0.5 * k);
    return P;
  }
}
KragPlayer.TIMERS = Player.TIMERS.concat(['flareT', 'blockT', 'counterT', 'fistT', 'landT', 'reformT', 'ventT']);
KragPlayer.DOWN = { stage: 'down' };
// the camera sits this much further back, so the body doesn't fill the view
KragPlayer.prototype.camScale = 1.35;
KragPlayer.prototype.fxCol = {
  main: KRAG_ORANGE, ring: '#ffb040', hot: '#fff0c8', ghost: KRAG_ORANGE, elec: KP_ELEC, spark: KRAG_FIRE, stance: 'kragGuard', lower: 'blockDown',
  tether: { line: '#ff6a1a', core: '#ffe0b0', ghost: KRAG_ORANGE, light: '#ff8a2a', elec: KP_ELEC, spark: KRAG_FIRE, pal: 'molten' },
};
