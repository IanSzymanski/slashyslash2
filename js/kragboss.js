'use strict';
// KRAG, the Molten Fist: a hulking cyborg brawler (its body is in krag.js). Violent, rough and brutal, and
// unrelenting: it always presses in and fights with everything it has, fists, knees and feet.
//   Heat. It runs hot: exertion, pain, landing blows and above all blows it blocks build heat, shown on the
//   body (seams glowing from dull red to white, steam, embers, the mohawk of flame growing). At full heat the
//   mohawk tears up off its head with an orange pulse, and it can throw the Molten Fist.
//   Combos. Fast strings of jabs, hooks, elbows, knees and kicks that drive straight through a parry: you take
//   no damage but you're shoved back, it isn't staggered, and you get no counter. Dodging leads it on. Each
//   string ends on a stopper (a haymaker, an uppercut, a hammer fist, a spinning backfist, a flying knee) with a
//   long wind-up and a big gold glint; parry that and it's knocked back off balance, open for the counter.
//   The block. It only guards when you're a threat: at range (a charging sword beam, gunfire, AEGIS's beam) or
//   right after you've staggered it. Its onyx arm comes up and takes blows from the front for a fraction of
//   their damage, and every blow it blocks builds heat. Fill it to full heat while it guards and it drops the
//   guard straight into the Molten Fist. It knows a charged arm is a liability, so at full heat it only guards
//   when you bait it: stagger it, or come at it from range with something big. Hit the arm then and all of it
//   goes off in its face: big damage, a blast that throws it back, and a stun. That's the only stun it has.
//   The Molten Fist (its red flash): a long wind-up in bullet time with the arm drawn back, a red wedge on the
//   street along the line it will drive, tracking you until its visor flashes; then it lunges and the fist
//   explodes along that line. No parry stops it and a dash's protection doesn't save you in front of it: dash
//   out of the wedge on the flash. It hits for a lot, throws you and leaves you dazed. A miss leaves it venting.
//   Getting to you: long shoulder charges that end in an explosion, leaps that land on you, stomps that send a
//   shockwave round and raise molten vents out of the street, and its tether: a chain from the right hand onto
//   a lamp post or a corner that it swings round to build speed and fling itself at you. Everywhere it walks it
//   leaves smouldering footprints.
// The last hit plays a slow-motion knockout and leaves its husk in the street.

ENEMY_DEFS.krag = { hp: 1500, r: 0.8, h: 2.9, speed: 5.6, score: 6000, mass: 9, dmg: 6, heavy: true, climb: 99, debris: ['#9a6440', '#7c4c30', '#2e2834', '#1e1a24', '#ff6a1a', '#c08a44'] };
ENEMY_BASE_STATE.krag = 'fight';

const KRAG_SPARK = { c0: '#fff4d0', c1: '#ffa040', c2: '#a02a08' };
const KRAG_FIRE = { c0: '#fff0c0', c1: '#ff7a1a', c2: '#7a1a04' };
const KRAG_STEAM = '#9a9296';
const KRAG_ORANGE = '#ff7a2a';
PALETTES.molten = [[255, 248, 220], [255, 190, 80], [255, 96, 24], [120, 24, 6]];
PAL_LIN.molten = PALETTES.molten.map((c) => c.map(_lin));
// Heat, 0 to MAX: per second of fighting, per blow it lands on you or that you parry, per stomp, per point of
// damage it takes; no heat for VENT seconds after it discharges
const HEAT = { MAX: 100, EXERT: 1.0, LAND: 5, PARRIED: 3, STOMP: 4, PAIN: 0.1, VENT: 3.5 };
// The block: the share of a blow's damage that gets through, the cosine of its half-width, and the first
// seconds of a guard after a stagger in which it won't shove you off
const BLOCK = { MUL: 0.15, COS: 0.34 };
// The Molten Fist: wind-up (s, before the telegraph setting), its bullet time's speed, the lunge's speed and
// longest length, the blast's cone (length and half-angle) and its radius round the fist, damage, knock, how
// long it dazes you, and the vent after it
const FIST = { WIND: 1.05, BT: 0.7, SPEED: 42, LUNGE: 8, CONE: 12, HALF: 0.6, R: 4.4, DMG: 42, KNOCK: 40, DAZE: 1.0, VENT: 1.6 };
// its arm going off in its face: a share of its health, and the stun
const DETONATE = { DMG: 0.12, STUN: 3.4 };
// the shoulder charge, the leap onto you and the tether swing (radius round the pivot, speeds from and to, how
// far round it has to go before it lets go, and its flight speed)
const KCHARGE = { WIND: 0.42, SPEED: 28, MAX: 22, DMG: 22, KNOCK: 30 };
const KJUMP = { WIND: 0.42, LIFT: 5, DMG: 26, R: 3.2 };
const KSWING = { R: 3.9, V0: 12, V1: 30, ACC: 30, MIN: 1.6, FLY: 32, DMG: 28 };
// what it won't swing round: the ground, the plaza, the arena's walls
const SWING_SKIP = new Set(['ground', 'plaza', 'bound']);
// a molten vent: radius, seconds of glowing crack before it erupts, seconds it erupts, damage
const VENT = { R: 1.35, TELL: 0.55, ERUPT: 0.45, DMG: 14 };

// Its blows. pose names the limb and motion (krag.js); wind = telegraph; swing = active time; r = reach from the
// chest. kind 'line' is a straight blow along the aim, 'arc' a swing (tilt from level, span), 'spin' all round.
// stopper: the big blows that end a string; parry one to stagger it. The rest plow through a parry.
const KRAG_MOVES = {
  jab: { pose: 'jabR', limb: 'R', wind: 0.24, swing: 0.14, r: 2.7, dmg: 9, knock: 12, kind: 'line', lunge: 6 },
  cross: { pose: 'crossR', limb: 'R', wind: 0.28, swing: 0.16, r: 3.0, dmg: 12, knock: 15, kind: 'line', lunge: 8 },
  elbow: { pose: 'elbowR', limb: 'R', wind: 0.24, swing: 0.14, r: 2.4, dmg: 11, knock: 14, kind: 'arc', span: 1.8, tilt: 0.2, lunge: 5 },
  hook: { pose: 'hookL', limb: 'L', wind: 0.32, swing: 0.18, r: 3.0, dmg: 14, knock: 18, kind: 'arc', span: 2.4, tilt: 0.1, lunge: 6, dir: -1 },
  knee: { pose: 'kneeR', limb: 'F', wind: 0.26, swing: 0.16, r: 2.3, dmg: 12, knock: 12, kind: 'line', low: true, launch: 10, lunge: 6 },
  kick: { pose: 'kickR', limb: 'F', wind: 0.32, swing: 0.18, r: 3.3, dmg: 12, knock: 26, kind: 'line', low: true, lunge: 4 },
  shove: { pose: 'shove', limb: 'L', wind: 0.22, swing: 0.16, r: 2.9, dmg: 8, knock: 24, kind: 'line', lunge: 6 },
  haymaker: { pose: 'hayL', limb: 'L', wind: 0.55, swing: 0.2, r: 3.4, dmg: 26, knock: 28, kind: 'arc', span: 1.6, tilt: 1.15, dir: -1, lunge: 12, stopper: true },
  uppercut: { pose: 'upL', limb: 'L', wind: 0.5, swing: 0.2, r: 3.0, dmg: 22, knock: 14, kind: 'arc', span: 1.4, tilt: 1.4, dir: 1, launch: 24, lunge: 7, stopper: true },
  hammer: { pose: 'hammer', limb: 'B', wind: 0.6, swing: 0.22, r: 3.3, dmg: 24, knock: 24, kind: 'arc', span: 1.2, tilt: 1.45, dir: -1, quake: true, lunge: 5, stopper: true },
  spinFist: { pose: 'spinL', limb: 'L', wind: 0.5, swing: 0.32, r: 3.5, dmg: 22, knock: 26, kind: 'spin', lunge: 4, stopper: true },
  flyKnee: { pose: 'flyKnee', limb: 'F', wind: 0.45, swing: 0.3, r: 2.6, dmg: 24, knock: 22, kind: 'line', leapV: 9, lunge: 16, launch: 18, stopper: true },
};
const KRAG_COMBOS = [
  ['jab', 'cross', 'hook', 'haymaker'], ['jab', 'jab', 'knee', 'uppercut'], ['hook', 'cross', 'kick'],
  ['elbow', 'hook', 'hammer'], ['jab', 'cross', 'jab', 'spinFist'], ['knee', 'elbow', 'flyKnee'],
  ['cross', 'hook', 'hook', 'haymaker'], ['jab', 'hook', 'uppercut'], ['kick', 'jab', 'cross', 'hammer'],
];

class Krag extends Boss {
  constructor(pos, scale = {}) {
    super('krag', pos, scale);
    this.name = 'KRAG'; this.G = 64; this.LEAP_G = 0.8;
    this.barCol = '#ff7a2a'; this.barHi = '#ffc890'; this.barName = '#ffc8a0';
    this.spawnT = 1.5; this.heat = 0; this.ventT = 0; this.pulseT = 0; this.flared = false;
    this.stunT = 0; this.stunMax = 1; this.transT = 0; this.perilFlash = 0; this.hitT = 0; this.rangedHurt = 0;
    this.act = null; this.attack = null; this.lunge = null; this.drive = null;
    this.cds = { combo: 0.6, closer: 0, stomp: 3, charge: 2, jump: 4, swing: 5, punch: 0, guard: 0, leap: 0 };
    this.lastDir = 1; this.dying = false; this.ko = null; this.koT = 0; this.intro = null; this.husk = null; this.tilt = 0;
    this.steamT = 0;
  }
  cinematicIntro() {
    const g = this.pos.y;
    this.intro = { t: 0, ct: 0, stage: 'fall', done: {}, started: false, g, lit: false };
    this.yaw = this.faceYaw = this.yawTo(Game.player.pos);
    this.pos.y = this.prev.y = g + 40;
  }

  // ---------- where its parts are ----------
  chest() { return { x: this.pos.x, y: this.pos.y + 2.0, z: this.pos.z }; }
  visorPos() { return this.boneAt('head', 0, 0.1, -0.2) || this.local(0, 2.5, 0.3); }
  fistPos() { return this.boneAt('handL', 0, -0.2, -0.02) || this.local(-0.7, 1.4, 0.4); }
  fistR() { return this.boneAt('handR', 0, -0.1, -0.02) || this.local(0.6, 1.4, 0.3); }
  footPos(side) { return this.boneAt('foot' + side, 0, -0.1, -0.1) || this.local(side === 'R' ? 0.3 : -0.3, 0.1, 0.2); }
  crestPos() { return this.boneAt('mohawk', 0, 0.05, 0) || this.local(0, 2.9, 0.1); }
  handPlant() { const p = this.local(-0.7, 0, 1.0); p.y = World.groundAt(p.x, p.z, p.y + 0.6) + 0.12; return p; }
  limbPos(l) { return l === 'R' ? this.fistR() : l === 'F' ? this.footPos('R') : this.fistPos(); }
  showModel() { return !this.spawning || !!this.intro; }
  charged() { return this.heat >= HEAT.MAX; }
  heatK() { return clamp(this.heat / HEAT.MAX, 0, 1); }
  // 0 at full health, 1 near death; later it recovers faster
  rageK() { return clamp(1 - this.hp / this.maxHp, 0, 1); }
  rageGap() { return lerp(1, 0.65, this.rageK()); }
  runSpeed() { return this.def.speed * S.enemies.speed * (this.charged() ? 1.15 : 1) * lerp(1, 1.15, this.rageK()); }
  windOf(m) { return this.tele(m.wind); }
  // the Molten Fist speeds up less than the rest on the harder settings, as the rival's red flash does
  fistWind() { const T = S.enemies.telegraph; return FIST.WIND * (T < 1 ? 1 - (1 - T) * 0.55 : T); }

