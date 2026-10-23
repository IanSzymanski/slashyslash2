'use strict';
// Training, in the training hall (world.js): three rooms. The first visit runs a guided tutorial: one move at a
// time, a line of text and then a task, up and round the movement hall, through the tether room and its ball
// machine, and down into the combat hall to the dummy. Every step has a checkpoint: fall off, miss, or end up
// somewhere the step doesn't allow, and you're put back to try it again. Afterwards the combat hall is a
// practice area: the dummy stands still or swings at you with yellow flashes (parry them) or red ones (get
// behind it), and pause opens a panel to spawn any enemy or the rival, set the dummy, toggle upgrades and
// modifiers, refill, and replay the tutorial. You can't die here.

// ---------- the dummy: a training bot anchored on its mat ----------
ENEMY_DEFS.dummy = { hp: 3000, r: 0.45, h: 1.8, speed: 0, score: 0, mass: 99, dmg: 8, heavy: true, debris: ['#d8dce4', '#e8843a', '#3a3e48', '#b8bec8'] };
ENEMY_BASE_STATE.dummy = 'idle';
GLINT_AT.dummy = ['weapon', 0.1];
// yellow: an overhead chop you parry. red: a blow no parry or dash stops, landing on everything round it but
// the 90 degree wedge behind it; its body blocks walking through, so you dash through it.
const DUMMY = { WIND: 0.65, RED_WIND: 1.05, REACH: 2.6, RED_R: 6, RED_CUE: 0.25, RED_CONNECT: 0.09 };
const DUMMY_MODES = { still: 'Dummy: still', yellow: 'Dummy: yellow swings', red: 'Dummy: red flashes', mixed: 'Dummy: yellow and red', fast: 'Dummy: fast yellow' };
const DUMMY_RED = '#ff2a3a';

MODELS.dummy = humanoidModel(1.0, {
  body: '#d8dce4', dark: '#3a3e48', vest: '#e8843a', limb: '#b8bec8', boot: '#1a1c22', eye: '#4af0ff',
  extra: [
    // a target on its chest, rings out from the middle
    { bone: 'chest', size: [0.26, 0.26, 0.03], at: [0, 0.1, -0.16], color: '#f4f4f8' },
    { bone: 'chest', size: [0.17, 0.17, 0.04], at: [0, 0.1, -0.165], color: '#e8843a' },
    { bone: 'chest', size: [0.07, 0.07, 0.05], at: [0, 0.1, -0.17], color: '#ff3048', glow: true },
    { bone: 'head', size: [0.3, 0.05, 0.3], at: [0, 0.2, -0.02], color: '#e8843a' },
    // a practice sword down the weapon bone: grip, guard, a long blunt blade
    { bone: 'weapon', size: [0.045, 0.18, 0.045], at: [0, 0.02, 0], color: '#2a2c34' },
    { bone: 'weapon', size: [0.2, 0.035, 0.06], at: [0, -0.08, 0], color: '#e8843a' },
    { bone: 'weapon', size: [0.035, 0.95, 0.08], at: [0, -0.58, -0.01], color: '#d8dce4', tag: 'blade' },
  ],
});

// stance on the spot; the yellow chop from overhead; the red blow drawn back low and swept round
Poses.dummy = function (r, e) {
  Rig.reset(r);
  const B = r.bones, st = e.state;
  B.thighL.rotation.x = 0.3; B.shinL.rotation.x = -0.45; B.thighR.rotation.x = -0.2; B.shinR.rotation.x = -0.3;
  B.hips.position.y = r.rest.hips.y - 0.05;
  B.armL.rotation.x = 0.5; B.foreL.rotation.x = 0.8; B.armL.rotation.z = -0.25;
  let arm = 0.7, fore = 1.0, wpn = -1.3, lean = -0.12, twist = 0, out = 0;
  if (st === 'windup') {
    const k = easeOutCubic(clamp(e.st / e.tele(DUMMY.WIND), 0, 1));
    arm = lerp(0.7, -2.6, k); fore = lerp(1.0, 0.9, k); wpn = lerp(-1.3, -0.3, k); lean = lerp(-0.12, 0.08, k); twist = 0.4 * k;
  } else if (st === 'strike') {
    const k = clamp(e.st / 0.12, 0, 1);
    arm = lerp(-2.6, 1.3, easeOutCubic(k)); fore = 0.2; wpn = -0.1; lean = -0.5; twist = lerp(0.4, -0.35, k);
  } else if (st === 'redWind') {
    // wide and low, the blade drawn back behind the hip, shaking as it fills
    const k = easeOutCubic(clamp(e.st / e.tele(DUMMY.RED_WIND), 0, 1)), sh = k > 0.6 ? rand(-0.04, 0.04) : 0;
    B.thighL.rotation.z = 0.3 * k; B.thighR.rotation.z = -0.3 * k; B.thighL.rotation.x = 0.3 + 0.3 * k; B.shinL.rotation.x = -0.45 - 0.5 * k;
    B.hips.position.y = r.rest.hips.y - 0.05 - 0.14 * k;
    arm = lerp(0.7, -0.9, k) + sh; fore = lerp(1.0, 0.25, k); wpn = lerp(-1.3, 0.5, k); lean = lerp(-0.12, -0.4, k); twist = -0.8 * k + sh;
  } else if (st === 'redStrike') {
    // a flat sweep right round
    const k = easeOutCubic(clamp(e.st / 0.16, 0, 1));
    arm = 1.4; fore = 0.1; wpn = 0.2; out = 1.1; lean = -0.35; twist = lerp(-0.8, 1.6, k);
  } else if (st === 'recover') {
    arm = 1.0; fore = 0.3; wpn = 0.2; lean = -0.35; twist = -0.15;
  }
  if (e.stun > 0) { Poses.stunned(r, e); return; }
  B.spine.rotation.x = lean; B.chest.rotation.y = twist;
  B.armR.rotation.x = arm; B.armR.rotation.z = out; B.foreR.rotation.x = fore; B.weapon.rotation.x = wpn;
  const red = st === 'redWind' || st === 'redStrike';
  Rig.tint(r, 'eye', red ? DUMMY_RED : st === 'windup' ? '#ffe060' : '#4af0ff');
  Rig.tint(r, 'blade', red ? DUMMY_RED : st === 'windup' ? '#ffd040' : '#d8dce4');
};

