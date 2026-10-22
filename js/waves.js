'use strict';
// Wave director for the scripted demo, endless survival, the rival fight and the melee duel test mode.
// Spawns go through Arena (world.js); distances are in metres, converted from the 2D pixel values.
// Until AEGIS-07 arrives in Phase 5, the demo ends after its sixth wave and endless has no rival waves.

// Each wave introduces one problem that a specific move solves, so the rival tests practised skills.
const DEMO_WAVES = [
  { name: 'SCRAP SWARM', list: ['scrapper', 'scrapper', 'scrapper', 'scrapper'] },
  { name: 'SHIELD WALL', list: ['scrapper', 'shielder', 'gunner', 'scrapper', 'shielder'] },
  { name: 'LOW PROFILE', list: ['crawler', 'drone', 'scrapper', 'crawler', 'drone', 'gunner'] },
  { name: 'INCOMING', list: ['grenadier', 'scrapper', 'shielder', 'drone', 'grenadier', 'scrapper', 'gunner'] },
  { name: 'HIGH GROUND', list: ['sniper', 'brute', 'scrapper', 'crawler', 'sniper', 'gunner'] },
  { name: 'LAST STAND', list: ['brute', 'shielder', 'gunner', 'drone', 'grenadier', 'sniper', 'crawler', 'scrapper', 'brute', 'scrapper'] },
  { name: 'RIVAL', boss: true, list: [] },
];
const ALL_TYPES = ['scrapper', 'gunner', 'drone', 'brute', 'shielder', 'crawler', 'grenadier', 'sniper'];
const BOSS_EVERY = 8;
const ENDLESS_TYPES = [
  { type: 'scrapper', cost: 1, minWave: 1, weight: 4 },
  { type: 'gunner', cost: 1.4, minWave: 2, weight: 2.4 },
  { type: 'drone', cost: 1.1, minWave: 3, weight: 2.4 },
  { type: 'brute', cost: 5, minWave: 5, weight: 0.6 },
  { type: 'shielder', cost: 1.6, minWave: 3, weight: 1.6 },
  { type: 'crawler', cost: 1.5, minWave: 4, weight: 1.3 },
  { type: 'grenadier', cost: 1.8, minWave: 5, weight: 1.1 },
  { type: 'sniper', cost: 1.7, minWave: 6, weight: 1.0 },
];
const ENDLESS_NAMES = ['STREET SWEEP', 'RUST TIDE', 'NIGHT SHIFT', 'SCRAPYARD', 'BLACKOUT', 'NEON RIOT', 'DEAD GRID', 'RED HOUR'];

