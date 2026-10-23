'use strict';
// AEGIS-07 in 3D: the 2D rival's fight (rival.js in the 2D game), rebuilt for open space. It is a 2.5 m mech
// that runs, boosts on its back thrusters and hovers, so it moves in ways the 2D one couldn't:
//   Stance. In phase 1 it always zones: it holds a band of range, strafes, boosts away and tether-zips to new
//   vantages (roof edges, balconies, the far side of the street), and only fights up close to cut you off it.
//   In phase 2 it always presses in, and only throws blade waves or leaps on you when you try to get away.
//   Its thrusters burn hotter while it charges.
//   Dash chains. Thruster dashes come in chains of legs taken relative to you at the moment each starts:
//   it zigzags in (side, other side, then the cut), swings round your flank, or feints back before it comes,
//   and from far off takes long chains that cross the street in boosts. Only a leg or a blow that attacks
//   glints first, so it can be parried or dodged; repositioning boosts never glint.
// Phase 1 (above half health): shielded. It zones with a forearm gun (slash the bolts back: eight cracks break
// the shield) and a shoulder beam it fires hovering, lobs a pulse grenade (tether it and kick it back to break
// the shield at once), and when you get in its face it cuts and boosts away. At half health it throws you
// clear and enrages in a cutscene.
// Phase 2: shield and guns offline, blade only; it stays blue. Combos, guards that parry what you swing into
// them and answer with a riposte in bullet time (parry it to stun it), the red flash (only a dash through to the
// wedge behind it avoids it), sword dash chains, blade waves (jump, duck, dash through, or parry to break them;
// they can't be sent back), and a dive bomb onto a mark that tracks you.
// The last hit plays a slow-motion knockout cutscene and leaves it lying in the street.

Object.assign(PALETTES, {
  blue: [[240, 248, 255], [150, 196, 255], [47, 107, 255], [12, 30, 110]],
});
for (const k of ['blue']) PAL_LIN[k] = PALETTES[k].map((c) => c.map(_lin));

ENEMY_DEFS.aegis = { hp: 900, r: 0.62, h: 2.5, speed: 7.0, score: 5000, mass: 6, dmg: 5, heavy: true, climb: 99, debris: ['#b4b8c0', '#868b96', '#33353e', '#2f6bff', '#c08a34'] };
ENEMY_BASE_STATE.aegis = 'fight';
CHARACTERS.aegis = { id: 'aegis', name: 'AEGIS-07', utility: null };

const AEGIS_BOLT = { outer: '#2f6bff', core: '#e0ecff', light: '#4a8aff' };
const AEGIS_SPARK = { c0: '#ffffff', c1: '#8ab8ff', c2: '#1a3a8a' };
const AEGIS_RED = { c0: '#ffffff', c1: '#ff6a7a', c2: '#5a0c1a' };
// bullet time while its riposte or red flash winds up
const RIPOSTE_BT_SCALE = 0.7;
// returned bolts it takes to break the phase-1 shield
const SHIELD_CRACKS = 8;
const PERIL_RED = '#ff2a3a';
// its eye flashes this long before a riposte or red flash connects (0.3 s of bullet time); act on the flash
const CUE_LEAD = 0.21;
const CLOSE_CONNECT = 0.09;
// thruster dash: speed in m/s and length of one leg in each phase
const AEGIS_DASH = { V: 26, LEN1: 4.6, LEN2: 5.4 };
const AEGIS_G = 60;
// the dive bomb: seconds charging, metres it leaps above you, seconds the mark tracks you in the hang, seconds
// from its flash to the dive (all scaled by the telegraph setting), and its dive speed in m/s
const DIVE = { CHARGE: 0.95, HIGH: 16, TRACK: 0.6, FLASH: 0.3, SPEED: 90 };
// tether zips: the line's flight time, top reeling speed, and range from you of the vantages it zips to
const ZIP = { FIRE: 0.14, SPEED: 34, NEAR: 9, FAR: 15 };
// the machine gun: wind-up (s, scaled by the telegraph setting), bolts per burst, seconds between them, and the
// reach of each pattern in radians (a sweep's half-width, how far short a walk starts, a scatter's half-width)
const GUN = { WIND: 0.55, SHOTS: 12, GAP: 0.075, SWEEP: 0.26, WALK: 0.2, SCATTER: 0.16 };
// blade waves: speed in m/s and the tilt (radians) of the crescent about its line of flight
const BLADE_WAVE = { SPEED: 38, TILT: Math.PI / 4 };
// the kinds of box whose tops it zips onto
const VANTAGE_KINDS = new Set(['building', 'container', 'car', 'overpass', 'girder', 'scaffold', 'frame', 'plat', 'stack', 'pile', 'machine', 'site', 'roof', 'escape', 'balcony']);

// Blade moves, in metres. wind = telegraph before the swing; swing = active time; r = reach from the chest;
// tilt = the swing plane's tilt from level (about 1.4 is a vertical cut); lunge = forward speed in the swing.
const RIVAL_MOVES = {
  slash: { wind: 0.3, swing: 0.2, r: 2.9, span: 3.0, tilt: 0.25, dmg: 14, lunge: 10 },
  cleave: { wind: 0.45, swing: 0.24, r: 3.2, span: 3.0, tilt: 1.35, dmg: 24, lunge: 6, quake: true, down: true },
  rise: { wind: 0.32, swing: 0.22, r: 3.0, span: 2.6, tilt: 1.3, dmg: 16, lunge: 5, rising: true },
  thrust: { wind: 0.36, swing: 0.2, r: 3.6, span: 0.3, tilt: 0, dmg: 18, thrust: true },
  spin: { wind: 0.42, swing: 0.3, r: 2.9, span: TAU - 0.02, tilt: 0.05, dmg: 16, spin: true },
  riposte: { wind: 0.34, swing: 0.2, r: 3.2, span: 3.4, tilt: 0.3, dmg: 28, close: true },
  // the red flash: everything out to zone metres takes it but a 90 degree wedge behind it
  peril: { wind: 0.45, swing: 0.24, r: 3.6, span: 3.2, tilt: 0.2, dmg: 45, close: true, unparryable: true, zone: 20 },
  wave: { wind: 0.4, swing: 0.22, r: 2.6, span: 2.6, tilt: 0.1, dmg: 12, wave: true },
  // the follow-up wave: it boosts up as it winds and throws it at head height
  waveAir: { wind: 0.42, swing: 0.22, r: 2.6, span: 2.6, tilt: 0.1, dmg: 12, wave: true, air: true },
};
const RIVAL_COMBOS = [
  ['slash', 'slash', 'cleave'], ['thrust', 'slash', 'rise'], ['slash', 'spin'],
  ['rise', 'cleave'], ['thrust', 'cleave'], ['slash', 'slash', 'slash', 'spin'],
];
// Dash chains: legs taken relative to the line to you when each starts. ['side', s, deg] boosts deg off that
// line to one side (s, mirrored at random per chain); fwd and back go along it; cut is the sword dash that
// passes through where you are; a move name throws that move from wherever the legs left it.
const CHAINS = {
  // charging, phase 2
  zigzag: [['side', 1, 62], ['side', -1, 62], ['cut']],
  zigzag3: [['side', 1, 70], ['side', -1, 70], ['side', 1, 70], ['cut']],
  flank: [['side', 1, 95], ['side', 1, 115], ['cut']],
  feint: [['fwd'], ['back'], ['cut']],
  straight: [['fwd'], ['cut']],
  // charging from far off: long chains that cover the ground in boosts before the cut
  blitz: [['fwd'], ['side', 1, 50], ['side', -1, 50], ['fwd'], ['cut']],
  longZigzag: [['side', 1, 45], ['side', -1, 45], ['side', 1, 45], ['side', -1, 45], ['cut']],
  sweep: [['side', 1, 75], ['side', 1, 40], ['fwd'], ['side', -1, 60], ['cut']],
  // phase 1, with you in its face: a cut to drive you back, then a boost out of reach
  shove: [['slash'], ['back'], ['side', 1, 110]],
  shoveCleave: [['cleave'], ['back'], ['back']],
  // zoning with you in its face: boost back out to range
  backstep: [['back'], ['side', 1, 90]],
};

// a horizontal unit vector, and one turned deg degrees toward the right of it (s = 1) or the left (s = -1)
const flat = (x, z) => { const l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; };
const turnFlat = (u, s, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a) * s; return { x: u.x * c - u.z * sn, z: u.z * c + u.x * sn }; };
// a direction turned toward another by at most maxAng radians
function turnDir(cur, want, maxAng) {
  const dot = clamp(cur.x * want.x + cur.y * want.y + cur.z * want.z, -1, 1), ang = Math.acos(dot);
  if (ang <= maxAng || ang < 1e-5) return { x: want.x, y: want.y, z: want.z };
  const k = maxAng / ang, x = lerp(cur.x, want.x, k), y = lerp(cur.y, want.y, k), z = lerp(cur.z, want.z, k), l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}
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

class Rival extends Enemy {
  constructor(pos, scale = {}) {
    super('aegis', pos, scale);
    this.isBoss = true; this.name = CHARACTERS.aegis.name;
    this.spawnT = 1.5; this.phase = 1; this.p2Hp = 0;
    this.shield = true; this.shieldDownT = 0; this.cracks = 0;
    this.stunT = 0; this.flinchT = 0; this.deflectT = 0; this.guardT = 0; this.parryInvulnT = 0; this.transT = 0; this.dodgeT = 0; this.perilFlash = 0;
    this.act = null; this.attack = null; this.windArc = null; this.lunge = null; this.dash = null; this.leap = null; this.hoverY = null;
    this.beam = null; this.grenade = null; this.beamLoop = null; this.want = null; this.faceYaw = this.yaw;
    this.cds = { gun: 1.2, blade: 0, beam: 7, grenade: 3, combo: 0.5, closer: 0, chain: 2, dive: 3, wave: 2, guard: 2, dodge: 0, leap: 0, zip: 3, zipTry: 0 };
    this.mode = 'zone'; this.modeT = 0; this.farT = 0; this.closeT = 0; this.hurtRecent = 0;
    this.bladeOut = 0; this.bladeWant = false; this.thrust = 0; this.ghostT = 0; this.stuckT = 0; this.lastPos = { x: pos.x, z: pos.z };
    this.dodged = new WeakSet(); this.dying = false; this.ko = null; this.koT = 0; this.intro = null; this.duel = false;
    this.lastDir = 1; this.reparried = false; this.redFirst = false; this.husk = null; this.tilt = 0; this.blindT = 0;
  }
  // Melee duel test mode: straight to phase 2 once it lands.
  startDuel() { this.duel = true; }
  // Entry cutscene: the street rumbles, a beacon erupts, it kneels inside it, stands, and its title hits.
  cinematicIntro() { this.intro = { t: 0, ct: 0, stage: 'gather', done: {}, started: false }; this.yaw = this.faceYaw = this.yawTo(Game.player.pos); }

