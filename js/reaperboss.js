'use strict';
// REAP-R, the Last Harvest: the third boss, in the Rift. A gaunt 2.9 m machine in a tattered violet cloak with a
// jet-boosted scythe longer than it is tall. Where KRAG never stops coming, REAP-R is never where you left it: it
// tears reality open and steps through. Its health is on the boss bar; everything else reads from its body, its
// tears and its sound.
//   Tears: it doesn't run at you or leap. It folds into a tear where it stands and steps out of another beside
//   you, behind you, or across the arena. The way out always opens first, with its own sound placed there, so
//   you can turn to it; later in the fight a decoy tear may open and shut before the real one.
//   The scythe: wide sweeps, in strings of two to four, each with a gold glint a moment before it lands; the big
//   ones (the overhead cleave, the executioner's blow) wind up outlined in gold. All of them can be parried: a
//   parry knocks it back off balance and charges your counter. Mid-string it may step through a tear and come
//   out the other side of you for the next blow.
//   The throw: from range it hauls the scythe back over its shoulder and throws it, spinning, straight down the
//   line to you. Past you it goes into a tear, and comes back out of another one on your far side, flying home
//   to its hand through wherever you're standing. Either pass can be parried: the scythe drops, and it's left
//   unarmed and reeling until it calls it back.
//   The whirlwind is its red move: no parry. It coils with the scythe drawn right back, the jet screaming, a red
//   ring on the ground showing the reach, in bullet time; then it spins across the arena after you, the scythe
//   out flat, dragging you in and round with it, hit after hit, until you dash out. Be outside the ring, or
//   above it. Afterwards the jet is spent and it kneels on the scythe, open.
//   The reaping: it holds out its left hand and a thread of violet runs from it to you; then the space between
//   you gives, and you're hauled to its feet for the executioner's blow (harder the lower your health). A dash
//   snaps the thread and leaves it grasping at nothing; or parry the blow.
//   Souls: a blow that reaches your health tears part of it out of you. It hangs where you were struck, a
//   violet wisp on a thread, drifting toward REAP-R. Reach it and the health comes back; if REAP-R gets to it
//   first, or you leave it too long, it's reaped, and REAP-R mends.
//   Dread: near it the colour drains from the world, the edges of the screen close in and a heartbeat rises.
// It arrives out of a tear; the last hit plays a slow-motion knockout and leaves its husk.

ENEMY_DEFS.reaper = { hp: 1300, r: 0.7, h: 2.9, speed: 6.2, score: 6500, mass: 8, dmg: 6, heavy: true, climb: 99, debris: ['#6c6874', '#4c4856', '#8a8692', '#4e1c72', '#3a1458', '#b44aff'] };
ENEMY_BASE_STATE.reaper = 'fight';

PALETTES.void = [[255, 255, 255], [220, 176, 255], [150, 60, 255], [48, 10, 110]];
PAL_LIN.void = PALETTES.void.map((c) => c.map(_lin));
const REAP_SPARK = { c0: '#ffffff', c1: '#b060ff', c2: '#3a0a7a' };
const REAP_GOLD = { c0: '#ffffff', c1: '#ffd070', c2: '#a06010' };
const REAP_VIOLET = '#a050ff';
// A step through a tear: seconds folding in, gone, and unfolding (quick: mid-string); the wait before the next;
// how far from you it steps out for a blow
const RWARP = { OUT: 0.22, GONE: [0.34, 0.5], IN: 0.16, QOUT: 0.13, QGONE: 0.26, QIN: 0.12, CD: [1.6, 2.8], NEAR: [3.0, 4.0] };
// The throw: wind-up, speed and reach of the first pass, its radius, damage and knock, the seconds between the
// tear it leaves by and the one it returns from, the speed home, how far past you it comes back from, and how
// long a parried throw leaves it unarmed
const RTHROW = { WIND: 0.62, SPEED: 30, RANGE: 27, R: 1.5, DMG: 18, KNOCK: 22, GAP: 0.55, BACK: 33, FAR: 8, DISARM: 2.6, CD: [5, 8] };
// The whirlwind: wind-up (before the telegraph setting), its bullet time's speed, reach, how long it spins, the
// seconds between hits, damage and knock, how fast it drifts after you, how hard it drags you in (m/s^2), how
// high it reaches, and how long it kneels after
const RWHIRL = { WIND: 1.2, BT: 0.65, R: 7.2, SPIN: 1.7, TICK: 0.3, DMG: 13, KNOCK: 18, SPEED: 5.5, PULL: 26, H: 3.6, VENT: 1.9, CD: [10, 14] };
// The reaping: the reach (the thread before the pull), how long and how fast it hauls you, the range it's thrown
// from, and how long a snapped thread leaves it open
const RREAP = { REACH: 0.6, PULL: 0.75, SPEED: 17, MIN: 6.5, MAX: 22, STOP: 4.4, WHIFF: 1.0, EXEC: 1.5, LOW: 35, CD: [9, 13] };
// A torn soul: the share of the health a blow took that it holds (at most MAX), how long it lasts, how fast it
// drifts to REAP-R, how close you or it must come, how much of what it holds mends REAP-R, how far to the side
// of you it's knocked, and how long before it can be taken back
const SOUL = { SHARE: 0.6, MAX: 60, LIFE: 10, DRIFT: 0.9, R: 1.6, REAP_R: 1.5, HEAL: 2.5, OUT: 3.4, ARM: 0.5 };
// its dread: how far it reaches
const DREAD = { R: 15 };
// the entry: when it steps out of the tear, when the blade catches, when the title hits, when it ends
const RINTRO = { STEP: 1.5, IGNITE: 2.5, TITLE: 3.4, END: 5.0, BACK: 2.4 };

// Its blows. wind = telegraph; swing = active time; r = reach from the chest; the arc is `span` wide, tipped `tilt`
// from level, swept the way `dir` says. big: outlined in gold from the start. drag: a hit hauls you to it.
const REAP_MOVES = {
  sweep: { wind: 0.44, swing: 0.2, r: 4.7, dmg: 15, knock: 20, span: 3.1, tilt: 0.1, dir: 1, lunge: 7 },
  back: { wind: 0.4, swing: 0.2, r: 4.7, dmg: 15, knock: 20, span: 3.1, tilt: -0.1, dir: -1, lunge: 7 },
  rise: { wind: 0.46, swing: 0.2, r: 4.5, dmg: 17, knock: 12, span: 2.4, tilt: 1.15, dir: 1, launch: 16, lunge: 6 },
  hook: { wind: 0.48, swing: 0.2, r: 5.0, dmg: 13, knock: 4, span: 2.6, tilt: 0.05, dir: -1, lunge: 3, drag: 15 },
  cleave: { wind: 0.6, swing: 0.22, r: 4.9, dmg: 24, knock: 26, span: 1.9, tilt: 1.45, dir: -1, lunge: 8, big: true, over: true, wave: true },
  execute: { wind: 0.52, swing: 0.22, r: 5.2, dmg: 28, knock: 30, span: 2.0, tilt: 1.45, dir: -1, lunge: 4, big: true, over: true, exec: true },
};
// 'WARP': it steps through a tear to the other side of you before the next blow
const REAP_COMBOS = [
  ['sweep', 'back'], ['sweep', 'rise', 'cleave'], ['back', 'hook', 'cleave'], ['rise', 'sweep'],
  ['sweep', 'WARP', 'cleave'], ['hook', 'WARP', 'back', 'cleave'], ['back', 'sweep', 'WARP', 'rise'],
];

// How much of its dread is on you, 0 to 1: nearer is worse, and worse while your soul is out.
function reaperDread() {
  const p = Game.player;
  if (!p || p.dead || Game.state === 'menu') return 0;
  let k = 0;
  for (const e of Game.enemies) {
    if (e.type !== 'reaper' || e.dead || e.spawning || e.dying) continue;
    k = Math.max(k, clamp(1 - (dist3(e.pos, p.pos) - 3) / (DREAD.R - 3), 0, 1) * (e.hidden ? 0.6 : 1));
    if (e.act && e.act.kind === 'whirl' && e.act.phase !== 'vent') k = Math.max(k, 0.8);
  }
  if (k > 0) for (const h of Game.hazards) if (h.kind === 'soul' && !h.dead) { k = Math.min(1, k + 0.35); break; }
  return k;
}

class Reaper extends Boss {
  constructor(pos, scale = {}) {
    super('reaper', pos, scale);
    this.name = 'REAP-R'; this.G = 60;
    this.barCol = '#a050ff'; this.barHi = '#e0c0ff'; this.barName = '#d8b8ff';
    this.spawnT = 1.1; this.stunT = 0; this.stunMax = 1; this.perilFlash = 0; this.hitT = 0;
    this.act = null; this.attack = null; this.lunge = null; this.hidden = false; this.scytheOut = null;
    this.cds = { combo: 0.8, warp: 1.2, throw: 3.5, whirl: 9, reap: 6, leap: 0, dodge: 0 };
    this.lastDir = 1; this.dying = false; this.ko = null; this.koT = 0; this.intro = null; this.husk = null; this.tilt = 0;
    this.beatT = 0; this.opened = false;
  }
  // it waits behind the world until its tear opens
  cinematicIntro() {
    const f = this.yawTo(Game.player.pos);
    this.yaw = this.faceYaw = f;
    this.intro = { t: 0, ct: 0, stage: 'tear', done: {}, started: false, g: this.pos.y, at: { x: this.pos.x, y: this.pos.y, z: this.pos.z }, lit: false };
  }