Enemy.prototype.dummy = function (dt) {
  const p = Game.player, mode = (Game.training && Game.training.dummy) || 'still';
  if (!this.home) this.home = { x: this.pos.x, z: this.pos.z };
  this.pos.x = this.home.x; this.pos.z = this.home.z; this.vel.x = this.vel.z = 0;
  const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz), dy = Math.abs(p.pos.y - this.pos.y);
  switch (this.state) {
    case 'idle':
      this.turnToward(p.pos.x, p.pos.z, 5, dt);
      if (mode !== 'still' && this.cd <= 0 && !p.dead && dy < 2.5 && !Game.cineActive()) {
        const red = mode === 'red' || (mode === 'mixed' && chance(0.4));
        if (red && d < DUMMY.RED_R) this.startRed();
        else if (!red && d < DUMMY.REACH + 1.2) this.startWind('windup');
      }
      break;
    case 'windup':
      // tracks you through most of it, then commits to its line
      if (this.st < this.tele(DUMMY.WIND) * 0.7) this.turnToward(p.pos.x, p.pos.z, 4, dt);
      if (this.st >= this.tele(DUMMY.WIND)) { this.setState('strike'); this.struck = false; Sound.play('enemyMelee', {}, this.center()); }
      break;
    case 'strike':
      if (!this.struck) {
        const f = this.fwd(), along = dx * f.x + dz * f.z, side = Math.abs(dx * -f.z + dz * f.x);
        if (along > -p.r && along < DUMMY.REACH + p.r && side < 0.9 + p.r && dy < 1.8) {
          this.struck = true;
          const res = p.takeHit({ dmg: this.dmg(), from: this.center(), kind: 'melee', source: this, knock: 12 });
          if (res === 'parried') Training.count('parry');
          if (res === 'hit') Training.count('yellowHit');
        }
      }
      if (this.st > 0.15) this.setState('recover');
      break;
    case 'redWind': this.runRed(dt, p, d, dy); break;
    case 'redStrike':
      if (!this.struck && this.st >= DUMMY.RED_CONNECT) {
        this.struck = true;
        if (!p.dead && this.behindMe(p)) {
          // it swung at nothing: you're behind it, and it's wide open
          Training.count('redDodge');
          this.stun = 1.2;
          FX.sparks(this.center(), 14, null, TAU, 4, 12, { c0: '#ffffff', c1: '#ff8a9a', c2: '#781e2a' });
          Sound.play('clash', {}, this.center());
        } else if (!p.dead && d <= DUMMY.RED_R && dy < 3) {
          const res = p.takeHit({ dmg: 12, from: this.center(), kind: 'melee', source: this, knock: 20, unparryable: true, through: true });
          if (res === 'hit') { Training.count('redHit'); FX.flash('#ff1030', 0.3); }
        }
      }
      if (this.st > 0.32) this.setState('recover');
      break;
    case 'recover':
      if (this.st > 0.5) { this.setState('idle'); this.cd = mode === 'fast' ? 0.5 : mode === 'red' ? 2.2 : 1.6; this.windMul = 1; }
      break;
  }
};
// The red flash: it locks its facing as it flares, red energy gathers into it and its eye flashes red just
// before the blow. It doesn't turn, and you can't walk through it: dash through to its back.
Enemy.prototype.startRed = function () {
  const p = Game.player;
  this.setState('redWind');
  this.yaw = yawOf(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
  this.windMul = 1;
  const g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z }, c = this.center();
  FX.ring(g, 0.5, 6, 0.35, { c: DUMMY_RED });
  FX.sparks(c, 20, { x: 0, y: 1, z: 0 }, 1.2, 5, 15, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
  FX.light(c, DUMMY_RED, 5, 9, 0.5);
  Sound.play('peril', { dur: Math.max(0.1, this.tele(DUMMY.RED_WIND) - DUMMY.RED_CUE) });
};
Enemy.prototype.runRed = function (dt, p, d, dy) {
  const wind = this.tele(DUMMY.RED_WIND), c = this.center(), k = clamp(this.st / Math.max(0.05, wind - DUMMY.RED_CUE), 0, 1);
  for (let i = 0; i < 2; i++) {
    const u = coneDir(null, TAU), R = lerp(3, 1.4, k), q = { x: c.x + u.x * R, y: c.y + u.y * R * 0.8, z: c.z + u.z * R };
    FX.sparks(q, 1, { x: -u.x, y: -u.y, z: -u.z }, 0.05, R * 3, R * 3.6, { c0: '#ffffff', c1: '#ff4a5a', c2: '#781e2a', g: 0, life: 0.7 });
  }
  if ((this._ring = (this._ring || 0) - dt) <= 0) { this._ring = lerp(0.3, 0.12, k); FX.ring({ x: this.pos.x, y: this.pos.y + 0.05, z: this.pos.z }, 3 - 1.6 * k, 0.5, 0.2, { c: DUMMY_RED }); }
  // its body stands in your way unless you dash or cut through it
  if (!p.dead && p.dashT <= 0 && p.dashEndT <= 0 && !p.iaido && dy < this.h) {
    const R = this.r + p.r + 0.05, ex = p.pos.x - this.pos.x, ez = p.pos.z - this.pos.z, l = Math.hypot(ex, ez);
    if (l < R) {
      const ux = l > 1e-3 ? ex / l : fwdX(this.yaw), uz = l > 1e-3 ? ez / l : fwdZ(this.yaw);
      p.pos.x = this.pos.x + ux * R; p.pos.z = this.pos.z + uz * R;
      const vn = p.vel.x * ux + p.vel.z * uz;
      if (vn < 0) { p.vel.x -= vn * ux; p.vel.z -= vn * uz; }
    }
  }
  if (!this.glinted && this.st >= wind - DUMMY.RED_CUE) {
    this.glinted = true;
    const at = this.model && this.model.bones.head ? Rig.boneWorld(this.model, 'head', new THREE.Vector3()) : { x: c.x, y: this.pos.y + this.h, z: c.z };
    FX.glint({ x: at.x, y: at.y + 0.1, z: at.z }, { c: DUMMY_RED, size: 1.6, dur: 0.24, threat: this });
    Sound.play('glint', {}, c);
  }
  if (this.st >= wind) {
    this.setState('redStrike'); this.struck = false;
    const f = this.fwd();
    FX.swoosh({ x: c.x, y: c.y, z: c.z, oy: 0, yaw: this.yaw, tilt: 0, r: DUMMY.RED_R * 0.55, span: 4.6, dir: -1, sweep: 0.12, dur: 0.28, thick: 0.5, pal: 'red', trail: 1, bolts: 3 });
    FX.light({ x: c.x + f.x * 2, y: c.y, z: c.z + f.z * 2 }, DUMMY_RED, 6, 10, 0.25);
    Sound.play('enemyMelee', {}, c);
    Game.shake(0.25);
  }
};
// within 45 degrees of straight behind it
Enemy.prototype.behindMe = function (p) {
  const f = this.fwd(), dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, d = Math.hypot(dx, dz);
  return d > 0.3 && (dx * f.x + dz * f.z) / d < -Math.SQRT1_2;
};

// ---------- the tether room: a battered ball machine, its footballs, and the door to the combat hall ----------
// The machine lobs a football at you on an arc it shows first; tether the ball in the air and time slows while
// you reel in and kick it where the crosshair points. Between the posts and over the bar is a goal.
const BALL = { G: 22, FLIGHT: 1.3, WIND: 1.0, KICK: 40, KICK_G: 8, MACHINE_S: 1.5 };
const legRot = (a, r, h) => {
  const d = new THREE.Vector3(-Math.sin(a) * r, h, -Math.cos(a) * r).normalize();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
  return [e.x, e.y, e.z];
};
MODELS.football = {
  bones: [['root', null, 0, 0, 0]], scale: 1.3,
  parts: [
    // two six-sided cones nose to nose along z, laces on top
    { bone: 'root', shape: 'hex', size: [0.26, 0.2, 0.26], at: [0, 0, 0.1], rot: [Math.PI / 2, 0, 0], taper: 0.3, color: '#7a3a1e' },
    { bone: 'root', shape: 'hex', size: [0.26, 0.2, 0.26], at: [0, 0, -0.1], rot: [-Math.PI / 2, 0, 0], taper: 0.3, color: '#7a3a1e' },
    { bone: 'root', size: [0.025, 0.03, 0.13], at: [0, 0.11, 0], color: '#f4f0e8', plain: true },
    { bone: 'root', size: [0.07, 0.03, 0.018], at: [0, 0.112, 0.04], color: '#f4f0e8', plain: true },
    { bone: 'root', size: [0.07, 0.03, 0.018], at: [0, 0.112, 0], color: '#f4f0e8', plain: true },
    { bone: 'root', size: [0.07, 0.03, 0.018], at: [0, 0.112, -0.04], color: '#f4f0e8', plain: true },
  ],
};
// faded blue, rusted and taped together, on a tripod with one bent leg; two six-sided wheels throw the ball
MODELS.ballMachine = {
  bones: [['root', null, 0, 0, 0], ['head', 'root', 0, 1.15, 0], ['wheelL', 'head', -0.25, 0.16, -0.46], ['wheelR', 'head', 0.25, 0.16, -0.46]], scale: BALL.MACHINE_S,
  parts: [
    ...[[0.5, 0.62], [2.6, 0.62], [4.3, 0.5]].map(([a, r]) => ({ bone: 'root', size: [0.07, Math.hypot(r, 1.04), 0.07], at: [Math.sin(a) * r * 0.5, 0.52, Math.cos(a) * r * 0.5], rot: legRot(a, r, 1.04), color: '#4a4a52' })),
    { bone: 'root', size: [0.1, 0.16, 0.1], at: [Math.sin(4.3) * 0.17, 0.75, Math.cos(4.3) * 0.17], color: '#b8b8b0', plain: 0.5 },
    { bone: 'root', size: [0.24, 0.14, 0.24], at: [0, 1.06, 0], color: '#2a2a30' },
    { bone: 'head', size: [0.62, 0.36, 0.56], at: [0, 0.16, 0.08], color: '#3e5a86' },
    { bone: 'head', size: [0.22, 0.16, 0.02], at: [0.14, 0.2, -0.205], color: '#8a4a26' },
    { bone: 'head', size: [0.12, 0.1, 0.02], at: [-0.18, 0.06, 0.37], color: '#8a4a26' },
    { bone: 'head', size: [0.64, 0.06, 0.06], at: [0, 0.22, 0.27], color: '#b8b8b0', plain: 0.5 },
    { bone: 'head', size: [0.06, 0.38, 0.58], at: [-0.19, 0.16, 0.08], color: '#b8b8b0', plain: 0.5 },
    { bone: 'head', size: [0.2, 0.16, 0.66], at: [0, 0.16, -0.52], color: '#8a8a92', taper: 0.9 },
    { bone: 'head', size: [0.46, 0.34, 0.46], at: [0, 0.5, 0.1], color: '#d8702a', taper: 1.35 },
    { bone: 'head', size: [0.16, 0.12, 0.26], at: [0.05, 0.68, 0.08], rot: [0, 0.4, 0.2], color: '#7a3a1e' },
    { bone: 'head', size: [0.3, 0.28, 0.3], at: [0, 0.08, 0.5], color: '#26262c' },
    { bone: 'head', size: [0.07, 0.07, 0.07], at: [0.24, 0.39, 0.3], color: '#3aff6a', glow: true, plain: true, tag: 'lamp' },
    { bone: 'wheelL', shape: 'hex', size: [0.46, 0.12, 0.46], color: '#1c1c22' },
    { bone: 'wheelL', shape: 'hex', size: [0.16, 0.14, 0.16], color: '#c8c8d0' },
    { bone: 'wheelL', size: [0.07, 0.13, 0.1], at: [0.17, 0, 0], color: '#e8c040' },
    { bone: 'wheelR', shape: 'hex', size: [0.46, 0.12, 0.46], color: '#1c1c22' },
    { bone: 'wheelR', shape: 'hex', size: [0.16, 0.14, 0.16], color: '#c83a2a' },
    { bone: 'wheelR', size: [0.07, 0.13, 0.1], at: [-0.17, 0, 0], color: '#e8c040' },
  ],
};
// the door: hazard-striped slats with a red strip along the foot while it's shut
MODELS.shutter = {
  bones: [['root', null, 0, 0, 0]],
  parts: [
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ bone: 'root', size: [4, 0.48, 0.16], at: [0, 0.25 + i * 0.5, 0], color: i % 2 ? '#e8b820' : '#2a2a30' })),
    { bone: 'root', size: [3.9, 0.06, 0.2], at: [0, 0.04, 0], color: '#ff2a3a', glow: true, plain: true, tag: 'lamp' },
  ],
};

