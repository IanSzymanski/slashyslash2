#!/usr/bin/env node
// Headless smoke test. Boots the 3D page and checks WebGL draws, runs scripted combat checks (a string
// lands, aim assist turns a swing, a glint can be parried and countered, a dash slash cuts, a hit costs
// shield), then plays Scrapper Waves with random input and mouse look. Fails on any page error, a
// camera inside a box or under the street, a body inside a box or outside the arena, or a failed check.
// Needs the dev dependencies:  npm install
// Usage: node tools/smoke-test.js [seconds-of-random-play] [--dist]
//   --dist also loads the single-file build (run node tools/build.js first).
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const seconds = Number(process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a)) || 60);
const root = path.resolve(__dirname, '..');
const pages = [path.join(root, 'index.html')];
if (process.argv.includes('--dist')) pages.push(path.join(root, 'dist', 'slashyslash-3d.html'));

// Runs in the page: one 60 Hz frame of the main loop, and key helpers.
const HARNESS = () => {
  window.T = {
    frame(n = 1) {
      for (let i = 0; i < n; i++) {
        const dt = 1 / 60;
        Game.realTime += dt;
        const look = Input.takeLook();
        if (Game.state === 'playing') {
          if (!Game.cineActive()) Camera.look(look.x, look.y);
          Game.step(dt);
          Render.interp();
          Camera.follow(Game.player, dt);
          Camera.update(dt, S.camera.distance, Game.player.dashT > 0);
        }
        if (T.render) Render.draw(dt);
      }
    },
    press(c) { Input.down.add(c); Input.pressed.add(c); },
    release(c) { Input.down.delete(c); Input.released.add(c); },
    tap(c, holdFrames = 1) { T.press(c); T.frame(holdFrames); T.release(c); },
    // a scrapper at (dx, dz) from the player, done spawning
    scrapper(dx, dz, o = {}) {
      const p = Game.player.pos, e = new Enemy('scrapper', { x: p.x + dx, y: p.y, z: p.z + dz }, {});
      e.spawning = false; e.cd = o.cd === undefined ? 99 : o.cd;
      Game.enemies.push(e);
      return e;
    },
    face(x, z, pitch = -0.12) { const p = Game.player.pos; Camera.yaw = yawOf(x - p.x, z - p.z); Camera.pitch = pitch; T.frame(2); },
    fresh() {
      Game.toMenu(); UI.act('test');
      const p = Game.player;
      S.gameplay.invincible = false; p.hp = PC.MAX_HP; p.shield = PC.MAX_SHIELD;
      T.frame(5);
      return p;
    },
  };
};