  // ---------- where its parts are ----------
  chest() { return { x: this.pos.x, y: this.pos.y + 2.0, z: this.pos.z }; }
  visorPos() { return this.boneAt('head', 0, 0.16, -0.18) || this.local(0, 2.6, 0.25); }
  handL() { return this.boneAt('handL', 0, -0.12, 0) || this.local(-0.6, 1.5, 0.4); }
  handR() { return this.boneAt('handR', 0, -0.12, 0) || this.local(0.6, 1.5, 0.4); }
  // a point u of the way along the blade's edge, and the jet's mouth
  bladePos(u = 0.6) { return (this.scytheOut ? null : this.boneAt('weapon', 0, lerp(SCYTHE.HEAD, SCYTHE.TIP[0], u), lerp(-0.2, SCYTHE.TIP[1], u))) || this.local(0.4, 3.0, 0.9); }
  jetPos() { return (this.scytheOut ? null : this.boneAt('weapon', 0, SCYTHE.HEAD, 0.7)) || this.local(0.5, 3.1, -0.3); }
  showModel() { return !this.hidden && (!this.spawning || (!!this.intro && this.intro.stage !== 'tear')); }
  // 0 at full health, 1 near death: it warps more, feints, and recovers faster
  rageK() { return clamp(1 - this.hp / this.maxHp, 0, 1); }
  rageGap() { return lerp(1, 0.7, this.rageK()); }
  // the whirlwind speeds up less than the rest on the harder settings, as the red flash does
  whirlWind() { const T = S.enemies.telegraph; return RWHIRL.WIND * (T < 1 ? 1 - (1 - T) * 0.55 : T); }
  cueProgress() { const a = this.act; return a && a.kind === 'whirl' && a.phase === 'wind' ? clamp(a.t / Math.max(0.05, a.wind - CUE_LEAD), 0, 1) : 1; }

  // ---------- state readers for the model and views ----------
  windingUp() {
    const a = this.act;
    return !!a && ((a.kind === 'melee' && a.phase === 'wind') || (a.kind === 'whirl' && a.phase === 'wind') || (a.kind === 'throw' && a.phase === 'wind') || a.kind === 'reap');
  }
  emissive() {
    if (this.dead) return 0;
    if (this.hitFlash > 0) return 0.8;
    if (this.dying && this.ko && this.ko.stage === 'impact' && ((this.t * 40) | 0) % 2) return 0.7;
    if (this.cutMark && ((Game.realTime * 30) | 0) % 2) return 0.6;
    return 0;
  }
  // The outline is a tell: red through the whirlwind's wind-up (no parry), gold through a big blow's and as any
  // blow glints (parry it), violet while the thread is on you.
  outline() {
    const a = this.act, fl = ((this.t * 24) | 0) % 2;
    if (this.dying || this.spawning || this.hidden || !a) return null;
    if (a.kind === 'whirl' && a.phase === 'wind') return this.perilFlash > 0 && ((this.t * 30) | 0) % 2 ? '#ffffff' : '#ff2a3a';
    if (a.kind === 'melee' && a.phase === 'wind' && (a.m.big || a.glinted)) return a.glinted && fl ? '#ffffff' : '#ffd070';
    if (a.kind === 'reap') return fl ? '#e8c8ff' : REAP_VIOLET;
    if (a.kind === 'throw' && a.phase === 'wind') return fl ? '#ffe8b0' : '#ffd070';
    return null;
  }
  // its violet lights: the eyes flash white through a wind-up, the blade burns red as the whirlwind builds, and
  // everything goes out when it falls
  tints() {
    const P = this._tint || (this._tint = {}), C = REAPER_COL, a = this.act, fl = ((this.t * 18) | 0) % 2;
    if (this.dying && this.ko && (this.ko.stage === 'collapse' || this.ko.stage === 'down' || (this.ko.stage === 'kneel' && ((this.t * 10) | 0) % 3 === 0))) {
      for (const t of ['eye', 'core', 'vein', 'blade', 'edge', 'jet']) P[t] = C.off;
      return P;
    }
    const dark = this.intro && !this.intro.lit, vent = (a && a.kind === 'whirl' && a.phase === 'vent') || this.stunT > 0;
    const red = a && a.kind === 'whirl' && a.phase !== 'vent';
    P.eye = this.windingUp() && fl ? '#ffffff' : red ? '#ff6a7a' : C.hot;
    P.core = vent ? C.dim : fl && this.windingUp() ? '#ffffff' : C.glow;
    P.vein = vent ? C.dim : C.glow;
    P.blade = dark || vent ? C.dim : red ? (fl ? '#ff5a6a' : '#ff2a3a') : C.glow;
    P.edge = dark || vent ? C.dim : red ? '#ffd0d4' : C.hot;
    P.jet = dark || vent ? C.off : red && fl ? '#ffffff' : C.glow;
    return P;
  }
  laser() { return 0; }
  stopLoops() {}

  // ---------- damage hooks used by hurtEnemy ----------
  damageTakenMul() { const a = this.act; return this.stunT > 0 || (a && a.kind === 'whirl' && a.phase === 'vent') ? 1.3 : 1; }
  // nothing reaches it while it's between tears
  intercept() { return this.hidden; }
  // called when you parry it (a parry passes the knock; a hit's stagger doesn't, so no blow staggers it): a
  // parried throw drops the scythe and leaves it unarmed; a parried blow knocks it back off balance
  stagger(dur, kv) {
    if (this.dying || dur < 1.2 || !kv || this.stunT > 0) return;
    const c = this.chest();
    if (this.scytheOut) { this.disarm(); return; }
    this.act = { kind: 'flinch', t: 0, dur: 0.85 * lerp(1, 0.8, this.rageK()) };
    this.attack = null; this.lunge = null;
    this.vel.x = (kv.x || 0) * 0.4; this.vel.z = (kv.z || 0) * 0.4;
    FX.sparks(c, 26, { x: 0, y: 1, z: 0 }, TAU, 5.5, 22, REAP_GOLD);
    FX.ring(c, 0.3, 3.2, 0.3, { c: '#ffd070', flat: false });
    Sound.play('reapStagger', {}, c);
  }
  // its thrown scythe struck out of the air: it's left unarmed and reeling until it calls the scythe back
  disarm() {
    const s = this.scytheOut, c = this.chest();
    if (s) s.drop();
    this.act = null; this.attack = null; this.lunge = null;
    this.stunT = this.stunMax = RTHROW.DISARM;
    FX.ring(c, 0.3, 4, 0.35, { c: '#ffd070', flat: false });
    FX.text('DISARMED', { x: c.x, y: this.pos.y + this.h + 0.5, z: c.z }, { c: '#ffd070', scale: 1.4 });
    Sound.play('reapStagger', {}, c);
    Game.registerHit(12, 'reflect');
  }
  // the scythe is back in its hand: caught off a throw, or called back through a tear
  catchScythe(called) {
    this.scytheOut = null;
    const h = this.handR();
    if (called) { RiftViews.tear(h, { h: 2.6, w: 0.9, dur: 0.35 }); Sound.play('warp', { pm: 1.3 }, h); }
    FX.sparks(h, 12, null, TAU, 3, 10, REAP_SPARK);
    FX.light(h, REAP_VIOLET, 4, 6, 0.2);
    Sound.play('reapCatch', {}, h);
    const a = this.act;
    if (a && a.kind === 'throw') { this.act = { kind: 'recover', t: 0, dur: 0.3 * this.rageGap() }; this.cds.combo = 0.2; }
  }