  // ---------- state readers for the model and views ----------
  windingUp() {
    const a = this.act;
    if (!a) return false;
    return (a.kind === 'melee' && a.phase === 'wind') || (a.kind === 'punch' && a.phase === 'wind') || (a.kind === 'charge' && a.phase === 'wind') ||
      (a.kind === 'jump' && a.phase !== 'land') || (a.kind === 'stomp' && a.phase === 'wind') || (a.kind === 'swing' && a.phase !== 'land');
  }
  emissive() {
    if (this.dead) return 0;
    if (this.hitFlash > 0) return 0.8;
    if (this.dying && this.ko && this.ko.stage === 'impact' && ((this.t * 40) | 0) % 2) return 0.7;
    if (this.cutMark && ((Game.realTime * 30) | 0) % 2) return 0.6;
    return 0;
  }
  // the outline: red through the Molten Fist's wind-up, white hot while a charged arm is up to guard
  outline() {
    const a = this.act;
    if (this.dying || this.spawning) return null;
    if (a && a.kind === 'punch' && a.phase === 'wind') return this.perilFlash > 0 && ((this.t * 30) | 0) % 2 ? '#ffffff' : '#ff2a3a';
    if (a && a.kind === 'guard' && a.charged) return ((this.t * 14) | 0) % 2 ? '#fff0c8' : '#ff8a2a';
    return null;
  }
  // The colours of its molten light: from dull red cold to white hot at full heat, flickering there; the onyx
  // arm runs a step hotter, and white while its charge is up to guard or winding into the Fist. Dark knocked out.
  tints() {
    const P = this._tint || (this._tint = {}), C = KRAG_COL, a = this.act, k = this.heatK();
    if (this.dying && this.ko && (this.ko.stage === 'collapse' || this.ko.stage === 'down' || (this.ko.stage === 'kneel' && ((this.t * 10) | 0) % 3 === 0))) {
      for (const t of ['vein', 'avein', 'visor', 'core', 'toe', 'knuck']) P[t] = C.off;
      return P;
    }
    const ramp = ['#5a1606', '#8a2a0a', '#b8400e', '#e05414', '#ff6a1a', '#ff8a2a', '#ffa840', '#ffc460', '#ffd890'];
    const at = (u) => ramp[clamp(Math.round(u * (ramp.length - 1)), 0, ramp.length - 1)];
    const flick = ((this.t * 18) | 0) % 2, max = this.charged();
    const stunned = this.stunT > 0, intro = this.intro && !this.intro.lit;
    P.vein = intro ? C.dim : stunned ? at(0.15) : max && flick ? '#ffe8b0' : at(0.35 + 0.6 * k);
    const hotArm = (a && a.kind === 'punch' && a.phase === 'wind') || (a && a.kind === 'guard' && a.charged);
    P.avein = intro ? C.dim : stunned || (a && a.kind === 'punch' && a.phase === 'vent') ? '#3a1408' : hotArm ? (flick ? '#ffffff' : '#ffd060') : max && flick ? '#fff0c8' : at(0.45 + 0.55 * k);
    P.knuck = P.avein;
    P.visor = intro ? C.dim : this.windingUp() && flick ? '#ffffff' : '#ff9a30';
    P.core = intro ? C.dim : max ? (flick ? '#ffffff' : '#ffd060') : at(0.55 + 0.45 * k);
    P.toe = intro ? C.dim : at(0.4 + 0.5 * k);
    return P;
  }
  laser() { return 0; }
  stopLoops() {}

