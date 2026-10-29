'use strict';
// Game state, fixed-step simulation, style, scoring, slow motion, hitstop, bullet time and cutscene state.
// Copied from the 2D main.js; the loop and the camera are new in main.js and camera.js.

// Style: hits build a meter that ranks you C to SSS. Repeating the same move earns less,
// and the rank multiplies score and ultimate charge.
const STYLE_GAIN = { lava: 15, lamp: 12, dash: 6, slash: 4, heavy: 7, groundcut: 8, rock: 2, plunge: 10, iaido: 10, chain: 5, tether: 10, reflect: 12, barrel: 10, saw: 1.5, beam: 4, beamFull: 9, round: 1.2, laser: 1.5, burst: 14, strike: 3, detonate: 30, armbreak: 20 };
const STYLE_RANKS = [
  { th: 380, r: 'SSS', c: '#ffffff', mul: 2.5 }, { th: 260, r: 'SS', c: '#ffd070', mul: 2 }, { th: 170, r: 'S', c: '#ffb040', mul: 1.75 },
  { th: 100, r: 'A', c: '#ff5a6a', mul: 1.5 }, { th: 50, r: 'B', c: '#d0a0ff', mul: 1.25 }, { th: 20, r: 'C', c: '#9ab0d0', mul: 1.1 },
];