  // ---------- souls ----------
  // A blow reached your health: part of what it took is torn out of you and hangs there.
  tearSoul(p, lost) {
    if (lost <= 0 || p.dead || this.dying) return;
    let s = Game.hazards.find((h) => h.kind === 'soul' && !h.dead);
    // knocked out of you to one side of the line between you, clear of you both
    const c = p.chest(), u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z), sd = chance(0.5) ? 1 : -1;
    let at = { x: c.x - u.z * sd * SOUL.OUT + u.x * 0.8, y: c.y + 0.2, z: c.z + u.x * sd * SOUL.OUT + u.z * 0.8 };
    if (World.pointSolid(at.x, at.y, at.z, 0.5)) at = { x: c.x + u.z * sd * SOUL.OUT + u.x * 0.8, y: c.y + 0.2, z: c.z - u.x * sd * SOUL.OUT + u.z * 0.8 };
    if (World.pointSolid(at.x, at.y, at.z, 0.5)) at = { x: c.x, y: c.y + 0.4, z: c.z };
    if (!s) { s = new TornSoul(this, at); Game.hazards.push(s); }
    s.add(lost * SOUL.SHARE, at);
    FX.slashLine(c, at, { w: 0.1, dur: 0.3, pal: 'void' });
    FX.sparks(c, 16, { x: 0, y: 1, z: 0 }, 1.4, 3, 10, Object.assign({ g: -3, life: 0.9 }, REAP_SPARK));
    FX.ring(c, 0.2, 2.2, 0.3, { c: '#d8b0ff', flat: false });
    Sound.play('soulTear', {}, c);
  }

  // ---------- update ----------
  update(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.t += dt; this.st += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.spawning) {
      if (this.intro) { this.updateIntro(dt); return; }
      // without the cutscene it still comes out of a tear
      if (!this.opened) { this.opened = true; RiftViews.tear(this.center(), { h: 4.2, w: 1.7, dur: this.spawnT + 0.35 }); Sound.play('tearOpen', {}, this.pos); }
      if (Math.random() < 0.5) this.suck(this.center(), 3);
      this.spawnT -= dt;
      if (this.spawnT <= 0) { Rift.burst(this.center(), 1.5); Sound.play('warp', { pm: 0.8 }, this.pos); this.arrive(true); }
      return;
    }
    for (const k in this.cds) this.cds[k] -= dt * (k === 'leap' ? 1 : S.enemies.aggression);
    for (const k of ['perilFlash', 'hitT']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    // the whirlwind's bullet time lasts exactly as long as its wind-up
    const a0 = this.act;
    if (Game.btOwner === this && Game.btKind === 'peril' && !(a0 && a0.kind === 'whirl' && a0.phase === 'wind')) Game.endBulletTime();
    if (this.dying) { this.updateDying(dt); return; }
    const p = Game.player;
    this.want = null;
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.stunT <= 0) { this.stunT = 0; if (this.scytheOut) this.catchScythe(true); this.act = { kind: 'recover', t: 0, dur: 0.35 }; this.cds.combo = 0.2; }
    } else {
      if (!this.act) this.chooseAct(p);
      if (this.act) this.runAct(dt, p);
      else this.navigate(dt, p);
      this.react(p);
    }
    this.presence(dt, p);
    this.physics(dt);
  }
  // motes drawn in to a point
  suck(c, r) {
    const u = coneDir(null, TAU), q = { x: c.x + u.x * r, y: c.y + u.y * r * 0.7, z: c.z + u.z * r };
    FX.sparks(q, 1, { x: -u.x, y: -u.y * 0.7, z: -u.z }, 0.05, r * 2.2, r * 2.8, Object.assign({ g: 0, life: 0.4 }, REAP_SPARK));
  }
  // what being near it does: violet motes off its cloak and blade, and your heart in your ears
  presence(dt, p) {
    if (this.hidden) return;
    if (Math.random() < 0.3) FX.sparks(this.local(rand(-0.5, 0.5), rand(0.4, 2.2), rand(-0.6, -0.2)), 1, { x: 0, y: 1, z: 0 }, 0.6, 0.4, 1.6, Object.assign({ g: -1.5, life: 1.1 }, REAP_SPARK));
    if (!this.scytheOut && Math.random() < 0.25) FX.sparks(this.bladePos(rand(0.1, 1)), 1, null, TAU, 0.3, 1.2, Object.assign({ g: -1, life: 0.6 }, REAP_SPARK));
    const k = reaperDread();
    if (k > 0.3 && (this.beatT -= dt) <= 0) { this.beatT = lerp(1.05, 0.5, k); Sound.play('heartbeat', { k }); }
  }

  // ---------- choosing what to do ----------
  chooseAct(p) {
    if (p.dead) return;
    const d = distXZ(p.pos, this.pos), dy = p.pos.y - this.pos.y, level = Math.abs(dy) < 2.4, rage = this.rageK();
    const clear = this.lineClear(p, d);
    // up close: the whirlwind when it's ready, or a string
    if (level && d < 7 && clear) {
      if (this.cds.whirl <= 0 && (rage > 0.2 || chance(0.35))) { this.startWhirl(p); return; }
      if (this.cds.combo <= 0) { this.startCombo(); return; }
      return;
    }
    if (this.cds.warp > 0 && level && d < 9) return;
    // from range, or from another level: the throw, the reaping, or through a tear to your side for a blow
    const opts = [];
    if (this.cds.warp <= 0) opts.push(['warp', 2.2 + rage]);
    if (this.cds.throw <= 0 && d > 8 && d < RTHROW.RANGE - 2 && this.clearShot(this.chest())) opts.push(['throw', 1.5]);
    if (this.cds.reap <= 0 && d > RREAP.MIN && d < RREAP.MAX && Math.abs(dy) < 5 && this.clearShot(this.chest())) opts.push(['reap', p.hp < RREAP.LOW ? 2.6 : 1.1]);
    if (!opts.length) return;
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pickd = opts[0][0];
    for (const [k, w] of opts) { if (r < w) { pickd = k; break; } r -= w; }
    if (pickd === 'throw') this.startThrow(p);
    else if (pickd === 'reap') this.startReap(p);
    else this.warpStrike(p);
  }
  lineClear(p, d) {
    const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    return !World.raycast({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, { x: u.x, y: 0, z: u.z }, Math.max(0.1, d - 0.5), 0.3);
  }
  // A threat from range it would rather not stand in front of: a sword beam near full, AEGIS's beam. It steps
  // through a tear out of the line.
  react(p) {
    const a = this.act;
    if ((a && a.kind !== 'recover') || this.cds.dodge > 0 || this.cds.warp > 0.6 || this.stunT > 0 || p.dead) return;
    const C = p.charging && p.charging.def.id === 'swordBeam' ? p.charging : null;
    if (!((C && C.k > 0.7) || p.beamAct) || distXZ(p.pos, this.pos) < 6) return;
    this.cds.dodge = rand(2.5, 4);
    if (chance(0.7)) this.warpStrike(p);
  }
  runAct(dt, p) {
    const a = this.act;
    a.t += dt;
    switch (a.kind) {
      case 'intro': if (a.t > 0.8) this.act = null; this.face(p.pos, 6); return;
      case 'recover': this.face(p.pos, 5); if (a.t > a.dur) this.act = null; return;
      case 'flinch':
        // knocked off balance; then it's gone, through a tear to somewhere it can start again
        if (a.t > a.dur) { this.act = null; this.cds.combo = 0.5; const q = this.warpSpot(p, 'far'); if (q) this.startWarp(q); }
        return;
      case 'melee': this.runMelee(dt, a, p); return;
      case 'warp': this.runWarp(dt, a, p); return;
      case 'throw': this.runThrow(dt, a, p); return;
      case 'whirl': this.runWhirl(dt, a, p); return;
      case 'reap': this.runReap(dt, a, p); return;
    }
  }
  // Between moves it drifts toward you, unhurried: it has no need to run.
  navigate(dt, p) {
    const d = distXZ(p.pos, this.pos);
    this.face(p.pos, 6);
    if (d > 4.2 && Math.abs(p.pos.y - this.pos.y) < 2.4 && this.lineClear(p, d) && !Foundry.crosses(this.pos, p.pos)) this.steerTo(p.pos, this.def.speed * S.enemies.speed * lerp(0.75, 1.1, this.rageK()));
  }

  // ---------- tears ----------
  // A clear spot to step out at: beside you ('flank'), behind you ('behind'), in front ('front'), or well away
  // ('far'). On your level, in sight of you, off the void.
  warpSpot(p, where) {
    const B = Arena.bounds(), py = p.onGround ? p.pos.y : World.groundAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
    if (py === -Infinity) return null;
    const back = p.yaw + Math.PI;
    for (let i = 0; i < 26; i++) {
      const w = i > 16 ? 'any' : where;
      const ang = w === 'behind' ? back + rand(-0.6, 0.6) : w === 'flank' ? p.yaw + (chance(0.5) ? 1 : -1) * rand(1.1, 2.0) : w === 'front' ? p.yaw + rand(-0.5, 0.5) : rand(0, TAU);
      // (on a ledge too small for that, right beside you)
      const R = where === 'far' ? rand(11, 17) : i > 21 ? rand(1.5, 2.6) : rand(RWARP.NEAR[0], RWARP.NEAR[1]) + (i > 16 ? 1.5 : 0);
      const x = p.pos.x + fwdX(ang) * R, z = p.pos.z + fwdZ(ang) * R;
      if (x < B.minX + 1.5 || x > B.maxX - 1.5 || z < B.minZ + 1.5 || z > B.maxZ - 1.5 || Foundry.lavaAt(x, z)) continue;
      const y = World.groundAt(x, z, py + 1.2);
      if (y === -Infinity || Math.abs(y - py) > 1.3 || !World.boxFree(x, y + 0.02, z, this.r, this.h)) continue;
      const dx = p.pos.x - x, dz = p.pos.z - z, l = Math.hypot(dx, dz) || 1;
      if (World.raycast({ x, y: y + 1.6, z }, { x: dx / l, y: 0, z: dz / l }, l - 0.4, 0.2)) continue;
      return { x, y, z };
    }
    return where === 'far' ? null : this.spotNear({ x: p.pos.x, y: py, z: p.pos.z }, 2.6, 5, true);
  }
  // Folds into a tear here and steps out at `to`. o.quick: mid-string; o.then: what it does as it arrives;
  // o.feint: a decoy tear that opens and shuts first.
  startWarp(to, o = {}) {
    this.attack = null; this.lunge = null;
    const q = !!o.quick, T = clamp(S.enemies.telegraph, 0.7, 1.4);
    this.act = { kind: 'warp', phase: 'out', t: 0, outT: q ? RWARP.QOUT : RWARP.OUT, goneT: (q ? RWARP.QGONE : rand(RWARP.GONE[0], RWARP.GONE[1])) * T, inT: q ? RWARP.QIN : RWARP.IN, to, then: o.then || null, feint: o.feint || null };
    RiftViews.tear(this.center(), { h: 3.8, w: 1.4, dur: this.act.outT + 0.25 });
    Sound.play('warp', {}, this.pos);
  }
  runWarp(dt, a, p) {
    if (a.phase === 'out') {
      if (Math.random() < 0.6) this.suck(this.center(), 2);
      if (a.t < a.outT) return;
      // gone: the body is already where it will step out, behind the world; the way out opens there now
      a.phase = 'gone'; a.t = 0; this.hidden = true;
      Rift.burst(this.center());
      const to = a.to, c = { x: to.x, y: to.y + this.h * 0.55, z: to.z };
      let delay = 0;
      if (a.feint) {
        const f = { x: a.feint.x, y: a.feint.y + this.h * 0.55, z: a.feint.z };
        RiftViews.tear(f, { h: 3.6, w: 1.3, dur: 0.34 });
        Sound.play('tearOpen', {}, f);
        delay = 0.24; a.goneT += delay;
      }
      RiftViews.tear(c, { h: 3.8, w: 1.4, dur: a.goneT - delay + a.inT + 0.22, delay });
      Game.queueCut(delay / Math.max(0.05, Game.slowScale), () => { if (!this.dead && this.act === a) Sound.play('tearOpen', {}, c); });
      Rift.shift(this, to);
      this.vel.x = this.vel.y = this.vel.z = 0; this.onGround = true;
      this.yaw = this.faceYaw = this.yawTo(p.pos);
      return;
    }
    if (a.phase === 'gone') {
      if (a.t < a.goneT) return;
      a.phase = 'in'; a.t = 0; this.hidden = false;
      this.yaw = this.faceYaw = this.yawTo(p.pos);
      Rift.burst(this.center(), 1.2);
      Sound.play('warp', { pm: 1.25 }, this.pos);
      return;
    }
    this.face(p.pos, 12);
    if (a.t < a.inT) return;
    this.act = null;
    this.cds.warp = rand(RWARP.CD[0], RWARP.CD[1]) * this.rageGap();
    if (a.then) a.then();
  }
  // through a tear to your side or your back, and straight into a blow; later in the fight, behind a decoy
  warpStrike(p) {
    const rage = this.rageK(), where = chance(0.45) ? 'behind' : chance(0.75) ? 'flank' : 'front';
    const q = this.warpSpot(p, where);
    if (!q) { this.cds.warp = 0.8; return; }
    const feint = rage > 0.4 && chance(0.4) ? this.warpSpot(p, where === 'behind' ? 'front' : 'behind') : null;
    this.startWarp(q, { feint, then: () => { if (!Game.player.dead) this.startCombo(true); } });
  }

  // ---------- blows ----------
  // quick: straight out of a tear, a short string
  startCombo(quick) {
    const rage = this.rageK();
    let opts = REAP_COMBOS.filter((c) => (quick ? c.length <= 3 && !c.includes('WARP') : rage > 0.25 || !c.includes('WARP')));
    if (!opts.length) opts = REAP_COMBOS.slice(0, 4);
    const combo = pick(opts);
    this.startMove(combo[0], { list: combo, i: 0 });
  }
  startMove(name, combo) {
    const m = REAP_MOVES[name], p = Game.player;
    this.attack = null; this.lunge = null;
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    const c = this.chest(), pc = p.chest(), d = distXZ(p.pos, this.pos), pa = clamp(Math.atan2(pc.y - c.y, Math.max(1.5, d)), -0.45, 0.45);
    this.act = { kind: 'melee', move: name, m, phase: 'wind', t: 0, wind: this.tele(m.wind) * (combo && combo.i > 0 ? 0.9 : 1), combo, glinted: false, hit: false, arc: { yaw: this.yaw, tilt: m.tilt, span: m.span, dir: m.dir, pa } };
    if (m.big) {
      const at = this.bladePos();
      FX.sparks(at, 18, null, TAU, 2, 9, Object.assign({ g: -2, life: 0.9 }, REAP_GOLD));
      FX.ring(c, 0.4, 3.6, 0.35, { c: '#ffd070', flat: false });
      FX.light(at, '#ffd070', 4, 8, 0.3);
      Sound.play('stopperWind', {}, this.center());
    } else Sound.play('reapWind', { pm: rand(0.9, 1.15) }, this.center());
  }
  runMelee(dt, a, p) {
    const m = a.m, c = this.chest(), d = distXZ(p.pos, this.pos), A = a.arc;
    if (a.phase === 'wind') {
      // it turns with you through most of the wind-up, and drifts in to keep you in reach
      const lead = { x: p.pos.x + p.vel.x * 0.15, z: p.pos.z + p.vel.z * 0.15 }, dl = Math.hypot(lead.x - this.pos.x, lead.z - this.pos.z);
      if (a.t < a.wind * 0.75) { this.face(lead, m.big ? 6 : 11); A.yaw = this.yaw; A.pa = clamp(Math.atan2(p.chest().y - c.y, Math.max(1.5, d)), -0.45, 0.45); }
      else this.faceYaw = this.yaw;
      if (dl > m.r - 1.4 && a.t < a.wind * 0.85) this.steerTo(lead, clamp((dl - m.r + 1.8) * 4, 2.5, 7));
      if (!a.glinted && a.t >= Math.max(0, a.wind - GLINT_LEAD)) {
        a.glinted = true;
        const at = this.bladePos();
        FX.glint(at, { c: '#ffd070', size: m.big ? 2.4 : 1.5, follow: () => this.bladePos(), threat: this });
        this.eyeGlint('#ffd070', m.big ? 1.4 : 0.9);
        if (m.big) { FX.ring(at, 0.3, 3.2, 0.28, { c: '#ffd070', flat: false }); FX.sparks(at, 20, null, TAU, 3, 12, Object.assign({ g: 0, life: 0.8 }, REAP_GOLD)); Sound.play('stopperCue', {}, c); }
        FX.light(at, '#ffd070', m.big ? 6 : 3.5, 8, 0.3);
        Sound.play('glint', {}, c);
      }
      if (a.t >= a.wind) this.beginBlow(a, m, p);
      return;
    }
    if (this.attack) this.attack.t = a.t;
    if (!a.hit && !p.dead && a.t > 0.02 && a.t < m.swing * 0.85 && arcHits(c, this.attack, m.r + 0.3, p, m.over ? 1.3 : 1.1)) {
      a.hit = true;
      const low = p.hp < RREAP.LOW, hp0 = p.hp;
      const res = p.takeHit({ dmg: m.dmg * this.dmgMul * (m.exec && low ? RREAP.EXEC : 1), from: c, kind: 'melee', source: this, knock: m.knock });
      if (this.act !== a) return;
      if (res === 'hit') {
        this.tearSoul(p, hp0 - p.hp);
        if (m.launch && !p.dead) { p.vel.y = Math.max(p.vel.y, m.launch); p.onGround = false; }
        // the hook drags you to its feet
        if (m.drag && !p.dead) { const u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z); p.vel.x = u.x * m.drag; p.vel.z = u.z * m.drag; }
        const pc = p.center(), f = this.fwd();
        FX.sparks(pc, m.big ? 26 : 14, { x: f.x, y: 0.3, z: f.z }, 1.3, 6, m.big ? 28 : 20, REAP_SPARK);
        FX.ring(pc, 0.3, m.big ? 3.4 : 2, 0.22, { c: REAP_VIOLET, flat: false });
        if (m.big) FX.flash('#a050ff', 0.18);
        Sound.play('reapHit', { heavy: !!m.big }, pc);
        Game.hitstop(m.big ? 0.09 : 0.05); Game.shake(m.big ? 0.4 : 0.2);
      }
    }
    // the cleave comes down hard enough to send a wave out along the ground
    if (m.wave && !a.waved && a.t > 0.1) {
      a.waved = true;
      if (this.onGround) {
        const f = this.fwd(), at = { x: this.pos.x + f.x * 3, y: this.pos.y, z: this.pos.z + f.z * 3 };
        Game.hazards.push(new GroundWave(at, 18 * S.enemies.speed, 9 * this.dmgMul, this));
        FX.ring({ x: at.x, y: at.y + 0.06, z: at.z }, 0.4, 5, 0.4, { c: REAP_VIOLET });
        FX.dust(at, 12, { c: '#2a2034', smax: 6, rise: 1.2 });
        FX.debris(at, 10, GRIT, 14);
        FX.decal('crack', at, { len: 3.4 });
        Sound.play('slam', {}, at);
        Game.shake(0.35);
      }
    }
    if (a.t >= m.swing) {
      this.attack = null;
      const cb = a.combo;
      if (cb && cb.i + 1 < cb.list.length && !p.dead) {
        cb.i++;
        if (cb.list[cb.i] === 'WARP') {
          // through a tear to the other side of you, and on with the string
          cb.i++;
          const q = this.warpSpot(p, chance(0.6) ? 'behind' : 'flank');
          if (q) { this.startWarp(q, { quick: true, then: () => this.startMove(cb.list[cb.i], cb) }); return; }
        }
        if (d < 11) { this.startMove(cb.list[cb.i], cb); return; }
      }
      this.act = { kind: 'recover', t: 0, dur: (m.big ? rand(0.65, 0.9) : rand(0.4, 0.6)) * this.rageGap() };
      this.cds.combo = rand(0.5, 1.0) * this.rageGap();
    }
  }
  beginBlow(a, m, p) {
    a.phase = 'swing'; a.t = 0; a.hit = false;
    const c = this.chest(), d = distXZ(p.pos, this.pos), f = this.fwd(), A = a.arc;
    this.attack = { yaw: A.yaw, tilt: m.tilt, span: m.span, dir: m.dir, t: 0, sweep: m.swing * 0.6, r: m.r, pa: A.pa };
    // the jet drives it into the blow, after where you're going, never past you
    const v = Math.min(m.lunge * 2.4, (Math.max(0, d - 2.6) / m.swing) * 2);
    this.lunge = { t: 0, dur: m.swing, vx: f.x * v, vz: f.z * v };
    FX.swoosh({ follow: this, oy: 2.0, x: c.x, y: c.y, z: c.z, yaw: A.yaw, tilt: m.tilt, pitch: A.pa, r: m.r * 0.92, span: m.span, dir: m.dir, sweep: m.swing * 0.6, dur: m.swing + 0.14, thick: m.big ? 0.6 : 0.45, pal: 'void', trail: 0.95, bolts: m.big ? 2 : 1 });
    const j = this.jetPos();
    FX.sparks(j, m.big ? 16 : 8, null, TAU, 3, 12, REAP_SPARK);
    FX.light(j, REAP_VIOLET, 4, 7, 0.2);
    Sound.play('reapSwing', { heavy: !!m.big }, c);
  }

  // ---------- the throw ----------
  startThrow(p) {
    this.attack = null; this.lunge = null;
    this.act = { kind: 'throw', phase: 'wind', t: 0, wind: this.tele(RTHROW.WIND), cued: false };
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.cds.throw = rand(RTHROW.CD[0], RTHROW.CD[1]);
    const j = this.jetPos();
    FX.sparks(j, 14, null, TAU, 2, 9, Object.assign({ g: -2, life: 0.8 }, REAP_GOLD));
    FX.light(j, '#ffd070', 4, 8, 0.3);
    Sound.play('reapThrowWind', {}, this.center());
  }
  runThrow(dt, a, p) {
    if (a.phase === 'wind') {
      if (a.t < a.wind * 0.85) this.face(p.pos, 7); else this.faceYaw = this.yaw;
      if (Math.random() < 0.7) this.suck(this.jetPos(), 1.6);
      if (!a.cued && a.t >= Math.max(0, a.wind - GLINT_LEAD)) { a.cued = true; this.eyeGlint('#ffd070', 1.2); FX.glint(this.bladePos(), { c: '#ffd070', size: 1.8, follow: () => this.bladePos(), threat: this }); Sound.play('glint', {}, this.center()); }
      if (a.t < a.wind) return;
      // it leaves the hand down the line to your chest, a little ahead of where you're going
      const from = this.local(0.6, 2.3, 0.8), pc = p.chest(), lead = clamp(dist3(from, pc) / RTHROW.SPEED, 0, 0.5) * 0.5;
      const dir = unit(pc.x + p.vel.x * lead - from.x, clamp(pc.y - from.y, -6, 6) * 0.9, pc.z + p.vel.z * lead - from.z);
      this.scytheOut = new ScytheThrow(this, from, dir);
      Game.projectiles.push(this.scytheOut);
      a.phase = 'out'; a.t = 0;
      FX.sparks(from, 16, dir, 0.8, 5, 18, REAP_SPARK);
      FX.ring(from, 0.3, 2.4, 0.2, { c: REAP_VIOLET, flat: false });
      Sound.play('reapThrow', {}, from);
      Game.shake(0.15);
      return;
    }
    // unarmed until it comes home: it holds its ground with its hand out
    this.face(p.pos, 4);
    if (!this.scytheOut || this.scytheOut.dead) { if (this.scytheOut) this.catchScythe(false); else this.act = null; }
    else if (a.t > 7) { this.scytheOut.dead = true; this.catchScythe(true); }
  }

  // ---------- the whirlwind ----------
  startWhirl(p) {
    this.attack = null; this.lunge = null;
    const wind = this.whirlWind();
    this.act = { kind: 'whirl', phase: 'wind', t: 0, wind, tick: 0, flashed: false, sw: 0 };
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.perilFlash = 0.16;
    this.cds.whirl = 99;
    Game.bulletTime(wind / RWHIRL.BT + 0.2, { kind: 'peril', scale: RWHIRL.BT, owner: this });
    Sound.play('peril', { dur: Math.max(0.1, (wind - CUE_LEAD) / RWHIRL.BT) });
    Sound.play('reapCharge', { dur: wind / RWHIRL.BT }, this.chest());
    const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, c = this.chest();
    FX.ring(g, RWHIRL.R, 0.6, 0.45, { c: '#ff2a3a' });
    FX.ring(c, 0.5, 6, 0.4, { c: '#ff2a3a', flat: false });
    FX.light(c, '#ff2a3a', 8, 16, 0.5);
    FX.flash('#ff2a3a', 0.2);
    Game.shake(0.3);
  }
  runWhirl(dt, a, p) {
    const c = this.chest(), d = distXZ(p.pos, this.pos), g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z };
    if (a.phase === 'wind') {
      const k = clamp(a.t / a.wind, 0, 1);
      this.face(p.pos, 3);
      // the jet screams: everything loose is drawn in to the blade, and the ground shakes
      for (let i = 0; i < 2; i++) this.suck(this.jetPos(), lerp(3.5, 1.5, k));
      if (Math.random() < 0.3) FX.ring(g, lerp(RWHIRL.R, 2.5, Math.random()), 0.5, 0.3, { c: '#ff2a3a' });
      if (Math.random() < 0.4) Game.shake(0.03 + 0.05 * k);
      if (!a.flashed && a.t >= a.wind - CUE_LEAD) { a.flashed = true; this.eyeGlint('#ffffff', 1.8); FX.glint(this.bladePos(), { c: '#ff2a3a', size: 2.6, follow: () => this.bladePos(), threat: this }); Sound.play('whirlLock', {}, c); }
      if (a.t < a.wind) return;
      a.phase = 'spin'; a.t = 0; a.tick = 0.05;
      if (Game.btOwner === this) Game.endBulletTime();
      FX.ring(g, 0.5, RWHIRL.R, 0.3, { c: '#ff2a3a' });
      FX.flash('#ff5a6a', 0.2);
      Sound.play('reapWhirl', { dur: RWHIRL.SPIN }, c);
      Game.shake(0.5);
      return;
    }
    if (a.phase === 'spin') {
      // round and round, the scythe out flat, drifting after you; the space round it leans in toward it
      this.yaw += 15 * dt; this.faceYaw = this.yaw;
      if (d > 1.5 && !Foundry.crosses(this.pos, p.pos)) this.steerTo(p.pos, RWHIRL.SPEED * S.enemies.speed * lerp(1, 1.3, this.rageK()));
      if (!p.dead && !p.ult && d > 1.2 && d < RWHIRL.R + 6 && Math.abs(p.pos.y - this.pos.y) < RWHIRL.H + 2) {
        const u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
        p.vel.x += u.x * RWHIRL.PULL * dt; p.vel.z += u.z * RWHIRL.PULL * dt;
      }
      if (Math.random() < 0.8) { const an = rand(0, TAU), r = rand(2, RWHIRL.R); FX.sparks({ x: this.pos.x + Math.cos(an) * r, y: this.pos.y + rand(0.2, 2.6), z: this.pos.z + Math.sin(an) * r }, 1, { x: -Math.sin(an), y: 0.1, z: Math.cos(an) }, 0.3, 8, 16, Object.assign({ g: 0, life: 0.35 }, REAP_SPARK)); }
      if ((a.sw -= dt) <= 0) {
        a.sw = 0.21;
        FX.swoosh({ follow: this, oy: 1.9, x: c.x, y: c.y, z: c.z, yaw: this.yaw, tilt: 0.04, r: RWHIRL.R * 0.95, span: TAU - 0.05, dir: 1, sweep: 0.2, dur: 0.32, thick: 0.7, pal: 'void', trail: 0.95, bolts: 1 });
        FX.dust(this.pos, 3, { c: '#2a2034', smax: 7, rise: 0.6 });
      }
      if ((a.tick -= dt) <= 0) {
        a.tick = RWHIRL.TICK;
        Props.slash((q) => distXZ(q.pos, this.pos) < RWHIRL.R, this.pos.y + 1.6, this.fwd());
        if (!p.dead && d < RWHIRL.R + p.r && p.pos.y < this.pos.y + RWHIRL.H && p.pos.y + p.h > this.pos.y - 0.4) {
          const hp0 = p.hp, res = p.takeHit({ dmg: RWHIRL.DMG * this.dmgMul, from: c, kind: 'melee', source: this, knock: RWHIRL.KNOCK, unparryable: true });
          if (this.act !== a) return;
          if (res === 'hit') {
            this.tearSoul(p, hp0 - p.hp);
            // it doesn't throw you clear: it drags you round with it, until you tear yourself out
            if (!p.dead) { const u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z); p.vel.x = u.x * 5 - u.z * 6; p.vel.z = u.z * 5 + u.x * 6; p.vel.y = Math.min(p.vel.y, 6); }
            const pc = p.center();
            FX.sparks(pc, 16, null, TAU, 6, 22, REAP_SPARK);
            Sound.play('reapHit', { heavy: true }, pc);
            Game.shake(0.3);
          }
        }
      }
      if (a.t < RWHIRL.SPIN) return;
      // the jet's spent: it drops to a knee on the scythe, smoking
      a.phase = 'vent'; a.t = 0;
      this.vel.x *= 0.3; this.vel.z *= 0.3;
      this.cds.whirl = rand(RWHIRL.CD[0], RWHIRL.CD[1]) * this.rageGap();
      FX.dust(this.jetPos(), 10, { c: '#6a6276', smax: 3, rise: 3, life: 1.6 });
      Sound.play('steam', {}, c);
      return;
    }
    if (Math.random() < 0.5) FX.dust(this.jetPos(), 1, { c: '#6a6276', smax: 1, rise: 2.4, life: 1.4 });
    if (a.t >= RWHIRL.VENT * this.rageGap()) { this.act = { kind: 'recover', t: 0, dur: 0.3 }; this.cds.combo = 0.3; }
  }

  // ---------- the reaping ----------
  startReap(p) {
    this.attack = null; this.lunge = null;
    this.act = { kind: 'reap', phase: 'reach', t: 0, reach: this.tele(RREAP.REACH) };
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.cds.reap = rand(RREAP.CD[0], RREAP.CD[1]);
    const h = this.handL();
    FX.glint(h, { c: '#d8b0ff', size: 1.8, dur: this.act.reach, follow: () => this.handL(), threat: this });
    FX.ring(h, 0.2, 2, 0.3, { c: REAP_VIOLET, flat: false });
    Sound.play('reapReach', { dur: this.act.reach }, this.center());
  }
  // the thread snaps: a dash broke it, or you got something solid between you
  snapReap(a, p) {
    const h = this.handL(), pc = p.chest();
    for (let i = 1; i < 6; i++) FX.sparks({ x: lerp(h.x, pc.x, i / 6), y: lerp(h.y, pc.y, i / 6), z: lerp(h.z, pc.z, i / 6) }, 4, null, TAU, 2, 9, REAP_SPARK);
    FX.ring(pc, 0.2, 2.4, 0.25, { c: '#ffffff', flat: false });
    Sound.play('reapSnap', {}, pc);
    if (a.phase === 'pull') { p.makeGhost('#ffffff', 0.4, 0.7); Game.slowmo(0.4, 0.3); }
    this.act = { kind: 'flinch', t: 0, dur: RREAP.WHIFF * this.rageGap() };
  }
  runReap(dt, a, p) {
    const d = distXZ(p.pos, this.pos), h = this.handL();
    this.face(p.pos, 10);
    if (p.dead) { this.act = null; return; }
    if (Math.random() < 0.6) { const pc = p.chest(), u = Math.random(); FX.sparks({ x: lerp(h.x, pc.x, u), y: lerp(h.y, pc.y, u), z: lerp(h.z, pc.z, u) }, 1, null, TAU, 0.5, 2, Object.assign({ g: 0, life: 0.4 }, REAP_SPARK)); }
    if (a.phase === 'reach') {
      if (a.t < a.reach) return;
      if (!this.clearShot(this.chest()) || d > RREAP.MAX + 4) { this.snapReap(a, p); return; }
      a.phase = 'pull'; a.t = 0;
      Sound.play('reapPull', {}, p.chest());
      FX.flash('#a050ff', 0.2);
      FPFX.kick('hit', { from: this.chest(), scale: 0.6 });
      return;
    }
    // hauled in: the space between you gives. A dash tears you loose.
    if (p.dashT > 0 || p.warpT > 0 || p.ult || p.iaido || !this.clearShot(this.chest())) { this.snapReap(a, p); return; }
    const u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    p.vel.x = u.x * RREAP.SPEED; p.vel.z = u.z * RREAP.SPEED;
    if (p.pos.y > this.pos.y + 0.5) p.vel.y = Math.min(p.vel.y, -4);
    if (((a.t * 20) | 0) !== (((a.t - dt) * 20) | 0)) p.makeGhost('#b060ff', 0.3, 0.5);
    if (d < RREAP.STOP || a.t >= RREAP.PULL) { p.vel.x *= 0.2; p.vel.z *= 0.2; this.startMove('execute', null); }
  }

  // ---------- physics ----------
  physics(dt) {
    const v = this.vel, p = Game.player, a = this.act;
    if (this.hidden) { v.x = v.y = v.z = 0; return; }
    if (this.lunge) {
      const L = this.lunge;
      L.t += dt;
      v.x = L.vx * (1 - L.t / L.dur); v.z = L.vz * (1 - L.t / L.dur);
      if (L.t >= L.dur) this.lunge = null;
    } else {
      const stunned = this.stunT > 0 || (a && (a.kind === 'flinch' || (a.kind === 'whirl' && a.phase === 'vent')));
      const W = !stunned && this.want ? this.want : null;
      const acc = (this.onGround ? 30 : 8) * dt;
      const [nx, nz] = approach2(v.x, v.z, W ? W.x * W.spd : 0, W ? W.z * W.spd : 0, W || this.onGround ? acc * (W ? 1 : 1.4) : 2 * dt);
      v.x = nx; v.z = nz;
    }
    v.y = Math.max(v.y - this.G * dt * Game.gravMul(), -50);
    World.moveBody(this, dt, { step: this.onGround ? 1.0 : 0 });
    // it never stands inside you: it gives way round you. Your dashes and drawn cuts pass through it.
    const passing = p.dashT > 0 || p.dashEndT > 0 || !!p.iaido || p.warpT > 0;
    if (!passing && !p.dead && p.pos.y < this.pos.y + this.h && p.pos.y + p.h > this.pos.y) {
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
    if (this.pos.y < -20) { const q = Arena.freeGroundAt(Arena.center().x, Arena.center().z, 1.2); this.pos.x = q.x; this.pos.y = q.y + 0.5; this.pos.z = q.z; v.x = v.y = v.z = 0; }
    const rate = this.turnRate || 8;
    this.yaw += clamp(angDiff(this.yaw, this.faceYaw), -rate * dt, rate * dt);
    this.turnRate = 8;
  }

  // ---------- entry ----------
  // From here it fights. quick: no cutscene (training, retries); otherwise the cutscene showed the title.
  arrive(quick) {
    this.spawning = false;
    if (quick) Game.announce(this.name, null, '#c080ff', 2.6);
    this.act = { kind: 'intro', t: quick ? 0 : 0.4 };
  }
  // Entry: a tear rips open in the air and widens, the light going out of everything round it; it steps out,
  // folded in its cloak, and the tear shuts behind it; it swings the scythe up and plants it as the blade
  // catches; and its title hits as it sweeps the scythe out wide.
  updateIntro(dt) {
    const I = this.intro, p = Game.player;
    if (!I.started) {
      I.started = true;
      if (!p.dead) Game.startCine({ kind: 'reaperIntro', focus: this, owner: this });
    }
    const C = Game.cine, own = C && C.owner === this;
    I.t += dt;
    const ct = (I.ct = own ? C.t : I.t);
    const once = (k) => (I.done[k] ? false : (I.done[k] = true));
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    const f = this.fwd(), tearAt = { x: I.at.x - f.x * RINTRO.BACK, y: I.g + 2.1, z: I.at.z - f.z * RINTRO.BACK };
    I.tearAt = tearAt;
    if (ct < RINTRO.STEP) {
      I.stage = 'tear';
      const k = ct / RINTRO.STEP;
      I.open = easeOutCubic(clamp(k * 1.4, 0, 1));
      if (once('open')) { Sound.play('tearOpen', {}, tearAt); Sound.play('reapArrive', { dur: RINTRO.STEP }, tearAt); FX.flash('#a050ff', 0.2); }
      for (let i = 0; i < 1 + k * 3; i++) this.suck(tearAt, 3 + 3 * k);
      if (Math.random() < 0.3) FX.bolt(tearAt, { x: tearAt.x + rand(-2, 2), y: tearAt.y + rand(-2, 2), z: tearAt.z + rand(-2, 2) }, 0.08, { outer: REAP_VIOLET, core: '#ffffff', jag: 0.3, w: 0.05 });
      Game.shake(0.02 + 0.05 * k);
      this.pos.x = this.prev.x = tearAt.x; this.pos.z = this.prev.z = tearAt.z;
    } else if (ct < RINTRO.IGNITE) {
      I.stage = 'step';
      if (once('step')) { Rift.burst(tearAt, 1.6); Sound.play('warp', { pm: 0.75 }, tearAt); FX.ring({ x: tearAt.x, y: I.g + 0.06, z: tearAt.z }, 0.4, 9, 0.6, { c: REAP_VIOLET }); Game.shake(0.4); }
      const u = easeOutCubic(clamp((ct - RINTRO.STEP) / 0.8, 0, 1));
      I.open = 1 - clamp((ct - RINTRO.STEP - 0.45) / 0.4, 0, 1);
      this.pos.x = this.prev.x = lerp(tearAt.x, I.at.x, u); this.pos.z = this.prev.z = lerp(tearAt.z, I.at.z, u);
      this.vel.x = f.x * 3 * (1 - u); this.vel.z = f.z * 3 * (1 - u);
    } else if (ct < RINTRO.TITLE) {
      I.stage = 'ignite'; I.open = 0;
      this.vel.x = this.vel.z = 0;
      this.pos.x = this.prev.x = I.at.x; this.pos.z = this.prev.z = I.at.z;
      if (ct >= RINTRO.IGNITE + 0.3 && once('lit')) {
        I.lit = true;
        if (own) C.zoom = 2;
        const b = this.bladePos(), g = { x: this.pos.x, y: I.g + 0.06, z: this.pos.z };
        FX.sparks(b, 40, null, TAU, 4, 18, REAP_SPARK);
        FX.ring(b, 0.3, 5, 0.4, { c: '#d8b0ff', flat: false });
        FX.ring(g, 0.4, 8, 0.5, { c: REAP_VIOLET });
        FX.light(b, '#c080ff', 9, 16, 0.6);
        FX.flash('#c080ff', 0.35);
        Sound.play('reapIgnite', {}, b);
        Game.shake(0.5);
      }
    } else {
      I.stage = 'title'; I.lit = true;
      if (once('title')) {
        if (own) { C.zoom = 1; C.big = { style: 'title', text: this.name, color: '#b060ff', tag: 'RIFT FRAME', sub: 'THE LAST HARVEST' }; C.bigT = 0; }
        const c = this.chest();
        Sound.play('titleHit'); Sound.play('reapSwing', { heavy: true }, c);
        FX.swoosh({ follow: this, oy: 2.0, x: c.x, y: c.y, z: c.z, yaw: this.yaw, tilt: 0.25, r: 4.4, span: 3.2, dir: 1, sweep: 0.3, dur: 0.5, thick: 0.6, pal: 'void', trail: 0.95, bolts: 2 });
        FX.ring(this.center(), 0.4, 8, 0.5, { c: REAP_VIOLET, flat: false });
        Game.shake(0.45);
      }
      if (ct >= RINTRO.END && once('end')) { this.endIntro(); return; }
    }
    this.pos.y = this.prev.y = I.g; this.onGround = true;
    this.cineShot('intro', ct, I.stage);
  }
  endIntro() {
    const I = this.intro;
    if (I) { this.pos.x = this.prev.x = I.at.x; this.pos.y = this.prev.y = I.g; this.pos.z = this.prev.z = I.at.z; this.onGround = true; this.vel.x = this.vel.z = 0; }
    this.intro = null;
    if (Game.cine && Game.cine.owner === this) Game.closeCine();
    this.arrive(false);
  }

  // ---------- knockout ----------
  // The last hit freezes into slow motion; it staggers, drops to a knee on its scythe as its lights fail, and
  // falls on its face. Whatever of you it was holding comes back.
  onDeath(o = {}) {
    if (this.dying) return;
    this.dying = true; this.hp = 0; this.koT = 0; this.hidden = false;
    this.act = null; this.attack = null; this.lunge = null; this.stunT = 0;
    if (this.scytheOut) { this.scytheOut.dead = true; this.scytheOut = null; }
    if (Game.btOwner === this) Game.endBulletTime();
    this.ko = { stage: 'impact', done: {}, rot: 0 };
    const p = Game.player, u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.vel.x = u.x * 8; this.vel.z = u.z * 8; this.vel.y = 7; this.onGround = false;
    const c = this.chest(), dir = o.dir || { x: u.x, y: 0.3, z: u.z };
    FX.texts = FX.texts.filter((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) > 5);
    const px = -dir.z, pz = dir.x, pl = Math.hypot(px, pz) || 1;
    FX.slashLine({ x: c.x - (px / pl) * 4, y: c.y - 0.6, z: c.z - (pz / pl) * 4 }, { x: c.x + (px / pl) * 4, y: c.y + 0.6, z: c.z + (pz / pl) * 4 }, { w: 0.45, dur: 0.22, grow: 0.01, pal: 'gold' });
    FX.ring(c, 0.4, 8.2, 0.8, { c: '#ffd070', flat: false });
    FX.ring(c, 0.2, 4.5, 0.6, { c: REAP_VIOLET, flat: false });
    FX.sparks(c, 60, dir, 2.2, 7.3, 38, REAP_SPARK);
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
    v.y = Math.max(v.y - this.G * dt, -40);
    World.moveBody(this, dt);
    const c = this.chest();
    if (ct < 1.3) {
      K.stage = 'impact';
      if (Math.random() < 0.5) FX.sparks(c, 2, null, TAU, 5.5, 20, REAP_SPARK);
    } else if (ct < 2.1) {
      K.stage = 'stagger';
      if (once('stagger')) { if (own) C.zoom = 1; const u = this.fwd(); v.x = -u.x * 3.5; v.z = -u.z * 3.5; Sound.play('steam', {}, c); }
      if (Math.random() < 0.5) FX.elec(this.local(rand(-0.5, 0.5), rand(1, 2.6), rand(-0.3, 0.3)), 0.6, 1, { outer: REAP_VIOLET, core: '#ffffff' });
    } else if (ct < 3.1) {
      K.stage = 'kneel';
      if (once('kneel')) { Sound.play('land', {}, this.pos); Sound.play('reapStagger', {}, c); FX.dust(this.pos, 10, { smax: 5 }); Game.shake(0.3); }
      if (Math.random() < 0.4) FX.sparks(this.local(rand(-0.5, 0.5), rand(0.6, 2.2), rand(-0.3, 0.3)), 1, { x: 0, y: 1, z: 0 }, 0.6, 1, 4, Object.assign({ g: -2, life: 1 }, REAP_SPARK));
    } else if (ct < 3.45) {
      K.stage = 'collapse'; K.rot = clamp((ct - 3.1) / 0.35, 0, 1);
    } else {
      K.stage = 'down'; K.rot = 1;
      const f = this.fwd(), h = { x: this.pos.x + f.x * 1.5, y: this.pos.y, z: this.pos.z + f.z * 1.5 };
      if (once('down')) {
        Sound.play('thud', {}, h);
        FX.dust(h, 20, { smax: 9, rise: 0.4 });
        FX.debris(h, 10, this.def.debris, 11);
        FX.decal('crack', h, { len: 3.2, dur: 10 });
        Game.shake(0.45);
      }
      if (ct >= 3.65 && once('big')) {
        if (own) { C.big = { text: 'KNOCKOUT', color: '#ffd070' }; C.bigT = 0; }
        Sound.play('ko');
        FX.flash('#fff4d0', 0.35);
        Game.shake(0.3);
      }
      if (ct >= 5.4 && once('finish')) this.finishKO();
    }
    this.cineShot('ko', ct, K.stage);
  }
  // hold-to-skip from Game: jump to the end of whichever cutscene it is running
  skipCine() {
    if (this.intro) { this.endIntro(); return; }
    if (this.dying && this.ko && !this.dead) {
      this.ko.stage = 'down'; this.ko.rot = 1; this.vel.x = this.vel.z = 0;
      this.finishKO();
    }
  }
  finishKO() {
    this.dead = true;
    this.husk = new ReaperHusk(this);
    Game.props.push(this.husk);
    Game.onKill(this, { cause: 'boss' });
    Game.closeCine();
    Sound.setIntensity(0.3);
    SaveData.unlocks.reaper = true;
    SaveData.bossKills++;
    saveProgress();
  }

  // ---------- the cutscene camera ----------
  cineShot(kind, ct, stage) {
    const C = Game.cine;
    if (!C || C.owner !== this || C.closing) return;
    const y = this.yaw, P = this.pos, at = (h) => ({ x: P.x, y: P.y + h, z: P.z });
    let s;
    if (kind === 'intro') {
      const I = this.intro, T = I.tearAt || at(2);
      if (stage === 'tear') s = { look: { x: T.x, y: T.y, z: T.z }, yaw: y + Math.PI + 0.3, pitch: 0.05, dist: lerp(13, 9, clamp(ct / RINTRO.STEP, 0, 1)), ease: 2 };
      else if (stage === 'step') s = { look: at(1.9), yaw: y + Math.PI + 0.5, pitch: 0.1, dist: 8, ease: 3 };
      else if (stage === 'ignite') s = { look: at(2.5), yaw: y + Math.PI - 0.35, pitch: 0.16, dist: 5.6, ease: 4 };
      else s = { look: at(2.2), yaw: y + Math.PI + 0.4 - (ct - RINTRO.TITLE) * 0.07, pitch: 0.05, dist: 6.6, ease: 3 };
    } else {
      if (stage === 'impact') s = { look: at(1.9), yaw: y + Math.PI / 2 + 0.2, pitch: 0.02, dist: 7, ease: 4 };
      else if (stage === 'down') s = { look: at(0.7), yaw: y + Math.PI * 0.75 + (ct - 3.45) * 0.1, pitch: -0.5, dist: 8.5, ease: 1.5 };
      else s = { look: at(1.6), yaw: y + Math.PI * 0.8 + (ct - 1.3) * 0.15, pitch: -0.06, dist: 6.6, ease: 2 };
    }
    C.shot = s;
  }
}