class Football {
  constructor(pos, vel, T) {
    this.kind = 'football';
    this.pos = { x: pos.x, y: pos.y, z: pos.z }; this.prev = { x: pos.x, y: pos.y, z: pos.z }; this.vel = { x: vel.x, y: vel.y, z: vel.z };
    this.state = 'flying'; this.hostile = true; this.rebound = true; this.grabR = 1.0; this.tethered = false; this.dead = false;
    this.t = 0; this.T = T; this.life = 9; this.rest = 0; this.judged = false; this.thudT = 0;
    this.dir = unit(vel.x, vel.y, vel.z); this.roll = 0; this.spinV = rand(9, 15) * (chance(0.5) ? 1 : -1);
  }
  center() { return this.pos; }
  get tetherable() { return this.state === 'flying' && !this.dead; }
  catch() { this.state = 'caught'; this.hostile = false; }
  kick(dir) {
    this.state = 'kicked'; this.hostile = false; this.life = 4; this.t = 0;
    this.vel = { x: dir.x * BALL.KICK, y: dir.y * BALL.KICK, z: dir.z * BALL.KICK };
    this.dir = { x: dir.x, y: dir.y, z: dir.z }; this.spinV = 34;
    Training.count('kick');
  }
  // a parry or a slash bats it off: no kick, so no goal
  reflect(to) {
    const p = this.pos, d = unit(to.x - p.x, to.y - p.y, to.z - p.z);
    this.state = 'loose'; this.hostile = false;
    this.vel = { x: d.x * 14, y: Math.max(d.y * 14, 5), z: d.z * 14 };
    Sound.play('thud', {}, p);
  }
  onSlash() { this.reflect(Camera.aim); }
  update(dt) {
    this.t += dt; this.life -= dt; this.thudT -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = this.pos, v = this.vel;
    this.prev.x = p.x; this.prev.y = p.y; this.prev.z = p.z;
    if (this.state === 'caught') {
      if (this.tethered) {
        const k = Math.max(0, 1 - 5 * dt);
        v.x *= k; v.y *= k; v.z *= k;
        p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
        this.roll += this.spinV * dt;
        return;
      }
      this.state = 'flying'; this.hostile = true;
    }
    if (this.state === 'rest') { this.rest += dt; if (this.rest > 1.6) this.dead = true; return; }
    v.y -= (this.state === 'kicked' ? BALL.KICK_G : BALL.G) * dt;
    for (let i = 0; i < 3; i++) {
      const ox = p.x, oy = p.y, oz = p.z;
      p.x += (v.x * dt) / 3; p.y += (v.y * dt) / 3; p.z += (v.z * dt) / 3;
      if (this.state === 'kicked' && !this.judged) this.judge(oz);
      if (World.pointSolid(p.x, p.y, p.z, 0.12)) { this.bounce(ox, oy, oz); if (this.state === 'rest') return; continue; }
      if (this.hostile && this.touchPlayer()) return;
    }
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > 3 && this.state !== 'loose') this.dir = { x: v.x / sp, y: v.y / sp, z: v.z / sp };
    this.roll += this.spinV * dt;
    if (this.state === 'kicked' && Math.random() < 0.7) FX.sparks(p, 1, null, TAU, 0.5, 2, { c0: '#ffffff', c1: '#ffe080', c2: '#c86a2a', g: 0, life: 0.35 });
  }
  // off whatever it hit, the axis it came in on flipped and the speed cut; a slow bounce on the floor ends it
  bounce(ox, oy, oz) {
    const p = this.pos, v = this.vel, sp = Math.hypot(v.x, v.y, v.z);
    const sx = World.pointSolid(p.x, oy, oz, 0.12), sy = World.pointSolid(ox, p.y, oz, 0.12), sz = World.pointSolid(ox, oy, p.z, 0.12);
    p.x = ox; p.y = oy; p.z = oz;
    if (sx) v.x = -v.x * 0.5;
    if (sy) v.y = -v.y * 0.45;
    if (sz) v.z = -v.z * 0.5;
    if (!sx && !sy && !sz) { v.x = -v.x * 0.4; v.y = -v.y * 0.4; v.z = -v.z * 0.4; }
    v.x *= 0.8; v.z *= 0.8;
    // footballs bounce where they like
    v.x += rand(-1.5, 1.5); v.z += rand(-1.5, 1.5);
    this.spinV = rand(-20, 20);
    if (this.state !== 'kicked') { this.state = 'loose'; this.hostile = false; }
    if (sp > 4 && this.thudT <= 0) { this.thudT = 0.15; Sound.play('thud', {}, p); FX.dust(p, 2, { smax: 0.8 }); }
    if (sy && Math.abs(v.y) < 2.2 && Math.hypot(v.x, v.z) < 3) { this.state = 'rest'; v.x = v.y = v.z = 0; }
  }
  // a ball you didn't catch knocks you about a little; a parry bats it away
  touchPlayer() {
    const P = Game.player, p = this.pos;
    if (P.dead || !pointInBody(p, P, 0.22)) return false;
    if (P.parryActive()) { P.doParry({ from: { x: p.x, y: p.y, z: p.z }, proj: this }); return true; }
    const u = unit(this.vel.x, 0, this.vel.z);
    P.vel.x += u.x * 6; P.vel.z += u.z * 6; P.vel.y = Math.max(P.vel.y, 4);
    this.vel = { x: -this.vel.x * 0.25, y: 4, z: -this.vel.z * 0.25 };
    this.state = 'loose'; this.hostile = false;
    Sound.play('thud', {}, p);
    FX.sparks(p, 6, { x: -u.x, y: 0.4, z: -u.z }, 1, 2, 6, { c0: '#ffffff', c1: '#c8a080', c2: '#6a3a1e' });
    Game.shake(0.12);
    return true;
  }
  // through the goal's plane: between the posts and over the bar is a goal; clipping a post bounces it out
  judge(oz) {
    const G = World.def.course.GOAL, p = this.pos;
    if (!(oz > G.z && p.z <= G.z)) return;
    this.judged = true;
    if (p.y > G.y0 && p.y < G.y1 && Math.abs(p.x - G.x0) < 0.3) { this.vel.x = -Math.abs(this.vel.x) - 4; this.vel.z = -this.vel.z * 0.4; Sound.play('clash', {}, p); return; }
    if (p.y > G.y0 && p.y < G.y1 && Math.abs(p.x - G.x1) < 0.3) { this.vel.x = Math.abs(this.vel.x) + 4; this.vel.z = -this.vel.z * 0.4; Sound.play('clash', {}, p); return; }
    if (p.x > G.x0 && p.x < G.x1 && p.y > G.y0 && p.y < G.y1) Training.goal(p);
  }
}