  // ---------- damage hooks used by hurtEnemy ----------
  damageTakenMul() { return this.stunT > 0 ? 1.35 : 1; }
  // its blows meet a parry and drive on through it (no counter); only a stopper can be caught
  clashes() { return !this.stopperNow(); }
  stopperNow() {
    const a = this.act;
    return !!a && ((a.kind === 'melee' && a.m.stopper) || (a.kind === 'charge' && a.phase === 'run') || (a.kind === 'jump') || (a.kind === 'swing' && a.phase === 'fly'));
  }
  // hits it takes on the guard: blocked from the front
  intercept(o, dmg) {
    if (this.transT > 0) return true;
    const a = this.act;
    if (a && a.kind === 'guard' && !this.dying && this.blocks(o)) { this.blockHit(o, dmg || 0); return true; }
    return false;
  }
  // whether a blow comes at it from the front: against the way it travels, or from you
  blocks(o) {
    if (o.cause === 'strike' || o.cause === 'fall') return false;
    const p = Game.player, d = o.dir;
    let ux, uz;
    if (d && Math.hypot(d.x, d.z) > 0.3) { ux = -d.x; uz = -d.z; } else { ux = p.pos.x - this.pos.x; uz = p.pos.z - this.pos.z; }
    const l = Math.hypot(ux, uz) || 1, f = this.fwd();
    return (ux * f.x + uz * f.z) / l > BLOCK.COS;
  }
  onHurt(d, o) {
    if (o.ranged) this.rangedHurt += d;
    this.addHeat(d * HEAT.PAIN);
  }
  // Adds heat; true when this takes it to full.
  addHeat(n) {
    if (this.ventT > 0 || this.dying || this.spawning || n <= 0) return false;
    const was = this.heat < HEAT.MAX;
    this.heat = Math.min(HEAT.MAX, this.heat + n);
    if (was && this.heat >= HEAT.MAX) { this.onCharged(); return true; }
    return false;
  }
  // full heat: the mohawk tears up off its head with an orange pulse, and it roars
  onCharged() {
    this.pulseT = 0.9; this.flared = true;
    const h = this.crestPos(), c = this.chest();
    FX.sparks(h, 40, { x: 0, y: 1, z: 0 }, 1.1, 6, 20, Object.assign({ g: -6, life: 1.4 }, KRAG_FIRE));
    FX.embers(h, 20);
    FX.ring(c, 0.5, 9, 0.55, { c: KRAG_ORANGE, flat: false });
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.5, 7, 0.45, { c: '#ffb040' });
    FX.light(h, '#ff8a2a', 8, 14, 0.5);
    FX.flash('#ff8a3a', 0.18);
    Sound.play('heatMax', {}, h);
    Sound.play('kragRoar', {}, c);
    Game.shake(0.35);
    const a = this.act;
    if (!this.stunT && (!a || a.kind === 'recover')) this.act = { kind: 'flare', t: 0 };
  }
  // A blow on the guard: most of it is stopped and it all goes into the arm as heat. Filled to full on the
  // guard, it drops it straight into the Molten Fist; already full when it raised it, the arm goes off.
  blockHit(o, dmg) {
    const a = this.act, p = Game.player;
    if (a.charged) { this.detonate(o); return; }
    const small = o.cause === 'round', beam = o.cause === 'laser';
    const heat = small ? 1.6 + dmg * 0.15 : beam ? 2 + dmg * 0.3 : clamp(4 + dmg * 0.7, 4, o.heavy ? 36 : 28);
    const d = Math.max(1, Math.round(dmg * BLOCK.MUL));
    this.hp = Math.max(1, this.hp - d);
    this.hitT = 0.15; a.hitT = 0.15; a.blocked = (a.blocked || 0) + 1;
    const at = this.fistPos(), u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    FX.text(String(d), { x: at.x, y: this.pos.y + this.h + 0.4, z: at.z }, { c: '#a8a0a8' });
    Game.registerHit(d, o.cause);
    if (!small || !this._blkT || Game.time > this._blkT) {
      this._blkT = Game.time + 0.1;
      FX.sparks({ x: at.x + u.x * 0.4, y: at.y, z: at.z + u.z * 0.4 }, small ? 4 : o.heavy ? 22 : 12, { x: u.x, y: 0.3, z: u.z }, 1.5, 5, 18, KRAG_SPARK);
      FX.light(at, '#ff8a2a', small ? 1.5 : 4, 6, 0.12);
      Sound.play('kragBlock', { heavy: !!o.heavy }, at);
      if (!small) { Game.hitstop(0.03); Game.shake(o.heavy ? 0.2 : 0.08); }
    }
    this.vel.x -= u.x * (small ? 0.3 : o.heavy ? 4 : 2); this.vel.z -= u.z * (small ? 0.3 : o.heavy ? 4 : 2);
    if (this.addHeat(heat)) this.startPunch(p, true);
  }
  // The charged arm takes a blow on the guard and all its heat goes off in its face: big damage, a blast that
  // throws it back, and the only stun it has.
  detonate(o) {
    const p = Game.player, at = this.fistPos(), c = this.chest(), f = this.fwd();
    this.heat = 0; this.ventT = HEAT.VENT + 1; this.flared = false; this.pulseT = 0;
    const d = Math.round(this.maxHp * DETONATE.DMG * (Game.has('glass') ? 1.35 : 1));
    this.hp -= d; this.hitFlash = 0.12;
    FX.text(String(d), { x: c.x, y: this.pos.y + this.h + 0.6, z: c.z }, { c: '#ffd070', scale: 2 });
    Game.registerHit(d, 'detonate');
    FX.ring(at, 0.4, 7.5, 0.5, { c: '#ffb040', flat: false });
    FX.ring(at, 0.3, 4, 0.35, { c: '#ffffff', flat: false });
    FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.5, 9, 0.5, { c: KRAG_ORANGE });
    FX.sparks(at, 70, null, TAU, 8, 34, KRAG_FIRE);
    FX.sparks(at, 30, { x: 0, y: 1, z: 0 }, 1.5, 6, 22, Object.assign({ g: -4, life: 1.6 }, KRAG_FIRE));
    FX.embers(at, 30);
    FX.debris(at, 20, this.def.debris, 20);
    FX.dust(at, 22, { c: '#2a2026', smax: 9, life: 1.6, rise: 1.8 });
    FX.decal('scorch', this.pos, { r: 2.6, dur: 10 });
    FX.light(at, '#ffb040', 10, 18, 0.6);
    FX.flash('#ffd0a0', 0.55);
    Sound.play('detonate', {}, at);
    Game.shake(0.95); Game.hitstop(0.12);
    Game.slowmo(0.2, 0.7, true);
    Props.blast(at, 4.5);
    // you're close enough to feel it, not to be hurt by it
    if (!p.dead && distXZ(p.pos, this.pos) < 4.5) { const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z); p.vel.x += u.x * 10; p.vel.z += u.z * 10; p.vel.y = Math.max(p.vel.y, 6); p.onGround = false; }
    if (this.hp <= 0) { this.hp = 0; killEnemy(this, { cause: 'detonate', dir: { x: -f.x, y: 0.3, z: -f.z } }); return; }
    this.stunFor(DETONATE.STUN);
    this.vel.x = -f.x * 12; this.vel.z = -f.z * 12; this.vel.y = 8; this.onGround = false;
  }
  stunFor(dur) {
    this.stunT = this.stunMax = dur;
    this.act = null; this.attack = null; this.lunge = null; this.drive = null; this.leap = null;
    if (Game.btOwner === this) Game.endBulletTime();
  }
  // called when you parry one of its blows (a parry passes the knock; a hit's stagger doesn't, so no blow
  // staggers it): a stopper knocks it back off balance; anything else it drives through
  stagger(dur, kv) {
    if (this.dying || dur < 1.2 || !kv || this.stunT > 0 || !this.stopperNow()) return;
    this.act = { kind: 'flinch', t: 0, dur: 0.85 * lerp(1, 0.85, this.rageK()) };
    this.attack = null; this.lunge = null; this.drive = null;
    if (this.leap) { this.leap = null; }
    if (kv) { this.vel.x = (kv.x || 0) * 0.35; this.vel.z = (kv.z || 0) * 0.35; }
    const c = this.chest();
    FX.sparks(c, 26, { x: 0, y: 1, z: 0 }, TAU, 5.5, 22, { c0: '#ffffff', c1: '#ffd070', c2: '#a06010' });
    FX.ring(c, 0.3, 3.2, 0.3, { c: '#ffd070', flat: false });
    Sound.play('kragStagger', {}, c);
  }

  // ---------- update ----------
  update(dt) {
    this.prev.x = this.pos.x; this.prev.y = this.pos.y; this.prev.z = this.pos.z;
    this.t += dt; this.st += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    if (this.spawning) {
      if (this.intro) { this.updateIntro(dt); return; }
      this.spawnT -= dt;
      if (this.spawnT <= 0) { this.landingBurst(1); this.arrive(true); }
      return;
    }
    for (const k in this.cds) this.cds[k] -= dt * (k === 'leap' ? 1 : S.enemies.aggression);
    for (const k of ['transT', 'ventT', 'perilFlash', 'hitT']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    this.rangedHurt = Math.max(0, this.rangedHurt - dt * 14);
    // the Fist's bullet time lasts exactly as long as its wind-up
    const a0 = this.act;
    if (Game.btOwner === this && Game.btKind === 'peril' && !(a0 && a0.kind === 'punch' && a0.phase === 'wind')) Game.endBulletTime();
    if (this.dying) { this.updateDying(dt); return; }
    const p = Game.player;
    this.want = null;
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (this.stunT <= 0) this.getUp();
    } else {
      this.addHeat(HEAT.EXERT * dt);
      if (!this.act) this.chooseAct(p);
      if (this.act) this.runAct(dt, p);
      else this.navigate(dt, p);
      this.react(p);
    }
    this.heatFX(dt);
    this.physics(dt);
  }
  // steam, embers and sparks off the body by its heat; at full heat an orange pulse every so often
  heatFX(dt) {
    const k = this.heatK(), c = this.chest();
    if (Math.random() < 0.08 + 0.5 * k) FX.embers(this.local(rand(-0.6, 0.6), rand(0.8, 2.6), rand(-0.4, 0.4)), 1);
    if ((this.steamT -= dt) <= 0) {
      this.steamT = lerp(0.6, 0.08, k);
      const v = this.local(chance(0.5) ? -0.25 : 0.25, 2.65, -0.45);
      FX.dust(v, 1 + Math.round(k * 2), { c: KRAG_STEAM, smax: 0.8, rise: 2.2 + 2 * k, life: 1.3 });
      if (k > 0.5) FX.dust(this.fistPos(), 1, { c: KRAG_STEAM, smax: 0.6, rise: 2, life: 1 });
    }
    if (this.stunT > 0 && Math.random() < 0.5) FX.dust(this.fistPos(), 1, { c: '#3a3036', smax: 0.8, rise: 2.5, life: 1.5 });
    if (this.charged()) {
      if (Math.random() < 0.4) FX.sparks(this.crestPos(), 2, { x: 0, y: 1, z: 0 }, 0.8, 3, 9, Object.assign({ g: -8, life: 1.2 }, KRAG_FIRE));
      if ((this.pulseT -= dt) <= 0) {
        this.pulseT = 1.1;
        FX.ring(c, 0.4, 3.6, 0.4, { c: KRAG_ORANGE, flat: false });
        FX.light(c, '#ff8a2a', 3, 8, 0.25);
      }
    }
    // the charged arm up to guard crackles: hit it
    const a = this.act;
    if (a && a.kind === 'guard' && a.charged && Math.random() < 0.7) {
      const f = this.fistPos();
      FX.sparks(f, 2, null, TAU, 2, 8, Object.assign({ g: 0, life: 0.6 }, KRAG_FIRE));
      if (Math.random() < 0.2) FX.bolt(f, { x: f.x + rand(-0.8, 0.8), y: f.y + rand(-0.6, 0.8), z: f.z + rand(-0.8, 0.8) }, 0.06, { outer: '#ff8a2a', core: '#ffffff', jag: 0.25, w: 0.04 });
    }
  }
  getUp() {
    this.act = { kind: 'recover', t: 0, dur: 0.55 };
    this.cds.combo = 0.2;
    const h = this.crestPos();
    FX.sparks(h, 20, { x: 0, y: 1, z: 0 }, 1, 4, 12, Object.assign({ g: -5, life: 1.2 }, KRAG_FIRE));
    Sound.play('kragRoar', {}, this.chest());
  }

  // ---------- choosing what to do ----------
  chooseAct(p) {
    if (p.dead) return;
    const d = distXZ(p.pos, this.pos), dy = p.pos.y - this.pos.y, level = Math.abs(dy) < 2.2, near = d < 3.8 && Math.abs(dy) < 2.6;
    if (this.charged()) {
      // full heat: it wants the Fist on you, from a few strides off with a clear line
      if (this.cds.punch <= 0 && level && d > 2.6 && d < 11 && this.lineClear(p, d)) { this.startPunch(p, false); return; }
      if (near && this.cds.combo <= 0) { this.startCombo(true); return; }
    } else if (near && this.cds.combo <= 0) { this.startCombo(false); return; }
    if (near || this.cds.closer > 0) return;
    this.cds.closer = rand(0.3, 0.6);
    const opts = [];
    if (level && d > 4 && d < 12 && this.cds.stomp <= 0) opts.push(['stomp', 1.2]);
    if (level && d > 8 && d < 26 && this.cds.charge <= 0 && this.lineClear(p, d)) opts.push(['charge', 1.6]);
    if (d > 7 && d < 30 && this.cds.jump <= 0) opts.push(['jump', Math.abs(dy) > 2 ? 3 : 1]);
    if (level && d > 7 && d < 26 && this.cds.swing <= 0) opts.push(['swing', 1.1]);
    if (!opts.length) return;
    let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), pickd = opts[0][0];
    for (const [k, w] of opts) { if (r < w) { pickd = k; break; } r -= w; }
    if (pickd === 'stomp') this.startStomp(p, chance(0.4 + 0.3 * this.rageK()) ? 3 : 1);
    else if (pickd === 'charge') this.startCharge(p);
    else if (pickd === 'jump') this.startJump(p);
    else if (!this.startSwing(p)) this.cds.swing = 3;
  }
  lineClear(p, d) {
    const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    return !World.raycast({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, { x: u.x, y: 0, z: u.z }, Math.max(0.1, d - 0.5), 0.3);
  }
  // What it reads as a threat from range: a sword beam charging (big once nearly full), AEGIS's beam (big), its
  // gun firing, or ranged hits landing on it.
  threat(p, d) {
    if (d < 6 || p.dead) return null;
    const C = p.charging;
    if (C && C.k > 0.45) return C.k >= 0.85 ? 'big' : 'small';
    if (p.beamAct) return 'big';
    for (const b of Game.projectiles) if (!b.dead && b.kind === 'swordbeam' && b.full && dist3(b.pos, this.center()) < 22) return 'big';
    if (p.gun && p.gun.firing && p.mode === 'gun') return 'small';
    if (this.rangedHurt > 8) return 'small';
    return null;
  }
  // It guards only when you're a threat at range (at full heat only against something big, and not always:
  // bait it), out of an idle moment, a walk or a recovery.
  react(p) {
    const a = this.act;
    if ((a && a.kind !== 'recover') || this.cds.guard > 0 || !this.onGround) return;
    const th = this.threat(p, distXZ(p.pos, this.pos));
    if (!th) return;
    if (this.charged() && !(th === 'big' && chance(0.7))) { this.cds.guard = 0.8; return; }
    this.raiseGuard(rand(1.6, 2.4), 'range');
    this.cds.guard = rand(3.5, 5.5);
  }
  raiseGuard(dur, why) {
    if (this.stunT > 0 || this.dying) return;
    this.attack = null; this.lunge = null; this.drive = null;
    this.act = { kind: 'guard', t: 0, dur, why, charged: this.charged(), hitT: 0, closeT: 0, blocked: 0, noShove: why === 'stagger' ? 0.9 : 0.35 };
    this.yaw = this.faceYaw = this.yawTo(Game.player.pos);
    Sound.play('kragGuard', {}, this.center());
    FX.sparks(this.fistPos(), 8, { x: 0, y: 1, z: 0 }, 1.2, 3, 8, KRAG_SPARK);
  }

  runAct(dt, p) {
    const a = this.act;
    a.t += dt;
    switch (a.kind) {
      case 'intro': if (a.t > 0.9) this.act = null; this.face(p.pos, 6); return;
      case 'flare': this.face(p.pos, 4); if (a.t > 0.6) this.act = null; return;
      case 'recover': if (a.t > a.dur) this.act = null; return;
      case 'flinch':
        if (a.t > a.dur) this.raiseGuard(rand(1.4, 1.9), 'stagger');
        return;
      case 'guard': this.runGuard(dt, a, p); return;
      case 'melee': this.runMelee(dt, a, p); return;
      case 'punch': this.runPunch(dt, a, p); return;
      case 'charge': this.runCharge(dt, a, p); return;
      case 'jump': this.runJump(dt, a, p); return;
      case 'stomp': this.runStomp(dt, a, p); return;
      case 'swing': this.runSwing(dt, a, p); return;
    }
  }
  // Always pressing in: straight at you when the way is clear, along the nav graph otherwise, leaping up to
  // whatever you stand on.
  navigate(dt, p) {
    const d = distXZ(p.pos, this.pos);
    this.face(p.pos, 7);
    if (d > 2.8) this.pathTo(p, this.runSpeed());
    this.unstick(dt, p, d > 3);
  }
  // The guard: the onyx arm up, turning slowly to keep you in front (circle it and you get round), walking in
  // behind it from range. Crowd it and it shoves you off; wait it out and it attacks.
  runGuard(dt, a, p) {
    const d = distXZ(p.pos, this.pos);
    this.face(p.pos, 3.2);
    if (d > 3.2) this.steerTo(p.pos, 2.4);
    a.hitT = Math.max(0, a.hitT - dt);
    const f = this.fwd(), inFront = ((p.pos.x - this.pos.x) * f.x + (p.pos.z - this.pos.z) * f.z) / (d || 1) > 0.3;
    a.closeT = d < 3 && inFront ? a.closeT + dt : 0;
    if (a.t > a.noShove && a.closeT > 0.45 && !a.charged) { this.startMove('shove', null); this.cds.combo = 0.4; return; }
    if (a.t >= a.dur) { this.act = null; this.cds.combo = 0; }
  }

  // ---------- blows ----------
  startCombo(stopper) {
    const p = Game.player, d = distXZ(p.pos, this.pos);
    let opts = stopper ? KRAG_COMBOS.filter((c) => KRAG_MOVES[c[c.length - 1]].stopper) : KRAG_COMBOS;
    if (d > 3.2) opts = opts.filter((c) => KRAG_MOVES[c[0]].r >= 2.9 || KRAG_MOVES[c[0]].lunge >= 8).concat(opts.slice(0, 1));
    const combo = pick(opts);
    this.startMove(combo[0], { list: combo, i: 0 });
  }
  startMove(name, combo) {
    const m = KRAG_MOVES[name], p = Game.player;
    this.attack = null; this.lunge = null;
    this.act = { kind: 'melee', move: name, m, phase: 'wind', t: 0, wind: this.windOf(m), combo, glinted: false, aim: null };
    this.faceYaw = this.yawTo(p.pos);
    this.lastDir = -this.lastDir;
    Sound.play('enemyWindup', { pm: m.stopper ? 0.45 : 0.75 }, this.center());
  }
  runMelee(dt, a, p) {
    const m = a.m, c = this.chest(), d = distXZ(p.pos, this.pos);
    if (a.phase === 'wind') {
      // tracks you through most of the wind-up and steps in on you
      if (a.t < a.wind * 0.75) this.face(p.pos, m.stopper ? 6 : 10);
      else this.faceYaw = this.yaw;
      if (d > m.r - 0.6 && a.t < a.wind * 0.8) this.steerTo(p.pos, m.stopper ? 2 : 3.4);
      if (!a.glinted && a.t >= Math.max(0, a.wind - GLINT_LEAD)) {
        a.glinted = true;
        const at = this.limbPos(m.limb);
        if (m.stopper) {
          // the stopper's tell: a big gold glint off the limb and the visor
          FX.glint(at, { c: '#ffd070', size: 1.6, follow: () => this.limbPos(m.limb), threat: this });
          this.eyeGlint('#ffd070', 1.2);
          Sound.play('stopperCue', {}, c);
        } else FX.glint(at, { c: '#ffe8c0', size: 0.8, follow: () => this.limbPos(m.limb), threat: this });
        Sound.play('glint', {}, c);
      }
      if (m.stopper && Math.random() < 0.5) FX.sparks(this.limbPos(m.limb), 1, null, TAU, 1.5, 5, Object.assign({ g: 0, life: 0.6 }, KRAG_FIRE));
      if (a.t >= a.wind) this.beginBlow(a, m, p);
      return;
    }
    if (m.kind === 'spin') { this.yaw += (TAU / m.swing) * dt; this.faceYaw = this.yaw; }
    if (this.attack) this.attack.t = a.t;
    if (!a.hit && !p.dead && a.t > 0.02 && a.t < m.swing * 0.85 && this.blowHits(a, m, p)) {
      a.hit = true;
      const res = p.takeHit({ dmg: m.dmg * this.dmgMul, from: c, kind: 'melee', source: this, knock: m.knock });
      if (this.act !== a) return;
      if (res === 'hit') {
        this.addHeat(HEAT.LAND);
        if (m.launch && !p.dead) { p.vel.y = Math.max(p.vel.y, m.launch); p.onGround = false; }
        FX.sparks(p.center(), 10, { x: this.fwd().x, y: 0.3, z: this.fwd().z }, 1.3, 6, 20, KRAG_SPARK);
        Game.hitstop(m.stopper ? 0.07 : 0.035);
      } else if (res === 'parried' && !m.stopper) this.plowThrough(p, m);
    }
    if (m.quake && !a.quaked && a.t > 0.1) {
      a.quaked = true;
      if (this.onGround) {
        const f = this.fwd(), at = { x: this.pos.x + f.x * 2.2, y: this.pos.y, z: this.pos.z + f.z * 2.2 };
        Game.hazards.push(new GroundWave(at, 19 * S.enemies.speed, 10 * this.dmgMul, this));
        for (const s of [4.5, 7.5]) this.spawnVent({ x: this.pos.x + f.x * s, y: this.pos.y, z: this.pos.z + f.z * s }, VENT.TELL);
        this.slamFX(at, 0.6);
      }
    }
    if (a.t >= m.swing) {
      this.attack = null;
      const cb = a.combo;
      if (cb && cb.i + 1 < cb.list.length) { cb.i++; this.startMove(cb.list[cb.i], cb); return; }
      this.act = { kind: 'recover', t: 0, dur: (m.stopper ? rand(0.6, 0.85) : rand(0.4, 0.6)) * this.rageGap() };
      this.cds.combo = rand(0.25, 0.6) * this.rageGap();
    }
  }
  // the blow lands its weight on your parry anyway: you're driven back and it costs you shield
  plowThrough(p, m) {
    const u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z), k = 6 + m.knock * 0.2;
    p.vel.x = u.x * k; p.vel.z = u.z * k;
    if (!S.gameplay.invincible) p.shield = Math.max(0, p.shield - 6);
    this.addHeat(HEAT.PARRIED);
    FX.sparks(p.chest(), 8, { x: u.x, y: 0.2, z: u.z }, 1.2, 4, 12, KRAG_SPARK);
    Sound.play('kragBlock', {}, p.chest());
  }
  beginBlow(a, m, p) {
    a.phase = 'swing'; a.t = 0; a.hit = false; a.quaked = false;
    const c = this.chest(), pc = p.chest(), d = distXZ(p.pos, this.pos), f = this.fwd();
    const pa = clamp(Math.atan2(pc.y - c.y, Math.max(1.2, d)), -0.5, 0.5);
    a.aim = { x: f.x * Math.cos(pa), y: Math.sin(pa), z: f.z * Math.cos(pa) };
    if (m.kind === 'arc') this.attack = { yaw: this.yaw, tilt: m.tilt, span: m.span, dir: m.dir || this.lastDir, t: 0, sweep: m.swing * 0.6, r: m.r, pa };
    // steps into the blow, never past you
    const v = Math.min(m.lunge * 2, (Math.max(0, d - 1.8) / m.swing) * 2);
    this.lunge = { t: 0, dur: m.swing, vx: f.x * v, vz: f.z * v };
    if (m.leapV) { this.vel.y = m.leapV; this.onGround = false; }
    const at = this.limbPos(m.limb);
    if (m.kind === 'arc' && m.stopper) {
      FX.swoosh({ follow: this, oy: 2.0, x: c.x, y: c.y, z: c.z, yaw: this.yaw, tilt: m.tilt, pitch: pa, r: m.r, span: m.span, dir: this.attack.dir, sweep: m.swing * 0.6, dur: m.swing + 0.12, thick: 0.5, pal: 'molten', trail: 0.9, bolts: 0 });
    } else if (m.kind === 'spin') {
      FX.swoosh({ follow: this, oy: 2.0, x: c.x, y: c.y, z: c.z, yaw: this.yaw, tilt: 0.05, r: m.r, span: TAU - 0.05, dir: 1, sweep: m.swing * 0.9, dur: m.swing + 0.15, thick: 0.45, pal: 'molten', trail: 0.9, bolts: 0 });
    }
    FX.sparks(at, m.stopper ? 14 : 5, { x: f.x, y: 0.1, z: f.z }, 0.8, 4, 14, KRAG_FIRE);
    Sound.play(m.stopper ? 'heavySwing' : 'enemyMelee', {}, c);
  }
  blowHits(a, m, p) {
    const c = this.chest(), pc = p.center();
    if (m.kind === 'arc') return arcHits(c, this.attack, m.r + 0.3, p, 1.0);
    if (m.kind === 'spin') return distXZ(pc, c) < m.r + p.r && pc.y > this.pos.y - 0.4 && pc.y < this.pos.y + 3.2;
    const A = a.aim, lo = m.low ? this.pos.y - 0.2 : this.pos.y + 0.5, hi = m.low ? this.pos.y + 2.2 : this.pos.y + 3.4;
    return segDistXZ(pc.x, pc.z, c.x, c.z, c.x + A.x * m.r, c.z + A.z * m.r) < p.r + 0.55 && pc.y > lo + A.y * m.r * 0.5 && pc.y < hi + A.y * m.r * 0.5;
  }

  // ---------- the Molten Fist ----------
  // overflow: its guard just filled it, and it answers at once
  startPunch(p, overflow) {
    this.attack = null; this.lunge = null; this.drive = null;
    const wind = this.fistWind();
    this.act = { kind: 'punch', phase: 'wind', t: 0, wind, tx: p.pos.x, tz: p.pos.z, locked: false, lockYaw: this.yawTo(p.pos), overflow: !!overflow, dirV: null };
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.perilFlash = 0.16;
    this.cds.punch = 99;
    Game.bulletTime(wind / FIST.BT + 0.2, { kind: 'peril', scale: FIST.BT, owner: this });
    Sound.play('peril', { dur: Math.max(0.1, (wind - CUE_LEAD) / FIST.BT) });
    Sound.play('kragCharge', { dur: wind / FIST.BT }, this.chest());
    const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, c = this.chest();
    FX.ring(g, 0.5, 7, 0.35, { c: '#ff2a3a' });
    FX.ring(c, 0.4, 4.5, 0.3, { c: '#ffd0d4', flat: false });
    FX.sparks(c, 26, { x: 0, y: 1, z: 0 }, 1.2, 6, 18, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
    FX.light(c, '#ff2a3a', 6, 12, 0.5);
    Game.shake(0.25);
  }
  // 0..1 through the wind-up, reaching 1 as the visor flashes (the HUD's cue reads it)
  cueProgress() {
    const a = this.act;
    if (!a || a.kind !== 'punch' || a.phase !== 'wind') return 1;
    return clamp(a.t / Math.max(0.05, a.wind - CUE_LEAD), 0, 1);
  }
  runPunch(dt, a, p) {
    if (a.phase === 'wind') {
      const lockAt = a.wind - CUE_LEAD, fist = this.fistPos(), k = clamp(a.t / Math.max(0.05, lockAt), 0, 1);
      // it tracks you until its visor flashes, then holds that line to the end
      if (a.t < lockAt) { this.face(p.pos, 6); a.tx = p.pos.x; a.tz = p.pos.z; a.lockYaw = this.faceYaw; }
      else {
        if (!a.locked) {
          a.locked = true;
          this.yaw = this.faceYaw = a.lockYaw = yawOf(a.tx - this.pos.x, a.tz - this.pos.z);
          this.eyeGlint('#ff2a3a', 2.4);
          FX.light(fist, '#ffffff', 6, 10, 0.2);
          Sound.play('glint', {}, this.chest());
        }
        this.yaw = this.faceYaw = a.lockYaw;
      }
      // red energy and fire stream into the drawn-back fist
      for (let i = 0; i < 3; i++) {
        const u = coneDir(null, TAU), R = lerp(3.4, 1.4, k), q = { x: fist.x + u.x * R, y: fist.y + u.y * R * 0.8, z: fist.z + u.z * R };
        FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3, R * 3.6, { c0: '#ffffff', c1: '#ff4a3a', c2: '#781e1a', g: 0, life: 0.8 });
      }
      if (Math.random() < 0.25 + 0.4 * k) { const u = coneDir(null, TAU), R = lerp(3, 1.4, k); FX.bolt({ x: fist.x + u.x * R, y: fist.y + u.y * R, z: fist.z + u.z * R }, fist, 0.07, { outer: '#ff2a3a', core: '#ffffff', jag: 0.35, w: 0.05 }); }
      if (Math.random() < 0.5) Game.shake(0.04 + 0.08 * k);
      if (a.t >= a.wind) {
        a.phase = 'lunge'; a.t = 0;
        if (Game.btOwner === this) Game.endBulletTime();
        const f = this.fwd(), d = Math.hypot(a.tx - this.pos.x, a.tz - this.pos.z);
        const L = Math.min(clamp(d - 1.4, 0, FIST.LUNGE), this.legRoom(f, FIST.LUNGE));
        a.dirV = { x: f.x, y: 0, z: f.z };
        const V = FIST.SPEED;
        this.drive = { vx: f.x * V, vz: f.z * V, vy: 0, t: 0, dur: Math.max(0.03, L / V), g: 0 };
        Sound.play('dash', {}, this.center());
        FX.sparks(this.local(0, 0.3, -0.3), 14, { x: -f.x, y: 0.3, z: -f.z }, 0.8, 6, 16, KRAG_FIRE);
      }
      return;
    }
    if (a.phase === 'lunge') {
      // the fist meets you, or the lunge runs out
      const fp = this.local(-0.2, 1.7, 1.4), pc = p.chest();
      if (!this.drive || (!p.dead && dist3(fp, pc) < 1.4)) { this.drive = null; this.fistBlast(a, p); }
      return;
    }
    // venting after it: the arm smokes, the rest of it heaves
    if (Math.random() < 0.6) FX.dust(this.fistPos(), 1, { c: KRAG_STEAM, smax: 1, rise: 2.6, life: 1.2 });
    if (a.t >= FIST.VENT * this.rageGap()) { this.act = null; this.cds.combo = 0.3; this.cds.punch = 1.5; }
  }
  // Where the Fist goes off: a cone along its locked line and a ball round the fist.
  fistZone(p) {
    const f = this.act && this.act.dirV ? this.act.dirV : this.fwd(), c = this.chest(), pc = p.chest();
    const fist = { x: this.pos.x + f.x * 1.5, y: c.y - 0.3, z: this.pos.z + f.z * 1.5 };
    if (dist3(fist, pc) < FIST.R) return true;
    if (Math.abs(pc.y - c.y) > 3.2) return false;
    const ox = this.pos.x - f.x * 0.5, oz = this.pos.z - f.z * 0.5, rx = pc.x - ox, rz = pc.z - oz;
    const along = rx * f.x + rz * f.z, side = Math.abs(rx * -f.z + rz * f.x);
    return along > 0 && along < FIST.CONE && Math.atan2(side, along) < FIST.HALF;
  }
  fistBlast(a, p) {
    a.phase = 'vent'; a.t = 0;
    const f = a.dirV || this.fwd(), c = this.chest(), fist = { x: this.pos.x + f.x * 1.5, y: c.y - 0.3, z: this.pos.z + f.z * 1.5 };
    this.heat = 0; this.ventT = HEAT.VENT; this.flared = false;
    let landed = false;
    if (!p.dead && this.fistZone(p)) {
      landed = p.takeHit({ dmg: FIST.DMG * this.dmgMul, from: c, kind: 'melee', source: this, knock: FIST.KNOCK, unparryable: true, pierce: true, through: true, daze: FIST.DAZE }) === 'hit';
      if (landed) {
        p.vel.y = Math.max(p.vel.y, 16); p.onGround = false;
        FX.sparks(p.chest(), 30, { x: f.x, y: 0.3, z: f.z }, 1.6, 11, 38, KRAG_FIRE);
        FX.flash('#ff3010', 0.45);
        Game.hitstop(0.14);
      }
    } else if (!p.dead && distXZ(p.pos, this.pos) < 12) p.perilDodge(this);
    // the blast: a fireball off the fist and fire jets along the line
    FX.ring(fist, 0.4, 6.5, 0.45, { c: '#ffb040', flat: false });
    FX.ring({ x: fist.x, y: this.pos.y + 0.06, z: fist.z }, 0.5, 8, 0.45, { c: '#ff2a3a' });
    FX.sparks(fist, 50, { x: f.x, y: 0.2, z: f.z }, 1.2, 10, 36, KRAG_FIRE);
    FX.sparks(fist, 30, null, TAU, 5, 18, KRAG_FIRE);
    for (const s of [3, 6, 9, 11.5]) {
      const q = { x: this.pos.x + f.x * s, y: this.pos.y + 0.2, z: this.pos.z + f.z * s };
      FX.sparks(q, 10, { x: f.x * 0.4, y: 1, z: f.z * 0.4 }, 0.8, 5, 14, Object.assign({ life: 0.9 }, KRAG_FIRE));
      FX.dust(q, 3, { c: '#2a2026', smax: 3, rise: 1.6 });
    }
    FX.embers(fist, 24);
    FX.debris(fist, 16, GRIT, 18);
    FX.decal('scorch', { x: fist.x, y: this.pos.y, z: fist.z }, { r: 2.4, dur: 10 });
    FX.decal('crack', { x: fist.x, y: this.pos.y, z: fist.z }, { len: 5 });
    FX.light(fist, '#ff8a2a', 10, 18, 0.5);
    Props.blast(fist, 4);
    Sound.play('kragPunch', {}, fist);
    Game.shake(landed ? 0.95 : 0.7);
  }

  // ---------- getting to you ----------
  // The shoulder charge: the spiked pauldron dropped, then a long drive at you that ends in an explosion
  startCharge(p) {
    this.attack = null; this.lunge = null;
    this.act = { kind: 'charge', phase: 'wind', t: 0, wind: this.tele(KCHARGE.WIND), glinted: false, hit: false };
    this.faceYaw = this.yawTo(p.pos);
    this.cds.charge = rand(4, 6);
    Sound.play('enemyWindup', { pm: 0.4 }, this.center());
  }
  runCharge(dt, a, p) {
    const f = this.fwd();
    if (a.phase === 'wind') {
      if (a.t < a.wind * 0.8) this.face(p.pos, 8);
      if (Math.random() < 0.6) FX.sparks(this.local(-0.3, 0.1, -0.5), 1, { x: -f.x, y: 0.4, z: -f.z }, 0.6, 3, 8, KRAG_FIRE);
      if (!a.glinted && a.t >= Math.max(0, a.wind - GLINT_LEAD)) {
        a.glinted = true;
        FX.glint(this.local(-0.7, 2.4, 0.3), { c: '#ffd070', size: 1.6, follow: () => this.local(-0.7, 2.4, 0.3), threat: this });
        Sound.play('stopperCue', {}, this.chest());
      }
      if (a.t >= a.wind) {
        const d = distXZ(p.pos, this.pos), L = Math.min(d + 5, KCHARGE.MAX, this.legRoom(f, KCHARGE.MAX));
        if (L < 3) { this.act = { kind: 'recover', t: 0, dur: 0.3 }; return; }
        a.phase = 'run'; a.t = 0;
        const V = KCHARGE.SPEED * Math.sqrt(S.enemies.speed);
        this.drive = { vx: f.x * V, vz: f.z * V, vy: 0, t: 0, dur: L / V, g: 0, homing: 0.35 };
        this.burst(this.local(0, 0.4, -0.4), 0.5);
        Sound.play('kragLaunch', {}, this.center());
      }
      return;
    }
    if (a.phase === 'run') {
      if (Math.random() < 0.8) FX.sparks(this.local(rand(-0.4, 0.4), rand(0.4, 2.2), -0.3), 1, { x: -f.x, y: 0.2, z: -f.z }, 0.5, 2, 6, Object.assign({ life: 0.8 }, KRAG_FIRE));
      // it smashes through the lamps in its way
      Props.blast(this.center(), this.r + 0.4);
      if (!a.hit && !p.dead) {
        const c = this.center(), pc = p.center();
        if (distXZ(c, pc) < this.r + p.r + 0.6 && pc.y > this.pos.y - 0.4 && pc.y < this.pos.y + this.h + 0.4) {
          a.hit = true;
          const res = p.takeHit({ dmg: KCHARGE.DMG * this.dmgMul, from: c, kind: 'melee', source: this, knock: KCHARGE.KNOCK });
          if (this.act !== a) return;
          if (res === 'hit') { this.addHeat(HEAT.LAND); this.burst({ x: (c.x + pc.x) / 2, y: pc.y, z: (c.z + pc.z) / 2 }, 0.8); this.drive = null; }
        }
      }
      if (!this.drive) { a.phase = 'skid'; a.t = 0; a.wall = !!(this.col && this.col.wall); if (a.wall) this.burst(this.local(-0.3, 1.6, 0.9), 1); }
      return;
    }
    if (Math.random() < 0.7) FX.sparks(this.local(rand(-0.3, 0.3), 0.1, 0.3), 1, { x: -f.x, y: 0.5, z: -f.z }, 0.6, 3, 9, KRAG_SPARK);
    if (a.t > 0.45) { this.act = { kind: 'recover', t: 0, dur: (a.wall ? 1.0 : 0.6) * this.rageGap() }; this.cds.combo = 0.2; }
  }
  // the leap onto you: it sinks, launches, and comes down on where you're heading with all its weight
  startJump(p) {
    const q = this.landingSpot(p);
    if (!q) { this.cds.jump = 2; return; }
    this.attack = null; this.lunge = null;
    this.act = { kind: 'jump', phase: 'crouch', t: 0, wind: this.tele(KJUMP.WIND), to: q, glinted: false, hit: false };
    this.faceYaw = this.yawTo(q);
    this.cds.jump = rand(6, 9);
    Sound.play('enemyWindup', { pm: 0.35 }, this.center());
  }
  landingSpot(p) {
    const lx = clamp(p.vel.x * 0.45, -5, 5), lz = clamp(p.vel.z * 0.45, -5, 5), x = p.pos.x + lx, z = p.pos.z + lz;
    const y = World.groundAt(x, z, p.pos.y + 1.2);
    if (y > -Infinity && Math.abs(y - p.pos.y) < 1.5 && World.boxFree(x, y + 0.02, z, this.r, this.h)) return { x, y, z };
    return this.spotNear(p.pos, 0.6, 3, true);
  }
  runJump(dt, a, p) {
    if (a.phase === 'crouch') {
      if (a.t < a.wind * 0.8) { const q = this.landingSpot(p); if (q) a.to = q; }
      this.faceYaw = this.yawTo(a.to);
      if (Math.random() < 0.7) FX.sparks(this.local(rand(-0.5, 0.5), 0.1, rand(-0.4, 0.4)), 1, { x: 0, y: 1, z: 0 }, 0.6, 2, 7, KRAG_FIRE);
      if (a.t >= a.wind) {
        a.phase = 'air'; a.t = 0;
        this.leapTo(a.to, { lift: KJUMP.LIFT, gk: this.LEAP_G, attack: true });
        this.burst({ x: this.pos.x, y: this.pos.y + 0.2, z: this.pos.z }, 0.6);
        FX.decal('crack', this.pos, { len: 3 });
      }
      return;
    }
    if (a.phase === 'air') {
      const L = this.leap;
      if (L && !a.glinted && L.T - L.t <= GLINT_LEAD) {
        a.glinted = true;
        FX.glint(this.fistPos(), { c: '#ffd070', size: 1.6, follow: () => this.fistPos(), threat: this });
        Sound.play('stopperCue', {}, this.chest());
      }
      if (Math.random() < 0.6) FX.sparks(this.local(rand(-0.4, 0.4), rand(0.3, 2), 0), 1, { x: 0, y: -1, z: 0 }, 0.6, 2, 6, KRAG_FIRE);
      return;
    }
    if (a.t > 0.75 * this.rageGap()) { this.act = { kind: 'recover', t: 0, dur: 0.3 }; this.cds.combo = 0.2; }
  }
  // Coming down with all its weight: a blast round it, a shockwave and a ring of vents. r: the blast's reach.
  slamImpact(r, dmg, vents) {
    const p = Game.player, g = { x: this.pos.x, y: this.pos.y, z: this.pos.z }, a = this.act;
    if (!p.dead && !(a && a.hit)) {
      const pc = p.center();
      if (dist3(pc, { x: g.x, y: g.y + 1, z: g.z }) < r + p.r) {
        if (a) a.hit = true;
        const res = p.takeHit({ dmg: dmg * this.dmgMul, from: { x: g.x, y: g.y + 1, z: g.z }, kind: 'melee', source: this, knock: 30 });
        if (res === 'hit') this.addHeat(HEAT.LAND);
        if (this.act !== a) return;
      }
    }
    Game.hazards.push(new GroundWave(g, 22 * S.enemies.speed, 12 * this.dmgMul, this));
    for (let i = 0; i < vents; i++) { const ang = (i / vents) * TAU + rand(-0.2, 0.2); this.spawnVent({ x: g.x + Math.cos(ang) * 5.5, y: g.y, z: g.z + Math.sin(ang) * 5.5 }, VENT.TELL); }
    this.slamFX(g, 1);
  }
  // Stomps: a foot hauled up and driven down, a shockwave out round it and vents raised along the street at
  // you; three in a row as it rages.
  startStomp(p, n) {
    this.attack = null; this.lunge = null;
    this.act = { kind: 'stomp', phase: 'wind', t: 0, wind: this.tele(0.55), n, i: 0, foot: 1 };
    this.faceYaw = this.yawTo(p.pos);
    this.cds.stomp = rand(5, 7);
    Sound.play('enemyWindup', { pm: 0.35 }, this.center());
  }
  runStomp(dt, a, p) {
    if (a.phase === 'wind') {
      this.face(p.pos, 4);
      if (Math.random() < 0.5) FX.sparks(this.footPos(a.foot > 0 ? 'R' : 'L'), 1, { x: 0, y: -1, z: 0 }, 0.8, 1.5, 5, KRAG_FIRE);
      if (a.t >= a.wind) {
        a.phase = 'slam'; a.t = 0;
        const at = this.local(a.foot * 0.35, 0, 0.5), u = flat(p.pos.x - this.pos.x, p.pos.z - this.pos.z), last = a.i + 1 >= a.n;
        at.y = this.pos.y;
        if (this.onGround) {
          Game.hazards.push(new GroundWave(at, 19 * S.enemies.speed, 12 * this.dmgMul, this));
          const line = last ? [3.5, 6.5, 9.5] : [4, 7];
          line.forEach((s, i) => this.spawnVent({ x: this.pos.x + u.x * s, y: this.pos.y, z: this.pos.z + u.z * s }, VENT.TELL - 0.15 + i * 0.12));
          if (last && a.n > 1) for (let i = 0; i < 6; i++) { const ang = (i / 6) * TAU; this.spawnVent({ x: this.pos.x + Math.cos(ang) * 4.5, y: this.pos.y, z: this.pos.z + Math.sin(ang) * 4.5 }, VENT.TELL + 0.15); }
          this.slamFX(at, last ? 0.9 : 0.6);
          this.addHeat(HEAT.STOMP);
        }
      }
      return;
    }
    if (a.t > 0.22) {
      if (++a.i < a.n) { a.phase = 'wind'; a.t = 0; a.wind = this.tele(0.32); a.foot = -a.foot; return; }
      this.act = { kind: 'recover', t: 0, dur: 0.55 * this.rageGap() };
      this.cds.combo = 0.2;
    }
  }
  spawnVent(at, delay) {
    const B = Arena.bounds();
    if (at.x < B.minX + 1 || at.x > B.maxX - 1 || at.z < B.minZ + 1 || at.z > B.maxZ - 1) return;
    const y = World.groundAt(at.x, at.z, at.y + 1.5);
    if (y === -Infinity || Math.abs(y - at.y) > 1.6) return;
    Game.hazards.push(new MoltenVent({ x: at.x, y, z: at.z }, delay, this));
  }

  // ---------- the tether swing ----------
  // A pivot it can swing round on its chain: a standing lamp post, or the corner of anything solid on its level
  // at least chest high (a building, a container, a car, a girder's foot), with open street round it far enough
  // for it to come round and see you down the line it lets go along.
  planSwing(p) {
    const K = this.pos, g = K.y, cands = [];
    for (const L of Props.standing()) if (Math.abs(L.y0 - g) < 0.5) cands.push({ x: L.x, z: L.z, lamp: L, pr: 0.16 });
    for (const b of World.near(K.x - 19, K.z - 19, K.x + 19, K.z + 19)) {
      if (SWING_SKIP.has(b.kind) || b.hidden || b.max.y < g + 1.4 || b.min.y > g + 0.5) continue;
      for (const [x, z] of [[b.min.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.min.z], [b.max.x, b.max.z]]) cands.push({ x, z, lamp: null, pr: 0 });
    }
    let best = null, bestS = -Infinity;
    for (const C of cands) {
      const dC = Math.hypot(C.x - K.x, C.z - K.z);
      if (dC < 3.5 || dC > 18) continue;
      const R = KSWING.R + C.pr, th0 = Math.atan2(K.z - C.z, K.x - C.x), E = { x: C.x + Math.cos(th0) * R, z: C.z + Math.sin(th0) * R };
      if (!this.freeAt(E.x, g, E.z)) continue;
      const ex = E.x - K.x, ez = E.z - K.z, el = Math.hypot(ex, ez);
      if (el > 0.5 && World.raycast({ x: K.x, y: g + 0.8, z: K.z }, { x: ex / el, y: 0, z: ez / el }, el, 0.3)) continue;
      for (const s of [1, -1]) {
        // the best place round the free arc to let go: you within 100 degrees of the way it's going (the chain
        // whips it round onto you as it lets go), in the clear
        let sweep = 0, rel = null, relCos = Math.cos(1.75);
        for (let k = 1; k <= 34; k++) {
          const th = th0 + s * k * 0.17, x = C.x + Math.cos(th) * R, z = C.z + Math.sin(th) * R;
          if (!this.freeAt(x, g, z)) break;
          sweep = k * 0.17;
          if (sweep < KSWING.MIN) continue;
          const tx = -Math.sin(th) * s, tz = Math.cos(th) * s, px = p.pos.x - x, pz = p.pos.z - z, pd = Math.hypot(px, pz), cs = (tx * px + tz * pz) / (pd || 1);
          if (pd > 5 && pd < 24 && cs > relCos && this.flightClear({ x, y: g, z }, p)) { rel = sweep; relCos = cs; }
        }
        // with free arc still beyond it, so it gets there before the arc runs out
        if (rel === null || rel > sweep - 0.3) continue;
        const score = relCos * 2 + Math.min(rel, 3) * 0.4 + rand(0, 1) + (C.lamp ? 0.5 : 0);
        if (score > bestS) { bestS = score; best = { C, R, s, th0, maxSweep: sweep, relSweep: rel, E, hook: { x: C.x, y: g + (C.lamp ? 2.8 : 2.2), z: C.z } }; }
      }
    }
    return best;
  }
  // a clear line for its whole body from q to you, at the height it flies
  flightClear(q, p) {
    const dx = p.pos.x - q.x, dz = p.pos.z - q.z, d = Math.hypot(dx, dz);
    return d > 1 && !World.raycast({ x: q.x, y: q.y + 1.8, z: q.z }, { x: dx / d, y: 0, z: dz / d }, d - 1, this.r);
  }
  // room for its body on its own level at (x, z), stepping over kerbs
  freeAt(x, y, z) { const gy = World.groundAt(x, z, y + 0.6); return Math.abs(gy - y) < 0.4 && World.boxFree(x, Math.max(y, gy) + 0.3, z, this.r * 0.9, this.h - 0.4); }
  startSwing(p) {
    const plan = this.planSwing(p);
    if (!plan) return false;
    this.attack = null; this.lunge = null;
    this.act = { kind: 'swing', phase: 'fire', t: 0, plan, hook: plan.hook, line: 0, side: plan.s, th: plan.th0, sweep: 0, spd: 0, v: null, glinted: false, dir: null, hit: false };
    this.faceYaw = this.yawTo(plan.C);
    this.cds.swing = rand(9, 12);
    Sound.play('chain', {}, this.center());
    return true;
  }
  runSwing(dt, a, p) {
    const P = a.plan, C = P.C;
    if (a.phase === 'fire') {
      // the chain flies from its right hand and bites
      a.line = clamp(a.t / 0.18, 0, 1);
      this.face(C, 14);
      if (a.t >= 0.18) { a.phase = 'reel'; a.t = 0; FX.sparks(a.hook, 10, null, TAU, 3.6, 12, KRAG_SPARK); Sound.play('tetherAttach', {}, a.hook); }
      return;
    }
    if (a.phase === 'reel') {
      // hauled out onto the circle it will swing round
      const dx = P.E.x - this.pos.x, dz = P.E.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.6 || a.t > 0.7) { a.phase = 'orbit'; a.t = 0; a.th = Math.atan2(this.pos.z - C.z, this.pos.x - C.x); a.spd = KSWING.V0; a.last = { x: this.pos.x, z: this.pos.z }; Sound.play('chainSwing', {}, this.center()); return; }
      this.want = { x: dx / d, z: dz / d, spd: 14 };
      this.face(C, 10);
      return;
    }
    if (a.phase === 'orbit') {
      a.spd = Math.min(KSWING.V1, a.spd + KSWING.ACC * dt);
      const dth = (a.spd / P.R) * dt;
      a.th += a.side * dth; a.sweep += dth;
      const tx = C.x + Math.cos(a.th) * P.R, tz = C.z + Math.sin(a.th) * P.R;
      a.v = { x: (tx - this.pos.x) / dt, y: -2, z: (tz - this.pos.z) / dt };
      const vl = Math.hypot(a.v.x, a.v.z), cap = a.spd * 2;
      if (vl > cap) { a.v.x *= cap / vl; a.v.z *= cap / vl; }
      const T = { x: -Math.sin(a.th) * a.side, z: Math.cos(a.th) * a.side };
      this.faceYaw = this.yaw = yawOf(T.x, T.z);
      if (Math.random() < 0.9) FX.sparks(this.local(rand(-0.4, 0.4), rand(0.3, 2.2), -0.4), 1, { x: -T.x, y: 0.2, z: -T.z }, 0.4, 2, 6, Object.assign({ life: 0.7 }, KRAG_FIRE));
      if (Math.random() < 0.5) FX.sparks(a.hook, 1, null, TAU, 1.5, 4, KRAG_SPARK);
      // snagged on something: let go
      const moved = Math.hypot(this.pos.x - a.last.x, this.pos.z - a.last.z);
      a.stuck = moved < a.spd * dt * 0.3 && a.t > 0.1 ? (a.stuck || 0) + dt : 0;
      a.last = { x: this.pos.x, z: this.pos.z };
      const px = p.pos.x - this.pos.x, pz = p.pos.z - this.pos.z, pd = Math.hypot(px, pz) || 1;
      const go = a.sweep >= KSWING.MIN && pd > 4 && ((T.x * px + T.z * pz) / pd > Math.cos(0.45) || a.sweep >= P.relSweep) && this.flightClear(this.pos, p);
      if (go) this.releaseSwing(a, p);
      else if (a.sweep >= P.maxSweep - 0.05 || a.stuck > 0.15 || a.t > 3) {
        // out of arc with no clear line at you: the chain lets go and it stumbles out of the swing
        if (this.flightClear(this.pos, p)) { this.releaseSwing(a, p); return; }
        FX.sparks(a.hook, 10, null, TAU, 3, 10, KRAG_SPARK);
        this.vel.x = T.x * a.spd * 0.4; this.vel.z = T.z * a.spd * 0.4;
        this.act = { kind: 'recover', t: 0, dur: 0.5 };
      }
      return;
    }
    if (a.phase === 'fly') {
      const c = this.center(), pc = p.center(), D = this.drive;
      if (D && !a.glinted && D.dur - D.t <= GLINT_LEAD + 0.05) {
        a.glinted = true;
        FX.glint(this.fistPos(), { c: '#ffd070', size: 1.6, follow: () => this.fistPos(), threat: this });
        Sound.play('stopperCue', {}, c);
      }
      if (Math.random() < 0.9) FX.sparks(c, 2, { x: -this.vel.x, y: -this.vel.y, z: -this.vel.z }, 0.5, 3, 9, Object.assign({ life: 0.7 }, KRAG_FIRE));
      if (!a.hit && !p.dead && dist3(c, pc) < this.r + p.r + 0.7) {
        a.hit = true;
        const res = p.takeHit({ dmg: KSWING.DMG * this.dmgMul, from: c, kind: 'melee', source: this, knock: 34 });
        if (this.act !== a) return;
        if (res === 'hit') this.addHeat(HEAT.LAND);
        this.drive = null;
      }
      if (!this.drive) { a.phase = 'land'; a.t = 0; this.slamImpact(2.6, 16, 4); }
      return;
    }
    if (a.t > 0.7 * this.rageGap()) { this.act = { kind: 'recover', t: 0, dur: 0.3 }; this.cds.combo = 0.2; }
  }
  // It lets go and slings itself at you; a lamp post it swung on snaps under the strain.
  releaseSwing(a, p) {
    a.phase = 'fly'; a.t = 0;
    const c = this.center(), pc = p.center(), lead = { x: pc.x + p.vel.x * 0.15, y: pc.y, z: pc.z + p.vel.z * 0.15 };
    const dx = lead.x - c.x, dz = lead.z - c.z, dh = Math.hypot(dx, dz) || 1, V = KSWING.FLY * Math.sqrt(S.enemies.speed);
    const T = clamp(dh / V, 0.15, 1), g = 30;
    // an arc that meets you at your chest, with a hop into it at least; walls and the street end it
    this.drive = { vx: dx / T, vz: dz / T, vy: Math.max(8, (lead.y - c.y) / T + 0.5 * g * T), t: 0, dur: T + 0.5, g };
    a.dir = { x: dx / dh, y: 0, z: dz / dh };
    this.yaw = this.faceYaw = yawOf(dx, dz);
    if (a.plan.C.lamp) Props.cut(a.plan.C.lamp, a.plan.C.lamp.y0 + 1.2, { x: -a.dir.x, z: -a.dir.z });
    else FX.sparks(a.hook, 14, null, TAU, 4, 14, KRAG_SPARK);
    this.burst(this.local(0, 1, -0.4), 0.5);
    Sound.play('kragLaunch', {}, c);
  }

  // ---------- physics ----------
  physics(dt) {
    const v = this.vel, p = Game.player, a = this.act;
    let gravity = true;
    if (this.drive) {
      // a straight drive: the charge, the Fist's lunge, the flight off the chain
      const D = this.drive;
      D.t += dt;
      if (D.homing && D.t < D.dur * D.homing && !p.dead) {
        const want = yawOf(p.pos.x - this.pos.x, p.pos.z - this.pos.z), cur = yawOf(D.vx, D.vz), V = Math.hypot(D.vx, D.vz), ny = cur + clamp(angDiff(cur, want), -1.5 * dt, 1.5 * dt);
        D.vx = fwdX(ny) * V; D.vz = fwdZ(ny) * V;
      }
      D.vy -= (D.g || 0) * dt;
      v.x = D.vx; v.z = D.vz; v.y = D.g ? D.vy : -1;
      gravity = false;
      this.faceYaw = this.yaw = yawOf(D.vx, D.vz);
    } else if (this.leap) {
      const L = this.leap;
      L.t += dt;
      v.x = L.vx; v.z = L.vz; v.y -= L.g * dt; gravity = false;
    } else if (a && a.kind === 'swing' && a.phase === 'orbit' && a.v) {
      v.x = a.v.x; v.y = a.v.y; v.z = a.v.z;
      gravity = false;
    } else if (this.lunge) {
      const L = this.lunge;
      L.t += dt;
      v.x = L.vx * (1 - L.t / L.dur); v.z = L.vz * (1 - L.t / L.dur);
      if (L.t >= L.dur) this.lunge = null;
    } else {
      const stunned = this.stunT > 0 || (a && a.kind === 'flinch');
      const W = !stunned && this.want ? this.want : null;
      const acc = (this.onGround ? 36 : 8) * dt;
      const [nx, nz] = approach2(v.x, v.z, W ? W.x * W.spd : 0, W ? W.z * W.spd : 0, W || this.onGround ? acc * (W ? 1 : 1.4) : 2 * dt);
      v.x = nx; v.z = nz;
      const hs = Math.hypot(nx, nz);
      if (hs > 0.6 && this.onGround) this.walk += hs * dt * 0.95;
    }
    if (gravity) v.y = Math.max(v.y - this.G * dt * Game.gravMul(), -50);
    const wasGround = this.onGround, vy0 = v.y;
    World.moveBody(this, dt, { step: this.onGround || this.drive ? 1.0 : 0 });
    if (this.drive) {
      const D = this.drive;
      if (D.t >= D.dur || (this.col && this.col.wall && D.t > 0.03) || (D.g && this.onGround && D.t > 0.1 && D.vy < 0)) { this.drive = null; v.x *= 0.2; v.z *= 0.2; }
    }
    if (this.leap) {
      const L = this.leap;
      if ((this.onGround && L.t > 0.1) || L.t > L.T + 0.6) { this.leap = null; this.onLand(L); }
    } else if (this.onGround && !wasGround && vy0 < -12) this.landingBurst(clamp(-vy0 / 45, 0.25, 0.8));
    // it never stands inside you: it gives way round you, so it never shoves you into a wall. Your dashes and
    // drawn cuts pass through it, so it holds its ground while you go by.
    const passing = p.dashT > 0 || p.dashEndT > 0 || !!p.iaido;
    if (!this.drive && !passing && !p.dead && p.pos.y < this.pos.y + this.h && p.pos.y + p.h > this.pos.y) {
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
    if (this.pos.y < -20) { const q = Arena.freeGroundAt(Arena.center().x, Arena.center().z, 1.2); this.pos.x = q.x; this.pos.y = q.y + 6; this.pos.z = q.z; v.x = v.y = v.z = 0; this.drive = null; this.leap = null; }
    const rate = this.turnRate || 8;
    this.yaw += clamp(angDiff(this.yaw, this.faceYaw), -rate * dt, rate * dt);
    this.turnRate = 8;
  }
  // every landing is explosive; the leap onto you most of all
  onLand(L) {
    const a = this.act;
    if (L.attack && a && a.kind === 'jump') { a.phase = 'land'; a.t = 0; this.slamImpact(KJUMP.R, KJUMP.DMG, 5); return; }
    this.landingBurst(0.45);
  }
  landingBurst(k) {
    const g = { x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z };
    FX.dust(g, Math.round(14 * k + 4), { smax: 3 + 7 * k });
    FX.ring(g, 0.3, 1.8 + 3.5 * k, 0.3, { c: KRAG_ORANGE });
    FX.sparks(g, Math.round(10 * k + 3), { x: 0, y: 1, z: 0 }, 1.6, 3, 10 + 8 * k, KRAG_FIRE);
    if (k > 0.4) { FX.decal('crack', g, { len: 2.5 + 2 * k }); FX.debris(g, 10, GRIT, 12); Sound.play('kragStomp', {}, g); }
    Sound.play('land', {}, g);
    Game.shake(0.12 + 0.35 * k);
  }
  // a blast at the ground: cracks, a ring, dust, debris and fire
  slamFX(at, k) {
    const g = { x: at.x, y: at.y + 0.06, z: at.z };
    FX.ring(g, 0.4, 3 + 5 * k, 0.4, { c: KRAG_ORANGE });
    FX.ring(g, 0.3, 2 + 2.5 * k, 0.3, { c: '#ffd070' });
    FX.dust(at, Math.round(14 + 16 * k), { smax: 6 + 8 * k, rise: 1.2 });
    FX.debris(at, Math.round(10 + 14 * k), GRIT, 14 + 8 * k);
    FX.sparks({ x: at.x, y: at.y + 0.3, z: at.z }, Math.round(12 + 16 * k), { x: 0, y: 1, z: 0 }, 1.4, 5, 16, KRAG_FIRE);
    FX.decal('crack', at, { len: 3 + 3 * k });
    FX.light({ x: at.x, y: at.y + 0.8, z: at.z }, '#ff8a2a', 5 + 4 * k, 9 + 6 * k, 0.35);
    Sound.play('kragStomp', {}, at);
    Game.shake(0.3 + 0.45 * k); Game.hitstop(0.03 * k);
  }
  // an explosion of fire off its body: setting off on a charge or a leap, meeting you, hitting a wall
  burst(at, k) {
    FX.ring(at, 0.3, 2 + 3 * k, 0.3, { c: KRAG_ORANGE, flat: false });
    FX.sparks(at, Math.round(14 + 20 * k), null, TAU, 4, 14 + 10 * k, KRAG_FIRE);
    FX.dust(at, Math.round(4 + 8 * k), { c: '#2a2026', smax: 4, rise: 1.5 });
    FX.light(at, '#ff8a2a', 4 + 4 * k, 8, 0.25);
    Sound.play('explode', { big: k > 0.7 }, at);
    Game.shake(0.15 + 0.3 * k);
  }
  // each footfall shakes the street and leaves a smouldering print
  footfall(side) {
    const d = distXZ(this.pos, Game.player.pos);
    if (d < 18) Game.shake(0.05);
    Sound.play('kragStep', {}, this.pos);
    const q = this.local(side === 'R' ? 0.36 : -0.36, 0, -0.05);
    q.y = World.groundAt(q.x, q.z, this.pos.y + 0.5);
    if (q.y === -Infinity || Math.abs(q.y - this.pos.y) > 0.4) return;
    FX.dust(q, 2, { smax: 2 });
    if (chance(0.5)) FX.embers(q, 1);
    KragViews.footprint(q, this.yaw, side);
  }

  // ---------- entry ----------
  // From here it fights. quick: no cutscene (training, retries); otherwise the cutscene showed the title.
  arrive(quick) {
    this.spawning = false;
    if (quick) Game.announce(this.name, null, '#ff9a5a', 2.6);
    this.act = { kind: 'intro', t: quick ? 0 : 0.5 };
  }
  // Entry: a streak of fire falls out of the sky onto the street; it lands in a crouch with a blast, stands
  // with steam pouring off it, its mohawk catches, it roars, and its title hits as it beats its fist into its
  // palm.
  updateIntro(dt) {
    const I = this.intro, p = Game.player;
    if (!I.started) {
      I.started = true;
      if (!p.dead) Game.startCine({ kind: 'kragIntro', focus: this, owner: this });
    }
    const C = Game.cine, own = C && C.owner === this;
    I.t += dt;
    const ct = (I.ct = own ? C.t : I.t);
    const once = (k) => (I.done[k] ? false : (I.done[k] = true));
    const g = { x: this.pos.x, y: I.g + 0.05, z: this.pos.z };
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    if (ct < 1.05) {
      I.stage = 'fall';
      if (once('rumble')) Sound.play('beaconRumble', {}, g);
      const k = ct / 1.05;
      this.pos.y = this.prev.y = I.g + 40 * Math.pow(1 - k, 1.6);
      const c = this.center();
      FX.sparks(c, 4, { x: 0, y: 1, z: 0 }, 0.6, 6, 18, Object.assign({ life: 0.8 }, KRAG_FIRE));
      if (Math.random() < 0.6) FX.embers(c, 2);
      if (Math.random() < 0.5) FX.sparks({ x: g.x + rand(-1, 1), y: g.y, z: g.z + rand(-1, 1) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 1, 4, KRAG_FIRE);
      Game.shake(0.01 + 0.03 * k);
    } else if (ct < 1.85) {
      I.stage = 'impact';
      if (once('impact')) {
        this.pos.y = this.prev.y = I.g; this.onGround = true;
        Sound.play('beaconErupt', {}, g); Sound.play('kragStomp', {}, g);
        FX.flash('#ffd0a0', 0.5);
        FX.ring(g, 0.4, 11, 0.6, { c: KRAG_ORANGE });
        FX.ring(g, 0.3, 6.4, 0.45, { c: '#ffd070' });
        FX.debris(g, 34, GRIT, 30);
        FX.dust(g, 30, { smax: 18, rise: 1, life: 1.4 });
        FX.sparks({ x: g.x, y: g.y + 0.5, z: g.z }, 50, { x: 0, y: 1, z: 0 }, 1.4, 8, 30, KRAG_FIRE);
        FX.decal('crack', g, { len: 6, dur: 14 });
        FX.decal('scorch', g, { r: 2.6, dur: 14 });
        FX.light({ x: g.x, y: g.y + 2, z: g.z }, '#ff8a2a', 9, 20, 0.7);
        Game.shake(0.8);
      }
      if (Math.random() < 0.6) FX.dust(this.local(rand(-0.6, 0.6), rand(1, 2.4), rand(-0.4, 0.4)), 1, { c: KRAG_STEAM, smax: 1, rise: 2.4, life: 1.4 });
    } else if (ct < 2.85) {
      I.stage = 'rise';
      if (Math.random() < 0.8) FX.dust(this.local(rand(-0.6, 0.6), rand(1, 2.6), rand(-0.4, 0.4)), 1, { c: KRAG_STEAM, smax: 1, rise: 2.4, life: 1.4 });
      if (ct >= 2.3 && once('lit')) {
        I.lit = true;
        const h = this.crestPos();
        FX.sparks(h, 30, { x: 0, y: 1, z: 0 }, 1, 4, 14, Object.assign({ g: -5, life: 1.2 }, KRAG_FIRE));
        FX.light(h, '#ff8a2a', 6, 8, 0.4);
        Sound.play('heatMax', {}, h);
      }
    } else if (ct < 3.75) {
      I.stage = 'roar';
      I.lit = true;
      if (once('roar')) {
        const c = this.chest();
        if (own) C.zoom = 2;
        FX.ring(c, 0.4, 10, 0.6, { c: KRAG_ORANGE, flat: false });
        FX.sparks(c, 40, null, TAU, 6, 24, KRAG_FIRE);
        FX.light(c, '#ff8a2a', 9, 16, 0.8);
        FX.flash('#ff9a5a', 0.3);
        Sound.play('kragRoar', {}, c); Sound.play('enrageRoar', {}, c);
        Game.shake(0.6);
      }
      if (Math.random() < 0.8) FX.sparks(this.crestPos(), 2, { x: 0, y: 1, z: 0 }, 0.8, 3, 10, Object.assign({ g: -6, life: 1 }, KRAG_FIRE));
    } else {
      I.stage = 'title';
      if (once('title')) {
        if (own) { C.zoom = 1; C.big = { style: 'title', text: this.name, color: '#ff8a3a', tag: 'FOUNDRY FRAME', sub: 'THE MOLTEN FIST' }; C.bigT = 0; }
        Sound.play('titleHit');
        FX.ring(this.center(), 0.4, 8, 0.5, { c: KRAG_ORANGE, flat: false });
        Game.shake(0.45);
      }
      // the fist beating into the palm
      const beat = Math.floor((ct - 3.75) * 9 / Math.PI);
      if (beat !== I.beat) { I.beat = beat; if (beat % 2 === 0) { const h = this.fistPos(); FX.sparks(h, 8, null, TAU, 2, 8, KRAG_SPARK); Sound.play('kragBlock', {}, h); } }
      if (ct >= 5.3 && once('end')) this.endIntro();
    }
    this.cineShot('intro', ct, I.stage);
  }
  endIntro() {
    const I = this.intro;
    if (I) { this.pos.y = this.prev.y = I.g; this.onGround = true; }
    this.intro = null;
    if (Game.cine && Game.cine.owner === this) Game.closeCine();
    this.arrive(false);
  }

  // ---------- knockout ----------
  // The last hit freezes into slow motion; it staggers, vents everything it has, drops to a knee with the
  // onyx fist planted, and falls on its face as its fire goes out.
  onDeath(o = {}) {
    if (this.dying) return;
    this.dying = true; this.hp = 0; this.koT = 0;
    this.act = null; this.attack = null; this.lunge = null; this.drive = null; this.leap = null; this.stunT = 0;
    if (Game.btOwner === this) Game.endBulletTime();
    this.ko = { stage: 'impact', done: {}, rot: 0 };
    const p = Game.player, u = flat(this.pos.x - p.pos.x, this.pos.z - p.pos.z);
    this.yaw = this.faceYaw = this.yawTo(p.pos);
    this.vel.x = u.x * 8; this.vel.z = u.z * 8; this.vel.y = 7; this.onGround = false;
    for (const h of Game.hazards) if (h.kind === 'vent' && h.owner === this) h.dead = true;
    const c = this.chest(), dir = o.dir || { x: u.x, y: 0.3, z: u.z };
    FX.texts = FX.texts.filter((q) => Math.hypot(q.x - this.pos.x, q.z - this.pos.z) > 5);
    const px = -dir.z, pz = dir.x, pl = Math.hypot(px, pz) || 1;
    FX.slashLine({ x: c.x - (px / pl) * 4, y: c.y - 0.6, z: c.z - (pz / pl) * 4 }, { x: c.x + (px / pl) * 4, y: c.y + 0.6, z: c.z + (pz / pl) * 4 }, { w: 0.45, dur: 0.22, grow: 0.01, pal: 'gold' });
    FX.ring(c, 0.4, 8.2, 0.8, { c: '#ffd070', flat: false });
    FX.ring(c, 0.2, 4.5, 0.6, { c: KRAG_ORANGE, flat: false });
    FX.sparks(c, 60, dir, 2.2, 7.3, 38, KRAG_FIRE);
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
      if (Math.random() < 0.5) FX.sparks(c, 2, null, TAU, 5.5, 20, KRAG_FIRE);
    } else if (ct < 2.1) {
      K.stage = 'stagger';
      if (once('stagger')) { if (own) C.zoom = 1; const u = this.fwd(); v.x = -u.x * 3.5; v.z = -u.z * 3.5; FX.dust(this.fistPos(), 10, { c: KRAG_STEAM, smax: 3, rise: 3, life: 1.6 }); Sound.play('steam', {}, c); }
      if (Math.random() < 0.6) FX.dust(this.local(rand(-0.6, 0.6), rand(1, 2.6), rand(-0.4, 0.4)), 1, { c: KRAG_STEAM, smax: 1.2, rise: 2.6, life: 1.4 });
    } else if (ct < 3.1) {
      K.stage = 'kneel';
      if (once('kneel')) { Sound.play('kragStomp', {}, this.pos); FX.dust(this.pos, 10, { smax: 5 }); Game.shake(0.3); }
      if (Math.random() < 0.4) FX.dust(this.local(rand(-0.6, 0.6), rand(1, 2.2), rand(-0.4, 0.4)), 1, { c: KRAG_STEAM, smax: 1, rise: 2, life: 1.4 });
    } else if (ct < 3.45) {
      K.stage = 'collapse'; K.rot = clamp((ct - 3.1) / 0.35, 0, 1);
    } else {
      K.stage = 'down'; K.rot = 1;
      const f = this.fwd(), h = { x: this.pos.x + f.x * 1.5, y: this.pos.y, z: this.pos.z + f.z * 1.5 };
      if (once('down')) {
        Sound.play('thud', {}, h); Sound.play('kragStomp', {}, h);
        FX.dust(h, 20, { smax: 9, rise: 0.4 });
        FX.debris(h, 10, this.def.debris, 11);
        FX.decal('crack', h, { len: 3.6, dur: 10 });
        Game.shake(0.45);
      }
      if (ct >= 3.65 && once('big')) {
        if (own) { C.big = { text: 'KNOCKOUT', color: '#ffd070' }; C.bigT = 0; }
        Sound.play('ko');
        FX.flash('#fff4d0', 0.35);
        Game.shake(0.3);
      }
      if (Math.random() < 0.08) FX.embers({ x: h.x + rand(-0.8, 0.8), y: h.y + 0.4, z: h.z + rand(-0.8, 0.8) }, 1);
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
    this.husk = new KragHusk(this);
    Game.props.push(this.husk);
    Game.onKill(this, { cause: 'boss' });
    Game.closeCine();
    Sound.setIntensity(0.3);
    SaveData.unlocks.krag = true;
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
      const g = this.intro ? this.intro.g : P.y, pp = Game.player.pos, d = distXZ(pp, P);
      if (stage === 'fall') s = { look: { x: P.x, y: g + 3 + Math.min(18, (P.y - g) * 0.45), z: P.z }, yaw: yawOf(P.x - pp.x, P.z - pp.z) + 0.3, pitch: 0.42, dist: Math.min(16, d * 0.55 + 4), ease: 3 };
      else if (stage === 'impact') s = { look: at(1.3), yaw: y + Math.PI + 0.6, pitch: 0.06, dist: 9.5, ease: 3 };
      else if (stage === 'rise') s = { look: at(1.9), yaw: y + Math.PI + 0.35, pitch: 0.12, dist: 7, ease: 3 };
      else if (stage === 'roar') s = { look: at(2.5), yaw: y + Math.PI - 0.2, pitch: 0.14, dist: 5.4, ease: 4 };
      else s = { look: at(2.2), yaw: y + Math.PI + 0.45 - (ct - 3.75) * 0.06, pitch: 0.04, dist: 5.8, ease: 3 };
    } else {
      if (stage === 'impact') s = { look: at(1.9), yaw: y + Math.PI / 2 + 0.2, pitch: 0.02, dist: 7, ease: 4 };
      else if (stage === 'down') s = { look: at(0.7), yaw: y + Math.PI * 0.75 + (ct - 3.45) * 0.1, pitch: -0.5, dist: 8.5, ease: 1.5 };
      else s = { look: at(1.6), yaw: y + Math.PI * 0.8 + (ct - 1.3) * 0.15, pitch: -0.06, dist: 6.6, ease: 2 };
    }
    C.shot = s;
  }
}