async function run(browser, file, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const name = path.basename(file);
  page.on('pageerror', (e) => errors.push(`${name}: ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  if (!fs.existsSync(file)) { errors.push(`missing ${file}`); return; }
  await page.goto('file://' + file);
  await page.waitForTimeout(1200);

  // WebGL is up and the title scene draws something other than the clear colour
  const gl = await page.evaluate(() => {
    if (typeof Gfx === 'undefined' || !Gfx.renderer) return { ok: false, why: document.getElementById('nogl').hidden ? 'no renderer' : 'WebGL failed to start' };
    Gfx.render();
    const c = Gfx.renderer.getContext(), w = c.drawingBufferWidth, h = c.drawingBufferHeight;
    const px = new Uint8Array(4 * 64);
    let lit = 0;
    for (let i = 0; i < 64; i++) {
      c.readPixels(Math.floor(((i % 8) + 0.5) * w / 8), Math.floor((Math.floor(i / 8) + 0.5) * h / 8), 1, 1, c.RGBA, c.UNSIGNED_BYTE, px.subarray(i * 4, i * 4 + 4));
      if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 3 * 16) lit++;
    }
    return { ok: lit > 4, why: `${lit}/64 sample points lit`, webgl2: Gfx.renderer.capabilities.isWebGL2, size: [w, h], verts: Gfx.levelVerts };
  });
  console.log(`${name}: webgl2 ${gl.webgl2}, buffer ${gl.size}, ${gl.verts} baked vertices, ${gl.why}`);
  if (!gl.ok) { errors.push(`${name}: scene did not draw (${gl.why})`); return; }

  // the real pointer-lock path from a click: either it locks and plays, or it waits paused with the hint
  await page.click('#btn-test');
  await page.waitForTimeout(1800);
  const lock = await page.evaluate(() => ({ state: Game.state, locked: Input.pointerLocked, hint: !document.getElementById('lock-hint').hidden }));
  console.log(`  click to start: ${lock.state}, pointer ${lock.locked ? 'locked' : 'not locked'}${lock.hint ? ', hint shown' : ''}`);
  if (!(lock.state === 'playing' && lock.locked) && !(lock.state === 'paused' && lock.hint)) errors.push(`start without a lock should pause with the hint: ${JSON.stringify(lock)}`);
  await page.evaluate(() => Game.toMenu());
  await page.evaluate(HARNESS);

  // ---------- scripted checks ----------
  const checks = await page.evaluate(async () => {
    const out = [], ok = (pass, msg) => out.push({ pass: !!pass, msg });
    UI.act('howto'); UI.act('back');
    UI.act('settings');
    for (const b of document.querySelectorAll('#settings .tabs button')) b.click();
    UI.act('back');
    S.camera.sensitivity = 1.25; saveSettings(); saveProgress();
    Sound.init();
    Sound.play('hit', { heavy: true }, { x: 3, y: 1, z: -2 });

    // a refused lock leaves the run paused with the hint, and Resume retries
    Input.canvas.requestPointerLock = () => Promise.reject(new Error('refused'));
    await UI.startRun('test');
    ok(Game.state === 'paused' && !document.getElementById('lock-hint').hidden, 'refused pointer lock pauses with a hint');
    delete Input.canvas.requestPointerLock;
    Input.lockRequired = false;

    // mouse look drops a lone recentring jump mid-turn but keeps a fast flick whole
    Input.takeLook(); Input.recentX = 0;
    for (let i = 0; i < 40; i++) Input.addLook(14, 0);
    Input.addLook(-640, 0);
    const turned = Input.takeLook().x;
    Input.recentX = 0;
    for (const d of [5, 60, 180, 320, 420, 300]) Input.addLook(d, 0);
    const flick = Input.takeLook().x;
    ok(turned === 560 && flick === 1285, `mouse look drops a recentring spike and keeps a flick (${turned}/560, ${flick}/1285)`);
    // render every checked frame (models only exist once drawn), small and fast
    S.visuals.resScale = 0.25; Render.resize(); T.render = true;

    // a light string: three taps on a scrapper in front land three hits and the finisher
    let p = T.fresh(), e = T.scrapper(2.4, 0);
    e.hp = e.maxHp = 999;
    T.face(e.pos.x, e.pos.z);
    let hits = 0;
    for (let i = 0; i < 3; i++) { const hp = e.hp; T.tap('Mouse0'); T.frame(16); if (e.hp < hp) hits++; e.pos.x = p.pos.x + 2.4; e.pos.z = p.pos.z; e.vel.x = e.vel.z = 0; }
    ok(hits === 3, `light string landed ${hits}/3 hits`);
    // a heavy (hold) opens a new string with the launching rise
    e.pos.x = p.pos.x + 2.4; T.frame(40);
    const hpH = e.hp;
    T.press('Mouse0'); T.frame(14); T.release('Mouse0'); T.frame(20);
    ok(e.hp < hpH && e.vel.y > 0, 'heavy opener hits and launches');

    // aim assist turns a swing onto a scrapper 25 degrees off the aim
    p = T.fresh();
    e = T.scrapper(Math.cos(0.44) * 2.6, Math.sin(0.44) * 2.6);
    T.face(p.pos.x + 10, p.pos.z);
    const hp0 = e.hp;
    T.tap('Mouse0'); T.frame(16);
    ok(e.hp < hp0, 'aim assist turns a light onto a target 25 degrees off');

    // parry from the glint: a scrapper winds up, its glint flashes, E inside the window parries and stuns it
    p = T.fresh();
    e = T.scrapper(2.0, 0, { cd: 0 });
    T.face(e.pos.x, e.pos.z);
    let glintAt = -1;
    for (let i = 0; i < 120 && glintAt < 0; i++) { T.frame(1); if (e.glinted) glintAt = i; }
    ok(glintAt >= 0, 'scrapper wind-up glints');
    const parries = Game.stats.parries, shield = p.shield;
    T.frame(6);
    T.press('KeyE');
    for (let i = 0; i < 40 && Game.stats.parries === parries; i++) T.frame(1);
    ok(Game.stats.parries === parries + 1, 'pressing parry on the glint parries the strike');
    ok(p.sheathe && p.sheathe.empowered, 'a parry empowers the stance');
    ok(Math.abs(p.shield - shield) < 0.01, 'a parry refunds its shield cost');
    ok(e.stun > 0, 'a parried scrapper is staggered');
    // releasing E draws the counter, which cuts it down
    e.hp = 60;
    T.release('KeyE');
    T.frame(60);
    ok(e.dead, 'the counter kills a staggered scrapper');

    // an unparried strike costs shield, not health
    p = T.fresh();
    e = T.scrapper(2.0, 0, { cd: 0 });
    T.face(e.pos.x, e.pos.z);
    for (let i = 0; i < 120 && p.shield === PC.MAX_SHIELD; i++) T.frame(1);
    ok(p.shield < PC.MAX_SHIELD && p.hp === PC.MAX_HP, `a strike takes shield first (shield ${p.shield.toFixed(0)}, hp ${p.hp})`);

    // dash into dash slash: Shift then a tap cuts a scrapper 6 m ahead
    p = T.fresh();
    e = T.scrapper(6, 0);
    T.face(e.pos.x, e.pos.z);
    const hp1 = e.hp, ex = e.pos.x;
    T.tap('ShiftLeft'); T.frame(4); T.tap('Mouse0'); T.frame(30);
    ok(e.hp < hp1, 'dash slash cuts along its path');
    ok(p.pos.x > ex - 1, `dash slash carries you up to or through the target (ended ${(p.pos.x - ex).toFixed(1)} m from where it stood)`);

    // a kill makes gibs and the model goes away
    p = T.fresh();
    e = T.scrapper(2.2, 0);
    T.face(e.pos.x, e.pos.z);
    const gibs = FX.gibList.length;
    e.hp = 1; T.tap('Mouse0'); T.frame(20);
    ok(e.dead && FX.gibList.length > gibs, 'a kill throws gibs');
    ok(!Render.models.has(e), 'a dead enemy\'s model is removed');

    // a scrapper winding up behind you shows on the threat ring; one between you and the camera fades
    p = T.fresh();
    Camera.yaw = yawOf(1, 0); T.frame(2);
    e = T.scrapper(-9, 0);
    e.setState('windup');
    T.frame(1);
    const ring = Render.ctx.getImageData(VIEW_W / 2 - 4, VIEW_H / 2 + 30 - 4, 9, 9).data;
    let lit = 0;
    for (let i = 3; i < ring.length; i += 4) if (ring[i] > 0) lit++;
    ok(lit > 4, `a wind-up behind you marks the bottom of the threat ring (${lit} px)`);
    e.dead = true;
    const f = T.scrapper(-2.5, 0);
    T.frame(20);
    ok(f.fade < 0.5, `a scrapper between the camera and you fades out (opacity ${f.fade.toFixed(2)})`);
    T.render = false;
    Game.toMenu();
    return out;
  });
  for (const c of checks) { console.log(`  ${c.pass ? 'ok  ' : 'FAIL'} ${c.msg}`); if (!c.pass) errors.push(`${name}: ${c.msg}`); }

  // ---------- random play ----------
  const res = await page.evaluate(async (frames) => {
    const problems = [];
    const fail = (m) => problems.push(m);
    S.visuals.resScale = 0.5; Render.resize();
    S.enemies.waveBreak = 1;
    UI.act('scrappers');
    S.gameplay.invincible = true;
    T.frame(1); Render.draw(1 / 60);
    const progs0 = Gfx.renderer.info.programs.length;
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'Mouse0', 'KeyE'];
    const B = World.def.bounds, PM = Camera.PITCH_MAX + 1e-6;
    const inBox = (b) => World.overlap(b.pos.x, b.pos.y + 0.02, b.pos.z, b.r * 0.9, b.h - 0.04);
    let maxEnemies = 0;
    for (let f = 0; f < frames; f++) {
      for (const c of codes) {
        const held = Input.down.has(c);
        if (!held && Math.random() < (c === 'Mouse0' ? 0.12 : c === 'KeyW' ? 0.08 : 0.04)) T.press(c);
        else if (held && Math.random() < 0.12) T.release(c);
      }
      Input.lookDX += (Math.random() - 0.5) * (Math.random() < 0.05 ? 900 : 60);
      Input.lookDY += (Math.random() - 0.5) * (Math.random() < 0.05 ? 700 : 40);
      if (f % 97 === 0) S.camera.distance = 3 + Math.random() * 4;
      // now and then look at the nearest enemy, as a player would
      if (Math.random() < 0.03) {
        const p = Game.player.pos, e = Game.enemies.filter((q) => !q.dead).sort((a, b) => distXZ(a.pos, p) - distXZ(b.pos, p))[0];
        if (e) { Camera.yaw = yawOf(e.pos.x - p.x, e.pos.z - p.z); Camera.pitch = -0.15; }
      }
      if (f === Math.floor(frames / 2)) { Game.pause(); if (Game.state !== 'paused') fail('pause failed'); await UI.resumeGame(); if (Game.state !== 'playing') fail('resume failed'); }
      T.frame(1);
      if (f % 3 === 0) Render.draw(1 / 60);
      maxEnemies = Math.max(maxEnemies, Game.enemies.length);
      const cp = Camera.pos, p = Game.player;
      if (![cp.x, cp.y, cp.z].every(isFinite)) fail(`camera position not finite at frame ${f}`);
      else if (World.pointSolid(cp.x, cp.y, cp.z)) fail(`camera inside a box at frame ${f}: ${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)}`);
      else if (World.groundAt(cp.x, cp.z, cp.y) === -Infinity) fail(`camera below the street at frame ${f}`);
      if (Math.abs(Camera.pitch) > PM) fail(`pitch past the limit at frame ${f}`);
      for (const b of [p].concat(Game.enemies.filter((e) => !e.dead && !e.spawning))) {
        const q = b.pos;
        if (![q.x, q.y, q.z].every(isFinite)) fail(`${b.type || 'player'} position not finite at frame ${f}`);
        else if (q.x < B.minX - 0.01 || q.x > B.maxX + 0.01 || q.z < B.minZ - 0.01 || q.z > B.maxZ + 0.01 || q.y < -0.01) fail(`${b.type || 'player'} outside the arena at frame ${f}: ${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`);
        else if (!b.mantle && inBox(b)) fail(`${b.type || 'player'} inside a box at frame ${f}: ${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}`);
      }
      if (problems.length) break;
    }
    if (Gfx.renderer.info.programs.length !== progs0) fail(`shaders compiled mid-fight: ${progs0} programs before, ${Gfx.renderer.info.programs.length} after`);
    const r = { problems, wave: Director.wave, kills: Game.stats.kills, maxEnemies, style: Game.rank() ? Game.rank().r : '-', time: Game.time.toFixed(1), calls: Gfx.renderer.info.render.calls, progs: Gfx.renderer.info.programs.length };
    Game.toMenu();
    S.visuals.resScale = 1; Render.resize();
    return r;
  }, Math.round(seconds * 60));
  await page.waitForTimeout(300);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  if (keys.some((k) => !k.startsWith('slashyslash3d.'))) errors.push(`storage keys outside slashyslash3d.*: ${keys.join(', ')}`);
  if (!keys.includes('slashyslash3d.settings.v1') || !keys.includes('slashyslash3d.save.v1')) errors.push(`3D saves missing: ${keys.join(', ')}`);
  console.log(`  scrapper waves: ${res.time}s simulated, wave ${res.wave}, ${res.kills} kills, up to ${res.maxEnemies} enemies, style ${res.style}, ${res.calls} draw calls, ${res.progs} shader programs`);
  if (res.kills < 1) errors.push(`${name}: random play killed nothing`);
  errors.push(...res.problems.map((m) => `${name}: ${m}`));
  await page.close();
}

(async () => {
  // newer Chromium builds need these flags for SwiftShader WebGL
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  for (const file of pages) await run(browser, file, errors);
  await browser.close();
  if (errors.length) {
    console.error('FAILED\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log('OK');
})();