  // ---------- where its parts are ----------
  center() { return { x: this.pos.x, y: this.pos.y + this.h * 0.55, z: this.pos.z }; }
  chest() { return { x: this.pos.x, y: this.pos.y + 1.85, z: this.pos.z }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  // a point in its body frame: x to its right, y up from its feet, f forward
  local(x, y, f) { const F = this.fwd(), R = this.right(); return { x: this.pos.x + R.x * x + F.x * f, y: this.pos.y + y, z: this.pos.z + R.z * x + F.z * f }; }
  shoulderR() { return this.local(0.43, 2.05, 0); }
  boneAt(name, x, y, z) {
    const R = this.model;
    if (!R || !R.bones[name]) return null;
    const v = this._bv || (this._bv = new THREE.Vector3());
    R.bones[name].updateWorldMatrix(true, false);
    v.set(x * AEGIS_SCALE, y * AEGIS_SCALE, z * AEGIS_SCALE).applyMatrix4(R.bones[name].matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }
  muzzle() { return this.boneAt('foreR', 0, -0.42, 0) || (() => { const s = this.shoulderR(), a = this.aimDir; return { x: s.x + a.x * 0.95, y: s.y + a.y * 0.95, z: s.z + a.z * 0.95 }; })(); }
  lensPos() { return this.boneAt('cannon', 0, 0.08, -0.37) || this.local(-0.42, 2.45, 0.3); }
  visorPos() { return this.boneAt('head', 0, 0.11, -0.18) || this.local(0, 2.35, 0.22); }
  orbPos() { return this.boneAt('handL', 0, -0.2, 0) || this.local(-0.45, 3.0, 0.1); }
  bladeTip() { return this.boneAt('weapon', 0, (AEGIS_BLADE * 0.85) / AEGIS_SCALE, 0) || this.local(0.5, 1.6, 1.4); }
  handPlant() { const p = this.local(-0.55, 0, 0.75); p.y = World.groundAt(p.x, p.z, p.y + 0.6) + 0.06; return p; }
  yawTo(q) { return yawOf(q.x - this.pos.x, q.z - this.pos.z); }
  groundY() { return World.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3); }

  // ---------- state readers for the model and views ----------
  dashing() { return !!this.dash; }
  hovering() { return this.hoverY !== null || (this.act && this.act.kind === 'dive' && this.act.phase === 'hang'); }
  showModel() { return !this.spawning || (this.intro && (this.intro.stage === 'emerge' || this.intro.stage === 'rise' || this.intro.stage === 'title')); }
  emissive() {
    if (this.hitFlash > 0) return 0.8;
    if (this.diveFlash > 0) return 1;
    const a = this.act;
    if (a && a.kind === 'dive' && a.phase === 'crouch') return clamp(a.t / this.tele(DIVE.CHARGE), 0, 1) * (0.25 + 0.2 * Math.sin(this.t * 40));
    if (this.intro && this.intro.stage === 'emerge') return 1;
    if (this.intro && this.intro.stage === 'rise' && this.intro.ct < 2.7) return 1;
    if (this.dying && this.ko && this.ko.stage === 'impact' && ((this.t * 40) | 0) % 2) return 0.7;
    if (this.parryInvulnT > 0.3) return 0.5;
    if (this.cutMark && ((Game.realTime * 30) | 0) % 2) return 0.6;
    return 0;
  }
  // the outline: red through the red flash, gold through a riposte, cyan while it guards
  outline() {
    const a = this.act;
    if (this.dying || this.spawning) return null;
    if (a && a.move === 'peril' && a.phase === 'wind') return this.perilFlash > 0 && ((this.t * 30) | 0) % 2 ? '#ffffff' : PERIL_RED;
    if (a && a.move === 'riposte' && a.phase === 'wind') return '#ffd070';
    if (a && a.kind === 'guard') return ((this.t * 8) | 0) % 2 ? '#bff8ff' : '#4a9aff';
    return null;
  }
  // the colours of its lights: blue in both phases (its guns go dark and the wiring under the popped limiters
  // glows once enraged), dark when knocked out
  tints() {
    const P = this._tint || (this._tint = {}), C = AEGIS_COL, ko = this.dying && this.ko && (this.ko.stage === 'collapse' || this.ko.stage === 'down');
    const p2 = this.phase === 2, blink = ((this.t * 12) | 0) % 3 === 0;
    if (ko || (this.dying && this.ko && this.ko.stage === 'kneel' && blink)) {
      for (const k of ['visor', 'core', 'lens', 'jet', 'gun', 'muzzle']) P[k] = C.off;
      P.wire = '#3a1a20';
      return P;
    }
    const a = this.act, hot = this.windingUp() && ((this.t * 16) | 0) % 2;
    P.visor = hot ? '#ffffff' : '#5a8aff';
    P.core = C.glow;
    P.lens = p2 ? C.off : a && a.kind === 'beam' ? (a.phase === 'fire' ? '#e0ecff' : ((this.t * 20) | 0) % 2 ? '#ffffff' : C.glow) : C.glow;
    P.gun = p2 ? C.off : a && a.kind === 'gun' ? '#9cc4ff' : C.glow;
    P.muzzle = p2 ? C.off : a && a.kind === 'gun' && a.t >= this.tele(GUN.WIND) ? '#ffffff' : C.glow;
    P.jet = this.mode === 'charge' ? '#9cc4ff' : C.glow;
    P.wire = p2 ? C.hi : C.wire;
    for (let i = 0; i < 3; i++) P['lim' + i] = p2 || (a && a.kind === 'enrage' && a.done['pop' + i]) ? C.K : C.G;
    return P;
  }
  windingUp() {
    const a = this.act;
    if (!a) return false;
    return (a.kind === 'gun' && a.t < this.tele(GUN.WIND)) || (a.kind === 'melee' && a.phase === 'wind') ||
      (a.kind === 'beam' && a.phase !== 'fire') || a.kind === 'grenade' || (a.kind === 'dive' && (a.phase === 'crouch' || a.phase === 'hang')) ||
      (a.kind === 'chain' && a.pause && a.glinted);
  }
  laser() { return 0; }
  stopLoops() { if (this.beamLoop) { this.beamLoop.stop(); this.beamLoop = null; } }

  // ---------- damage hooks used by hurtEnemy ----------
  shielded() { return this.shield && !this.dying; }
  dodging() { return this.dodgeT > 0; }
  // the stun is the payoff in phase 1; hits while it's merely unshielded count for less
  damageTakenMul() { return this.stunT > 0 ? 1.3 : this.phase === 1 && !this.shield ? 0.6 : 1; }
  // in phase 2 your parry is met blade to blade: no counter, and it raises a guard instead
  clashes() { return this.phase === 2 && !(this.act && this.act.move === 'riposte'); }
  // 0 at the start of phase 2, 1 near death
  rageK() { return clamp(1 - this.hp / (this.p2Hp || this.maxHp), 0, 1); }
  // later combos come faster as its health drops
  rageGap() { return this.phase === 2 ? lerp(1.8, 0.8, this.rageK()) : 1; }
  // phase 1 can't be skipped: damage stops at half health until the limiters come off
  gateDamage(d) { return this.phase === 1 ? Math.max(0, Math.min(d, this.hp - Math.floor(this.maxHp / 2))) : d; }
  // hits it deflects without a shield: its own parries, and the phase change
  intercept(o) {
    if (this.transT > 0) return true;
    if (this.parryInvulnT > 0) { FX.sparks(this.chest(), 4, null, TAU, 5.5, 14.5, AEGIS_SPARK); return true; }
    if (this.phase === 2 && this.guardT > 0) {
      // a blade of light from range breaks on its guard; only a blade in reach gets the counter
      if (o.ranged) { this.blockBeam(o); return true; }
      this.parryPlayer(o);
      return true;
    }
    return false;
  }
  blockBeam(o) {
    const p = Game.player, c = this.chest(), u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (!(this.act && this.act.lockYaw !== undefined)) this.yaw = this.faceYaw = this.yawTo(p.pos);
    FX.sparks({ x: c.x + u.x * 0.8, y: c.y, z: c.z + u.z * 0.8 }, o.full ? 24 : 10, { x: u.x, y: 0.2, z: u.z }, 1.6, 6, 20, AEGIS_SPARK);
    Sound.play('clash', {}, c);
  }
  noteHurt(d) { this.hurtRecent += d; }
  shieldHit(o) {
    // bolts sent back into the shield crack it; enough cracks break it like a rebounded grenade
    // so does the full sword beam
    if ((o.cause === 'reflect' || o.cause === 'beamFull') && this.phase === 1 && !this.dying) {
      this.cracks++;
      FX.ring(this.center(), 0.3, 1.8, 0.2, { c: '#9cc4ff', flat: false });
      Sound.play('reflect', {}, this.center());
      if (this.cracks >= SHIELD_CRACKS) { this.breakShield(); return; }
    }
    const p = Game.player, c = this.center(), u = flat(p.pos.x - c.x, p.pos.z - c.z);
    const at = { x: c.x + u.x * 1.2, y: c.y, z: c.z + u.z * 1.2 };
    FX.sparks(at, 6, { x: u.x, y: 0.3, z: u.z }, 1.4, 5.5, 18, AEGIS_SPARK);
    this.deflectT = 0.2;
    Sound.play('shieldDeflect', {}, at);
  }
  breakShield() {
    this.shield = false; this.shieldDownT = 10; this.cracks = 0;
    this.stunFor(3.2);
    const f = this.fwd();
    this.vel.x = -f.x * 9; this.vel.z = -f.z * 9; this.vel.y = 12; this.onGround = false;
    const c = this.center();
    FX.ring(c, 0.4, 5.5, 0.45, { c: '#4a8aff', flat: false });
    FX.sparks(c, 40, null, TAU, 7.3, 29, AEGIS_SPARK);
    FX.elec(c, 2.6, 10, { outer: '#2f6bff', core: '#ffffff' });
    FX.light(c, '#4a8aff', 7, 14, 0.5);
    FX.flash('#c8dcff', 0.35);
    Sound.play('bossShieldBreak', {}, c);
    Game.slowmo(0.25, 0.55, true);
    Game.shake(0.6);
    Game.hitstop(0.1);
  }
  restoreShield() {
    this.shield = true; this.cracks = 0;
    FX.ring(this.center(), 2.6, 0.5, 0.4, { c: '#4a8aff', flat: false });
    Sound.play('shieldUp', {}, this.center());
  }
  // a pulse grenade kicked back into it
  pulseHit() {
    if (this.dying || this.transT > 0) return;
    if (this.shield) this.breakShield();
    else hurtEnemy(this, 60, { cause: 'barrel', heavy: true, kv: { x: 0, y: 12, z: 0 }, dir: { x: 0, y: 1, z: 0 }, crit: true });
  }
  stunFor(dur) {
    this.stunT = dur; this.flinchT = 0; this.guardT = 0; this.parryInvulnT = 0;
    this.act = null; this.attack = null; this.windArc = null; this.beam = null; this.hoverY = null; this.dash = null; this.lunge = null; this.leap = null;
    this.stopLoops();
    if (Game.btOwner === this) Game.endBulletTime();
  }
  // called when the player parries one of its attacks
  stagger(dur, kv) {
    // a stunned rival can't be staggered into a guard (by parrying a leftover shockwave, say)
    if (this.dying || dur < 1.2 || this.stunT > 0) return;
    const push = (k) => { if (kv) { this.vel.x += (kv.x || 0) * k; this.vel.z += (kv.z || 0) * k; } };
    if (this.phase === 2) {
      if (this.act && this.act.move === 'riposte') {
        if (this.rollReparry()) { this.raiseGuard(1.6, 'reparry'); push(0.25); return; }
        this.stunFor(3.2);
        push(0.5); this.vel.y = 9; this.onGround = false;
        FX.sparks(this.chest(), 24, { x: 0, y: 1, z: 0 }, TAU, 5.5, 24, { c0: '#ffffff', c1: '#ffd070', c2: '#a06010' });
        Sound.play('bossShieldBreak', {}, this.center());
        Game.slowmo(0.25, 0.5, true);
        return;
      }
      // blades lock and it raises a guard, ready to parry whatever you throw next
      this.raiseGuard(1.4, 'clash');
      push(0.25);
      return;
    }
    this.flinchT = 0.7;
    this.act = null; this.attack = null; this.windArc = null; this.hoverY = null; this.beam = null; this.lunge = null; this.dash = null;
    push(0.33);
  }
  // after you parry its riposte it usually staggers; sometimes it recovers into a guard that parries your counter
  rollReparry() { this.reparried = chance(this.reparried ? 0.15 : lerp(0.3, 0.55, this.rageK())); return this.reparried; }
  // its first parry usually answers gold, but sometimes red: read which as it happens
  rollRedFirst() { this.redFirst = chance(this.redFirst ? 0.12 : lerp(0.25, 0.4, this.rageK())); return this.redFirst; }
  // Phase 2 guard: anything swung into it is parried and answered. why: 'clash' (you parried its swing),
  // 'read' (it saw your attack coming), 'stance' (it waits for you to commit), 'reparry' (it caught your parry of
  // its riposte; what it parries next gets the red flash).
  raiseGuard(dur, why) {
    if (this.stunT > 0 || this.dying) return;
    this.attack = null; this.windArc = null; this.lunge = null; this.dash = null;
    this.act = { kind: 'guard', t: 0, why };
    this.guardT = dur;
    this.yaw = this.faceYaw = this.yawTo(Game.player.pos);
    this.bladeWant = true;
    this.eyeGlint('#9ac8ff', 1.6);
    Sound.play('guardUp', {}, this.center());
    if (why === 'clash' || why === 'reparry') { Sound.play('clash'); Game.bulletTime(0.3, { kind: 'clash', scale: 0.3, owner: this }); }
  }
  // 0..1 through the riposte or red-flash wind-up, reaching 1 as its eye flashes
  cueProgress() {
    const a = this.act;
    if (!a || !a.m || !a.m.close || a.phase !== 'wind') return 1;
    return clamp(a.t / Math.max(0.05, this.windOf(a.m) - CUE_LEAD), 0, 1);
  }
  // a move's wind-up at this difficulty; the red flash speeds up less than the rest on the harder settings
  windOf(m) {
    if (!m.zone) return this.tele(m.wind);
    const T = S.enemies.telegraph;
    return m.wind * (T < 1 ? 1 - (1 - T) * 0.55 : T) * this.windMul;
  }
  eyeGlint(c, size) { FX.glint(this.visorPos(), { c, size, dur: 0.24, follow: () => this.visorPos(), threat: this }); }
  parryPlayer(o) {
    const reparry = !!(this.act && this.act.why === 'reparry');
    this.guardT = 0; this.parryInvulnT = 0.45;
    const p = Game.player, c = this.chest(), u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    FX.sparks({ x: c.x + u.x * 0.8, y: c.y, z: c.z + u.z * 0.8 }, 18, { x: u.x, y: 0.2, z: u.z }, 1.6, 7.3, 25, { c0: '#ffffff', c1: '#9ac8ff', c2: '#1a3a8a' });
    Sound.play('parry');
    Game.hitstop(0.06);
    Game.shake(0.2);
    if (!p.dead) {
      p.iaido = null; p.attack = null;
      p.vel.x = u.x * 15.5; p.vel.z = u.z * 15.5; p.vel.y = Math.max(p.vel.y, 7.3); p.onGround = false;
    }
    if (reparry || this.rollRedFirst()) { this.startPeril(); return; }
    this.startMove('riposte', null);
    // the world drains to grey, it glows gold, and its eye flashes gold: parry on the flash
    const wind = this.tele(RIVAL_MOVES.riposte.wind), real = wind / RIPOSTE_BT_SCALE;
    Game.bulletTime(real + 0.2, { kind: 'riposte', scale: RIPOSTE_BT_SCALE, owner: this });
    Sound.play('riposteCue', { dur: Math.max(0.1, (wind - CUE_LEAD) / RIPOSTE_BT_SCALE) });
  }
  // the red flash: it flares red and winds up a blow that goes straight through a parry; dash to its back
  startPeril() {
    this.startMove('peril', null);
    this.perilFlash = 0.16;
    FX.light(this.chest(), PERIL_RED, 6, 12, 0.5);
    Game.shake(0.25);
    const wind = this.windOf(RIVAL_MOVES.peril), real = wind / RIPOSTE_BT_SCALE;
    Game.bulletTime(real + 0.2, { kind: 'peril', scale: RIPOSTE_BT_SCALE, owner: this });
    // a pillar of red light and a ring thrown out as it starts to gather
    const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z };
    FX.ring(g, 0.5, 7, 0.35, { c: PERIL_RED });
    FX.ring(this.chest(), 0.4, 4.5, 0.3, { c: '#ffd0d4', flat: false });
    FX.sparks(this.chest(), 26, { x: 0, y: 1, z: 0 }, 1.2, 6, 18, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
    Sound.play('peril', { dur: Math.max(0.1, (wind - CUE_LEAD) / RIPOSTE_BT_SCALE) });
  }

  // ---------- update ----------
  update(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.t += dt; this.st += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.spawning) {
      if (this.intro) { this.updateIntro(dt); return; }
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.landingBurst(0.8); this.arrive(true); }
      return;
    }
    for (const k in this.cds) this.cds[k] -= dt * (k === 'leap' || k === 'dodge' || k === 'zip' || k === 'zipTry' ? 1 : S.enemies.aggression);
    for (const k of ['flinchT', 'guardT', 'parryInvulnT', 'transT', 'dodgeT', 'deflectT', 'perilFlash', 'diveFlash']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    this.hurtRecent = Math.max(0, this.hurtRecent - dt * 12);
    // the riposte's and red flash's bullet time lasts exactly as long as the wind-up
    const a0 = this.act;
    if (Game.btOwner === this && (Game.btKind === 'riposte' || Game.btKind === 'peril') && !(a0 && a0.move === Game.btKind && a0.phase === 'wind')) Game.endBulletTime();
    if (this.grenade && this.grenade.dead) { this.grenade = null; this.cds.grenade = rand(6, 9); }
    // the beam hum follows the beam, so it never outlives it
    const hum = !!(this.beam && this.beam.firing) && !this.dying;
    if (hum && !this.beamLoop) this.beamLoop = Sound.loop('beam');
    else if (!hum && this.beamLoop) this.stopLoops();
    this.bladeOut = approach(this.bladeOut, this.bladeWant || this.phase === 2 ? 1 : 0, dt * 7);
    if (this.dying) { this.updateDying(dt); return; }
    if (this.phase === 1 && this.hp <= this.maxHp / 2 && !(this.act && this.act.kind === 'intro')) this.enterPhase2();
    if (this.phase === 1 && !this.shield) {
      this.shieldDownT -= dt;
      if (this.shieldDownT <= 0 && this.stunT <= 0) this.restoreShield();
    }
    const p = Game.player, d = distXZ(p.pos, this.pos);
    this.farT = d > 15 ? this.farT + dt : Math.max(0, this.farT - dt * 2);
    this.closeT = d < 4.5 ? this.closeT + dt : Math.max(0, this.closeT - dt);
    // how long it has gone without a clear shot at you
    this.blindT = this.clearShot(this.shoulderR()) ? 0 : this.blindT + dt;
    this.modeT -= dt;
    this.aimDir = this.aimFrom(this.shoulderR(), p.chest());
    this.want = null;
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (Math.random() < 0.3) FX.sparks(this.visorPos(), 1, { x: 0, y: 1, z: 0 }, 1.5, 1.8, 4.5, { c0: '#ffffff', c1: '#ffd070', c2: '#a06010', g: 0 });
    } else if (this.flinchT > 0) {
      // recoiling from a parry
    } else {
      if (!this.act) this.chooseAct(p);
      if (this.act) this.runAct(dt, p);
      else this.navigate(dt, p);
      this.react(p);
    }
    if (this.phase === 2 && Math.random() < 0.25) {
      const q = this.local(rand(-0.4, 0.4), rand(0.8, 2.3), rand(-0.3, 0.3));
      FX.sparks(q, 1, { x: 0, y: 1, z: 0 }, 1, 1.8, 5.5, Object.assign({ g: -3 }, AEGIS_SPARK));
      if (Math.random() < 0.15) FX.bolt(q, { x: q.x + rand(-0.6, 0.6), y: q.y + rand(-0.4, 0.6), z: q.z + rand(-0.6, 0.6) }, 0.08, { outer: '#2f6bff', core: '#ffffff', jag: 0.15, w: 0.04 });
    }
    this.physics(dt);
    this.thrusterFX(dt);
  }
  // the colour and strength of its jets this frame (views.js draws them)
  thrusterFX(dt) {
    const a = this.act, dive = a && a.kind === 'dive' ? a.phase : null;
    const want = this.dash || dive === 'rise' || dive === 'dive' ? 1 : dive === 'crouch' ? clamp(a.t / this.tele(DIVE.CHARGE), 0, 1) * 0.6 : this.leap ? 0.85 : a && a.kind === 'zip' && a.phase !== 'fire' ? 0.55 : this.hovering() ? 0.7 : this.mode === 'charge' && !this.dying ? 0.18 : 0.06;
    this.thrust = approach(this.thrust, want, dt * 8);
    if ((this.dash || (this.lunge && this.phase === 2) || dive === 'dive' || dive === 'rise') && (this.ghostT -= dt) <= 0) { this.ghostT = 0.035; this.ghostReq = (this.ghostReq || 0) + 1; }
  }
  aimFrom(o, c) { const dx = c.x - o.x, dy = c.y - o.y, dz = c.z - o.z, l = Math.hypot(dx, dy, dz) || 1; return { x: dx / l, y: dy / l, z: dz / l }; }

  // ---------- stance ----------
  // Phase 1 always zones (holding its range, boosting and zipping away); phase 2 always presses in, and only
  // throws blade waves or leaps on you when you try to get away.
  pickMode() { this.mode = this.phase === 1 ? 'zone' : 'charge'; this.modeT = 99; }

  // ---------- choosing what to do ----------
  chooseAct(p) {
    if (p.dead) return;
    const d = distXZ(p.pos, this.pos), dy = p.pos.y - this.pos.y, near = d < 4.2 && Math.abs(dy) < 2.4;
    if (this.modeT <= 0) this.pickMode(p, d);
    if (this.phase === 2) {
      if (this.cds.combo <= 0 && near) {
        // sometimes it opens with a guard and waits for you to swing into it
        if (d < 3.6 && this.cds.guard <= 0 && chance(0.3)) { this.raiseGuard(rand(1.3, 1.8), 'stance'); this.cds.guard = rand(5, 8); return; }
        const opts = d > 3.0 ? RIVAL_COMBOS.filter((c) => c[0] === 'thrust') : RIVAL_COMBOS;
        const combo = pick(opts);
        this.startMove(combo[0], { list: combo, i: 0 });
        return;
      }
      if (!near && this.cds.closer <= 0 && Math.abs(dy) < 3.5) {
        this.cds.closer = rand(0.4, 0.8);
        const rage = this.rageK();
        // you're getting away: it throws a blade wave after you or leaps on you with the dive bomb
        if (this.escaping(p, d)) {
          if (this.cds.wave <= 0 && d > 6) { this.startMove(!this.onGround || chance(0.3) ? 'waveAir' : 'wave', null); this.cds.wave = rand(2.2, 3.4) * this.rageGap(); return; }
          if (this.cds.dive <= 0 && d > 8 && chance(0.5)) { this.startDive(p); this.cds.dive = rand(6, 9); return; }
        }
        // otherwise it comes for you: long chains that cover the ground in boosts from far off, short ones near
        if (this.cds.chain <= 0 && d < 34) {
          this.startChain(pick(d > 12 ? ['blitz', 'longZigzag', 'sweep', 'zigzag3'] : rage > 0.5 ? ['zigzag', 'zigzag3', 'flank', 'feint', 'flank'] : ['zigzag', 'flank', 'feint', 'straight']));
          this.cds.chain = rand(2.4, 3.6) * this.rageGap();
          return;
        }
      }
      return;
    }
    if (this.shield && !this.grenade && this.cds.grenade <= 0 && d > 5) {
      this.act = { kind: 'grenade', t: 0, plan: null, thrown: false };
      Sound.play('beamCharge', {}, this.center());
      return;
    }
    // kept in its face: a tether zip well away
    if (d < 7.5 && this.closeT > 1 && this.cds.zip <= 2.5 && this.startZip(p)) return;
    // in its face: a cut to drive you back and a boost out, or just the boost if the blade isn't ready
    if (near) {
      if (this.cds.blade <= 0) { this.startChain(chance(0.65) ? 'shove' : 'shoveCleave'); this.cds.blade = rand(1.4, 2); this.cds.chain = rand(1.4, 2.2); return; }
      if (this.cds.chain <= 0) { this.startChain('backstep'); this.cds.chain = rand(1.6, 2.4); return; }
    }
    // too close, out of range, or cut off from you: a tether zip to a new vantage
    if (this.cds.zip <= 0 && (d < 7.5 || d > 20 || this.blindT > 1.2) && this.startZip(p)) return;
    if (d < 6.5 && this.cds.chain <= 0) { this.startChain('backstep'); this.cds.chain = rand(2, 3); return; }
    if (this.cds.beam <= 0 && d > 7 && this.headroom(3.6)) { this.startBeam(); return; }
    if (this.cds.gun <= 0 && this.blindT <= 0 && d < 30) { this.startGun(); return; }
    // nothing ready: it moves to another vantage now and then
    if (this.cds.zip <= 0 && this.startZip(p)) return;
  }
  // you're trying to get away: running off from it, or kept out at range for a while
  escaping(p, d) {
    if (d < 8) return false;
    const ux = (p.pos.x - this.pos.x) / d, uz = (p.pos.z - this.pos.z) / d;
    return p.vel.x * ux + p.vel.z * uz > 4.5 || this.farT > 0.8;
  }
  clearShot(from) {
    const c = Game.player.chest(), dx = c.x - from.x, dy = c.y - from.y, dz = c.z - from.z, d = Math.hypot(dx, dy, dz) || 1;
    return !World.raycast(from, { x: dx / d, y: dy / d, z: dz / d }, d - 0.4);
  }
  headroom(h) { return !World.raycast({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, { x: 0, y: 1, z: 0 }, h, 0.4); }

  runAct(dt, p) {
    const a = this.act;
    a.t += dt;
    switch (a.kind) {
      case 'intro':
        if (this.duel && this.phase === 1 && a.t > 0.35) { this.enterPhase2((Game.runs.duel || 0) > 1); return; }
        if (a.t > 1.1) this.act = null;
        this.face(p.pos, 6, dt);
        return;
      case 'enrage': this.runEnrage(dt, a, p); return;
      case 'guard': {
        this.face(p.pos, 10, dt);
        if (Math.random() < 0.4) FX.sparks(this.bladeTip(), 1, { x: 0, y: 1, z: 0 }, 1.5, 1.8, 5.5, Object.assign({ g: 0 }, AEGIS_SPARK));
        // waiting it out works: the guard drops and it attacks straight away
        if (this.guardT <= 0) { this.act = null; this.cds.combo = a.why === 'stance' ? 0 : 0.2; }
        if (a.why === 'stance' && distXZ(p.pos, this.pos) > 3.6) this.steerTo(p.pos, 2.2);
        return;
      }
      case 'recover':
        if (a.t > a.dur) this.act = null;
        return;
      case 'melee': this.runMelee(dt, a, p); return;
      case 'chain': this.runChain(dt, a, p); return;
      case 'dive': this.runDive(dt, a, p); return;
      case 'zip': this.runZip(dt, a, p); return;
      case 'gun': this.runGun(dt, a, p); return;
      case 'beam': this.runBeam(dt, a, p); return;
      case 'grenade': this.runGrenade(dt, a, p); return;
    }
  }

  // ---------- getting around ----------
  face(q, rate, dt) { this.faceYaw = this.yawTo(q); this.turnRate = rate; }
  steerTo(q, spd) { const u = flat(q.x - this.pos.x, q.z - this.pos.z); this.want = { x: u.x, z: u.z, spd }; }
  runSpeed() { return this.def.speed * S.enemies.speed * (this.phase === 2 ? 1.2 : 1); }
  // where to be when it has nothing on: zoning holds a band of range and strafes; charging closes in
  navigate(dt, p) {
    const d = distXZ(p.pos, this.pos), u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z), spd = this.runSpeed();
    this.face(p.pos, 7, dt);
    if (this.mode === 'charge') {
      // from far off it boosts in along the open street
      const level = Math.abs(p.pos.y - this.pos.y) < 1.2;
      if (d > 13 && level && this.onGround && this.cds.closer <= 0) {
        const L = this.legRoom(u, 7);
        this.cds.closer = rand(0.9, 1.4);
        if (L > 3 && !World.raycast({ x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, { x: u.x, y: 0, z: u.z }, Math.min(d, 8), 0.25)) { this.dashTo(u, L); return; }
      }
      if (d > 2.6) this.pathTo(p, spd);
      this.unstick(dt, p, d > 3);
      return;
    }
    const near = this.phase === 1 ? 9 : 8, far = this.phase === 1 ? 16 : 14;
    if (d > far || Math.abs(p.pos.y - this.pos.y) > 3.5 && this.blindT > 0) {
      if (this.phase === 1 && this.cds.zip <= 0 && this.startZip(p)) return;
      this.pathTo(p, spd); this.unstick(dt, p, true); return;
    }
    let mx, mz;
    if (d < near) { mx = -u.x; mz = -u.z; }
    else { const s = this.side; mx = -u.z * s + u.x * 0.15 * (d - (near + far) / 2) / far; mz = u.x * s + u.z * 0.15 * (d - (near + far) / 2) / far; }
    const m = flat(mx, mz);
    // a wall or a drop in the way turns it round
    if (this.blockedAhead(m, 1.6)) { this.side = -this.side; if (d < near) { m.x = -u.z * this.side; m.z = u.x * this.side; } }
    this.want = { x: m.x, z: m.z, spd: spd * (d < near ? 0.9 : 0.6) };
    if (chance(0.004)) this.side = -this.side;
  }
  blockedAhead(m, L) {
    const knee = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z };
    if (World.raycast(knee, { x: m.x, y: 0, z: m.z }, L, 0.3)) return true;
    const ax = this.pos.x + m.x * L, az = this.pos.z + m.z * L;
    return World.groundAt(ax, az, this.pos.y + 0.6) < this.pos.y - 1.2;
  }
  // Toward the player: straight when on its level with the way clear, else along the nav graph; links it can't
  // walk it boosts over with a thruster leap.
  pathTo(p, spd) {
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1e-3;
    const level = Math.abs(p.pos.y - this.pos.y) < 1.2, knee = { x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z };
    if (level && !World.raycast(knee, { x: dx / d, y: 0, z: dz / d }, d, 0.25)) { this.want = { x: dx / d, z: dz / d, spd }; return; }
    const s = this.onGround ? Nav.steer(this, 99) : null;
    if (s) {
      if (s.kind === Nav.JUMP && this.cds.leap <= 0) { this.leapTo(s.to); return; }
      this.want = { x: s.x, z: s.z, spd };
      return;
    }
    // off the graph: boost to where the player is, if it can
    if (this.onGround && this.cds.leap <= 0 && Math.abs(p.pos.y - this.pos.y) > 1.5) {
      const q = this.spotNear(p.pos, 2.5, 5.5, true);
      if (q) { this.leapTo(q); return; }
    }
    this.want = { x: dx / d, z: dz / d, spd };
  }
  // it hasn't got anywhere for a while: boost to a clear spot near the player
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
  // A thruster leap: up over whatever is between and down onto q, timed so it lands there.
  leapTo(q) {
    const g = AEGIS_G * 0.6, top = Math.max(this.pos.y, q.y) + 2.5;
    const room = World.raycast({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, { x: 0, y: 1, z: 0 }, top - this.pos.y, 0.4);
    const apex = room ? this.pos.y + Math.max(0.5, room.t - 0.2) : top;
    const vy = Math.sqrt(2 * g * Math.max(0.3, apex - this.pos.y)), T = vy / g + Math.sqrt(2 * Math.max(0.05, apex - q.y) / g);
    this.leap = { to: q, t: 0, T, g, vx: (q.x - this.pos.x) / T, vz: (q.z - this.pos.z) / T };
    this.vel.y = vy; this.onGround = false;
    this.cds.leap = 1.2;
    this.faceYaw = this.yawTo(q);
    Sound.play('jump', {}, this.pos);
    FX.dust(this.pos, 8, { smax: 4.5 });
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 0.3, 2.2, 0.25, { c: '#4a8aff' });
  }
  // A thruster dash along a flat direction: it skims at dash speed for dist metres. o.cut makes it a sword dash.
  dashTo(m, dist, o = {}) {
    const V = AEGIS_DASH.V * Math.sqrt(S.enemies.speed);
    this.dash = { t: 0, dur: Math.max(0.06, dist / V), vx: m.x * V, vz: m.z * V, cut: !!o.cut, hit: false, evade: !!o.evade };
    if (o.evade) this.dodgeT = this.dash.dur + 0.08;
    this.lunge = null;
    Sound.play('dash', {}, this.center());
    const back = this.local(0, 1.9, -0.45);
    FX.sparks(back, 8, { x: -m.x, y: -0.3, z: -m.z }, 0.6, 7.3, 16, AEGIS_SPARK);
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 0.3, 1.8, 0.2, { c: '#4a8aff' });
    if (this.onGround) FX.dust(this.pos, 4, { smax: 3.6 });
  }
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
  // With its shield down or its guard free, it answers incoming swings: a sideways boost, or in phase 2 a
  // guard that parries. Only while idle or moving: its recovery is your punish window.
  react(p) {
    if (this.shield || this.act || this.cds.dodge > 0 || this.dash) return;
    const threat = p.attack || p.iaido;
    if (!threat || this.dodged.has(threat) || dist3(p.center(), this.center()) > 5) return;
    this.dodged.add(threat);
    const r = Math.random();
    const heavy = threat.heavy || (threat.cfg && threat.cfg.heavy);
    const block = this.phase === 2 && this.cds.guard <= 0 ? (heavy ? 0.55 : 0.25) : 0;
    if (r < block) { this.raiseGuard(0.6, 'read'); this.cds.guard = rand(3, 5); this.cds.dodge = 1.5; return; }
    if (r < block + (this.phase === 2 ? 0.25 : 0.4)) {
      const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
      let m = turnFlat({ x: -u.x, z: -u.z }, chance(0.5) ? 1 : -1, 60);
      if (this.legRoom(m, 4) < 2) m = turnFlat({ x: -u.x, z: -u.z }, 1, -60);
      this.dashTo(m, Math.max(1.5, Math.min(4.2, this.legRoom(m, 4.2))), { evade: true });
      this.cds.dodge = 2.5;
    }
  }

  // ---------- physics ----------
  physics(dt) {
    const v = this.vel, p = Game.player;
    let gravity = true;
    if (this.dash) {
      const D = this.dash;
      D.t += dt;
      v.x = D.vx; v.z = D.vz; v.y = 0; gravity = false;
      if (D.cut) {
        this.faceYaw = yawOf(D.vx, D.vz); this.yaw = this.faceYaw;
        if (this.attack) this.attack.t += dt;
        if (!D.hit && !p.dead) {
          const c = this.center(), pc = p.center();
          if (distXZ(c, pc) < this.r + p.r + 1.0 && pc.y > this.pos.y - 0.4 && pc.y < this.pos.y + this.h + 0.4) {
            D.hit = true;
            p.takeHit({ dmg: 16 * this.dmgMul, from: c, kind: 'melee', source: this, knock: 22 });
          }
        }
      }
      if (this.dash === D && (D.t >= D.dur || (this.col && this.col.wall && D.t > 0.03))) this.endDash();
    } else if (this.leap) {
      const L = this.leap;
      L.t += dt;
      v.x = L.vx; v.z = L.vz; v.y -= L.g * dt; gravity = false;
      if ((this.onGround && L.t > 0.1) || L.t > L.T + 0.6) { this.leap = null; this.landingBurst(0.35); }
    } else if (this.act && this.act.kind === 'zip' && this.act.phase === 'reel' && this.act.v) {
      const a = this.act;
      v.x = a.v.x; v.y = a.v.y; v.z = a.v.z;
      gravity = false;
    } else if (this.act && this.act.kind === 'dive' && (this.act.phase === 'hang' || this.act.phase === 'dive')) {
      const a = this.act;
      if (a.phase === 'hang') { v.x = v.y = v.z = 0; } else { v.x = a.v.x; v.y = a.v.y; v.z = a.v.z; }
      gravity = false;
    } else if (this.hoverY !== null) {
      v.y = clamp((this.hoverY - this.pos.y) * 5 + Math.sin(this.t * 4) * 0.3, -6, 9);
      const [nx, nz] = approach2(v.x, v.z, this.want ? this.want.x * this.want.spd : 0, this.want ? this.want.z * this.want.spd : 0, 12 * dt);
      v.x = nx; v.z = nz;
      gravity = false;
    } else if (this.lunge) {
      const L = this.lunge;
      L.t += dt;
      v.x = L.vx * (1 - L.t / L.dur); v.z = L.vz * (1 - L.t / L.dur);
      if (L.t >= L.dur) this.lunge = null;
    } else {
      const stunned = this.stunT > 0 || this.flinchT > 0;
      const W = !stunned && this.want ? this.want : null;
      const acc = (this.onGround ? 42 : 10) * dt;
      const [nx, nz] = approach2(v.x, v.z, W ? W.x * W.spd : 0, W ? W.z * W.spd : 0, W || this.onGround ? acc * (W ? 1 : 1.6) : 2 * dt);
      v.x = nx; v.z = nz;
      const hs = Math.hypot(nx, nz);
      if (hs > 0.6 && this.onGround) this.walk += hs * dt * 1.05;
    }
    if (gravity) v.y = Math.max(v.y - AEGIS_G * dt * Game.gravMul(), -50);
    const wasGround = this.onGround, vy0 = v.y;
    World.moveBody(this, dt, { step: this.dash || this.onGround ? 1.0 : 0 });
    if (this.onGround && !wasGround && vy0 < -14 && !this.leap) this.landingBurst(0.25);
    // it never stands inside you: it gives way round you. Your dashes and drawn cuts pass straight through it
    // (and so does its own dash or cut through you), so it holds its ground while you go by.
    const passing = p.dashT > 0 || p.dashEndT > 0 || !!p.iaido;
    if (!this.dash && !passing && !p.dead && p.pos.y < this.pos.y + this.h && p.pos.y + p.h > this.pos.y) {
      const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, d = Math.hypot(dx, dz), R = this.r + p.r + 0.05;
      if (d < R) {
        const ux = d > 1e-3 ? dx / d : -fwdX(this.yaw), uz = d > 1e-3 ? dz / d : -fwdZ(this.yaw);
        const nx = p.pos.x + ux * R, nz = p.pos.z + uz * R;
        if (World.boxFree(nx, this.pos.y + 0.02, nz, this.r, this.h - 0.05)) { this.pos.x = nx; this.pos.z = nz; }
        const vn = v.x * ux + v.z * uz;
        if (vn < 0) { v.x -= vn * ux; v.z -= vn * uz; }
      }
    }
    const B = Arena.bounds();
    this.pos.x = clamp(this.pos.x, B.minX + this.r, B.maxX - this.r);
    this.pos.z = clamp(this.pos.z, B.minZ + this.r, B.maxZ - this.r);
    if (this.pos.y < -20) { const q = Arena.freeGroundAt(Arena.center().x, Arena.center().z, 1.2); this.pos.x = q.x; this.pos.y = q.y + 6; this.pos.z = q.z; v.x = v.y = v.z = 0; }
    // turning: fast, slower through wind-ups that have committed
    const rate = this.turnRate || 8;
    this.yaw += clamp(angDiff(this.yaw, this.faceYaw), -rate * dt, rate * dt);
    this.turnRate = 8;
  }
  endDash() {
    const D = this.dash;
    this.dash = null;
    this.vel.x *= 0.25; this.vel.z *= 0.25;
    const a = this.act;
    if (a && a.kind === 'chain') {
      if (D.cut) {
        this.attack = null;
        this.act = { kind: 'recover', t: 0, dur: (this.phase === 2 ? 0.55 : 0.6) * this.rageGap() };
        this.cds.combo = rand(0.3, 0.7) * this.rageGap();
        return;
      }
      this.legPause(a);
    }
  }
  // the burst where it lands: dust, a ring, a thud
  landingBurst(k) {
    const g = { x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z };
    FX.dust(g, Math.round(14 * k + 3), { smax: 3 + 6 * k });
    FX.ring(g, 0.3, 1.5 + 3 * k, 0.3, { c: '#4a8aff' });
    if (k > 0.5) { FX.decal('crack', g, { len: 3.2 }); FX.debris(g, 10, GRIT, 12); Sound.play('slam', {}, g); }
    Sound.play('land', {}, g);
    Game.shake(0.1 + 0.3 * k);
  }
  footfall() {
    if (distXZ(this.pos, Game.player.pos) < 16) Game.shake(0.03);
    Sound.play('land', {}, this.pos);
    FX.dust(this.pos, 2, { smax: 1.8 });
  }

  // ---------- dash chains ----------
  startChain(name) {
    const pat = CHAINS[name];
    this.act = { kind: 'chain', name, legs: pat, i: -1, side: chance(0.5) ? 1 : -1, pause: true, pt: 0, pdur: 0.22, glinted: false, leg: null };
    this.bladeWant = this.phase === 2 || pat.some((l) => l[0] === 'cut' || RIVAL_MOVES[l[0]]);
    Sound.play('enemyWindup', { pm: 0.7 }, this.center());
    const back = this.local(0, 1.9, -0.5);
    FX.sparks(back, 6, { x: -fwdX(this.yaw), y: -0.6, z: -fwdZ(this.yaw) }, 0.6, 4.5, 9, AEGIS_SPARK);
  }
  // the beat between legs: short, longer before the cut so its glint reads
  legPause(a) {
    const next = a.legs[a.i + 1];
    a.pause = true; a.pt = 0; a.glinted = false;
    a.pdur = next && next[0] === 'cut' ? 0.34 : (this.phase === 2 ? lerp(0.16, 0.1, this.rageK()) : 0.2);
  }
  runChain(dt, a, p) {
    if (this.dash) return;
    if (!a.pause) return;
    a.pt += dt;
    this.face(p.pos, 12, dt);
    const next = a.legs[a.i + 1];
    if (!next) { this.act = { kind: 'recover', t: 0, dur: 0.35 }; return; }
    // the cut glints in the beat before it (not before a boost in to get within reach of it)
    if (next[0] === 'cut' && !a.glinted && a.pt >= a.pdur - GLINT_LEAD && distXZ(p.pos, this.pos) <= 9) {
      a.glinted = true;
      FX.glint(this.bladeTip(), { c: '#9cc4ff', size: 1.3, follow: () => this.bladeTip(), threat: this });
      Sound.play('glint', {}, this.center());
    }
    if (a.pt < a.pdur) return;
    a.i++; a.pause = false; a.leg = next;
    const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z), d = distXZ(p.pos, this.pos);
    const kind = next[0];
    if (RIVAL_MOVES[kind] && !RIVAL_MOVES[kind].wave && d > RIVAL_MOVES[kind].r + 1.2) {
      // too far off for the blow it ends on: one more boost in first
      a.i--;
      const L = Math.min(clamp(d - 2.4, 1.5, 8), this.legRoom(u, 8));
      if (L < 0.8) { this.startMove(kind, { list: [kind], i: 0, chain: a }); a.i++; return; }
      this.dashTo(u, L);
      return;
    }
    if (RIVAL_MOVES[kind]) {
      // a move thrown from where the legs left it; the chain picks up again after it
      this.yaw = this.faceYaw = this.yawTo(p.pos);
      this.startMove(kind, { list: [kind], i: 0, chain: a });
      return;
    }
    let m, L;
    const len = this.phase === 2 ? AEGIS_DASH.LEN2 : AEGIS_DASH.LEN1;
    if (kind === 'cut' && d > 9) {
      // too far off for the cut to reach: one more boost in first
      a.i--;
      const Lf = Math.min(d - 4, 8, this.legRoom(u, 8));
      if (Lf >= 0.8) { this.dashTo(u, Lf); return; }
      a.i++;
    }
    if (kind === 'side') {
      // longer legs from far off, so a long chain covers the ground
      m = turnFlat(u, a.side * next[1], next[2]); L = len * (d > 12 ? 1.5 : 1);
      // a wall that way mirrors the leg
      if (this.legRoom(m, L) < 2.2) { const m2 = turnFlat(u, -a.side * next[1], next[2]); if (this.legRoom(m2, L) > this.legRoom(m, L)) { m = m2; a.side = -a.side; } }
    } else if (kind === 'fwd') { m = u; L = clamp(d - 3.6, 1.2, 7); }
    else if (kind === 'back') { m = { x: -u.x, z: -u.z }; L = 4.5; }
    else {
      // the cut: through where you'll be, blade out along the way
      const lead = { x: p.pos.x + p.vel.x * 0.12, z: p.pos.z + p.vel.z * 0.12 };
      m = flat(lead.x - this.pos.x, lead.z - this.pos.z); L = clamp(distXZ(lead, this.pos) + 1.8, 3, 10);
      const yaw = yawOf(m.x, m.z), dir = (this.lastDir = -this.lastDir);
      const pa = clamp(Math.atan2(p.chest().y - this.chest().y, Math.max(1, d)), -0.5, 0.5);
      this.attack = { yaw, tilt: 0.15, span: 2.8, dir, t: 0, sweep: L / AEGIS_DASH.V, r: 2.6, pa };
      FX.swoosh({ follow: this, oy: 1.85, x: this.pos.x, y: this.pos.y + 1.85, z: this.pos.z, yaw, tilt: 0.15, pitch: pa, r: 2.6, span: 2.8, dir, sweep: L / AEGIS_DASH.V, dur: L / AEGIS_DASH.V + 0.16, thick: 0.45, pal: 'blue', trail: 0.95, bolts: 3 });
      Sound.play('swing', { stage: 3 }, this.center());
    }
    L = Math.min(L, this.legRoom(m, L));
    if (L < 0.8) { if (kind === 'cut') { this.attack = null; this.act = { kind: 'recover', t: 0, dur: 0.3 }; } else this.legPause(a); return; }
    this.dashTo(m, L, { cut: kind === 'cut' });
  }

  // ---------- blade moves ----------
  startMove(name, combo) {
    const m = RIVAL_MOVES[name], p = Game.player;
    this.attack = null; this.lunge = null;
    this.act = { kind: 'melee', move: name, m, phase: 'wind', t: 0, combo };
    // the red flash picks its line once, at you, as it flares, and holds it to the end
    if (m.zone) { this.yaw = this.faceYaw = this.yawTo(p.pos); this.act.lockYaw = this.yaw; }
    else this.faceYaw = this.yawTo(p.pos);
    // the arc it will swing, for the wind-up pose; level swings alternate sides
    const dir = m.down ? -1 : m.rising ? 1 : (this.lastDir = -this.lastDir);
    this.windArc = { yaw: this.yaw, tilt: m.tilt, span: m.span, dir, pa: 0 };
    this.bladeWant = true;
    Sound.play('enemyWindup', { pm: name === 'riposte' ? 1.4 : 0.6 }, this.center());
    if (m.air && this.onGround) {
      this.vel.y = 16; this.onGround = false;
      Sound.play('jump', {}, this.pos);
      FX.dust(this.pos, 4, { smax: 3.6 });
    }
  }
  runMelee(dt, a, p) {
    const m = a.m, c = this.chest();
    if (m.zone && !a.resolved) this.blockPassage(p);
    if (a.phase === 'wind') {
      const wind = this.windOf(m);
      // the red flash gathers: red energy streams in from all round it into the blade
      if (m.zone) {
        const c = this.chest(), k = clamp(a.t / Math.max(0.05, wind - CUE_LEAD), 0, 1);
        for (let i = 0; i < 3; i++) {
          const u = coneDir(null, TAU), R = lerp(3.6, 1.8, k), q = { x: c.x + u.x * R, y: c.y + u.y * R * 0.8, z: c.z + u.z * R };
          FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3, R * 3.6, { c0: '#ffffff', c1: '#ff4a5a', c2: '#781e2a', g: 0, life: 0.8 });
        }
        if (Math.random() < 0.25 + 0.4 * k) { const u = coneDir(null, TAU), R = lerp(3.2, 1.6, k); FX.bolt({ x: c.x + u.x * R, y: c.y + u.y * R, z: c.z + u.z * R }, this.bladeTip(), 0.07, { outer: PERIL_RED, core: '#ffffff', jag: 0.35, w: 0.05 }); }
        if (Math.random() < 0.5) Game.shake(0.04 + 0.08 * k);
      }
      // it tracks you through most of the wind-up; the red flash neither turns nor steps once it flares, so
      // getting behind it is the answer
      if (m.zone) this.yaw = this.faceYaw = a.lockYaw;
      else if (a.t < wind * 0.75) this.face(p.pos, m.close ? 14 : 6, dt);
      else this.faceYaw = this.yaw;
      this.windArc.yaw = this.yaw;
      if (m.close && !m.zone && a.t < wind * 0.8) this.steerTo(p.pos, 1.5);
      if (!a.glinted && a.t >= Math.max(0, wind - (m.close ? CUE_LEAD : GLINT_LEAD))) {
        a.glinted = true;
        if (m.close) this.eyeGlint(m.unparryable ? PERIL_RED : '#ffd070', 2.2);
        else FX.glint(this.bladeTip(), { c: '#9cc4ff', size: 1.25, follow: () => this.bladeTip(), threat: this });
        Sound.play('glint', {}, this.center());
      }
      if (a.t >= wind) this.beginSwing(a, m, p);
      return;
    }
    this.attack.t = a.t;
    if (m.zone) { this.runPerilSwing(a, m, p); return; }
    if (!a.hit && !p.dead) {
      let hit = false;
      if (m.thrust) {
        const f = this.fwd(), pc = p.center();
        hit = segDistXZ(pc.x, pc.z, c.x, c.z, c.x + f.x * m.r, c.z + f.z * m.r) < p.r + 0.45 && pc.y > c.y - 1.4 && pc.y < c.y + 1.0;
      } else if (a.t > (m.close ? CLOSE_CONNECT : 0.02) && a.t < m.swing * 0.8) hit = arcHits(c, this.attack, m.r + 0.3, p);
      if (hit) {
        a.hit = true;
        const res = p.takeHit({ dmg: m.dmg * this.dmgMul, from: c, kind: 'melee', source: this, knock: m.quake ? 25.5 : m.rising ? 14.5 : 20 });
        if (res === 'hit' && m.rising && !p.dead) { p.vel.y = 25; p.onGround = false; }
        if (this.act !== a) return;
      }
    }
    if (m.quake && !a.quaked && a.t > 0.12) {
      a.quaked = true;
      if (this.onGround) {
        const f = this.fwd(), at = { x: this.pos.x + f.x * 2, y: this.pos.y, z: this.pos.z + f.z * 2 };
        Game.hazards.push(new GroundWave(at, 20 * S.enemies.speed, 10 * this.dmgMul, this));
        FX.dust(at, 12, { smax: 7 });
        FX.debris(at, 10, GRIT, 14);
        FX.decal('crack', at, { len: 3.4 });
        FX.ring({ x: at.x, y: at.y + 0.06, z: at.z }, 0.3, 3.2, 0.3, { c: '#4a8aff' });
        Game.shake(0.25);
        Sound.play('slam', {}, at);
      }
    }
    if (a.t >= m.swing) {
      this.attack = null;
      const cb = a.combo;
      if (cb && cb.chain) { this.act = cb.chain; this.legPause(cb.chain); return; }
      if (cb && cb.i + 1 < cb.list.length) { cb.i++; this.startMove(cb.list[cb.i], cb); return; }
      this.act = { kind: 'recover', t: 0, dur: this.phase === 2 ? rand(0.55, 0.85) * this.rageGap() : 0.45 };
      this.cds.combo = rand(0.3, 0.8) * this.rageGap();
      if (this.phase === 1) this.bladeWant = this.mode === 'charge';
    }
  }
  beginSwing(a, m, p) {
    a.phase = 'swing'; a.t = 0; a.hit = false; a.quaked = false;
    if (m.close && Game.btOwner === this) Game.endBulletTime();
    const c = this.chest(), pc = p.chest(), d = distXZ(p.pos, this.pos), f = this.fwd();
    // the arc leans up or down at you when you're above or below
    const pa = m.spin || m.zone ? 0 : clamp(Math.atan2(pc.y - c.y, Math.max(1.2, d)), -0.6, 0.6);
    const W = this.windArc;
    this.attack = { yaw: this.yaw, tilt: m.tilt, span: m.span, dir: W.dir, t: 0, sweep: m.swing * 0.6, r: m.r, pa, spin: m.spin, rising: m.rising };
    this.windArc = null;
    if (m.thrust) { const v = Math.min(30, (Math.max(0, d - 1.4) / 0.16) * 2); this.lunge = { t: 0, dur: 0.16, vx: f.x * v, vz: f.z * v }; }
    else if (m.close && !m.zone) {
      // the riposte closes whatever gap you opened
      const gap = Math.max(0, d - 1.8);
      this.lunge = { t: 0, dur: 0.14, vx: f.x * Math.min(32, (gap / 0.14) * 2), vz: f.z * Math.min(32, (gap / 0.14) * 2) };
    } else if (m.lunge) {
      // steps into the swing, never past you
      const v = Math.min(m.lunge * 2, (Math.max(0, d - 1.6) / m.swing) * 2);
      this.lunge = { t: 0, dur: m.swing, vx: f.x * v, vz: f.z * v };
    }
    if (m.rising) { this.vel.y = 9; this.onGround = false; }
    if (m.wave) this.fireWave(m);
    if (m.zone) {
      const end = { x: c.x + f.x * m.zone, y: c.y, z: c.z + f.z * m.zone };
      FX.slashLine(c, end, { w: 0.5, dur: 0.35, pal: 'red' });
      for (let i = 0; i < 3; i++) FX.bolt(c, end, 0.3, { outer: PERIL_RED, core: '#ffffff', jag: 0.5, w: 0.1, forks: 3 });
      FX.light({ x: c.x + f.x * 4, y: c.y, z: c.z + f.z * 4 }, PERIL_RED, 7, 16, 0.3);
      Game.shake(0.3);
    }
    if (!m.thrust) {
      FX.swoosh({ follow: this, oy: 1.85, x: c.x, y: c.y, z: c.z, yaw: this.yaw, tilt: m.tilt, pitch: pa, r: m.r, span: m.span, dir: W.dir, sweep: m.swing * 0.6, dur: m.swing + 0.12, thick: m.r > 3 ? 0.45 : 0.38,
        pal: m.unparryable ? 'red' : a.move === 'riposte' ? 'gold' : 'blue', trail: 0.95, bolts: m.r > 3 || m.spin ? 4 : 3, boltPal: null });
    } else {
      const end = { x: c.x + f.x * m.r, y: c.y, z: c.z + f.z * m.r };
      FX.slashLine(c, end, { w: 0.3, dur: 0.25, pal: 'blue' });
      FX.bolt(c, end, 0.22, { outer: '#2f6bff', core: '#ffffff', jag: 0.25, w: 0.08, forks: 2 });
    }
    Sound.play('swing', { stage: m.r > 3 || m.spin ? 3 : 1 }, c);
  }
  // A wide crescent of energy thrown off the swing along the ground at where you stand; the air version flies
  // at head height.
  // A crescent of energy thrown off the swing, tilted 45 degrees one way or the other, at where you'll be when it
  // gets there (it leads your run); the air version flies at head height.
  fireWave(m) {
    const p = Game.player, c = this.chest(), V = BLADE_WAVE.SPEED * Math.sqrt(S.enemies.speed);
    let tx = p.pos.x, tz = p.pos.z;
    for (let i = 0; i < 2; i++) {
      const t = Math.min(0.9, distXZ({ x: tx, z: tz }, this.pos) / V);
      tx = p.pos.x + p.vel.x * t; tz = p.pos.z + p.vel.z * t;
    }
    const u = flat(tx - this.pos.x, tz - this.pos.z);
    const base = m.air ? Math.max(this.pos.y, p.pos.y) + 1.9 : this.pos.y + 1.0;
    const at = { x: this.pos.x + u.x * 1.2, y: base, z: this.pos.z + u.z * 1.2 };
    Game.projectiles.push(new BladeWave(at, u, 24 * this.dmgMul, this, !!m.air, (chance(0.5) ? 1 : -1) * BLADE_WAVE.TILT));
    FX.light(at, '#4a8aff', 5, 8, 0.2);
    Sound.play('heavySwing', {}, c);
  }
  // its body is a wall through the red flash: only a dash carries you past it to its back
  blockPassage(p) {
    if (p.dead || p.dashT > 0 || p.iaido) return;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), R = this.r + p.r + 0.1;
    if (d >= R || p.pos.y > this.pos.y + this.h || p.pos.y + p.h < this.pos.y) return;
    const f = this.fwd();
    p.pos.x = this.pos.x + f.x * R; p.pos.z = this.pos.z + f.z * R;
    const vn = p.vel.x * f.x + p.vel.z * f.z;
    if (vn < 0) { p.vel.x -= vn * f.x; p.vel.z -= vn * f.z; }
  }
  // the red flash lands everywhere in front of it at once, a beat into the swing
  runPerilSwing(a, m, p) {
    this.yaw = this.faceYaw = a.lockYaw;
    if (!a.resolved && a.t >= CLOSE_CONNECT) {
      a.resolved = true;
      const c = this.chest(), pc = p.chest(), f = this.fwd();
      const behind = this.inBackWedge(p);
      if (!p.dead && !behind && dist3(c, pc) <= m.zone && Math.abs(pc.y - c.y) < 4.5) {
        a.landed = p.takeHit({ dmg: m.dmg * this.dmgMul, from: c, kind: 'melee', source: this, knock: 36, unparryable: true, pierce: true, through: true }) === 'hit';
        if (a.landed) {
          p.vel.y = 26; p.onGround = false;
          FX.sparks(pc, 30, { x: f.x, y: 0.3, z: f.z }, 1.6, 11, 38, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
          FX.flash('#ff1030', 0.4);
          Game.hitstop(0.12); Game.shake(0.7);
          Sound.play('slam', {}, pc);
        }
      }
    }
    if (a.t >= m.swing) {
      this.attack = null;
      if (!a.landed) { this.whiff(); return; }
      this.act = { kind: 'recover', t: 0, dur: rand(0.55, 0.85) * this.rageGap() };
      this.cds.combo = rand(0.3, 0.8) * this.rageGap();
    }
  }
  // within 45 degrees of straight behind it
  inBackWedge(p) {
    const f = this.fwd(), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    return d > 0.3 && (dx * f.x + dz * f.z) / d < -Math.SQRT1_2;
  }
  // it committed to the red flash and hit nothing: wide open
  whiff() {
    const p = Game.player, f = this.fwd();
    if (!p.dead && this.inBackWedge(p)) p.perilDodge(this);
    this.stunFor(2.6);
    this.vel.x = f.x * 12; this.vel.z = f.z * 12;
    FX.sparks(this.chest(), 20, { x: 0, y: 1, z: 0 }, TAU, 5.5, 20, { c0: '#ffffff', c1: '#ffd070', c2: '#a06010' });
    Sound.play('bossShieldBreak', {}, this.center());
    Game.slowmo(0.25, 0.5, true);
  }

  // ---------- dive bomb ----------
  // It charges on the spot (energy drawn in round it, the street shaking, the mark already under you), leaps
  // high over you on its jets, hangs while the mark tracks you, flashes as the mark locks, and a beat later
  // boosts straight down onto it, cracking the street and throwing a ring out.
  startDive(p) {
    this.attack = null; this.lunge = null;
    this.act = { kind: 'dive', phase: 'crouch', t: 0, tx: p.pos.x, ty: p.pos.y, tz: p.pos.z, locked: false, pulse: 0 };
    this.bladeWant = true;
    Sound.play('beamCharge', {}, this.center());
  }
  runDive(dt, a, p) {
    const track = () => {
      a.tx = p.pos.x; a.tz = p.pos.z;
      const g = World.groundAt(a.tx, a.tz, p.pos.y + 0.3);
      a.ty = g === -Infinity ? p.pos.y : g;
    };
    this.faceYaw = yawOf(a.tx - this.pos.x, a.tz - this.pos.z);
    if (a.phase === 'crouch') {
      track();
      const charge = this.tele(DIVE.CHARGE), k = clamp(a.t / charge, 0, 1);
      if ((a.pulse -= dt) <= 0) {
        a.pulse = lerp(0.2, 0.07, k);
        FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 3 - k, 0.5, 0.2, { c: '#4a8aff' });
        FX.light({ x: this.pos.x, y: this.pos.y + 0.6, z: this.pos.z }, '#4a8aff', 2 + 4 * k, 5 + 5 * k, a.pulse + 0.05);
        if (k > 0.4) FX.bolt(this.local(rand(-0.5, 0.5), rand(0.6, 2.2), 0), this.local(rand(-1.4, 1.4), rand(0.2, 2.6), rand(-1, 1)), 0.08, { outer: '#2f6bff', core: '#ffffff', jag: 0.2, w: 0.05 });
        for (let i = 0; i < 3; i++) {
          const ang = rand(0, TAU), R = rand(1.4, 2.4), q = { x: this.pos.x + Math.cos(ang) * R, y: this.pos.y + rand(0.2, 2.6), z: this.pos.z + Math.sin(ang) * R };
          FX.sparks(q, 1, { x: -Math.cos(ang), y: 0.2, z: -Math.sin(ang) }, 0.2, 4, 7, Object.assign({ g: 0 }, AEGIS_SPARK));
        }
        Game.shake(0.03 + 0.08 * k);
      }
      if (a.t >= charge) {
        a.phase = 'rise'; a.t = 0;
        // high over you, as far as the sky over it allows
        const room = World.raycast({ x: this.pos.x, y: this.pos.y + this.h, z: this.pos.z }, { x: 0, y: 1, z: 0 }, DIVE.HIGH + 4, 0.4);
        a.top = Math.max(this.pos.y + 4, a.ty + DIVE.HIGH);
        if (room) a.top = Math.min(a.top, this.pos.y + Math.max(2.5, room.t - 0.3));
        this.vel.y = Math.sqrt(2 * AEGIS_G * Math.max(1, a.top - this.pos.y)); this.onGround = false;
        const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z };
        FX.ring(g, 0.4, 4.2, 0.3, { c: '#4a8aff' });
        FX.dust(g, 18, { smax: 9, rise: 1.2 });
        FX.decal('crack', g, { len: 3 });
        FX.light({ x: g.x, y: g.y + 1, z: g.z }, '#4a8aff', 5, 10, 0.3);
        Sound.play('jump', {}, this.pos); Sound.play('dash', {}, this.pos);
        Game.shake(0.3);
      }
      return;
    }
    if (a.phase === 'rise') {
      track();
      // drifts over toward a point short of the mark
      const dx = a.tx - this.pos.x, dz = a.tz - this.pos.z, dd = Math.hypot(dx, dz) || 1, k = Math.max(0, dd - 3) / dd;
      this.vel.x = approach(this.vel.x, clamp(dx * k * 2.2, -20, 20), 50 * dt); this.vel.z = approach(this.vel.z, clamp(dz * k * 2.2, -20, 20), 50 * dt);
      if (Math.random() < 0.7) FX.sparks(this.local(0, 1.4, -0.4), 1, { x: 0, y: -1, z: 0 }, 0.3, 6, 12, AEGIS_SPARK);
      if (this.vel.y <= 1 || a.t > 1.3) { a.phase = 'hang'; a.t = 0; }
      return;
    }
    if (a.phase === 'hang') {
      // the mark follows you, then locks as it flashes; a beat later it comes down
      const lockT = this.tele(DIVE.TRACK);
      if (a.t < lockT) track();
      else if (!a.locked) {
        a.locked = true;
        this.diveFlash = 0.14;
        const c = this.chest();
        FX.glint(c, { c: '#ffffff', size: 3.2, dur: 0.3, follow: () => this.chest(), threat: this });
        this.eyeGlint('#9cc4ff', 2.4);
        FX.light(c, '#9cc4ff', 7, 22, 0.35);
        FX.ring(c, 0.4, 3.4, 0.25, { c: '#ffffff', flat: false });
        FX.sparks(c, 18, null, TAU, 6, 16, AEGIS_SPARK);
        Sound.play('glint', {}, c);
      }
      if (a.t >= lockT + this.tele(DIVE.FLASH)) {
        a.phase = 'dive'; a.t = 0; a.hit = false;
        // always down onto the mark, even if you climbed above it
        const tx = a.tx, ty = Math.min(a.ty, this.pos.y - 1), tz = a.tz;
        const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, L = Math.hypot(dx, dy, dz) || 1;
        a.v = { x: (dx / L) * DIVE.SPEED, y: (dy / L) * DIVE.SPEED, z: (dz / L) * DIVE.SPEED };
        a.dir = { x: dx / L, y: dy / L, z: dz / L };
        const c = this.chest();
        FX.slashLine(c, { x: tx, y: ty + 0.5, z: tz }, { w: 0.4, dur: 0.4, pal: 'blue' });
        FX.swoosh({ follow: this, oy: 1.85, x: c.x, y: c.y, z: c.z, yaw: yawOf(dx, dz), tilt: 1.3, pitch: Math.asin(clamp(dy / L, -1, 1)) * 0.5, r: 2.8, span: 2.4, dir: -1, sweep: 0.15, dur: 0.35, thick: 0.45, pal: 'blue', trail: 0.95, bolts: 3, boltPal: null });
        Sound.play('dash', {}, c); Sound.play('swing', { stage: 3 }, c);
      }
      return;
    }
    // diving
    if (!a.hit && !p.dead) {
      const c = this.center(), pc = p.center(), v = a.dir;
      const ahead = { x: c.x + v.x * 1.2, y: c.y + v.y * 1.2, z: c.z + v.z * 1.2 };
      if (dist3(ahead, pc) < 1.6 || dist3(c, pc) < 1.4) {
        a.hit = true;
        p.takeHit({ dmg: 26 * this.dmgMul, from: c, kind: 'melee', source: this, knock: 28 });
        if (this.act !== a) return;
      }
    }
    if ((this.onGround && a.t > 0.02) || a.t > 0.8 || (this.col && this.col.wall)) this.diveImpact();
  }
  diveImpact() {
    // the landing is its punish window
    this.act = { kind: 'recover', t: 0, dur: 1.0 * this.rageGap() };
    this.cds.combo = rand(0.5, 0.9) * this.rageGap();
    this.vel.x = this.vel.z = 0;
    if (!this.onGround) return;
    const g = { x: this.pos.x, y: this.pos.y, z: this.pos.z }, up = { x: g.x, y: g.y + 0.06, z: g.z };
    Game.hazards.push(new GroundWave(g, 22 * S.enemies.speed, 12 * this.dmgMul, this));
    FX.ring(up, 0.4, 7.5, 0.4, { c: '#4a8aff' });
    FX.ring(up, 0.3, 4.2, 0.3, { c: '#ffffff' });
    FX.ring({ x: g.x, y: g.y + 1.2, z: g.z }, 0.5, 3.6, 0.3, { c: '#2f6bff', flat: false });
    FX.dust(g, 28, { smax: 13, rise: 1.4 });
    FX.debris(g, 22, GRIT, 22);
    FX.decal('crack', g, { len: 6.5 });
    FX.sparks({ x: g.x, y: g.y + 0.4, z: g.z }, 24, { x: 0, y: 1, z: 0 }, 1.4, 8, 22, AEGIS_SPARK);
    FX.light({ x: g.x, y: g.y + 0.8, z: g.z }, '#4a8aff', 8, 16, 0.4);
    Game.shake(0.75); Game.hitstop(0.05);
    Sound.play('slam', {}, g); Sound.play('land', {}, g);
  }

  // ---------- tether zips (phase 1) ----------
  // A vantage ZIP.NEAR to ZIP.FAR from you with a clear shot at you, higher the better (a roof edge, a balcony,
  // a girder), that a straight line from here reaches with room for its body all the way.
  findVantage(p) {
    const cands = Arena.perches().map((q) => ({ x: q.x, y: q.y, z: q.z }));
    for (let i = 0; i < 12; i++) { const q = this.spotNear(p.pos, ZIP.NEAR, ZIP.FAR, false); if (q) cands.push(q); }
    // and points on the raised tops round you: containers, the overpass, girders, scaffolding, roofs
    const P0 = p.pos, R = ZIP.FAR + 2, g = World.def.groundY, inset = this.r + 0.1;
    for (const b of World.near(P0.x - R, P0.z - R, P0.x + R, P0.z + R)) {
      if (!VANTAGE_KINDS.has(b.kind) || b.max.y < g + 1.4 || b.max.x - b.min.x < inset * 2 + 0.2 || b.max.z - b.min.z < inset * 2 + 0.2) continue;
      for (let i = 0; i < 2; i++) cands.push({ x: rand(b.min.x + inset, b.max.x - inset), y: b.max.y, z: rand(b.min.z + inset, b.max.z - inset) });
    }
    let best = null, bestS = -Infinity;
    const c = p.chest();
    for (const q of cands) {
      const d = distXZ(q, p.pos), travel = dist3(q, this.pos);
      if (d < ZIP.NEAR - 1 || d > ZIP.FAR + 2 || travel < 6 || travel > 32 || q.y < p.pos.y - 3) continue;
      if (!World.boxFree(q.x, q.y + 0.02, q.z, this.r, this.h)) continue;
      const sh = { x: q.x, y: q.y + 2.05, z: q.z }, dx = c.x - sh.x, dy = c.y - sh.y, dz = c.z - sh.z, L = Math.hypot(dx, dy, dz) || 1;
      if (World.raycast(sh, { x: dx / L, y: dy / L, z: dz / L }, L - 0.4)) continue;
      // further from you than it is now when it's escaping, and never a line that passes over or through you
      const d0 = distXZ(this.pos, p.pos);
      if (d0 < 7.5) {
        // escaping: away from you, within 70 degrees of straight away
        const ox = this.pos.x - p.pos.x, oz = this.pos.z - p.pos.z, qx = q.x - this.pos.x, qz = q.z - this.pos.z;
        if (d < d0 + 3 || (ox * qx + oz * qz) / ((Math.hypot(ox, oz) || 1) * (Math.hypot(qx, qz) || 1)) < 0.34) continue;
      } else if (segDistXZ(p.pos.x, p.pos.z, this.pos.x, this.pos.z, q.x, q.z) < 3.5) continue;
      if (!this.zipClear(q)) continue;
      const score = -Math.abs(d - (ZIP.NEAR + ZIP.FAR) / 2) * 0.5 + clamp(q.y - p.pos.y, -2, 8) * 0.6 + rand(0, 2) - (travel > 22 ? 1 : 0);
      if (score > bestS) { bestS = score; best = q; }
    }
    return best;
  }
  // where a zip to q carries its feet: over q, high enough to clear the edge of a ledge above it
  zipEnd(q) { return { x: q.x, y: q.y + (q.y > this.pos.y + 1.5 ? 2.2 : 1), z: q.z }; }
  // room for its body along the straight line from here to the zip's end over q
  zipClear(q) {
    const e = this.zipEnd(q), x0 = this.pos.x, y0 = this.pos.y + 0.3, z0 = this.pos.z, x1 = e.x, y1 = e.y, z1 = e.z;
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 0.5);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!World.boxFree(lerp(x0, x1, k), lerp(y0, y1, k), lerp(z0, z1, k), this.r * 0.9, this.h)) return false;
    }
    return true;
  }
  // its left hand throws a line to the vantage, it reels itself in on it, then drops onto it
  startZip(p) {
    if (this.cds.zipTry > 0) return false;
    const q = this.findVantage(p);
    // nowhere to go: look again in a moment
    if (!q) { this.cds.zipTry = 0.8; return false; }
    this.attack = null; this.lunge = null; this.windArc = null;
    this.act = { kind: 'zip', phase: 'fire', t: 0, land: q, to: this.zipEnd(q), hook: { x: q.x, y: q.y + 0.05, z: q.z }, line: 0, spd: 8, v: null, still: 0 };
    this.cds.zip = rand(4, 7);
    this.bladeWant = this.phase === 2;
    this.faceYaw = this.yawTo(q);
    Sound.play('tetherFire', {}, this.center());
    return true;
  }
  runZip(dt, a, p) {
    if (a.phase === 'fire') {
      a.line = clamp(a.t / ZIP.FIRE, 0, 1);
      this.faceYaw = this.yawTo(a.land); this.turnRate = 14;
      if (a.t >= ZIP.FIRE) {
        a.phase = 'reel'; a.t = 0; this.onGround = false;
        FX.sparks(a.hook, 8, null, TAU, 3.6, 12, AEGIS_SPARK);
        FX.ring(a.hook, 0.1, 1, 0.2, { c: '#4a8aff' });
        Sound.play('tetherAttach', {}, a.hook); Sound.play('zip', {}, this.center());
      }
      return;
    }
    if (a.phase === 'reel') {
      a.spd = Math.min(ZIP.SPEED, a.spd + 110 * dt);
      const dx = a.to.x - this.pos.x, dy = a.to.y - this.pos.y, dz = a.to.z - this.pos.z, d = Math.hypot(dx, dy, dz) || 1e-3;
      this.faceYaw = yawOf(dx, dz); this.turnRate = 14;
      // snagged on something that moved into the way: let go
      const moved = a.last ? dist3(a.last, this.pos) : 1;
      a.still = moved < 0.02 ? a.still + dt : 0;
      a.last = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
      if (d < 0.3 || a.t > 2 || a.still > 0.2) {
        a.phase = 'drop'; a.t = 0; a.v = null;
        this.vel.x = (dx / d) * 3; this.vel.y = 1; this.vel.z = (dz / d) * 3;
        return;
      }
      const s = Math.min(a.spd, d / dt);
      a.v = { x: (dx / d) * s, y: (dy / d) * s, z: (dz / d) * s };
      return;
    }
    // dropping onto the spot
    if ((this.onGround && a.t > 0.02) || a.t > 1.2) { this.act = { kind: 'recover', t: 0, dur: 0.18 }; this.landingBurst(0.12); }
  }

  // ---------- phase 1: gun, beam, grenade ----------
  // The forearm machine gun: its barrels spin up, a fan of tracer light opens over the area it will spray,
  // then a burst of GUN.SHOTS bolts that follows a pattern round you rather than a straight line at you:
  //   sweep: across you from one side to the other; walk: in from the street in front of you and up onto you;
  //   scatter: a wide cone of loose fire.
  startGun() {
    const pattern = pick(['sweep', 'sweep', 'walk', 'scatter']);
    this.act = { kind: 'gun', t: 0, shots: 0, next: 0, aimDir: { x: this.aimDir.x, y: this.aimDir.y, z: this.aimDir.z }, pattern, side: chance(0.5) ? 1 : -1, spin: 0 };
    this.bladeWant = false;
    Sound.play('gunSpin', { dur: this.tele(GUN.WIND) }, this.muzzle());
  }
  // where in its pattern shot i of the burst goes, as yaw and pitch offsets (radians) from the aim at you
  gunOffset(a, i) {
    const k = i / Math.max(1, GUN.SHOTS - 1);
    if (a.pattern === 'sweep') return { yaw: a.side * lerp(-GUN.SWEEP, GUN.SWEEP, k) + rand(-0.03, 0.03), pitch: rand(-0.04, 0.04) + Math.sin(k * 9) * 0.02 };
    if (a.pattern === 'walk') return { yaw: rand(-0.06, 0.06) + Math.sin(k * 7) * 0.05 * a.side, pitch: lerp(-GUN.WALK, 0.03, Math.min(1, k * 1.4)) };
    return { yaw: rand(-GUN.SCATTER, GUN.SCATTER), pitch: rand(-0.08, 0.1) };
  }
  // the extent of the pattern, for the fan the views draw: [yaw0, yaw1, pitch0, pitch1]
  gunFan(a) {
    if (a.pattern === 'sweep') return [-GUN.SWEEP, GUN.SWEEP, -0.05, 0.05];
    if (a.pattern === 'walk') return [-0.1, 0.1, -GUN.WALK, 0.04];
    return [-GUN.SCATTER, GUN.SCATTER, -0.08, 0.1];
  }
  runGun(dt, a, p) {
    const tele = this.tele(GUN.WIND), want = this.aimFrom(this.shoulderR(), p.chest());
    a.spin = Math.min(1, a.t / tele);
    if (a.t < tele) {
      a.aimDir = want;
      // the barrels spinning up: sparks flung round the muzzle, faster as it nears
      if (Math.random() < 0.3 + 0.6 * a.spin) {
        const m = this.muzzle(), ang = rand(0, TAU), f = a.aimDir, rx = -f.z, rz = f.x, rl = Math.hypot(rx, rz) || 1;
        const t = { x: (rx / rl) * Math.cos(ang), y: Math.sin(ang), z: (rz / rl) * Math.cos(ang) };
        FX.sparks(m, 1, t, 0.3, 3 + 6 * a.spin, 6 + 8 * a.spin, Object.assign({ g: 0, life: 0.5 }, AEGIS_SPARK));
      }
    } else {
      a.aimDir = turnDir(a.aimDir, want, 2.4 * dt);
      a.next -= dt;
      if (a.next <= 0 && a.shots < GUN.SHOTS) {
        a.next = GUN.GAP; a.shots++;
        const m = this.muzzle(), o = this.gunOffset(a, a.shots - 1), d = a.aimDir;
        const yaw = yawOf(d.x, d.z) + o.yaw, pitch = clamp(Math.asin(clamp(d.y, -1, 1)) + o.pitch, -1.2, 1.2);
        const dir = { x: fwdX(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: fwdZ(yaw) * Math.cos(pitch) };
        Game.projectiles.push(new Bolt({ x: m.x + dir.x * 0.3, y: m.y + dir.y * 0.3, z: m.z + dir.z * 0.3 }, dir, 26 * S.enemies.speed, this.def.dmg * this.dmgMul, AEGIS_BOLT));
        Sound.play('bossGun', {}, m);
        FX.sparks(m, 3, dir, 0.5, 5.5, 14.5, AEGIS_SPARK);
        FX.light(m, '#4a8aff', 2.5, 4, 0.06);
      }
      if (a.shots >= GUN.SHOTS && a.next <= -0.15) { this.act = null; this.cds.gun = rand(2.4, 3.6); }
    }
    this.aimDir = a.aimDir;
    this.faceYaw = yawOf(a.aimDir.x, a.aimDir.z) + 0.25; this.turnRate = 10;
    // it keeps moving while it shoots: strafing while it zones, walking in while it charges
    const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z), spd = this.runSpeed() * 0.45;
    if (this.mode === 'charge') this.want = { x: u.x, z: u.z, spd };
    else {
      const m = { x: -u.z * this.side, z: u.x * this.side };
      if (this.blockedAhead(m, 1.4)) this.side = -this.side;
      this.want = { x: -u.z * this.side, z: u.x * this.side, spd };
    }
  }
  startBeam() {
    this.act = { kind: 'beam', phase: 'rise', t: 0, dir: null, wy: 0, wp: 0, tick: 0, cut: 0 };
    this.hoverY = this.pos.y + 3.4;
    this.bladeWant = false;
    this.onGround = false;
    Sound.play('jump', {}, this.pos);
    FX.dust(this.pos, 8, { smax: 4.5 });
  }
  runBeam(dt, a, p) {
    const o = this.lensPos(), want = this.aimFrom(o, p.center());
    if (a.phase === 'rise') {
      this.faceYaw = this.yawTo(p.pos) - 0.4;
      if (Math.abs(this.pos.y - this.hoverY) < 0.3 || a.t > 0.7) { a.phase = 'charge'; a.t = 0; a.dir = want; Sound.play('laserCharge', { dur: this.tele(0.85) }, o); }
      return;
    }
    if (a.phase === 'charge') {
      a.dir = want;
      this.faceYaw = yawOf(want.x, want.z) - 0.4;
      // energy drawn into the lens from all round it, faster and closer as the charge builds
      const k = clamp(a.t / this.tele(0.85), 0, 1);
      for (let i = 0; i < 2 + Math.round(k * 3); i++) {
        const u = coneDir(null, TAU), R = lerp(2.8, 1.2, k), q = { x: o.x + u.x * R, y: o.y + u.y * R, z: o.z + u.z * R };
        FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3.2, R * 3.8, Object.assign({ g: 0, life: 0.8 }, AEGIS_SPARK));
      }
      if (Math.random() < 0.4 + 0.5 * k) FX.elec(o, 0.5 + 0.5 * k, 1, { outer: '#2f6bff', core: '#ffffff' });
      if (Math.random() < 0.15 + 0.3 * k) { const u = coneDir(null, TAU); FX.bolt({ x: o.x + u.x * 2, y: o.y + u.y * 2, z: o.z + u.z * 2 }, o, 0.06, { outer: '#2f6bff', core: '#ffffff', jag: 0.3, w: 0.04 }); }
      Game.shake(0.01 + 0.03 * k);
      this.beam = { o, dir: a.dir, len: 0, firing: false, k: a.t / this.tele(0.85) };
      if (a.t >= this.tele(0.85)) {
        a.phase = 'fire'; a.t = 0;
        FX.ring(o, 0.2, 2.6, 0.25, { c: '#9cc4ff', flat: false });
        FX.light(o, '#c8dcff', 6, 12, 0.25);
        Game.shake(0.15);
      }
      return;
    }
    // firing: the beam has angular momentum, so it is slow to change direction
    const cy = yawOf(a.dir.x, a.dir.z), cp = Math.asin(clamp(a.dir.y, -1, 1));
    const wy = yawOf(want.x, want.z), wp = Math.asin(clamp(want.y, -1, 1));
    a.wy = approach(a.wy, clamp(angDiff(cy, wy) * 1.5, -0.55, 0.55) * S.enemies.speed, 0.9 * dt);
    a.wp = approach(a.wp, clamp((wp - cp) * 1.5, -0.35, 0.35), 0.9 * dt);
    const ny = cy + a.wy * dt, np = clamp(cp + a.wp * dt, -1.2, 0.6);
    a.dir = { x: fwdX(ny) * Math.cos(np), y: Math.sin(np), z: fwdZ(ny) * Math.cos(np) };
    this.faceYaw = ny - 0.4; this.turnRate = 4;
    const MAX = 70, hit = World.raycast(o, a.dir, MAX), len = hit ? hit.t : MAX;
    this.beam = { o, dir: a.dir, len, firing: true, k: 1 };
    const end = { x: o.x + a.dir.x * len, y: o.y + a.dir.y * len, z: o.z + a.dir.z * len };
    if (hit) {
      if (Math.random() < 0.8) FX.sparks(end, 2, { x: -a.dir.x, y: -a.dir.y, z: -a.dir.z }, 1.6, 5.5, 18, AEGIS_SPARK);
      if (Math.random() < 0.12) FX.decal('scorch', end, { r: 0.5, dur: 3 });
    }
    // street lamps in its path are cut down
    if ((a.cut -= dt) <= 0) {
      a.cut = 0.1;
      Props.slash((q) => {
        const t = (q.pos.x - o.x) * a.dir.x + (q.pos.z - o.z) * a.dir.z, hl = Math.hypot(a.dir.x, a.dir.z) || 1, tt = t / (hl * hl);
        if (tt < 0 || tt > len) return false;
        const bx = o.x + a.dir.x * tt, by = o.y + a.dir.y * tt, bz = o.z + a.dir.z * tt;
        return Math.hypot(bx - q.pos.x, bz - q.pos.z) < 0.45 && by > q.pos.y && by < q.pos.y + q.h;
      }, o.y, { x: a.dir.x, z: a.dir.z });
    }
    a.tick -= dt;
    if (a.tick <= 0 && !p.dead) {
      const pc = p.center(), t = clamp((pc.x - o.x) * a.dir.x + (pc.y - o.y) * a.dir.y + (pc.z - o.z) * a.dir.z, 0, len);
      const cx = o.x + a.dir.x * t, cy2 = o.y + a.dir.y * t, cz = o.z + a.dir.z * t;
      if (Math.hypot(pc.x - cx, (pc.y - cy2) * 0.6, pc.z - cz) < p.r + 0.45) {
        a.tick = 0.18;
        p.takeHit({ dmg: 7 * this.dmgMul, from: o, kind: 'beam', knock: 12.7 });
      }
    }
    Game.shake(0.015);
    if (a.t >= 2.6) { this.act = null; this.beam = null; this.hoverY = null; this.cds.beam = rand(9, 12); }
  }
  runGrenade(dt, a, p) {
    this.face(p.pos, 6, dt);
    const o = this.orbPos();
    if (!a.thrown) {
      a.plan = this.planThrow(o, { x: p.pos.x, y: p.pos.y + 0.3, z: p.pos.z });
      if (Math.random() < 0.7) FX.elec(o, 0.4 + a.t * 0.5, 1, { outer: '#2f6bff', core: '#ffffff' });
      if (a.t >= this.tele(1.15)) {
        this.grenade = new PulseGrenade(o, a.plan.v, this);
        Game.projectiles.push(this.grenade);
        Sound.play('throw', {}, o);
        a.thrown = true; a.t = 0;
        this.cds.grenade = 99;
      }
      return;
    }
    if (a.t > 0.3) this.act = null;
  }
  planThrow(o, q) {
    const T = clamp(dist3(o, q) / 20, 0.65, 1.15);
    return { o, T, v: { x: (q.x - o.x) / T, y: (q.y - o.y) / T + 0.5 * GRENADE_G * T, z: (q.z - o.z) / T } };
  }

  // ---------- half health: the enrage ----------
  // A shockwave throws the player clear, then it rises on its jets, its limiters blow, it roars and slams down.
  enterPhase2(quick = false) {
    this.phase = 2; this.p2Hp = this.hp;
    this.shield = false; this.stunT = 0; this.flinchT = 0; this.guardT = 0; this.parryInvulnT = 0;
    this.attack = null; this.windArc = null; this.beam = null; this.hoverY = null; this.dash = null; this.lunge = null; this.leap = null;
    this.stopLoops();
    this.mode = 'charge'; this.modeT = rand(5, 7);
    if (quick) {
      // straight into the blade phase: duel retries skip the cutscene
      this.act = null; this.transT = 0.3; this.cds.combo = 1.2;
      FX.ring(this.center(), 0.4, 5.5, 0.4, { c: '#4a8aff', flat: false });
      Sound.play('bossRoar', {}, this.center());
      return;
    }
    const hadShield = this.shield, p = Game.player;
    this.act = { kind: 'enrage', t: 0, done: {}, stage: 'brace' };
    this.transT = 99; this.cds.combo = 0.4;
    // anything of its still in the air fizzles out
    for (const b of Game.projectiles) {
      if (b.dead || !(b.hostile || b.owner === this)) continue;
      b.dead = true;
      FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, AEGIS_SPARK);
    }
    const c = this.center();
    FX.ring(c, 0.5, 13.6, 0.55, { c: '#4a8aff', flat: false });
    FX.ring(c, 0.4, 9, 0.45, { c: '#4a8aff', flat: false });
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.5, 11.8, 0.5, { c: '#4a8aff' });
    if (hadShield) FX.sparks(c, 40, null, TAU, 11, 33, AEGIS_SPARK);
    FX.sparks(c, 30, null, TAU, 7.3, 27, AEGIS_SPARK);
    FX.dust(this.pos, 24, { smax: 18, rise: 1 });
    FX.light(c, '#4a8aff', 8, 20, 0.5);
    FX.flash('#ffffff', 0.45);
    Sound.play('bossShieldBreak', {}, c);
    Sound.play('shockwave', { power: 1 }, c);
    Game.shake(0.7);
    Game.hitstop(0.1);
    p.blastAway(this.pos, clamp(1.25 - distXZ(p.pos, this.pos) / 29, 0.35, 1));
    if (!p.dead) Game.startCine({ kind: 'enrage', focus: this, owner: this });
  }
  runEnrage(dt, a, p) {
    const C = Game.cine, own = C && C.owner === this, ct = own ? C.t : a.t;
    const once = (k) => (a.done[k] ? false : (a.done[k] = true));
    this.faceYaw = this.yawTo(p.pos);
    const c = this.chest();
    if (ct < 0.55) a.stage = 'brace';
    else if (ct < 1.75) {
      a.stage = 'charge';
      if (once('rise')) { this.hoverY = this.pos.y + 2.2; Sound.play('enrageCharge', {}, c); }
      if (Math.random() < 0.7) FX.elec(c, 1.1 + (ct - 0.55) * 1.4, 1, { outer: '#4a8aff', core: '#ffffff' });
      if (Math.random() < 0.5) FX.sparks(this.local(rand(-0.7, 0.7), 0.3, rand(-0.5, 0.5)), 1, { x: 0, y: 1, z: 0 }, 0.6, 3.6, 12.7, Object.assign({ g: -11 }, AEGIS_SPARK));
      [0.8, 1.05, 1.3].forEach((tt, i) => { if (ct >= tt && once('pop' + i)) this.limiterPop(i); });
    } else if (ct < 2.85) {
      a.stage = 'roar';
      if (once('roar')) this.roar();
      if (Math.random() < 0.8) FX.sparks(c, 2, null, TAU, 7.3, 23.6, AEGIS_SPARK);
      if (Math.random() < 0.35) { const d = coneDir(null, TAU); FX.bolt(c, { x: c.x + d.x * 3.6, y: c.y + d.y * 3.6, z: c.z + d.z * 3.6 }, 0.08, { outer: '#2f6bff', core: '#ffffff', jag: 0.55, forks: 2 }); }
      Game.shake(0.012);
    } else {
      a.stage = 'land';
      if (once('drop')) { this.hoverY = null; this.vel.y = -24; if (own) C.zoom = 1; }
      if (this.onGround && once('slam')) {
        const g = { x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z };
        FX.dust(g, 18, { smax: 13.6, rise: 0.6 });
        FX.debris(g, 12, GRIT, 16);
        FX.decal('crack', g, { len: 4.4, dur: 8 });
        FX.ring(g, 0.4, 6.4, 0.4, { c: '#4a8aff' });
        Sound.play('slam', {}, g); Sound.play('thud', {}, g);
        Game.shake(0.45);
      }
      if (ct >= 3.4 && once('close')) this.endEnrage();
    }
    this.cineShot('enrage', ct, a.stage);
  }
  limiterPop(i) {
    const spots = [[-0.2, 2.1, 0.32], [0.2, 2.1, 0.32], [0, 2.3, 0.2]], [x, y, f] = spots[i % 3];
    const q = this.local(x, y, f);
    FX.debris(q, 6, ['#d29a3c', '#e8ecf2', '#3a3c46'], 20);
    FX.sparks(q, 14, null, TAU, 7.3, 23.6, AEGIS_SPARK);
    FX.ring(q, 0.2, 1.3, 0.2, { c: '#4a8aff', flat: false });
    Sound.play('limiterPop', {}, q);
    Game.shake(0.15);
  }
  roar() {
    const C = Game.cine;
    if (C && C.owner === this) C.zoom = 2;
    const c = this.chest();
    FX.flash('#ffffff', 0.6);
    FX.ring(c, 0.4, 11, 0.6, { c: '#4a8aff', flat: false });
    FX.ring(c, 0.2, 6.4, 0.45, { c: '#2f6bff', flat: false });
    FX.sparks(c, 50, null, TAU, 9, 31, AEGIS_SPARK);
    FX.elec(c, 3.6, 14, { outer: '#2f6bff', core: '#ffffff' });
    FX.light(c, '#4a8aff', 9, 18, 0.9);
    Sound.play('enrageRoar', {}, c);
    Sound.play('bossRoar', {}, c);
    Game.shake(0.7);
    Game.hitstop(0.05);
  }
  endEnrage() {
    Game.closeCine();
    // a breather before the first combo
    this.act = null; this.transT = 0.3; this.cds.combo = 1.2; this.hoverY = null;
  }
  // ---------- entry ----------
  // From here it fights. quick: the short beam drop (duel retries); otherwise the cutscene showed the title.
  arrive(quick) {
    this.spawning = false;
    if (quick && !this.duel) Game.announce(this.name, null, '#7aa8ff', 2.6);
    this.act = { kind: 'intro', t: quick ? 0 : 0.6 };
    this.pickMode(Game.player, distXZ(Game.player.pos, this.pos));
  }
  updateIntro(dt) {
    const I = this.intro, p = Game.player;
    if (!I.started) {
      I.started = true;
      if (!p.dead) Game.startCine({ kind: 'rivalIntro', focus: this, owner: this });
    }
    const C = Game.cine, own = C && C.owner === this;
    I.t += dt;
    const ct = (I.ct = own ? C.t : I.t);
    const once = (k) => (I.done[k] ? false : (I.done[k] = true));
    const g = { x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, CY = AEGIS_SPARK;
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    if (ct < 0.75) {
      I.stage = 'gather';
      if (once('rumble')) { Sound.play('beaconRumble', {}, g); FX.decal('crack', g, { len: 2.6, dur: 14 }); }
      // energy crawls in along the street and motes rise off the cracks
      if (Math.random() < 0.8) {
        const a = rand(0, TAU), d = rand(2.2, 6.4), q = { x: g.x + Math.cos(a) * d, y: g.y, z: g.z + Math.sin(a) * d };
        FX.sparks(q, 1, { x: -Math.cos(a), y: 0, z: -Math.sin(a) }, 0.2, d * 1.6, d * 2, Object.assign({ g: 0, life: 1.6 }, CY));
      }
      if (Math.random() < 0.5) FX.sparks({ x: g.x + rand(-0.7, 0.7), y: g.y, z: g.z + rand(-0.7, 0.7) }, 1, { x: 0, y: 1, z: 0 }, 0.4, 2.7, 8, Object.assign({ g: -3.6, life: 1.4 }, CY));
      if (Math.random() < 0.15) FX.debris({ x: g.x + rand(-1.8, 1.8), y: g.y, z: g.z + rand(-1.8, 1.8) }, 1, GRIT, 5.5);
      Game.shake(0.012 + ct * 0.02);
    } else if (ct < 2.0) {
      I.stage = 'erupt';
      if (once('erupt')) {
        Sound.play('beaconErupt', {}, g);
        FX.flash('#c8dcff', 0.55);
        FX.ring(g, 0.4, 11, 0.6, { c: '#4a8aff' });
        FX.ring(g, 0.3, 6.4, 0.45, { c: '#ffffff' });
        FX.debris(g, 34, GRIT, 31);
        FX.dust(g, 26, { smax: 20, rise: 1, life: 1.4 });
        FX.decal('crack', g, { len: 5.8, dur: 14 });
        FX.sparks({ x: g.x, y: g.y + 0.9, z: g.z }, 50, { x: 0, y: 1, z: 0 }, 1.2, 11, 40, CY);
        FX.light({ x: g.x, y: g.y + 5.5, z: g.z }, '#4a8aff', 9, 24, 0.8);
        Game.shake(0.75);
      }
      if (Math.random() < 0.9) FX.sparks({ x: g.x + rand(-0.6, 0.6), y: g.y + rand(0, 11), z: g.z + rand(-0.6, 0.6) }, 1, { x: 0, y: 1, z: 0 }, 0.3, 11, 27, Object.assign({ g: -9 }, CY));
      if (Math.random() < 0.25) {
        const yy = g.y + rand(1, 12), a = rand(0, TAU);
        FX.bolt({ x: g.x + Math.cos(a) * 0.7, y: yy, z: g.z + Math.sin(a) * 0.7 }, { x: g.x + Math.cos(a) * rand(2.2, 4.5), y: yy + rand(-1.8, 1.8), z: g.z + Math.sin(a) * rand(2.2, 4.5) }, 0.08, { outer: '#2f6bff', core: '#ffffff', jag: 0.55, forks: 2 });
      }
      if (Math.random() < 0.3) FX.debris({ x: g.x + rand(-1.3, 1.3), y: g.y, z: g.z + rand(-1.3, 1.3) }, 1, GRIT, 18);
      if ((I.pulse = (I.pulse || 0) - dt) <= 0) { I.pulse = 0.32; FX.ring(g, 0.5, 4.5, 0.35, { c: '#4a8aff' }); }
      Game.shake(0.025);
    } else if (ct < 2.55) {
      I.stage = 'emerge';
      if (once('emerge')) Sound.play('enrageCharge', {}, g);
      if (Math.random() < 0.6) FX.sparks({ x: g.x + rand(-0.5, 0.5), y: g.y + rand(0, 2.2), z: g.z + rand(-0.5, 0.5) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 5.5, 14.5, Object.assign({ g: -5.5 }, CY));
    } else if (ct < 3.1) {
      I.stage = 'rise';
      if (once('reveal')) {
        const c = this.center();
        FX.ring(c, 0.4, 6.4, 0.4, { c: '#4a8aff', flat: false });
        FX.sparks(c, 40, null, TAU, 7.3, 27, CY);
        FX.elec(c, 2.4, 10, { outer: '#2f6bff', core: '#ffffff' });
        FX.flash('#ffffff', 0.4);
        Sound.play('shockwave', { power: 0.6 }, c);
        Sound.play('shieldUp', {}, c);
        Game.shake(0.4);
      }
      if (ct >= 2.85 && once('visor')) {
        const v = this.visorPos();
        FX.light(v, '#4a8aff', 4, 4, 0.4);
        FX.glint(v, { c: '#9cc4ff', size: 1.4, dur: 0.3 });
        Sound.play('glint', {}, v);
      }
    } else {
      I.stage = 'title';
      if (once('title')) {
        if (own) { C.zoom = 2; C.big = { style: 'title', text: this.name, color: '#7aa8ff', tag: 'RIVAL FRAME', sub: this.duel ? 'MELEE DUEL' : 'SECTOR 9 ENFORCER' }; C.bigT = 0; }
        Sound.play('titleHit');
        Sound.play('bossRoar', {}, this.center());
        FX.ring(this.center(), 0.4, 8.2, 0.5, { c: '#4a8aff', flat: false });
        FX.dust(g, 16, { smax: 13.6, rise: 0.6 });
        Game.shake(0.5);
      }
      if (Math.random() < 0.3) FX.sparks({ x: g.x + rand(-0.5, 0.5), y: g.y + rand(0.4, 1.8), z: g.z + rand(-0.5, 0.5) }, 1, { x: 0, y: 1, z: 0 }, 1, 1.8, 5.5, Object.assign({ g: -3.6 }, CY));
      if (ct >= 4.8 && once('end')) this.endIntro();
    }
    this.cineShot('intro', ct, I.stage);
  }
  endIntro() {
    this.intro = null;
    if (Game.cine && Game.cine.owner === this) Game.closeCine();
    this.arrive(false);
  }

  // ---------- knockout ----------
  // The last hit freezes into slow motion, then it staggers, kneels on its blade and falls on its face.
  onDeath(o = {}) {
    if (this.dying) return;
    this.dying = true; this.hp = 0; this.koT = 0;
    this.act = null; this.attack = null; this.windArc = null; this.beam = null; this.hoverY = null; this.dash = null; this.lunge = null; this.leap = null;
    this.stunT = 0; this.flinchT = 0; this.guardT = 0;
    this.stopLoops();
    if (Game.btOwner === this) Game.endBulletTime();
    this.ko = { stage: 'impact', done: {}, rot: 0 };
    const p = Game.player, u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.vel.x = u.x * 12; this.vel.z = u.z * 12; this.vel.y = 10; this.onGround = false;
    for (const b of Game.projectiles) if (!b.dead && (b.hostile || b.owner === this)) b.dead = true;
    const c = this.chest(), dir = o.dir || { x: u.x, y: 0.3, z: u.z };
    // keep the close-up clean: no damage numbers over the knockout
    FX.texts = FX.texts.filter((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) > 5);
    const px = -dir.z, pz = dir.x, pl = Math.hypot(px, pz) || 1;
    FX.slashLine({ x: c.x - (px / pl) * 4, y: c.y - 0.6, z: c.z - (pz / pl) * 4 }, { x: c.x + (px / pl) * 4, y: c.y + 0.6, z: c.z + (pz / pl) * 4 }, { w: 0.45, dur: 0.22, grow: 0.01, pal: 'gold' });
    FX.ring(c, 0.4, 8.2, 0.8, { c: '#ffd070', flat: false });
    FX.ring(c, 0.2, 4.5, 0.6, { c: '#ff6a7a', flat: false });
    FX.sparks(c, 60, dir, 2.2, 7.3, 38, { c0: '#ffffff', c1: '#ffe080', c2: '#ff5a3a' });
    FX.elec(c, 2.7, 10, { outer: '#ff3a52', core: '#ffffff' });
    FX.light(c, '#ffffff', 9, 18, 0.9);
    FX.flash('#ffffff', 0.7);
    Sound.play('koHit');
    Sound.setIntensity(0);
    Game.hitstop(0.12);
    Game.slowmo(0.12, 1.3, true);
    Game.shake(0.6);
    if (!p.dead) Game.startCine({ kind: 'ko', focus: this, owner: this, zoom: 2 });
  }
  updateDying(dt) {
    const K = this.ko, C = Game.cine, own = C && C.owner === this;
    this.koT += dt;
    const ct = own ? C.t : this.koT * 2.5;
    const once = (k) => (K.done[k] ? false : (K.done[k] = true));
    const v = this.vel;
    const [nx, nz] = approach2(v.x, v.z, 0, 0, (this.onGround ? 40 : 6) * dt);
    v.x = nx; v.z = nz;
    v.y = Math.max(v.y - AEGIS_G * dt, -40);
    World.moveBody(this, dt);
    const c = this.chest(), BL = { outer: '#2f6bff', core: '#ffffff' };
    if (ct < 1.3) {
      K.stage = 'impact';
      if (Math.random() < 0.5) FX.sparks(c, 2, null, TAU, 5.5, 20, { c0: '#ffffff', c1: '#ffe080', c2: '#ff5a3a' });
      if (Math.random() < 0.3) FX.elec(c, 1.4, 1, { outer: '#ff3a52', core: '#ffffff' });
    } else if (ct < 2.1) {
      K.stage = 'stagger';
      if (once('stagger')) { if (own) C.zoom = 1; const u = this.fwd(); v.x = -u.x * 4.5; v.z = -u.z * 4.5; Sound.play('limiterPop', {}, c); FX.elec(c, 1.8, 6, BL); }
      if (Math.random() < 0.25) FX.elec(c, 1.1, 1, BL);
      if (Math.random() < 0.2) FX.sparks(c, 1, null, TAU, 3.6, 12.7, AEGIS_SPARK);
    } else if (ct < 3.1) {
      K.stage = 'kneel';
      if (once('kneel')) { Sound.play('thud', {}, this.pos); FX.dust(this.pos, 8, { smax: 4.5 }); Game.shake(0.2); }
      if (Math.random() < 0.15) FX.elec(c, 0.9, 1, BL);
    } else if (ct < 3.45) {
      K.stage = 'collapse'; K.rot = clamp((ct - 3.1) / 0.35, 0, 1);
    } else {
      K.stage = 'down'; K.rot = 1;
      const f = this.fwd(), h = { x: this.pos.x + f.x * 1.3, y: this.pos.y, z: this.pos.z + f.z * 1.3 };
      if (once('down')) {
        Sound.play('thud', {}, h); Sound.play('slam', {}, h);
        FX.dust(h, 16, { smax: 8, rise: 0.4 });
        FX.debris(h, 8, this.def.debris, 11);
        FX.decal('crack', h, { len: 3.2, dur: 10 });
        Game.shake(0.35);
      }
      if (ct >= 3.65 && once('big')) {
        if (own) { C.big = { text: 'KNOCKOUT', color: '#ffd070' }; C.bigT = 0; }
        Sound.play('ko');
        FX.flash('#fff4d0', 0.35);
        Game.shake(0.3);
      }
      if (Math.random() < 0.05) FX.elec({ x: h.x, y: h.y + 0.3, z: h.z }, 0.7, 1, BL);
      if (ct >= 5.4 && once('finish')) this.finishKO();
    }
    this.cineShot('ko', ct, K.stage);
  }
  // hold-to-skip from Game: jump to the end of whichever cutscene it is running
  skipCine() {
    if (this.intro) { this.endIntro(); return; }
    if (this.act && this.act.kind === 'enrage') {
      this.hoverY = null; this.vel.y = -20;
      this.endEnrage();
    } else if (this.dying && this.ko && !this.dead) {
      this.ko.stage = 'down'; this.ko.rot = 1; this.vel.x = this.vel.z = 0;
      this.finishKO();
    }
  }
  finishKO() {
    this.dead = true;
    this.stopLoops();
    // what's left lies in the street until the next wave
    this.husk = new RivalHusk(this);
    Game.props.push(this.husk);
    Game.onKill(this, { cause: 'boss' });
    Game.closeCine();
    Sound.setIntensity(0.3);
    // the duel is practice, so only a full fight counts
    if (this.duel) return;
    SaveData.unlocks.aegis = true;
    SaveData.bossKills++;
    saveProgress();
  }

  // ---------- the cutscene camera ----------
  // Each cutscene stage frames it from a set angle: shot yaw is the camera's look direction, so its own yaw
  // plus pi looks at its face. The camera eases between shots (camera.js).
  cineShot(kind, ct, stage) {
    const C = Game.cine;
    if (!C || C.owner !== this || C.closing) return;
    const y = this.yaw, P = this.pos, at = (h) => ({ x: P.x, y: P.y + h, z: P.z });
    let s;
    if (kind === 'intro') {
      const pp = Game.player.pos, d = distXZ(pp, P);
      if (stage === 'gather') s = { look: at(1.2), yaw: yawOf(P.x - pp.x, P.z - pp.z) + 0.25, pitch: -0.06, dist: Math.min(14, d * 0.6 + 3), ease: 3 };
      else if (stage === 'erupt') s = { look: at(4.2), yaw: y + Math.PI + 0.5 + (ct - 0.75) * 0.25, pitch: 0.32, dist: 11, ease: 2.5 };
      else if (stage === 'emerge') s = { look: at(1.4), yaw: y + Math.PI + 0.35, pitch: 0.04, dist: 6.5, ease: 3 };
      else if (stage === 'rise') s = { look: at(1.7), yaw: y + Math.PI + 0.25, pitch: 0.2, dist: 4.6, ease: 4 };
      else s = { look: at(2.0), yaw: y + Math.PI - 0.45 - (ct - 3.1) * 0.06, pitch: 0.06, dist: 4.1, ease: 3 };
    } else if (kind === 'enrage') {
      if (stage === 'brace') s = { look: at(1.5), yaw: y + Math.PI + 0.3, pitch: 0.08, dist: 7, ease: 4 };
      else if (stage === 'charge') s = { look: at(2.2), yaw: y + Math.PI + 0.3 - (ct - 0.55) * 0.3, pitch: 0.22, dist: 5.2, ease: 2 };
      else if (stage === 'roar') s = { look: at(2.5), yaw: y + Math.PI - 0.15, pitch: 0.08, dist: 3.4, ease: 5 };
      else s = { look: at(1.2), yaw: y + Math.PI + 0.6, pitch: -0.2, dist: 8.5, ease: 3 };
    } else {
      if (stage === 'impact') s = { look: at(1.6), yaw: y + Math.PI / 2 + 0.2, pitch: 0.02, dist: 6, ease: 4 };
      else if (stage === 'down') s = { look: at(0.6), yaw: y + Math.PI * 0.75 + (ct - 3.45) * 0.1, pitch: -0.5, dist: 7.5, ease: 1.5 };
      else s = { look: at(1.3), yaw: y + Math.PI * 0.8 + (ct - 1.3) * 0.15, pitch: -0.08, dist: 5.6, ease: 2 };
    }
    C.shot = s;
  }
}

// ---------- hazards and projectiles ----------
// A wide crescent of energy thrown off a swing, travelling along the ground (or at head height, thrown from
// the air). Jump it, slide under the high one, or dash through it; a parry breaks it (it is never sent back) and a
// slash passes through.
class BladeWave {
  // roll: its tilt about its line of flight (radians, positive raises its right end)
  constructor(pos, dir, dmg, owner, air, roll = 0) {
    this.kind = 'bladewave';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.dir = { x: dir.x, z: dir.z }; this.roll = roll;
    this.speed = BLADE_WAVE.SPEED * Math.sqrt(S.enemies.speed); this.dmg = dmg; this.owner = owner; this.air = air;
    // half its width across its path (wide, so jumping, dashing through or parrying stay the answers rather than
    // a step to the side), and half its height
    this.W = 4.5; this.H = air ? 0.55 : 0.65;
    this.hostile = true; this.life = 1.4; this.dead = false; this.parryOnly = true; this.t = 0;
    this.vel = { x: this.dir.x * this.speed, y: 0, z: this.dir.z * this.speed };
  }
  // a point on its band: u metres along it from the middle, v across it
  pointOn(u, v) {
    const c = Math.cos(this.roll), s = Math.sin(this.roll), side = u * c - v * s, up = u * s + v * c;
    return { x: this.pos.x - this.dir.z * side, y: this.pos.y + up, z: this.pos.z + this.dir.x * side };
  }
  // whether its band, tilted by roll, crosses a body side metres to the side of its middle
  crosses(side, P) {
    const c = Math.cos(this.roll), s = Math.sin(this.roll);
    for (const k of [0.05, 0.35, 0.65, 0.95]) {
      const h = P.pos.y + P.h * k - this.pos.y, u = side * c + h * s, v = -side * s + h * c;
      if (Math.abs(u) < this.W + P.r * 0.5 && Math.abs(v) < this.H + P.r * 0.5) return true;
    }
    return false;
  }
  // a parry breaks it on the blade; it can't be sent back
  reflect() {
    const P = Game.player, c = P.chest();
    FX.sparks(c, 16, { x: -this.dir.x, y: 0.3, z: -this.dir.z }, 1.6, 6.4, 20, AEGIS_SPARK);
    this.fizzle();
  }
  fizzle() {
    this.dead = true;
    for (let i = 0; i < 8; i++) {
      const q = this.pointOn(rand(-this.W, this.W), rand(-this.H, this.H));
      FX.sparks(q, 1, null, TAU, 2.7, 11, AEGIS_SPARK);
    }
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.fizzle(); return; }
    const d = this.dir, px = -d.z, pz = d.x;
    for (let i = 0; i < 3; i++) {
      this.pos.x += (d.x * this.speed * dt) / 3; this.pos.z += (d.z * this.speed * dt) / 3;
      // walls stop it where its middle meets one
      if (World.pointSolid(this.pos.x + d.x * 0.3, this.pos.y, this.pos.z + d.z * 0.3)) { this.fizzle(); return; }
      const P = Game.player;
      if (P.dead) continue;
      const rx = P.pos.x - this.pos.x, rz = P.pos.z - this.pos.z, along = rx * d.x + rz * d.z, side = rx * px + rz * pz;
      if (Math.abs(along) < 0.45 + P.r && this.crosses(side, P)) {
        const r = P.takeHit({ dmg: this.dmg, from: { x: this.pos.x - d.x, y: this.pos.y, z: this.pos.z - d.z }, kind: 'projectile', proj: this, knock: 18 });
        if (r === 'hit' || r === 'immune' || r === 'parried') { if (!this.dead) this.fizzle(); return; }
      }
    }
    if (Math.random() < 0.6) FX.sparks(this.pointOn(rand(-this.W, this.W), rand(-this.H, this.H)), 1, { x: -d.x, y: 0, z: -d.z }, 0.4, 1.8, 5.5, Object.assign({ g: 0 }, AEGIS_SPARK));
  }
}