// A molten vent: a glowing crack in the street, bubbling, that bursts into a column of fire. Standing on it as
// it erupts throws you up out of it.
class MoltenVent {
  constructor(pos, delay, owner) {
    this.kind = 'vent';
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.owner = owner; this.R = VENT.R; this.delay = Math.max(0.2, delay * S.enemies.telegraph);
    this.t = 0; this.phase = 'tell'; this.dead = false; this.hit = false;
    FX.decal('crack', { x: pos.x, y: pos.y, z: pos.z }, { len: 2.4, dur: 3 });
  }
  update(dt) {
    this.t += dt;
    const c = this.pos;
    if (this.phase === 'tell') {
      if (Math.random() < 0.5) FX.sparks({ x: c.x + rand(-0.6, 0.6), y: c.y + 0.05, z: c.z + rand(-0.6, 0.6) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 1, 4, KRAG_FIRE);
      if (this.t >= this.delay) {
        this.phase = 'erupt'; this.t = 0;
        FX.sparks({ x: c.x, y: c.y + 0.3, z: c.z }, 24, { x: 0, y: 1, z: 0 }, 0.6, 8, 22, Object.assign({ life: 1.1 }, KRAG_FIRE));
        FX.embers(c, 10);
        FX.dust(c, 6, { c: '#2a2026', smax: 3, rise: 3, life: 1.2 });
        FX.light({ x: c.x, y: c.y + 1.5, z: c.z }, '#ff8a2a', 5, 8, 0.4);
        Sound.play('molten', {}, c);
      }
      return;
    }
    if (this.phase === 'erupt') {
      if (Math.random() < 0.8) FX.sparks({ x: c.x + rand(-0.4, 0.4), y: c.y + rand(0.5, 3), z: c.z + rand(-0.4, 0.4) }, 1, { x: 0, y: 1, z: 0 }, 0.5, 4, 10, KRAG_FIRE);
      const P = Game.player;
      if (!this.hit && !P.dead && distXZ(P.pos, c) < this.R + P.r && P.pos.y > c.y - 0.4 && P.pos.y < c.y + 3.2) {
        this.hit = true;
        const res = P.takeHit({ dmg: VENT.DMG * (this.owner ? this.owner.dmgMul : 1), from: { x: c.x, y: c.y - 0.5, z: c.z }, kind: 'shockwave', source: this.owner && !this.owner.dead ? this.owner : null, knock: 10 });
        if (res === 'hit') { P.vel.y = Math.max(P.vel.y, 17); P.onGround = false; }
      }
      if (this.t >= VENT.ERUPT) { this.phase = 'fade'; this.t = 0; }
      return;
    }
    if (this.t >= 0.4) this.dead = true;
  }
}

// What's left of KRAG after a knockout: the body lying where it fell (render.js hands it over), smoking, until
// the next wave.
class KragHusk {
  constructor(r) {
    this.kind = 'husk';
    const f = r.fwd();
    this.pos = { x: r.pos.x + f.x * 1.4, y: r.pos.y, z: r.pos.z + f.z * 1.4 }; this.rig = null;
    this.r = 1.3; this.h = 0.9; this.dead = false; this.t = 0; this.wave = Director.wave; this.fade = 0;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 0.4, z: this.pos.z }; }
  hit() { FX.sparks(this.center(), 6, null, TAU, 3, 10, KRAG_SPARK); }
  update(dt) {
    this.t += dt;
    if (!this.fade && Director.wave !== this.wave) {
      this.fade = 0.001;
      FX.ring({ x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, 0.3, 3, 0.4, { c: KRAG_ORANGE });
      Sound.play('spawn', {}, this.pos);
    }
    if (this.fade) { this.fade += dt; if (this.fade > 0.5) this.dead = true; }
    if (Math.random() < 0.05) FX.dust({ x: this.pos.x + rand(-0.8, 0.8), y: this.pos.y + 0.4, z: this.pos.z + rand(-0.8, 0.8) }, 1, { c: '#3a3442', smax: 0.9, rise: 1.6, life: 1.8 });
    if (Math.random() < 0.03) FX.embers({ x: this.pos.x + rand(-0.8, 0.8), y: this.pos.y + 0.3, z: this.pos.z + rand(-0.8, 0.8) }, 1);
  }
}
