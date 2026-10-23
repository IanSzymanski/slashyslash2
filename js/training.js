'use strict';
// Training, in the training hall (world.js). The first visit runs a guided tutorial: one move at a time, a
// line of text and then a task (reach the marker, get through the laser door, hit the dummy a certain way).
// Afterwards the hall is a practice area: the dummy stands still or swings at you with yellow flashes (parry
// them) or red ones (get behind it), and pause opens a panel to spawn any enemy or the rival, set the dummy,
// toggle upgrades and modifiers, refill, and replay the tutorial. You can't die here.

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

// ---------- the practice area ----------
const TRAIN_TYPES = [
  ['scrapper', 'Scrapper'], ['gunner', 'Gunner'], ['drone', 'Drone'], ['brute', 'Brute'],
  ['shielder', 'Shield scrapper'], ['crawler', 'Armoured crawler'], ['grenadier', 'Grenadier'], ['sniper', 'Rooftop sniper'],
];

const Training = {
  dummy: null,
  start() {
    Game.training = { dummy: 'still', counts: {} };
    Tutorial.active = false;
    if (!SaveData.tutorialDone) Tutorial.begin(false);
  },
  // the dummy on its mat, and nothing else
  reset() {
    for (const e of Game.enemies) if (e.stopLoops) e.stopLoops();
    Game.enemies = []; Game.projectiles = []; Game.hazards = [];
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
    // a fall out of the course (there's no way out, but a zip could still find one) puts you back
    if (p.pos.y < -5) { const s = Tutorial.active ? Tutorial.respawnAt() : World.def.playerStart; this.place(p, s); }
    if (Tutorial.active) Tutorial.update(dt);
  },
  // The laser door: crossing it without a dash throws you back the way you came. A dash, or anything that
  // can't be hit, goes through.
  gate(p) {
    const G = World.def.course.GATE, z0 = p.prev.z - G.z, z1 = p.pos.z - G.z;
    if (z0 * z1 >= 0 || p.pos.x < G.x0 - p.r || p.pos.x > G.x1 + p.r || p.pos.y > G.h) return;
    const at = { x: p.pos.x, y: p.pos.y + 1, z: G.z };
    if (p.dashT > 0 || p.dashEndT > 0 || p.iframes > 0) {
      this.count('gate');
      FX.sparks(at, 18, { x: 0, y: 0.3, z: Math.sign(z1) }, 1.4, 5, 16, { c0: '#ffffff', c1: '#ff8a9a', c2: '#781e2a' });
      Sound.play('reflect', {}, at);
      return;
    }
    const side = Math.sign(z0) || 1;
    p.pos.z = G.z + side * (p.r + 0.15); p.vel.x *= 0.3; p.vel.z = side * 9; p.vel.y = Math.max(p.vel.y, 4);
    if (p.tether) p.releaseTether();
    FX.sparks(at, 22, { x: 0, y: 0.4, z: side }, 1.3, 5, 18, { c0: '#ffffff', c1: '#ff5a6a', c2: '#781e2a' });
    FX.light(at, '#ff3048', 4, 6, 0.2);
    Sound.play('shieldBreak', {}, at);
    FPFX.kick('guard', { from: { x: p.pos.x, y: at.y, z: G.z } });
    Game.shake(0.2);
    this.count('zap');
  },
  place(p, s) {
    p.pos.x = p.prev.x = s.x; p.pos.y = p.prev.y = s.y; p.pos.z = p.prev.z = s.z;
    p.vel.x = p.vel.y = p.vel.z = 0;
    if (p.tether) p.releaseTether();
    p.yaw = s.yaw || 0; Camera.yaw = p.yaw;
    Camera.snap(p);
  },

  // spawned in front of you, a little way off
  spawnPoint(type) {
    const p = Game.player, f = { x: fwdX(Camera.yaw), z: fwdZ(Camera.yaw) };
    if (type === 'sniper') {
      const near = Arena.perches().slice().sort((a, b) => distXZ(a, p.pos) - distXZ(b, p.pos));
      return near.find((q) => distXZ(q, p.pos) > 8) || near[0];
    }
    const B = Arena.bounds(), x = clamp(p.pos.x + f.x * 9, B.minX + 2, B.maxX - 2), z = clamp(p.pos.z + f.z * 9, -71, -33);
    const q = Arena.freeGroundAt(x, z, 0.6);
    return type === 'drone' ? { x: q.x, y: q.y + 4, z: q.z } : q;
  },
  spawn(type) {
    const q = this.spawnPoint(type);
    Game.enemies.push(new Enemy(type, q, {}));
    Sound.play('spawn', {}, q);
  },
  spawnRival(phase2) {
    const p = Game.player, f = { x: fwdX(Camera.yaw), z: fwdZ(Camera.yaw) };
    const q = Arena.freeGroundAt(clamp(p.pos.x + f.x * 14, -12, 12), clamp(p.pos.z + f.z * 14, -70, -34), 0.7);
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
    h += Tutorial.active ? btn('train-skip', 'Skip the tutorial', 'go to practice') + btn('train-tutorial', 'Restart the tutorial') : btn('train-tutorial', 'Replay the tutorial', 'movement, combat, parries');
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
// the world, what to set up on the way in, and the task that finishes it.
const K = (a) => `<kbd>${Touch.on() ? Touch.label(a) : codeLabel((S.controls.bindings[a] || [])[0])}</kbd>`;
const onTop = (p, x0, x1, z0, z1, y) => p.onGround && Math.abs(p.pos.y - y) < 0.1 && p.pos.x > x0 && p.pos.x < x1 && p.pos.z > z0 && p.pos.z < z1;
const TUTORIAL_STEPS = [
  {
    id: 'move', title: 'Move',
    text: () => (Touch.on() ? `Drag the left side of the screen to move and the right side to look. Walk to the marker.` : `${K('forward')} ${K('left')} ${K('back')} ${K('right')} to move, the mouse to look. Walk to the marker.`),
    at: { x: 0, y: 0, z: 28, r: 1.6 },
    done: (p, s) => p.onGround && distXZ(p.pos, s.at) < s.at.r && p.pos.y < 0.5,
  },
  {
    id: 'climb', title: 'Climb',
    text: () => 'Walk into a ledge up to head height and you climb it. Get on top of the orange block.',
    at: { x: 0, y: 2.5, z: 20, r: 1.6 },
    done: (p) => onTop(p, -4, 4, 18, 22, 2.5),
  },
  {
    id: 'jump', title: 'Jump',
    text: () => `${K('jump')} to jump; hold it to go higher. Touch a ledge in the air and you pull yourself up. Get onto the teal block.`,
    at: { x: 9, y: 5.5, z: 19, r: 1.6 },
    done: (p) => onTop(p, 6, 12, 17, 21, 5.5),
  },
  {
    id: 'double', title: 'Double jump',
    text: () => `${K('jump')} again in the air for a second jump. From the teal block, reach the top of the tower.`,
    at: { x: 9, y: 13, z: 12, r: 1.6 },
    done: (p) => onTop(p, 6, 12, 10, 14, 13),
  },
  {
    id: 'dash', title: 'Dash',
    text: () => `${K('dash')} dashes the way you're moving. Nothing can hit you mid-dash. Drop down and dash through the red lasers.`,
    at: { x: 0, y: 0, z: 7.5, r: 1.4 },
    enter: () => { Game.player.dashCharges = PC.DASH_CHARGES; },
    done: () => Training.n('gate') > 0,
  },
  {
    id: 'slide', title: 'Slide',
    text: () => `Run, then hold ${K('crouch')} to slide. Slide through the gap under the wall.`,
    at: { x: 0, y: 0, z: -9.5, r: 2.4 },
    done: (p) => p.pos.z < -10.8 && p.pos.y < 1,
  },
  {
    id: 'zip', title: 'Tether: zip',
    text: () => `Aim at the top edge of the ledge and hold ${K('tether')}: the tether zips you to it and you climb over.`,
    at: { x: 0, y: 14, z: -28, r: 2.2 },
    enter: () => { Game.player.shield = PC.MAX_SHIELD; },
    done: (p) => p.onGround && p.pos.y > 13.9 && p.pos.z < -26 && p.pos.z > -35,
  },
  {
    id: 'fling', title: 'Tether: fling',
    text: () => `Go through the door. Aim at the floating platform's edge and tap ${K('tether')}: a tap throws you up and onto it.`,
    at: { x: 0, y: 16, z: -49.5, r: 2.4 },
    enter: () => { Game.player.shield = PC.MAX_SHIELD; },
    done: (p) => onTop(p, -3, 3, -52, -47, 16),
  },
  {
    id: 'slash', title: 'Slash',
    text: () => `Drop down to the dummy. Tap ${K('attack')} to slash; keep tapping for a string of three.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
    count: 'slash', need: 3,
  },
  {
    id: 'heavy', title: 'Heavy attack',
    text: () => `Hold ${K('attack')} for a heavy attack. Land one on the dummy.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
    count: 'heavy', need: 1,
  },
  {
    id: 'fight', title: 'Fight',
    text: () => 'Two scrappers. Take them down. When one\'s blade flashes, it\'s about to swing.',
    enter: () => {
      for (const m of World.def.course.mats) { const e = new Enemy('scrapper', { x: m.x, y: 0, z: m.z }, {}); e.tutorial = true; Game.enemies.push(e); }
      Sound.play('spawn');
    },
    done: () => !Game.enemies.some((e) => e.tutorial && !e.dead),
  },
  {
    id: 'beam', title: 'Sword beam',
    text: () => `Hold ${K('utility')} until the blade burns gold, then let go at the dummy. A tap throws a small blade; a hit while charging breaks it.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
    enter: () => { Game.player.utilCD = 0; },
    count: 'beamFull', need: 1,
  },
  {
    id: 'parry', title: 'Parry the yellow flash',
    text: () => `The dummy fights back now. When its blade flashes yellow, press ${K('sheathe')} to parry. Parry it twice.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
    enter: () => { Game.training.dummy = 'yellow'; Game.player.shield = PC.MAX_SHIELD; },
    count: 'parry', need: 2,
  },
  {
    id: 'counter', title: 'Counter',
    text: () => `Hold ${K('sheathe')} through the parry, then let go: you strike back with a big slash. Parry, then counter.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
    enter: () => { Game.training.dummy = 'yellow'; Game.player.shield = PC.MAX_SHIELD; },
    count: 'iaido', need: 1,
  },
  {
    id: 'red', title: 'The red flash',
    text: () => `Red can't be parried, and dashing on the spot won't save you. Get behind it: dash through its body before it swings. Twice.`,
    at: { x: 0, y: 0, z: -62, r: 2.4, ring: true },
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

const Tutorial = {
  active: false, i: 0, t: 0, doneT: 0, base: 0, el: null, marker: null,
  // fromPanel: asked for again, so you're put back at the start of the course
  begin(fromPanel) {
    this.active = true; this.i = 0; this.doneT = 0;
    Training.clear();
    Game.training.dummy = 'still';
    const p = Game.player;
    Training.refill();
    Training.place(p, World.def.tutorialStart);
    this.enter();
    if (fromPanel) Sound.play('ultReady');
  },
  // skip: straight to practice, back in the hall
  finish(skip) {
    this.active = false;
    SaveData.tutorialDone = true; saveProgress();
    if (Game.training) Game.training.dummy = 'still';
    for (const e of Game.enemies) if (e.tutorial) e.dead = true;
    if (skip) Training.place(Game.player, World.def.playerStart);
    this.show(null);
    if (this.marker) this.marker.visible = false;
  },
  step() { return TUTORIAL_STEPS[this.i]; },
  enter() {
    const s = this.step();
    s.t = 0;
    this.t = 0; this.doneT = 0;
    this.base = s.count ? Training.n(s.count) : 0;
    if (s.enter) s.enter();
    this.show(s);
  },
  // where to put you back if you fall out: the start of the room you're in
  respawnAt() { return this.i <= 4 ? World.def.tutorialStart : this.i <= 5 ? { x: 0, y: 0, z: 4, yaw: 0 } : this.i <= 6 ? { x: 0, y: 0, z: -14, yaw: 0 } : World.def.playerStart; },
  progress() { const s = this.step(); return s.count ? Math.min(s.need, Training.n(s.count) - this.base) : 0; },
  update(dt) {
    const s = this.step(), p = Game.player;
    s.t = (s.t || 0) + dt;
    this.t += dt;
    if (this.doneT > 0) {
      this.doneT -= dt;
      if (this.doneT <= 0) {
        if (this.i >= TUTORIAL_STEPS.length - 1) { this.finish(false); return; }
        this.i++;
        this.enter();
      }
      return;
    }
    const ok = s.count ? this.progress() >= s.need : s.done(p, s);
    if (s.count && this._shown !== this.progress()) this.show(s);
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
    const n = TUTORIAL_STEPS.length - 1, num = Math.min(this.i + 1, n);
    this._shown = this.progress();
    const prog = s.count && s.need > 1 ? ` <span class="prog">${this._shown} / ${s.need}</span>` : '';
    this.el.innerHTML = `<div class="tut-head"><span class="tut-n">${s.id === 'done' ? '' : num + ' / ' + n}</span><b>${done && s.id !== 'done' ? '&#10003; ' : ''}${s.title}</b>${prog}</div><p>${s.text()}</p>`;
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