// ---------- the practice area ----------
const TRAIN_TYPES = [
  ['scrapper', 'Scrapper'], ['gunner', 'Gunner'], ['drone', 'Drone'], ['brute', 'Brute'],
  ['shielder', 'Shield scrapper'], ['crawler', 'Armoured crawler'], ['grenadier', 'Grenadier'], ['sniper', 'Rooftop sniper'],
];

const Training = {
  dummy: null, doorOpen: true, doorK: 1, machine: null, rigs: null,
  start() {
    Game.training = { dummy: 'still', counts: {} };
    this.machine = { state: 'idle', t: 0, wait: 0.6, spin: 0, yaw: 0, pitch: 0.3, recoil: 0, plan: null, ball: null };
    Tutorial.active = false;
    this.setDoor(true, true);
    if (!SaveData.tutorialDone) Tutorial.begin(false);
  },
  // the dummy on its mat, and nothing else
  reset() {
    for (const e of Game.enemies) if (e.stopLoops) e.stopLoops();
    Game.enemies = []; Game.projectiles = []; Game.hazards = [];
    this.makeDummy();
  },
  makeDummy() {
    const D = World.def.course.DUMMY, d = new Enemy('dummy', { x: D.x, y: 0, z: D.z }, {});
    d.spawning = false; d.yaw = D.yaw; d.cd = 1;
    d.log = [];
    // it never dies: it patches itself up
    d.onDeath = () => {
      d.hp = d.maxHp;
      FX.ring(d.center(), 0.3, 2.2, 0.3, { c: '#ffd070', flat: false });
    };
    d.onHurt = (dmg, o) => { d.log.push({ t: Game.time, d: dmg }); this.count(o.cause || 'hit'); };
    d.outline = () => (d.state === 'redWind' ? (d.glinted && ((Game.realTime * 30) | 0) % 2 ? '#ffffff' : DUMMY_RED) : null);
    Game.enemies.push(d);
    this.dummy = d;
    return d;
  },
  // the dummy steps off its mat for the fight, and back on afterwards
  dummyOut() {
    const d = this.dummy;
    if (!d) return;
    if (d.stopLoops) d.stopLoops();
    Game.enemies = Game.enemies.filter((e) => e !== d);
    FX.ring({ x: d.pos.x, y: 0.06, z: d.pos.z }, 0.4, 2.4, 0.35, { c: '#3ad0ff' });
    FX.sparks(d.center(), 18, { x: 0, y: 1, z: 0 }, 1, 3, 10, { c0: '#ffffff', c1: '#9ae8ff', c2: '#1a6aa0' });
    this.dummy = null;
  },
  dummyIn() {
    if (this.dummy && Game.enemies.includes(this.dummy)) return;
    const d = this.makeDummy();
    FX.ring({ x: d.pos.x, y: 0.06, z: d.pos.z }, 2.4, 0.4, 0.35, { c: '#3ad0ff' });
    FX.sparks(d.center(), 18, { x: 0, y: 1, z: 0 }, 1, 3, 10, { c0: '#ffffff', c1: '#9ae8ff', c2: '#1a6aa0' });
    Sound.play('spawn', {}, d.pos);
  },
  count(k) { const C = Game.training && Game.training.counts; if (C) C[k] = (C[k] || 0) + 1; },
  n(k) { const C = Game.training && Game.training.counts; return (C && C[k]) || 0; },
  // damage per second on the dummy over the last three seconds
  dps() {
    const d = this.dummy;
    if (!d || !d.log) return 0;
    while (d.log.length && Game.time - d.log[0].t > 3) d.log.shift();
    return Math.round(d.log.reduce((a, b) => a + b.d, 0) / 3);
  },

  update(dt) {
    const p = Game.player;
    // health comes back once you've gone a few seconds without being hit
    if (p.shieldDelay < -1 && p.hp < PC.MAX_HP && !p.dead) p.hp = Math.min(PC.MAX_HP, p.hp + 40 * dt);
    this.gate(p);
    this.updateMachine(dt, Tutorial.active && Tutorial.step().id === 'football' && Tutorial.doneT <= 0);
    this.doorK = approach(this.doorK, this.doorOpen ? 1 : 0, dt * 1.2);
    if (Tutorial.active) Tutorial.update(dt);
    // a fall out of the building (there's no way out, but a zip could still find one) puts you back
    else if (p.pos.y < -5) this.place(p, World.def.playerStart);
  },
  // The laser doorway: crossing it without a dash throws you back the way you came. A dash, or anything that
  // can't be hit, goes through.
  gate(p) {
    const G = World.def.course.GATE, ax = G.axis, bx = ax === 'x' ? 'z' : 'x';
    const s0 = p.prev[ax] - G.at, s1 = p.pos[ax] - G.at;
    if (s0 * s1 >= 0 || p.pos[bx] < G.a0 - p.r || p.pos[bx] > G.a1 + p.r || p.pos.y > G.y1 || p.pos.y + p.h < G.y0) return;
    const at = { x: p.pos.x, y: p.pos.y + 1, z: p.pos.z };
    at[ax] = G.at;
    const dir = { x: 0, y: 0.3, z: 0 };
    if (p.dashT > 0 || p.dashEndT > 0 || p.iframes > 0) {
      this.count('gate');
      dir[ax] = Math.sign(s1);
      FX.sparks(at, 18, dir, 1.4, 5, 16, { c0: '#ffffff', c1: '#ff8a9a', c2: '#781e2a' });
      Sound.play('reflect', {}, at);
      return;
    }
    const side = Math.sign(s0) || 1;
    p.pos[ax] = G.at + side * (p.r + 0.15); p.vel[bx] *= 0.3; p.vel[ax] = side * 9; p.vel.y = Math.max(p.vel.y, 4);
    if (p.tether) p.releaseTether();
    dir[ax] = side; dir.y = 0.4;
    FX.sparks(at, 22, dir, 1.3, 5, 18, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
    FX.light(at, '#ff3048', 4, 6, 0.2);
    Sound.play('shieldBreak', {}, at);
    const from = { x: p.pos.x, y: at.y, z: p.pos.z };
    from[ax] = G.at;
    FPFX.kick('guard', { from });
    Game.shake(0.2);
    this.count('zap');
  },
  // the shutter between the football field and the combat hall: its box rises into the wall when it opens
  setDoor(open, now) {
    const D = World.def.course.DOOR;
    if (!D) return;
    this.doorOpen = open;
    if (now) this.doorK = open ? 1 : 0;
    D.box.min.y = open ? D.y1 + 0.3 : D.y0; D.box.max.y = open ? D.y1 * 2 - D.y0 + 0.3 : D.y1;
  },
  // puts you down at a checkpoint, standing, everything you were doing in the air dropped
  place(p, s) {
    p.pos.x = p.prev.x = s.x; p.pos.y = p.prev.y = s.y; p.pos.z = p.prev.z = s.z;
    p.vel.x = p.vel.y = p.vel.z = 0;
    if (p.tether) p.releaseTether();
    Game.endBulletTime();
    Controller.dropCling(p);
    p.mantle = null; p.vault = null; p.dashT = 0; p.sliding = false; p.crouching = false; p.h = PC.H; p.skid = null;
    p.dashCharges = PC.DASH_CHARGES; p.airJumps = 1;
    p.yaw = s.yaw || 0; Camera.yaw = p.yaw;
    Camera.snap(p);
  },

  // ---------- the ball machine ----------
  // where a ball fired now would leave the chute, and the throw that lands it on your chest after FLIGHT
  planShot(p) {
    const S = BALL.MACHINE_S, D = World.def.course.MACHINE, c = p.chest(), hx = D.x, hy = D.y + 1.31 * S, hz = D.z;
    const yaw = yawOf(c.x - hx, c.z - hz), o = { x: hx + fwdX(yaw) * 0.9 * S, y: hy + 0.05, z: hz + fwdZ(yaw) * 0.9 * S }, T = BALL.FLIGHT;
    const v = { x: (c.x - o.x) / T, y: (c.y - o.y) / T + 0.5 * BALL.G * T, z: (c.z - o.z) / T };
    return { o, v, T, yaw, pitch: Math.atan2(v.y, Math.hypot(v.x, v.z)) };
  },
  updateMachine(dt, active) {
    const M = this.machine, D = World.def.course.MACHINE, p = Game.player;
    if (!M) return;
    M.recoil = Math.max(0, M.recoil - dt * 4);
    M.spin = approach(M.spin, M.state === 'wind' ? 1 : M.state === 'cool' ? 0.5 : active ? 0.12 : 0, dt * 1.6);
    // it sputters: a puff from the motor now and then, sparks off a wheel while it spins hard
    const S = BALL.MACHINE_S;
    if (M.spin > 0.05 && Math.random() < dt * 1.5) FX.dust({ x: D.x - fwdX(M.yaw) * 0.5 * S, y: D.y + 1.4 * S, z: D.z - fwdZ(M.yaw) * 0.5 * S }, 1, { smax: 0.6, rise: 1.5, c: '#5a5a62' });
    if (M.spin > 0.7 && Math.random() < dt * 8) FX.sparks({ x: D.x + fwdX(M.yaw) * 0.45 * S, y: D.y + 1.3 * S, z: D.z + fwdZ(M.yaw) * 0.45 * S }, 1, null, TAU, 2, 6, { c0: '#ffffff', c1: '#ffd070', c2: '#a04010' });
    if (!active) { M.state = 'idle'; M.plan = null; return; }
    const ball = M.ball, busy = ball && !ball.dead && ball.state !== 'rest' && ball.state !== 'loose' && !(ball.state === 'kicked' && ball.judged);
    switch (M.state) {
      case 'idle':
        M.wait -= dt;
        if (busy) M.wait = 0.9;
        else if (M.wait <= 0 && p.onGround && p.pos.y > World.def.course.FIELD.y - 0.5) { M.state = 'wind'; M.t = 0; Sound.play('gunSpin', {}, D); }
        break;
      case 'wind':
        M.t += dt;
        // it tracks you, then holds its line for the last moment so the arc you see is the one it throws
        if (M.t < BALL.WIND - 0.3 || !M.plan) M.plan = this.planShot(p);
        if (M.t >= BALL.WIND) this.fire();
        break;
      case 'cool':
        M.t += dt;
        if (M.t > 0.7) { M.state = 'idle'; M.wait = 0.9; }
        break;
    }
    if (M.plan) { M.yaw = M.plan.yaw; M.pitch = M.plan.pitch; }
  },
  fire() {
    const M = this.machine, P = M.plan, o = P.o;
    const b = new Football(o, P.v, P.T);
    Game.projectiles.push(b);
    M.ball = b; M.state = 'cool'; M.t = 0; M.recoil = 1;
    Sound.play('throw', {}, o); Sound.play('kick', {}, o);
    FX.dust(o, 3, { smax: 1, rise: 2, c: '#7a7a82' });
    FX.sparks(o, 8, unit(P.v.x, P.v.y, P.v.z), 0.5, 3, 9, { c0: '#ffffff', c1: '#ffd070', c2: '#a04010' });
    // and sometimes a bit of it comes off
    if (chance(0.35)) FX.debris({ x: o.x, y: o.y + 0.3, z: o.z }, 2, ['#3e5a86', '#b8b8b0', '#8a4a26'], 5);
  },
  goal(at) {
    const G = World.def.course.GOAL, c = { x: (G.x0 + G.x1) / 2, y: G.y0 + 2.5, z: G.z };
    this.count('goal');
    for (const col of ['#ffd070', '#3ad0ff', '#ff5a6a', '#ffffff']) FX.sparks(c, 14, { x: 0, y: 0.6, z: 1 }, 1.4, 6, 16, { c0: col, c1: col, c2: '#ffffff' });
    FX.ring(at, 0.3, 3, 0.4, { c: '#ffd070', flat: false });
    FX.light(c, '#ffe0a0', 6, 16, 0.6);
    Sound.play('waveClear'); Sound.play('rankUp');
    Game.shake(0.2);
  },

  // the machine, the door's shutter and the footballs' arcs, drawn each frame
  sync(t) {
    const on = Arena.id === 'training' && !!World.def.course && !!this.machine;
    if (!this.rigs) {
      if (!on) return;
      const m = Rig.build(MODELS.ballMachine), d = Rig.build(MODELS.shutter);
      Gfx.scene.add(m.mesh, d.mesh);
      this.rigs = { m, d };
    }
    const { m, d } = this.rigs;
    m.mesh.visible = d.mesh.visible = on;
    if (!on) return;
    const C = World.def.course, D = C.MACHINE, M = this.machine;
    m.mesh.position.set(D.x, D.y, D.z);
    // shaking as it winds up, a jolt back when it fires
    const sh = M.spin * 0.025;
    m.bones.root.rotation.set(rand(-sh, sh) * 0.5, 0, rand(-sh, sh) * 0.5);
    m.bones.head.rotation.set(M.pitch - M.recoil * 0.25, M.yaw, 0, 'YXZ');
    m.bones.head.position.y = m.rest.head.y - M.recoil * 0.08;
    const w = (this._wheel = (this._wheel || 0) + M.spin * 0.9);
    m.bones.wheelL.rotation.y = w; m.bones.wheelR.rotation.y = -w * 0.97;
    Rig.tint(m, 'lamp', M.state === 'wind' ? (((t * 10) | 0) % 2 ? '#ffffff' : '#ff3a2a') : M.state === 'cool' ? '#ff9a2a' : '#3aff6a');
    if (!this._lit) { this._lit = true; Render.feet(m.feet, D); Render.feet(d.feet, { x: 0, y: C.DOOR.y0, z: C.DOOR.box.min.z }); }
    // the laser doorway's beams vanish while the camera passes through it, so they never fill the screen
    const G = C.GATE, cp = Gfx.camera.position, bx = G.axis === 'x' ? 'z' : 'x';
    const inGate = Math.abs(cp[G.axis] - G.at) < 1 && cp[bx] > G.a0 - 0.5 && cp[bx] < G.a1 + 0.5 && cp.y > G.y0 - 0.5 && cp.y < G.y1 + 0.5;
    for (const mat of Gfx.buzzMats) mat.visible = !inGate;
    const k = easeInOutQuad(this.doorK);
    d.mesh.position.set((C.DOOR.x0 + C.DOOR.x1) / 2, C.DOOR.y0 + k * (C.DOOR.y1 - C.DOOR.y0 + 0.2), (C.DOOR.box.min.z + C.DOOR.box.max.z) / 2);
    Rig.tint(d, 'lamp', this.doorOpen ? '#2a2a30' : ((t * 2) | 0) % 2 ? '#ff2a3a' : '#a01020');
  },
  // the machine's planned throw while it winds up, and each ball's path while it flies, as dashed arcs with the
  // spot it lands on marked (views.js calls this with its arc pool)
  tells(V, ai, zone, cp, t) {
    const M = this.machine, N = V.ARC_N;
    if (!M) return ai;
    const arc = (o, v, T, white) => {
      if (ai >= V.arcs.length) return;
      const m = V.arcs[ai++], pts = [];
      for (let i = 0; i < N; i++) { const tt = (i / (N - 1)) * T; pts.push({ x: o.x + v.x * tt, y: o.y + v.y * tt - 0.5 * BALL.G * tt * tt, z: o.z + v.z * tt }); }
      const on = hexLinear(white ? '#ffffff' : '#ffb040'), off = [0, 0, 0];
      m.visible = true;
      FX.writeStrip(m, pts, 0.05, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      const e = pts[N - 1], gy = World.groundAt(e.x, e.z, e.y + 0.6);
      zone({ x: e.x, y: gy > -Infinity ? gy : e.y, z: e.z }, 1.2, '#ffb040');
    };
    if (M.state === 'wind' && M.plan) arc(M.plan.o, M.plan.v, M.plan.T, M.t > BALL.WIND - 0.3 && ((t * 16) | 0) % 2);
    for (const b of Game.projectiles) if (b.kind === 'football' && b.hostile && !b.dead) arc(b.pos, b.vel, Math.max(0.05, b.T - b.t) + 0.15, false);
    return ai;
  },

  // spawned in front of you, a little way off
  spawnPoint(type) {
    const p = Game.player, f = { x: fwdX(Camera.yaw), z: fwdZ(Camera.yaw) }, H = World.def.course.HALL;
    if (type === 'sniper') {
      const near = Arena.perches().slice().sort((a, b) => distXZ(a, p.pos) - distXZ(b, p.pos));
      return near.find((q) => distXZ(q, p.pos) > 8) || near[0];
    }
    const x = clamp(p.pos.x + f.x * 9, H.x0 + 3, H.x1 - 3), z = clamp(p.pos.z + f.z * 9, H.z0 + 3, H.z1 - 4);
    const q = Arena.freeGroundAt(x, z, 0.6);
    return type === 'drone' ? { x: q.x, y: q.y + 4, z: q.z } : q;
  },
  // two points in view ahead of you, in the combat hall, for the tutorial's fight
  pairAhead() {
    const p = Game.player, H = World.def.course.HALL, out = [];
    for (const d of [9, 7, 11, 5]) {
      for (const a of [0.4, -0.4, 0.7, -0.7, 0.15, -0.15, 1.0, -1.0, 1.35, -1.35, 1.57, -1.57]) {
        const yaw = Camera.yaw + a, x = p.pos.x + fwdX(yaw) * d, z = p.pos.z + fwdZ(yaw) * d;
        if (x < H.x0 + 1.8 || x > H.x1 - 1.8 || z < H.z0 + 1.8 || z > H.z1 - 4) continue;
        if (out.some((q) => distXZ(q, { x, z }) < 4)) continue;
        out.push(Arena.freeGroundAt(x, z, 0.6));
        if (out.length === 2) return out;
      }
    }
    // backed against a wall: across the hall from you instead
    while (out.length < 2) out.push(Arena.freeGroundAt(clamp(-p.pos.x * 0.5 + (out.length ? 4 : -4), H.x0 + 3, H.x1 - 3), (H.z0 + H.z1) / 2 + (p.pos.z < (H.z0 + H.z1) / 2 ? 10 : -10), 0.6));
    return out;
  },
  spawn(type) {
    const q = this.spawnPoint(type);
    Game.enemies.push(new Enemy(type, q, {}));
    Sound.play('spawn', {}, q);
  },
  spawnRival(phase2) {
    const p = Game.player, f = { x: fwdX(Camera.yaw), z: fwdZ(Camera.yaw) }, H = World.def.course.HALL;
    const q = Arena.freeGroundAt(clamp(p.pos.x + f.x * 14, H.x0 + 3, H.x1 - 3), clamp(p.pos.z + f.z * 14, H.z0 + 4, H.z1 - 5), 0.7);
    const r = new Rival(q, {});
    if (phase2) { r.enterPhase2(true); r.transT = 0; }
    Game.enemies.push(r);
    Sound.play('spawn', {}, q);
  },
  clear() {
    for (const e of Game.enemies) { if (e.type === 'dummy') continue; if (e.stopLoops) e.stopLoops(); e.dead = true; }
    Game.projectiles = []; Game.hazards = [];
  },
  refill() {
    const p = Game.player;
    p.hp = PC.MAX_HP; p.shield = PC.MAX_SHIELD; p.shieldOffT = 0; p.dashCharges = PC.DASH_CHARGES; p.parryCD = 0; p.utilCD = 0;
  },
  cycleDummy() {
    const keys = Object.keys(DUMMY_MODES), t = Game.training;
    t.dummy = keys[(keys.indexOf(t.dummy) + 1) % keys.length];
  },
  cycleModifier() {
    const keys = [null].concat(Object.keys(WAVE_MODIFIERS));
    Director.modifier = keys[(keys.indexOf(Director.modifier) + 1) % keys.length];
  },
  // the panel is rebuilt every time it opens so labels show the current state
  render() {
    const el = document.getElementById('train-body');
    const btn = (act, label, extra = '', data = '') => `<button type="button" data-act="${act}" ${data}>${label}${extra ? ` <small>${extra}</small>` : ''}</button>`;
    let h = '<h3>Tutorial</h3><div class="grid2">';
    h += Tutorial.active ? btn('train-skip', 'Skip the tutorial', 'go to practice') + btn('train-tutorial', 'Restart the tutorial') : btn('train-tutorial', 'Replay the tutorial', 'movement, tether, combat, parries');
    h += '</div><h3>Spawn</h3><div class="grid2">';
    for (const [t, name] of TRAIN_TYPES) h += btn('train-spawn', name, '', `data-type="${t}"`);
    h += btn('train-rival', 'AEGIS-07', 'phase 1', 'data-p2="0"') + btn('train-rival', 'AEGIS-07', 'blade phase', 'data-p2="1"');
    h += '</div><h3>Practice</h3><div class="grid2">';
    h += btn('train-dummy', DUMMY_MODES[Game.training.dummy]);
    h += btn('train-mod', 'Modifier', Director.modifier ? WAVE_MODIFIERS[Director.modifier].name.toLowerCase() : 'none');
    h += btn('train-refill', 'Refill health and shield') + btn('train-ult', 'Charge ultimate');
    h += btn('train-clear', 'Clear enemies');
    h += '</div><h3>Upgrades</h3><div class="grid2">';
    for (const id in UPGRADES) h += btn('train-upgrade', UPGRADES[id].name, Game.has(id) ? 'on' : 'off', `data-id="${id}"`);
    h += '</div>';
    el.innerHTML = h;
  },
  act(a, el) {
    switch (a) {
      case 'train-spawn': this.spawn(el.dataset.type); UI.resumeGame(); return;
      case 'train-rival': this.spawnRival(el.dataset.p2 === '1'); UI.resumeGame(); return;
      case 'train-clear': this.clear(); UI.resumeGame(); return;
      case 'train-tutorial': Tutorial.begin(true); UI.resumeGame(); return;
      case 'train-skip': Tutorial.finish(true); UI.resumeGame(); return;
      case 'train-refill': this.refill(); break;
      case 'train-ult': Game.player.ultCharge = 1; break;
      case 'train-dummy': this.cycleDummy(); break;
      case 'train-mod': this.cycleModifier(); break;
      case 'train-upgrade': { const id = el.dataset.id; if (Game.upgrades.has(id)) Game.upgrades.delete(id); else Game.upgrades.add(id); break; }
    }
    this.render();
  },

  // on the HUD: the tutorial's marker arrow, and the dummy's damage per second while practising
  drawHud(ctx, t) {
    if (Tutorial.active) { Tutorial.drawHud(ctx, t); return; }
    const d = this.dummy, dps = this.dps();
    if (!d || d.dead || !dps) return;
    const s = Render.project({ x: d.pos.x, y: d.pos.y + d.h + 0.7, z: d.pos.z });
    if (s && !s.off) drawText(ctx, 'DPS ' + dps, s.x, s.y, { align: 'center', color: '#ffd070' });
  },
};

// ---------- the tutorial ----------
// Each step: a title, a line of text (keys from your bindings, or the touch buttons), an optional marker in
// the world, a checkpoint (cp) and the surfaces you may stand on while it runs (zone: boxes with a y range),
// what to set up on the way in and out, and the task that finishes it. Standing anywhere else, or falling out,
// puts you back at the checkpoint: no step can be skipped by going round it.
const K = (a) => `<kbd>${Touch.on() ? Touch.label(a) : codeLabel((S.controls.bindings[a] || [])[0])}</kbd>`;
const onTop = (p, x0, x1, z0, z1, y) => p.onGround && Math.abs(p.pos.y - y) < 0.1 && p.pos.x > x0 && p.pos.x < x1 && p.pos.z > z0 && p.pos.z < z1;
const Z = (x0, x1, z0, z1, y0, y1) => ({ x0, x1, z0, z1, y0, y1 });
// the movement hall's floor and low blocks; the tower; the walkway in stretches between its stations; the deck
const TZ = {
  floor: Z(-12, 20, 6, 74, -1, 6), tower: Z(16, 20, 36, 42, 12.5, 13.5),
  toSlide: Z(16, 20, 36, 49.4, 12.5, 13.5), toVault: Z(16, 20, 48, 65.1, 12.5, 14.2),
  toGate: [Z(16, 20, 64, 74, 12.5, 14.2), Z(10, 20, 70, 74, 12.5, 13.5)], toKick: Z(-3, 10, 70, 74, 12.5, 13.5),
  deck: Z(-3, 3, 48, 70, 24, 25), sill: Z(-7, 7, 3.5, 6.5, 11, 12.5),
  room2: Z(-15, 15, -24, 4, -1, 1), field: Z(-15, 15, -50, -24, 14.5, 16.5),
};
const TUTORIAL_STEPS = [
  {
    id: 'move', title: 'Move',
    text: () => (Touch.on() ? `Drag the left side of the screen to move and the right side to look. Walk to the marker.` : `${K('forward')} ${K('left')} ${K('back')} ${K('right')} to move, the mouse to look. Walk to the marker.`),
    at: { x: 6, y: 0, z: 16, r: 1.6 }, cp: { x: 6, y: 0, z: 10, yaw: Math.PI }, zone: [TZ.floor],
    done: (p, s) => p.onGround && distXZ(p.pos, s.at) < s.at.r && p.pos.y < 0.5,
  },
  {
    id: 'climb', title: 'Climb',
    text: () => 'Walk into a ledge up to head height and you climb it. Get on top of the orange block.',
    at: { x: 9, y: 2.5, z: 22, r: 1.6 }, cp: { x: 6, y: 0, z: 15, yaw: Math.PI }, zone: [TZ.floor],
    done: (p) => onTop(p, 6, 12, 20, 24, 2.5),
  },
  {
    id: 'jump', title: 'Jump',
    text: () => `${K('jump')} to jump; hold it to go higher. Touch a ledge in the air and you pull yourself up. Get onto the teal block.`,
    at: { x: 16, y: 5.5, z: 30.5, r: 1.6 }, cp: { x: 9, y: 2.5, z: 22, yaw: Math.PI }, zone: [TZ.floor],
    done: (p) => onTop(p, 13, 19, 28, 33, 5.5),
  },
  {
    id: 'double', title: 'Double jump',
    text: () => `${K('jump')} again in the air for a second jump. From the teal block, reach the top of the purple tower.`,
    at: { x: 18, y: 13, z: 39, r: 1.6 }, cp: { x: 16, y: 5.5, z: 29.5, yaw: Math.PI }, zone: [TZ.floor, TZ.tower],
    done: (p) => onTop(p, 16, 20, 36, 42, 13),
  },
  {
    id: 'slide', title: 'Slide',
    text: () => `Run, then press ${K('crouch')} to slide. Slide through the gap under the wall.`,
    at: { x: 18, y: 13, z: 48.5, r: 1.6 }, cp: { x: 18, y: 13, z: 38, yaw: Math.PI }, zone: [TZ.toSlide],
    pass: (p) => { const V = World.def.course.SLIDE; return p.pos.z > V.z0 && p.pos.z < V.z1 && p.pos.y < V.y0 + 0.2; },
    done: (p, s) => s.passed && p.pos.z > World.def.course.SLIDE.z1 + 0.4,
  },
  {
    id: 'vault', title: 'Vault',
    text: () => 'Run straight at the low barrier to vault through the slot above it. Sliding or jumping won\'t get you through.',
    at: { x: 18, y: 13, z: 63, r: 1.6 }, cp: { x: 18, y: 13, z: 51, yaw: Math.PI }, zone: [TZ.toVault],
    pass: (p) => { const V = World.def.course.VAULT; return p.pos.z > V.z0 && p.pos.z < V.z1 && p.pos.y > V.top - 0.1; },
    done: (p, s) => s.passed && p.pos.z > World.def.course.VAULT.z1 + 0.5,
  },
  {
    id: 'dash', title: 'Dash',
    text: () => `${K('dash')} dashes the way you're moving. Nothing can hit you mid-dash. Dash through the red lasers.`,
    at: { x: 10, y: 13, z: 72, r: 1.4 }, cp: { x: 18, y: 13, z: 72, yaw: Math.PI / 2 }, zone: TZ.toGate,
    enter: () => { Game.player.dashCharges = PC.DASH_CHARGES; },
    count: 'gate', need: 1,
  },
  {
    id: 'kick', title: 'Wall kick',
    text: () => `Jump at the purple wall and push into it to grab on, then hold ${K('jump')} to kick off. Kick from wall to wall up onto the deck.`,
    at: { x: 0, y: 24.5, z: 68, r: 1.6 }, cp: { x: 7, y: 13, z: 72, yaw: Math.PI / 2 }, zone: [TZ.toKick, TZ.deck],
    done: (p) => onTop(p, -3, 3, 48, 70, 24.5),
  },
  {
    id: 'gap', title: 'Double jump, double dash',
    text: (s) => `Too far to jump. Run off the end: jump, jump again, then ${K('dash')} twice as you come down. Through the opening.${s.fails ? ' Dash after the top of the second jump, not before.' : ''}`,
    at: { x: 0, y: 11.5, z: 5, r: 1.3 }, cp: { x: 0, y: 24.5, z: 67, yaw: 0 }, zone: [TZ.deck, TZ.sill],
    enter: () => { Game.player.dashCharges = PC.DASH_CHARGES; },
    done: (p) => p.pos.z < 3,
  },
  {
    id: 'zip', title: 'Tether: zip',
    text: () => `Your tether. Aim at the top edge of the ledge and hold ${K('tether')}: it zips you up and you climb over.`,
    at: { x: 0, y: 15, z: -26, r: 2.2 }, cp: { x: 0, y: 0, z: -8, yaw: 0 }, zone: [TZ.room2, TZ.sill, TZ.field],
    enter: () => { Game.player.shield = PC.MAX_SHIELD; },
    done: (p) => p.onGround && p.pos.y > 14.9 && p.pos.z < -24,
  },
  {
    id: 'football', title: 'Tether: kick',
    text: () => `The machine lobs balls at you along the arc. Tether one in the air: time slows, and you kick it where the crosshair points. Between the posts, over the bar.`,
    cp: { x: -3, y: 15, z: -31, yaw: -Math.PI / 4 }, zone: [TZ.field],
    enter: () => { const M = Training.machine; M.state = 'idle'; M.wait = 1.2; },
    exit: () => { Training.setDoor(true); Sound.play('shieldUp'); },
    count: 'goal', need: 2,
  },
  {
    id: 'slash', title: 'Slash',
    text: () => `Through the door and down to the dummy. Tap ${K('attack')} to slash; keep tapping for a string of three.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    count: 'slash', need: 3,
  },
  {
    id: 'heavy', title: 'Heavy attack',
    text: () => `Hold ${K('attack')} for a heavy attack. Land one on the dummy.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    count: 'heavy', need: 1,
  },
  {
    id: 'fight', title: 'Fight',
    text: () => 'Two scrappers. Take them down. When one\'s blade flashes, it\'s about to swing.',
    enter: () => {
      Training.dummyOut();
      for (const q of Training.pairAhead()) { const e = new Enemy('scrapper', q, {}); e.tutorial = true; Game.enemies.push(e); }
      Sound.play('spawn');
    },
    exit: () => Training.dummyIn(),
    done: () => !Game.enemies.some((e) => e.tutorial && !e.dead),
  },
  {
    id: 'beam', title: 'Sword beam',
    text: () => `Hold ${K('utility')} until the blade burns gold, then let go at the dummy. A tap throws a small blade; a hit while charging breaks it.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    enter: () => { Game.player.utilCD = 0; },
    count: 'beamFull', need: 1,
  },
  {
    id: 'parry', title: 'Parry the yellow flash',
    text: () => `The dummy fights back now. When its blade flashes yellow, press ${K('sheathe')} to parry. Parry it twice.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    enter: () => { Game.training.dummy = 'yellow'; Game.player.shield = PC.MAX_SHIELD; },
    count: 'parry', need: 2,
  },
  {
    id: 'counter', title: 'Counter',
    text: () => `Keep holding ${K('sheathe')} after a parry: the counter charges as the ring fills, harder the longer you hold, but a hit breaks it. Let go to strike back.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    enter: () => { Game.training.dummy = 'yellow'; Game.player.shield = PC.MAX_SHIELD; },
    count: 'iaido', need: 1,
  },
  {
    id: 'red', title: 'The red flash',
    text: () => `Red can't be parried, and dashing on the spot won't save you. Get behind it: dash through its body before it swings. Twice.`,
    at: { x: 0, y: 0, z: -80, r: 2.4, ring: true },
    enter: () => { Game.training.dummy = 'red'; Game.player.dashCharges = PC.DASH_CHARGES; },
    count: 'redDodge', need: 2,
  },
  {
    id: 'done', title: 'Training complete',
    text: () => `That's the basics. The hall is yours now: ${K('pause')} opens the practice panel to spawn enemies, set the dummy, or replay this tutorial.`,
    enter: () => { Game.training.dummy = 'still'; SaveData.tutorialDone = true; saveProgress(); },
    done: (p, s) => s.t > 7,
  },
];
const stepIndex = (id) => TUTORIAL_STEPS.findIndex((s) => s.id === id);

const Tutorial = {
  active: false, i: 0, t: 0, doneT: 0, base: 0, failT: 0, el: null, marker: null,
  // fromPanel: asked for again, so you're put back at the start of the course
  begin(fromPanel) {
    this.active = true; this.i = 0; this.doneT = 0; this.failT = 0;
    for (const s of TUTORIAL_STEPS) s.fails = 0;
    Training.clear();
    Training.dummyIn();
    Training.setDoor(false, true);
    Game.training.dummy = 'still';
    const p = Game.player;
    Training.refill();
    Training.place(p, World.def.tutorialStart);
    this.enter();
    if (fromPanel) Sound.play('ultReady');
  },
  // skip: straight to practice, back in the combat hall
  finish(skip) {
    const s = this.active && this.step();
    if (s && s.exit && this.doneT <= 0) s.exit();
    this.active = false;
    SaveData.tutorialDone = true; saveProgress();
    if (Game.training) Game.training.dummy = 'still';
    for (const e of Game.enemies) if (e.tutorial) e.dead = true;
    Training.dummyIn();
    Training.setDoor(true);
    if (skip) Training.place(Game.player, World.def.playerStart);
    this.show(null);
    if (this.marker) this.marker.visible = false;
  },
  step() { return TUTORIAL_STEPS[this.i]; },
  // what isn't taught yet stays off: the tether until the tether room (so it can't skip the course), and the
  // bullet jump (crouch or slide, then jump) until the combat hall
  locked(what) {
    if (!this.active) return false;
    return this.i < stepIndex(what === 'tether' ? 'zip' : 'slash');
  },
  enter() {
    const s = this.step();
    s.t = 0; s.passed = false;
    this.t = 0; this.doneT = 0;
    this.base = s.count ? Training.n(s.count) : 0;
    if (s.enter) s.enter();
    this.show(s);
  },
  // back to the step's checkpoint, to try again
  fail() {
    const s = this.step(), p = Game.player;
    s.fails = (s.fails || 0) + 1; s.passed = false;
    if (s.cp) Training.place(p, s.cp);
    this.failT = 1.6;
    Sound.play('denied');
    FX.ring({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z }, 2.6, 0.3, 0.35, { c: '#ff5a6a' });
    this.show(s);
  },
  // on the step's ground: inside one of its zone boxes
  allowed(p, s) {
    if (!s.zone) return true;
    return s.zone.some((q) => p.pos.x > q.x0 - 0.2 && p.pos.x < q.x1 + 0.2 && p.pos.z > q.z0 - 0.2 && p.pos.z < q.z1 + 0.2 && p.pos.y > q.y0 && p.pos.y < q.y1);
  },
  progress() { const s = this.step(); return s.count ? Math.min(s.need, Training.n(s.count) - this.base) : 0; },
  update(dt) {
    const s = this.step(), p = Game.player;
    s.t = (s.t || 0) + dt;
    this.t += dt;
    if (this.failT > 0 && (this.failT -= dt) <= 0) this.show(s);
    if (this.doneT > 0) {
      this.doneT -= dt;
      if (this.doneT <= 0) {
        if (s.exit) s.exit();
        if (this.i >= TUTORIAL_STEPS.length - 1) { this.finish(false); return; }
        this.i++;
        this.enter();
      }
      return;
    }
    if (s.pass && !s.passed && s.pass(p)) s.passed = true;
    const ok = s.count ? this.progress() >= s.need : s.done(p, s);
    if (s.count && this._shown !== this.progress()) this.show(s);
    // fell out, or landed somewhere this step doesn't go (past a station without going through it, say):
    // back to its checkpoint
    if (!ok && (p.pos.y < -5 || (p.onGround && !p.mantle && !p.vault && !this.allowed(p, s)))) { this.fail(); return; }
    if (ok) {
      this.doneT = s.id === 'done' ? 0.01 : 1.1;
      if (s.id !== 'done') {
        Sound.play('utilReady'); Sound.play('ultReady');
        FX.ring({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z }, 0.3, 2.6, 0.35, { c: '#3ad0ff' });
        FX.sparks(p.center(), 16, { x: 0, y: 1, z: 0 }, 1, 4, 10, { c0: '#ffffff', c1: '#9ae8ff', c2: '#1a6aa0' });
      }
      this.show(s, true);
    }
  },

  // ---------- the text panel ----------
  show(s, done = false) {
    if (!this.el) this.el = document.getElementById('tut');
    if (!this.el) return;
    if (!s) { this.el.hidden = true; return; }
    this.el.hidden = false;
    this.el.classList.toggle('done', done);
    this.el.classList.toggle('fail', this.failT > 0 && !done);
    const n = TUTORIAL_STEPS.length - 1, num = Math.min(this.i + 1, n);
    this._shown = this.progress();
    const prog = s.count && s.need > 1 ? ` <span class="prog">${this._shown} / ${s.need}</span>` : '';
    const mark = done && s.id !== 'done' ? '&#10003; ' : this.failT > 0 ? '&#8634; ' : '';
    this.el.innerHTML = `<div class="tut-head"><span class="tut-n">${s.id === 'done' ? '' : num + ' / ' + n}</span><b>${mark}${s.title}</b>${prog}</div><p>${s.text(s)}</p>`;
  },
  // ---------- the marker: a ring on the surface, a column of light and a bobbing diamond ----------
  syncMarker(t) {
    const s = this.active && this.step(), at = s && s.at && this.doneT <= 0 ? s.at : null;
    if (!this.marker) { if (!at) return; this.buildMarker(); }
    const g = this.marker;
    g.visible = !!at;
    if (!at) return;
    const U = g.userData, pulse = 1 + 0.06 * Math.sin(t * 5);
    g.position.set(at.x, at.y + 0.03, at.z);
    U.ring.scale.set(at.r * pulse, 1, at.r * pulse);
    U.col.scale.set(at.r * 0.92, at.ring ? 0.01 : 3.2, at.r * 0.92);
    U.col.visible = !at.ring;
    U.gem.position.y = (at.ring ? 3 : 2.6) + Math.sin(t * 3) * 0.18;
    U.gem.rotation.y = t * 2;
  },
  buildMarker() {
    if (this.marker) return;
    const mat = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }, o));
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2), mat('#1ab8f0', { opacity: 0.9 }));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), mat('#3ad0ff', { opacity: 0.16 }));
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.28, 4, 2), mat('#1ab8f0', { opacity: 0.95 }));
    ring.renderOrder = col.renderOrder = gem.renderOrder = 3;
    g.add(ring, col, gem);
    g.userData = { ring, col, gem };
    g.visible = false;
    Gfx.scene.add(g);
    this.marker = g;
  },
  // an arrow at the screen's edge toward the marker when it's out of view
  drawHud(ctx, t) {
    const s = this.step(), at = s && s.at;
    if (!at || this.doneT > 0) return;
    const q = Render.project({ x: at.x, y: at.y + 1, z: at.z });
    if (q && !q.off) return;
    // behind the camera or off screen: point from the middle toward it
    const v = Render._v.set(at.x, at.y + 1, at.z).applyMatrix4(Gfx.camera.matrixWorldInverse);
    let ax = v.x, ay = -v.y;
    const l = Math.hypot(ax, ay) || 1;
    ax /= l; ay /= l;
    const cx = VIEW_W / 2, cy = VIEW_H / 2, k = Math.min((VIEW_W / 2 - 16) / Math.max(1e-3, Math.abs(ax)), (VIEW_H / 2 - 16) / Math.max(1e-3, Math.abs(ay)));
    const x = cx + ax * k, y = cy + ay * k, bob = Math.sin(t * 6) * 1.5;
    ctx.save();
    ctx.translate(Math.round(x - ax * bob), Math.round(y - ay * bob));
    ctx.rotate(Math.atan2(ay, ax));
    ctx.fillStyle = '#0b0910';
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -7); ctx.lineTo(-3, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3ad0ff';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-2, 0); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
};