// REAP-R's scythe in the air: thrown down a line, into a tear at the end of it, out of another on your far side
// and home to its hand. It hits once on each pass; a parry on either drops it.
class ScytheThrow {
  constructor(owner, from, dir) {
    this.kind = 'scythe'; this.owner = owner; this.hostile = true; this.parryOnly = true;
    this.pos = { x: from.x, y: from.y, z: from.z }; this.dir = { x: dir.x, y: dir.y, z: dir.z };
    this.phase = 'out'; this.t = 0; this.dist = 0; this.spin = 0; this.dead = false; this.hidden = false; this.struck = false; this.life = 0; this.back = null;
  }
  // a pass at you: once per pass, as it reaches you
  strike() {
    const p = Game.player, O = this.owner;
    if (this.struck || p.dead) return;
    const pc = p.center();
    if (Math.hypot(pc.x - this.pos.x, pc.z - this.pos.z) > RTHROW.R + p.r || Math.abs(pc.y - this.pos.y) > 1.7) return;
    this.struck = true;
    const hp0 = p.hp, res = p.takeHit({ dmg: RTHROW.DMG * O.dmgMul, from: { x: this.pos.x - this.dir.x, y: this.pos.y, z: this.pos.z - this.dir.z }, kind: 'melee', source: O, knock: RTHROW.KNOCK });
    if (res === 'hit') {
      O.tearSoul(p, hp0 - p.hp);
      FX.sparks(pc, 18, this.dir, 1.3, 6, 22, REAP_SPARK);
      Sound.play('reapHit', { heavy: true }, pc);
      Game.shake(0.3);
    }
  }
  // parried out of the air
  drop() {
    if (this.dead) return;
    this.dead = true;
    FX.sparks(this.pos, 30, { x: 0, y: 1, z: 0 }, 1.6, 5, 20, REAP_GOLD);
    FX.debris(this.pos, 6, ['#4c4856', '#8a8692', '#b44aff'], 9);
    FX.ring(this.pos, 0.3, 3, 0.3, { c: '#ffd070', flat: false });
    Sound.play('reflect', {}, this.pos);
  }
  update(dt) {
    const O = this.owner, p = Game.player;
    this.t += dt; this.life += dt; this.spin += dt * 24;
    if (!O || O.dead || O.dying) { this.dead = true; return; }
    if (this.phase === 'out') {
      const step = RTHROW.SPEED * S.enemies.speed * dt;
      let hit = World.raycast(this.pos, this.dir, step + 0.7, 0.3);
      // thrown down at the street it doesn't bury itself: it skims on along it
      if (hit && hit.ny > 0.7 && Math.hypot(this.dir.x, this.dir.z) > 0.2) { const u = flat(this.dir.x, this.dir.z); this.dir = { x: u.x, y: 0, z: u.z }; this.pos.y = Math.max(this.pos.y, hit.y + 0.9); hit = World.raycast(this.pos, this.dir, step + 0.7, 0.3); }
      this.pos.x += this.dir.x * step; this.pos.y += this.dir.y * step; this.pos.z += this.dir.z * step; this.dist += step;
      if (Math.random() < 0.7) FX.sparks(this.pos, 1, null, TAU, 1, 5, Object.assign({ g: 0, life: 0.3 }, REAP_SPARK));
      this.strike();
      if (this.dead) return;
      if (hit || this.dist >= RTHROW.RANGE) {
        // into a tear at the end of its flight
        this.phase = 'gap'; this.t = 0; this.hidden = true; this.struck = false;
        RiftViews.tear(this.pos, { h: 3.2, w: 1.2, dur: 0.4 });
        Rift.burst(this.pos);
        Sound.play('warp', { pm: 1.4 }, this.pos);
      }
      return;
    }
    if (this.phase === 'gap') {
      if (!this.back && this.t >= RTHROW.GAP * 0.25) {
        // the way back opens past you, on the far side from its hand
        const pc = p.chest(), u = flat(pc.x - O.pos.x, pc.z - O.pos.z), h = World.raycast(pc, { x: u.x, y: 0, z: u.z }, RTHROW.FAR + 1, 0.4), far = h ? Math.max(1.5, h.t - 1.2) : RTHROW.FAR;
        this.back = { x: pc.x + u.x * far, y: pc.y + 0.2, z: pc.z + u.z * far };
        RiftViews.tear(this.back, { h: 3.2, w: 1.2, dur: RTHROW.GAP * 0.75 + 0.4 });
        Sound.play('tearOpen', {}, this.back);
      }
      if (this.t < RTHROW.GAP) return;
      this.phase = 'back'; this.t = 0; this.hidden = false;
      this.pos.x = this.back.x; this.pos.y = this.back.y; this.pos.z = this.back.z;
      Rift.burst(this.pos);
      return;
    }
    // home to its hand, through wherever you're standing
    const h = O.handR(), dx = h.x - this.pos.x, dy = h.y - this.pos.y, dz = h.z - this.pos.z, l = Math.hypot(dx, dy, dz) || 1, step = RTHROW.BACK * S.enemies.speed * dt;
    this.dir = { x: dx / l, y: dy / l, z: dz / l };
    if (l <= step + 1 || this.life > 6) { this.dead = true; return; }
    this.pos.x += this.dir.x * step; this.pos.y += this.dir.y * step; this.pos.z += this.dir.z * step;
    if (Math.random() < 0.7) FX.sparks(this.pos, 1, null, TAU, 1, 5, Object.assign({ g: 0, life: 0.3 }, REAP_SPARK));
    this.strike();
  }
}