// What's left of the rival after a knockout: the model lying where it fell (render.js hands it over) until
// the next wave.
class RivalHusk {
  constructor(r) {
    this.kind = 'husk';
    const f = r.fwd();
    this.pos = { x: r.pos.x + f.x * 1.2, y: r.pos.y, z: r.pos.z + f.z * 1.2 }; this.rig = null;
    this.r = 1; this.h = 0.6; this.dead = false; this.t = 0; this.wave = Director.wave; this.fade = 0;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 0.3, z: this.pos.z }; }
  update(dt) {
    this.t += dt;
    if (!this.fade && Director.wave !== this.wave) {
      this.fade = 0.001;
      FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.3, 2.7, 0.4, { c: '#4a8aff' });
      Sound.play('spawn', {}, this.pos);
    }
    if (this.fade) { this.fade += dt; if (this.fade > 0.5) this.dead = true; }
    if (Math.random() < 0.015) FX.elec({ x: this.pos.x + rand(-0.7, 0.7), y: this.pos.y + 0.3, z: this.pos.z + rand(-0.7, 0.7) }, 0.6, 1, { outer: '#2f6bff', core: '#ffffff' });
    if (Math.random() < 0.04) FX.dust({ x: this.pos.x + rand(-0.5, 0.5), y: this.pos.y + 0.3, z: this.pos.z + rand(-0.5, 0.5) }, 1, { c: '#3a3442', smax: 0.9, rise: 1.6, life: 1.6 });
  }
}