const Game = {
  state: 'menu', mode: 'demo', time: 0, realTime: 0, acc: 0,
  player: null, enemies: [], projectiles: [], props: [], hazards: [], pickups: [], cuts: [],
  // shake trauma; camera.js turns it into small rotations
  cam: { trauma: 0 },
  slowScale: 1, slowT: 0, freezeT: 0, btT: 0, btDur: 0, btKind: null, btOwner: null,
  // cutscene: letterbox bars, camera focus, optional 2x zoom; the owner drives it and closes it
  cine: null, seenCines: new Set(), runs: {}, upgrades: new Set(),
  stats: { kills: 0, score: 0, maxCombo: 0, parries: 0, wave: 0, time: 0, damageTaken: 0, ults: 0 },
  combo: 0, comboT: 0, comboPop: 0, announcements: [], overT: 0, overVictory: false,
  style: 0, styleRecent: [], styleIdle: 0, lastSlowAt: -10, rankPop: 0,

  toMenu() {
    this.state = 'menu';
    if (this.player) this.player.stopAllLoops();
    for (const e of this.enemies) if (e.stopLoops) e.stopLoops();
    Sound.stopAll();
    FX.clear();
    this.enemies = []; this.projectiles = []; this.hazards = []; this.pickups = []; this.cuts = []; this.props = [];
    this.player = null;
    this.slowScale = 1; this.slowT = 0; this.freezeT = 0; this.btT = 0; this.btKind = null; this.btOwner = null;
    this.cine = null; Input.locked = false; Input.releaseLock();
    Arena.setBlackout(false);
    Sound.setSlow(false);
    Sound.setIntensity(0);
    this.announcements = [];
    Tutorial.active = false; Tutorial.show(null);
    UI.refreshBest();
    UI.show('menu');
  },
  newRun(mode) {
    Sound.init();
    Sound.startMusic();
    if (this.player) this.player.stopAllLoops();
    for (const e of this.enemies) if (e.stopLoops) e.stopLoops();
    Sound.stopAll();
    this.mode = mode;
    this.runs[mode] = (this.runs[mode] || 0) + 1;
    // every mode starts in the crossroads except the 2D street's free roam, Training in its own hall and the
    // KRAG fight in the Foundry (endless travels between the crossroads and the Foundry through portals)
    if (!Arena.load(mode === 'street' ? 'street' : mode === 'training' ? 'training' : mode === 'krag' ? 'foundry' : 'crossroads')) Props.reset();
    Tutorial.active = false; Tutorial.show(null);
    Arena.setBlackout(false);
    this.state = 'playing';
    FX.clear();
    this.enemies = []; this.projectiles = []; this.hazards = []; this.pickups = []; this.cuts = []; this.props = [];
    this.player = makePlayer(SaveData.character, Arena.playerStart());
    this.time = 0; this.acc = 0; this.slowScale = 1; this.slowT = 0; this.freezeT = 0; this.overT = 0; this.btT = 0; this.btKind = null; this.btOwner = null;
    this.cine = null; Input.locked = false;
    this.stats = { kills: 0, score: 0, maxCombo: 0, parries: 0, wave: 0, time: 0, damageTaken: 0, ults: 0 };
    this.combo = 0; this.comboT = 0; this.announcements = [];
    this.style = 0; this.styleRecent = []; this.styleIdle = 0; this.upgrades = new Set();
    Render.hpTrail = PC.MAX_HP; Render.shTrail = PC.MAX_SHIELD;
    this.cam.trauma = 0;
    Camera.snap(this.player);
    this.resetProps(true);
    Director.start(mode);
    if (mode === 'training') { Training.start(); Training.reset(); }
    Sound.setSlow(false);
    Sound.setIntensity(0.4);
    Input.clear(); Input.consume();
    UI.hideAll();
  },
  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    if (this.player) this.player.onPause();
    for (const e of this.enemies) if (e.stopLoops) e.stopLoops();
    Sound.setSlow(true);
    Input.releaseLock();
    UI.show(UI.pausePanel());
  },
  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    Sound.setSlow(this.slowT > 0);
    if (this.player) this.player.onResume();
    Input.clear(); Input.consume();
    UI.hideAll();
  },
  resetProps(all) {
    if (all) this.props = [];
    this.props = this.props.filter((p) => !p.dead);
    // red barrels in the crossroads, crucibles of slag in the Foundry, and the Foundry's ladles full again
    const Kind = World.def.crucibles ? Crucible : Barrel;
    for (const s of Arena.barrelSpots()) {
      if (!this.props.some((p) => p.kind === 'barrel' && dist3(p.pos, s) < 2.7)) this.props.push(new Kind(s));
    }
    Foundry.resetProps();
  },

  // ---------- feedback hooks ----------
  hitstop(d) {
    if (S.visuals.hitstop <= 0) return;
    this.freezeT = Math.max(this.freezeT, Math.min(0.12, d * S.visuals.hitstop));
  },
  // force: cutscenes and big payoffs. Anything else within 2s of the last slow-mo is halved.
  slowmo(scale, dur, force = false) {
    if (!S.visuals.slowmo) return;
    if (!force) {
      if (this.realTime - this.lastSlowAt < 2) { scale = lerp(scale, 1, 0.5); dur *= 0.5; }
      this.lastSlowAt = this.realTime;
    }
    this.slowScale = Math.min(this.slowScale, scale);
    this.slowT = Math.max(this.slowT, dur);
    Sound.setSlow(true);
  },
  shake(t) { this.cam.trauma = Math.min(1, this.cam.trauma + t); },
  // Bullet time: slow motion plus a desaturated screen, so whatever is drawn emissive pops.
  // kind 'rebound' (tethered grenade), 'riposte' (parry the rival's counter now), 'clash' (blades locked).
  bulletTime(dur, o = {}) {
    this.btT = dur; this.btDur = dur; this.btKind = o.kind || 'rebound'; this.btOwner = o.owner || null;
    // its speed replaces any slow motion already running, so cue timing is the same every time
    if (!S.visuals.slowmo) return;
    this.slowScale = o.scale || 0.25; this.slowT = dur;
    Sound.setSlow(true);
  },
  endBulletTime() {
    if (this.btT <= 0) return;
    this.btT = 0; this.btKind = null; this.btOwner = null; this.slowScale = 1; this.slowT = 0;
    Sound.setSlow(false);
  },
  bulletK() {
    if (this.btT <= 0) return 0;
    return clamp(this.btT / 0.12, 0, 1) * clamp((this.btDur - this.btT) / 0.08, 0, 1);
  },
  startCine(o) {
    this.cine = Object.assign({ t: 0, bars: 0, zoom: 1, focus: null, owner: null, caption: null, big: null, bigT: 0, closing: false, skipHold: 0 }, o);
    // a cutscene you've already seen this session can be skipped by holding attack, parry or jump; keys already
    // down when it starts (a held beam, gun or hover) don't count until they're let go and pressed again
    this.cine.skippable = this.seenCines.has(this.cine.kind);
    this.cine.stale = new Set(Input.down);
    this.seenCines.add(this.cine.kind);
    Input.locked = true;
    const p = this.player;
    if (p.sheathe) p.cancelSheathe();
    if (p.tether) p.releaseTether();
    p.cancelCharge();
    p.attackQueued = null; p.atkPend = null; p.ultHold = 0; p.stopLoop('ult');
    p.cancelActions();
    this.endBulletTime();
  },
  // Hands control back while the bars slide out.
  closeCine() {
    if (!this.cine) return;
    this.cine.closing = true; this.cine.zoom = 1; this.cine.caption = null; this.cine.big = null;
    Input.locked = false;
  },
  cineActive() { return !!this.cine && !this.cine.closing; },
  queueCut(delay, fn) { this.cuts.push({ t: delay, fn }); },
  announce(text, sub, color = '#ff3a52', dur = 1.6, small = false) {
    this.announcements = this.announcements.filter((a) => a.text !== text);
    this.announcements.push({ text, sub, color, dur, t: 0, small });
    if (this.announcements.length > 3) this.announcements.shift();
  },
  addScore(n) { this.stats.score += Math.round(n); },
  registerHit(d, cause) {
    this.combo++;
    this.comboT = 2.5;
    this.comboPop = 0.06;
    if (this.combo > this.stats.maxCombo) this.stats.maxCombo = this.combo;
    const base = STYLE_GAIN[cause] || 3;
    const repeats = this.styleRecent.filter((c) => c === cause).length;
    const before = this.rank();
    this.style += base * Math.max(0.2, 1 - 0.18 * repeats);
    this.styleRecent.push(cause);
    if (this.styleRecent.length > 8) this.styleRecent.shift();
    this.styleIdle = 0;
    const after = this.rank();
    if (after && after !== before && (!before || after.th > before.th)) { this.rankPop = 0.3; Sound.play('rankUp'); }
  },
  rank() { for (const r of STYLE_RANKS) if (this.style >= r.th) return r; return null; },
  has(id) { return this.upgrades.has(id); },
  mod(id) { return (this.mode === 'endless' || this.mode === 'training') && Director.modifier === id; },
  gravMul() { return this.mod('lowgrav') ? 0.6 : 1; },
  // Endless: offer one of three upgrades during the break.
  offerUpgrade() {
    if (this.state !== 'playing' || this.player.dead) return;
    const opts = upgradeOffer();
    if (!opts.length) return;
    this.state = 'pick';
    this.player.onPause();
    Sound.setSlow(true);
    UI.showPick(opts);
  },
  chooseUpgrade(id) {
    if (this.state !== 'pick' || !UPGRADES[id]) return;
    this.upgrades.add(id);
    this.state = 'playing';
    Sound.setSlow(this.slowT > 0);
    Sound.play('ultReady');
    Input.clear(); Input.consume();
    UI.hideAll();
    this.announce(UPGRADES[id].name.toUpperCase(), null, '#ffd070', 2.2, true);
    // the pick was a click or a key press, so the mouse can be locked again straight away
    if (Input.lockRequired && !Touch.on()) Input.requestLock().then((ok) => { if (!ok && this.state === 'playing') { this.pause(); UI.lockHint(true); } });
  },
  rankMul() { const r = this.rank(); return r ? r.mul : 1; },
  // getting hit costs most of your style
  styleHit() { this.style *= 0.4; this.styleRecent.length = 0; },
  onKill(e, o) {
    if (e.counted) return;
    e.counted = true;
    this.stats.kills++;
    this.addScore(e.def.score * (1 + Math.min(this.combo, 100) * 0.03) * this.rankMul());
    const p = this.player;
    if (!p.ult) p.ultCharge = Math.min(1, p.ultCharge + ((e.heavy ? 3 : 1) / S.gameplay.ultKills) * this.rankMul());
    if (this.has('bloodline') && !p.dead) p.heal(2);
    if (o.cause !== 'fall' && chance(e.heavy ? 1 : 0.12)) this.pickups.push(new Pickup(e.center(), 'hp'));
  },
  onPlayerDeath() {
    this.combo = 0;
    this.overT = 2.2;
    this.overVictory = false;
    Sound.play('gameOver');
    Sound.setIntensity(0);
    this.saveBest();
  },
  victory() {
    if (this.mode === 'demo') SaveData.demoCleared = true;
    saveProgress();
    this.overT = 1.2;
    this.overVictory = true;
    Sound.setIntensity(0.2);
  },
  saveBest() {
    if (this.mode === 'endless') {
      if (this.stats.score > SaveData.bestScore) SaveData.bestScore = this.stats.score;
      if (Director.wave - 1 > SaveData.bestWave) SaveData.bestWave = Director.wave - 1;
      saveProgress();
    }
  },

  // ---------- simulation ----------
  step(realDt) {
    const C = this.cine;
    if (C) {
      C.t += realDt;
      if (C.big) C.bigT += realDt;
      C.bars = approach(C.bars, C.closing ? 0 : 1, realDt * (C.closing ? 2.5 : 3.5));
      if (C.closing && C.bars <= 0) this.cine = null;
      else if (C.skippable && !C.closing) {
        for (const c of C.stale) if (!Input.down.has(c)) C.stale.delete(c);
        const held = ['attack', 'sheathe', 'jump'].some((a) => Input.codes(a).some((c) => c && Input.down.has(c) && !C.stale.has(c)));
        C.skipHold = held ? C.skipHold + realDt : 0;
        if (C.skipHold >= 0.5 && C.owner && C.owner.skipCine) { C.owner.skipCine(); Game.freezeT = 0; this.slowT = 0; this.slowScale = 1; Sound.setSlow(false); }
      }
    }
    if (this.btT > 0) { this.btT -= realDt; if (this.btT <= 0) { this.btT = 0; this.btKind = null; this.btOwner = null; } }
    if (this.slowT > 0) {
      this.slowT -= realDt;
      if (this.slowT <= 0) { this.slowScale = 1; Sound.setSlow(false); }
    }
    for (let i = this.cuts.length - 1; i >= 0; i--) {
      const c = this.cuts[i];
      c.t -= realDt;
      if (c.t <= 0) { this.cuts.splice(i, 1); c.fn(); }
    }
    for (const a of this.announcements) a.t += realDt;
    this.announcements = this.announcements.filter((a) => a.t < a.dur);
    this.comboPop = Math.max(0, this.comboPop - realDt);
    if (this.rankPop > 0) this.rankPop = Math.max(0, this.rankPop - realDt);
    if (this.freezeT > 0) this.freezeT -= realDt;
    else {
      this.acc += realDt * this.slowScale;
      const STEP = 1 / 120;
      let n = 0;
      while (this.acc >= STEP && n < 10) { this.tick(STEP); this.acc -= STEP; n++; Input.consume(); }
      if (n >= 10) this.acc = 0;
    }
    if (this.overT > 0 && !this.cineActive()) {
      this.overT -= realDt;
      if (this.overT <= 0) {
        this.state = 'over'; this.player.stopAllLoops();
        for (const e of this.enemies) if (e.stopLoops) e.stopLoops();
        Sound.stopAll();
        this.saveBest(); UI.showOver(this.overVictory);
      }
    }
  },
  tick(dt) {
    this.time += dt;
    if (!this.player.dead) this.stats.time += dt;
    // the red barrels' colliders, where they are this tick
    World.dyn.length = 0;
    for (const p of this.props) if (!p.dead && p.q && p.q.on) World.dyn.push(p.q);
    this.player.update(dt);
    if (this.mode === 'training') Training.update(dt);
    Nav.update(this.player.pos, this.time);
    const cine = this.cineActive() ? this.cine : null;
    for (const e of this.enemies) if (!e.dead && (!cine || e === cine.owner)) e.update(dt);
    separateEnemies(dt);
    for (const b of this.projectiles) b.update(dt);
    for (const h of this.hazards) h.update(dt);
    for (const p of this.props) p.update(dt);
    Foundry.update(dt);
    Props.update(dt);
    for (const pk of this.pickups) pk.update(dt);
    if (!this.player.dead && !cine) Director.update(dt);
    FX.update(dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.styleIdle += dt;
    if (this.styleIdle > 1.2 && this.style > 0) this.style = Math.max(0, this.style - (4 + this.style * 0.06) * dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((b) => !b.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);
    this.props = this.props.filter((p) => !p.dead);
  },
};