// Part of you, torn out by a blow: it hangs where you were struck, drifting to REAP-R. Reach it first.
class TornSoul {
  constructor(owner, at) {
    this.kind = 'soul'; this.owner = owner; this.pos = { x: at.x, y: at.y, z: at.z }; this.held = 0; this.t = 0; this.dead = false; this.pulse = 0; this.arm = SOUL.ARM;
  }
  center() { return this.pos; }
  add(n, at) {
    // a fresh tear joins the one already out, where the new one was struck
    if (this.held > 0) { this.pos.x = (this.pos.x + at.x) / 2; this.pos.y = (this.pos.y + at.y) / 2; this.pos.z = (this.pos.z + at.z) / 2; }
    this.held = Math.min(SOUL.MAX, this.held + n); this.t = Math.min(this.t, SOUL.LIFE * 0.4); this.pulse = 1; this.arm = SOUL.ARM;
  }
  // back where it belongs
  restore(P) {
    this.dead = true;
    const n = Math.max(1, Math.round(this.held));
    P.heal(n);
    FX.text('+' + n, { x: P.pos.x, y: P.pos.y + P.h + 0.6, z: P.pos.z }, { c: '#d8b0ff', scale: 1.3 });
    FX.sparks(P.chest(), 24, { x: 0, y: 1, z: 0 }, TAU, 3, 12, Object.assign({ g: -2, life: 0.8 }, REAP_SPARK));
    FX.ring(P.chest(), 2.4, 0.4, 0.3, { c: '#d8b0ff', flat: false });
    FX.flash('#c8a0ff', 0.15);
    Sound.play('soulBack');
  }
  update(dt) {
    this.t += dt; this.pulse = Math.max(0, this.pulse - dt * 2); this.arm = Math.max(0, this.arm - dt);
    const P = Game.player, O = this.owner;
    if (!P || P.dead) { this.dead = true; return; }
    if (!O || O.dead || O.dying) { this.restore(P); return; }
    if (Math.random() < 0.5) FX.sparks({ x: this.pos.x + rand(-0.3, 0.3), y: this.pos.y + rand(-0.4, 0.5), z: this.pos.z + rand(-0.3, 0.3) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 0.4, 1.6, Object.assign({ g: -1.5, life: 0.8 }, REAP_SPARK));
    const pc = P.chest();
    if (this.arm <= 0 && dist3(pc, this.pos) < SOUL.R + P.r) { this.restore(P); return; }
    // it's reeled in, faster as its time runs out
    const oc = O.chest(), dx = oc.x - this.pos.x, dy = oc.y - 0.3 - this.pos.y, dz = oc.z - this.pos.z, l = Math.hypot(dx, dy, dz) || 1;
    if (!O.hidden) {
      const v = SOUL.DRIFT * (1 + 2 * clamp(this.t / SOUL.LIFE, 0, 1)) * dt;
      this.pos.x += (dx / l) * v; this.pos.y += (dy / l) * v; this.pos.z += (dz / l) * v;
    }
    if (this.t > SOUL.LIFE || (!O.hidden && this.arm <= 0 && l < SOUL.REAP_R)) {
      // reaped
      this.dead = true;
      const n = Math.round(this.held * SOUL.HEAL);
      O.hp = Math.min(O.maxHp, O.hp + n);
      FX.text('+' + n, { x: oc.x, y: O.pos.y + O.h + 0.5, z: oc.z }, { c: '#b060ff', scale: 1.4 });
      FX.sparks(this.pos, 20, { x: dx / l, y: dy / l, z: dz / l }, 0.6, 6, 18, REAP_SPARK);
      FX.ring(oc, 3, 0.5, 0.35, { c: REAP_VIOLET, flat: false });
      FX.light(oc, REAP_VIOLET, 6, 10, 0.4);
      Sound.play('soulReaped', {}, oc);
    }
  }
}

// What's left of REAP-R after a knockout: the body lying where it fell (render.js hands it over), its lights
// out, until the next wave.
class ReaperHusk {
  constructor(r) {
    this.kind = 'husk';
    const f = r.fwd();
    this.pos = { x: r.pos.x + f.x * 1.4, y: r.pos.y, z: r.pos.z + f.z * 1.4 }; this.rig = null;
    this.r = 1.3; this.h = 0.9; this.dead = false; this.t = 0; this.wave = Director.wave; this.fade = 0;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }; }
  hit() { FX.sparks(this.center(), 6, null, TAU, 3, 10, REAP_SPARK); }
  update(dt) {
    this.t += dt;
    if (!this.fade && Director.wave !== this.wave) {
      // a tear takes what's left of it
      this.fade = 0.001;
      RiftViews.tear(this.center(), { h: 1.6, w: 3.2, dur: 0.6, roll: Math.PI / 2 });
      Sound.play('warp', { pm: 0.7 }, this.pos);
    }
    if (this.fade) { this.fade += dt; if (this.fade > 0.5) this.dead = true; }
    if (Math.random() < 0.04) FX.sparks({ x: this.pos.x + rand(-0.8, 0.8), y: this.pos.y + 0.3, z: this.pos.z + rand(-0.8, 0.8) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 0.4, 1.4, Object.assign({ g: -1, life: 1 }, REAP_SPARK));
  }
}
