#!/usr/bin/env node
// Headless smoke test: boots the 3D page, checks WebGL draws, plays the test room with random input and
// mouse look, and fails on any page error, a camera inside a box, or a player outside the arena.
// Needs the dev dependencies:  npm install
// Usage: node tools/smoke-test.js [seconds-of-simulated-play] [--dist]
//   --dist also loads the single-file build (run node tools/build.js first).
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const seconds = Number(process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a)) || 60);
const root = path.resolve(__dirname, '..');
const pages = [path.join(root, 'index.html')];
if (process.argv.includes('--dist')) pages.push(path.join(root, 'dist', 'slashyslash-3d.html'));

async function run(browser, file, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${path.basename(file)}: ${e.stack || e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${path.basename(file)}: ${m.text()}`); });
  if (!fs.existsSync(file)) { errors.push(`missing ${file}`); return; }
  await page.goto('file://' + file);
  await page.waitForTimeout(700);

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
    return { ok: lit > 4, why: `${lit}/64 sample points lit`, webgl2: Gfx.renderer.capabilities.isWebGL2, size: [w, h] };
  });
  console.log(`${path.basename(file)}: webgl2 ${gl.webgl2}, buffer ${gl.size}, ${gl.why}`);
  if (!gl.ok) { errors.push(`${path.basename(file)}: scene did not draw (${gl.why})`); return; }

  // the real pointer-lock path from a click: either it locks and plays, or it waits paused with the hint
  await page.click('#btn-test');
  await page.waitForTimeout(1800);
  const lock = await page.evaluate(() => ({ state: Game.state, locked: Input.pointerLocked, hint: !document.getElementById('lock-hint').hidden }));
  console.log(`  click to start: ${lock.state}, pointer ${lock.locked ? 'locked' : 'not locked'}${lock.hint ? ', hint shown' : ''}`);
  if (!(lock.state === 'playing' && lock.locked) && !(lock.state === 'paused' && lock.hint)) errors.push(`start without a lock should pause with the hint: ${JSON.stringify(lock)}`);
  await page.evaluate(() => Game.toMenu());

  const res = await page.evaluate(async (frames) => {
    const problems = [];
    const fail = (m) => problems.push(m);
    // settings, how to play and every settings tab render
    UI.act('howto'); UI.act('back');
    UI.act('settings');
    for (const b of document.querySelectorAll('#settings .tabs button')) b.click();
    UI.act('back');
    // saved data stays under the 3D keys
    S.camera.sensitivity = 1.25; saveSettings(); saveProgress();
    // positional audio and the Arena interface used by the Director
    Sound.init();
    Sound.play('hit', { heavy: true }, { x: 3, y: 1, z: -2 });
    Sound.play('glint', {}, { x: -8, y: 1, z: 6 });
    for (let w = 1; w <= DEMO_WAVES.length; w++) Director.buildDemo(w);
    for (let w = 1; w <= 24; w++) if (!Array.isArray(Director.buildEndless(w))) fail('endless wave ' + w);
    if (!Arena.spawnPoints('ground').length) fail('no ground spawns');
    const fg = Arena.freeGroundAt(9, 9, 1.1);
    if (!World.cylinderFree(fg.x, fg.y, fg.z, 1.1, PC.HEIGHT)) fail('freeGroundAt returned a blocked spot');

    // a refused lock leaves the run paused with the hint, and Resume retries
    Input.canvas.requestPointerLock = () => Promise.reject(new Error('refused'));
    await UI.startRun('test');
    if (Game.state !== 'paused' || document.getElementById('lock-hint').hidden) fail('refused lock: expected paused with the hint, got ' + Game.state);
    delete Input.canvas.requestPointerLock;
    Game.toMenu();

    // random play renders at half resolution: SwiftShader is slow and pixels aren't what this tests
    Input.lockRequired = false;
    S.visuals.resScale = 0.5; Render.resize();
    UI.act('test');
    if (Game.state !== 'playing') fail('test room did not start: ' + Game.state);
    S.gameplay.invincible = true;
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'Mouse0', 'KeyE', 'Mouse2', 'KeyR', 'KeyF'];
    const B = World.def.bounds, PM = Camera.PITCH_MAX + 1e-6;
    for (let f = 0; f < frames; f++) {
      for (const c of codes) {
        const held = Input.down.has(c);
        if (!held && Math.random() < (c === 'Mouse0' ? 0.12 : 0.04)) { Input.down.add(c); Input.pressed.add(c); }
        else if (held && Math.random() < 0.12) { Input.down.delete(c); Input.released.add(c); }
      }
      // mouse look: steady drags with occasional big flicks
      Input.lookDX += (Math.random() - 0.5) * (Math.random() < 0.05 ? 900 : 60);
      Input.lookDY += (Math.random() - 0.5) * (Math.random() < 0.05 ? 700 : 40);
      if (f % 97 === 0) S.camera.distance = 3 + Math.random() * 4;
      if (Math.random() < 0.01) Game.shake(0.6);
      if (Math.random() < 0.004) Game.slowmo(0.3, 0.4);
      if (Math.random() < 0.002) Game.bulletTime(0.6, { kind: 'clash', scale: 0.7 });
      if (Math.random() < 0.01) Game.hitstop(0.08);
      if (Math.random() < 0.02) Game.registerHit(10, 'slash');
      if (Math.random() < 0.005) Sound.play('glint', {}, { x: Math.random() * 30 - 15, y: 1, z: Math.random() * 30 - 15 });
      if (f === Math.floor(frames / 2)) { Game.pause(); if (Game.state !== 'paused') fail('pause failed'); await UI.resumeGame(); }
      if (f === Math.floor(frames / 2) + 1 && Game.state !== 'playing') fail('resume failed: ' + Game.state);
      // the main loop, one 60 Hz frame
      const dt = 1 / 60;
      Game.realTime += dt;
      const look = Input.takeLook();
      if (Game.state === 'playing') {
        Camera.look(look.x, look.y);
        Game.step(dt);
        Camera.follow(Game.player, dt);
        Camera.update(dt);
      }
      if (f % 3 === 0) Render.draw(dt);
      const cp = Camera.pos, p = Game.player.pos;
      if (![cp.x, cp.y, cp.z].every(isFinite)) fail(`camera position not finite at frame ${f}`);
      else if (World.pointSolid(cp.x, cp.y, cp.z)) fail(`camera inside a box at frame ${f}: ${cp.x.toFixed(2)},${cp.y.toFixed(2)},${cp.z.toFixed(2)}`);
      else if (World.groundAt(cp.x, cp.z, cp.y) === -Infinity) fail(`camera below the floor at frame ${f}: ${cp.y.toFixed(2)}`);
      if (Math.abs(Camera.pitch) > PM) fail(`pitch past the limit at frame ${f}: ${Camera.pitch}`);
      if (Camera.curDist > S.camera.distance + 1e-6) fail(`camera beyond its distance at frame ${f}`);
      if (!(p.x >= B.minX && p.x <= B.maxX && p.z >= B.minZ && p.z <= B.maxZ && p.y >= World.def.groundY - 0.01)) fail(`player outside the arena at frame ${f}`);
      else if (!World.cylinderFree(p.x, p.y + 0.02, p.z, PC.RADIUS * 0.9, PC.HEIGHT - 0.04)) fail(`player inside a box at frame ${f}`);
      if (problems.length) break;
    }
    // resolution scale resizes the drawing buffer
    const before = Gfx.renderer.getContext().drawingBufferWidth;
    S.visuals.resScale = 1; Render.resize();
    const after = Gfx.renderer.getContext().drawingBufferWidth;
    if (!(after === before * 2)) fail(`resolution scale did nothing: ${before} -> ${after}`);
    Game.toMenu();
    return { problems, style: Game.rank() ? Game.rank().r : '-', time: Game.time.toFixed(1) };
  }, Math.round(seconds * 60));
  await page.waitForTimeout(300);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  if (keys.some((k) => !k.startsWith('slashyslash3d.'))) errors.push(`storage keys outside slashyslash3d.*: ${keys.join(', ')}`);
  if (!keys.includes('slashyslash3d.settings.v1') || !keys.includes('slashyslash3d.save.v1')) errors.push(`3D saves missing: ${keys.join(', ')}`);
  console.log(`  test room: ${res.time}s simulated, style ${res.style}, storage ${keys.join(', ')}`);
  errors.push(...res.problems);
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