const Director = {
  mode: 'demo', wave: 0, state: 'idle', queue: [], spawnT: 0, breakT: 0, waveName: '', total: 0, scale: { hp: 1, dmg: 1 }, bossWave: false, modifier: null,

  start(mode) {
    this.mode = mode; this.wave = 0; this.state = mode === 'training' ? 'training' : mode === 'test' || mode === 'street' ? 'idle' : 'intro'; this.breakT = 1.4; this.queue = []; this.modifier = null;
  },
  enabledTypes() { return ALL_TYPES.filter((t) => S.enemies[t]); },
  rivalBuilt() { return typeof Rival === 'function'; },
  soloRival() { return this.mode === 'boss' || this.mode === 'duel'; },
  demoWaves() { return this.rivalBuilt() ? DEMO_WAVES.length : DEMO_WAVES.filter((w) => !w.boss).length; },
  lastWave() { return this.soloRival() ? 1 : this.mode === 'demo' ? this.demoWaves() : Infinity; },
  buildDemo(n) {
    const def = DEMO_WAVES[n - 1];
    this.bossWave = !!def.boss;
    this.waveName = def.name;
    this.scale = { hp: 1, dmg: 1 };
    const en = this.enabledTypes(), fallback = en.length ? en : ['scrapper'];
    const list = def.list.map((t) => (S.enemies[t] ? t : pick(fallback)));
    if (!list.length) return [];
    const target = Math.max(1, Math.round(list.length * S.enemies.count));
    const out = [];
    for (let i = 0; i < target; i++) out.push(list[i % list.length]);
    return out;
  },
  buildEndless(n) {
    this.bossWave = S.enemies.bossEndless && this.rivalBuilt() && n % BOSS_EVERY === 0;
    if (this.bossWave) {
      this.scale = { hp: 1 + (n - 1) * 0.06, dmg: 1 + (n - 1) * 0.03 };
      this.waveName = 'RIVAL';
      return [];
    }
    let budget = (4 + n * 1.7) * S.enemies.count;
    const avail = ENDLESS_TYPES.filter((d) => S.enemies[d.type] && d.minWave <= n);
    const pool = avail.length ? avail : [ENDLESS_TYPES[0]];
    const out = [];
    if (n % 5 === 0 && S.enemies.brute) for (let i = 0; i < Math.floor(n / 5); i++) { out.push('brute'); budget -= 4; }
    for (let guard = 0; budget > 0.5 && guard < 300; guard++) {
      const opts = pool.filter((d) => d.cost <= budget + 0.6);
      if (!opts.length) break;
      const ws = opts.map((d) => d.weight * (d.type === 'brute' ? 1 + n * 0.05 : 1));
      let r = Math.random() * ws.reduce((a, b) => a + b, 0), k = 0;
      while (r > ws[k]) { r -= ws[k]; k++; }
      out.push(opts[k].type);
      budget -= opts[k].cost;
    }
    for (let i = out.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [out[i], out[j]] = [out[j], out[i]]; }
    this.scale = { hp: 1 + (n - 1) * 0.07, dmg: 1 + (n - 1) * 0.035 };
    this.waveName = n % 5 === 0 ? 'HEAVY WAVE' : ENDLESS_NAMES[(n - 1) % ENDLESS_NAMES.length];
    return out.length ? out : ['scrapper'];
  },
  nextWave() {
    this.wave++;
    if (this.soloRival()) { this.bossWave = true; this.scale = { hp: 1, dmg: 1 }; this.waveName = this.mode === 'duel' ? 'LIMITERS OFF, FULL HEALTH' : 'RIVAL'; this.queue = []; }
    else this.queue = this.mode === 'demo' ? this.buildDemo(this.wave) : this.buildEndless(this.wave);
    this.total = this.queue.length;
    this.spawnT = this.bossWave ? 4 : 0.8;
    // endless waves from 4 on sometimes carry a twist
    const mods = Object.keys(WAVE_MODIFIERS).filter((k) => !WAVE_MODIFIERS[k].later);
    this.modifier = this.mode === 'endless' && !this.bossWave && this.wave >= 4 && chance(0.45) ? pick(mods) : null;
    this.state = 'fight';
    // Blackout: the street lamps go out for this wave (a rebake while the title shows)
    Arena.setBlackout(this.modifier === 'blackout');
    if (this.bossWave) this.spawnRival();
    const title = this.mode === 'duel' ? 'MELEE DUEL' : this.mode === 'boss' ? 'RIVAL FIGHT' : 'WAVE ' + this.wave + (this.mode === 'demo' ? ' / ' + this.demoWaves() : '');
    Game.announce(title, this.waveName, this.mode === 'duel' ? '#ff6a7a' : this.bossWave ? '#4af0ff' : '#ff3a52', 2.2);
    if (this.modifier) Game.announce(WAVE_MODIFIERS[this.modifier].name, WAVE_MODIFIERS[this.modifier].desc, '#ffd070', 2.6, true);
    Sound.play('waveStart');
    Sound.setIntensity(1);
    Game.resetProps();
  },
  alive() {
    let n = 0;
    for (const e of Game.enemies) if (!e.dead) n++;
    return n;
  },
  remaining() { return this.queue.length + this.alive(); },
  update(dt) {
    if (this.state === 'training') return;
    if (this.state === 'intro' || this.state === 'break') {
      this.breakT -= dt;
      if (this.breakT <= 0) {
        if (this.wave >= this.lastWave()) { this.state = 'done'; Game.victory(); return; }
        this.nextWave();
      }
    } else if (this.state === 'fight') {
      this.spawnT -= dt;
      const alive = this.alive();
      if (this.queue.length && alive < S.enemies.maxAlive && this.spawnT <= 0) {
        this.spawn(this.queue.shift());
        this.spawnT = rand(0.35, 0.95) / Math.sqrt(S.enemies.aggression);
      }
      if (!this.queue.length && alive === 0) this.clear();
    }
  },
  clear() {
    Sound.play('waveClear');
    Sound.setIntensity(0.35);
    const bonus = 250 * this.wave;
    Game.addScore(bonus);
    Game.stats.wave = this.wave;
    Game.player.heal(15);
    if (this.mode === 'endless' && this.wave > SaveData.bestWave) { SaveData.bestWave = this.wave; saveProgress(); }
    const last = this.wave >= this.lastWave();
    const done = this.mode === 'duel' ? 'DUEL WON' : this.mode === 'boss' ? 'RIVAL DEFEATED' : 'DEMO CLEAR';
    this.modifier = null;
    Arena.setBlackout(false);
    const pickDue = this.mode === 'endless' && upgradeDue(this.wave);
    if (pickDue) Game.queueCut(1.0, () => Game.offerUpgrade());
    Game.announce(last ? done : 'WAVE CLEAR', '+' + bonus + ' PTS', '#7dff8a', 1.8);
    this.state = 'break';
    this.breakT = last ? 2 : Math.max(S.enemies.waveBreak, pickDue ? 2.5 : 0);
  },
  spawnRival() {
    const p = Game.player.pos, c = Arena.center(), B = Arena.bounds();
    // 27 m from the player, toward the middle of the arena
    const d = distXZ(p, c) || 1, k = 27 / d;
    const x = clamp(p.x + (c.x - p.x) * k, B.minX + 11, B.maxX - 11), z = clamp(p.z + (c.z - p.z) * k, B.minZ + 11, B.maxZ - 11);
    const r = new Rival(Arena.freeGroundAt(x, z, 1.1), this.scale);
    if (this.mode === 'duel') r.startDuel();
    // the entry cutscene plays except on duel retries, which go straight to the fight
    if (!(this.mode === 'duel' && (Game.runs.duel || 0) > 1)) r.cinematicIntro();
    Game.enemies.push(r);
    Sound.play('spawn');
  },
  spawn(type) {
    const p = Game.player.pos, B = Arena.bounds();
    let pts;
    if (type === 'drone') {
      pts = [];
      for (let i = 0; i < 12; i++) {
        const a = rand(0, TAU), r = rand(13.6, 29);
        const x = clamp(p.x + Math.cos(a) * r, B.minX + 6, B.maxX - 6), z = clamp(p.z + Math.sin(a) * r, B.minZ + 6, B.maxZ - 6);
        const y = World.groundAt(x, z, 100) + rand(4, 8);
        // open air with room for the drone to arrive, not under a balcony's lip
        if (World.boxFree(x, y - 0.2, z, 0.7, 1.2)) pts.push({ x, y, z });
      }
    } else if (type === 'brute' || type === 'crawler') pts = Arena.spawnPoints('ground').slice();
    else if (type === 'sniper') pts = Arena.perches().slice();
    else pts = Arena.spawnPoints('ground').concat(Arena.spawnPoints('high'));
    if (!pts.length) pts = Arena.spawnPoints('high').map((q) => ({ x: q.x, y: q.y + 4, z: q.z }));
    let ok = pts.filter((q) => { const d = distXZ(q, p); return d > 11.8 && d < 43.6; });
    if (!ok.length) ok = pts.filter((q) => dist3(q, p) > 8.2);
    if (!ok.length) ok = pts;
    const q = pick(ok);
    // ground spawns scatter a little; drone spots and perches were checked for room exactly where they are
    const j = type === 'drone' || type === 'sniper' ? 0 : 0.5;
    const e = new Enemy(type, { x: q.x + rand(-j, j), y: q.y, z: q.z + rand(-j, j) }, this.scale);
    if (this.modifier === 'elite' && chance(0.3)) makeElite(e);
    Game.enemies.push(e);
    if (distXZ(q, p) < 29) Sound.play('spawn', {}, q);
    return e;
  },
};
