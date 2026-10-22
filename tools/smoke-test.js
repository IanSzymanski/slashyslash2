#!/usr/bin/env node
// Headless smoke test. Boots the 3D page and checks WebGL draws, runs scripted checks of the moves
// (Phases 1 and 2), the nav graph, each enemy type's answer and the wave modes (Phase 3), then plays
// Endless from wave 6 with random input and mouse look. Fails on any page error, a camera inside a box
// or under the street, a body inside a box or outside the arena, a shader compiled mid-fight, or a
// failed check.
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
    // an enemy of any type at (dx, dz) from the player, done spawning
    enemy(type, dx, dz, o = {}) {
      const p = Game.player.pos, e = new Enemy(type, { x: p.x + dx, y: p.y, z: p.z + dz }, {});
      e.spawning = false; e.cd = o.cd === undefined ? 99 : o.cd;
      if (o.hp) e.hp = e.maxHp = o.hp;
      if (o.frozen) e.stun = 99;
      Game.enemies.push(e);
      return e;
    },
    face(x, z, pitch = -0.12) { const p = Game.player.pos; Camera.yaw = yawOf(x - p.x, z - p.z); Camera.pitch = pitch; T.frame(2); },
    // point the camera's crosshair straight at a world point
    aimAt(c, dp = 0) {
      for (let i = 0; i < 2; i++) { const q = Camera.pos; Camera.yaw = yawOf(c.x - q.x, c.z - q.z); Camera.pitch = Math.atan2(c.y - q.y, Math.hypot(c.x - q.x, c.z - q.z)) + dp; T.frame(1); }
    },
    fresh() {
      Game.toMenu(); UI.act('test');
      const p = Game.player;
      S.gameplay.invincible = false; p.hp = PC.MAX_HP; p.shield = PC.MAX_SHIELD;
      T.frame(5);
      Game.props = []; Game.projectiles = []; Game.hazards = [];
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

    // ---------- Phase 2 moves ----------
    // a gunner lays its laser on you and fires; a slash sends the bolt back into it
    p = T.fresh(); e = T.enemy('gunner', 10, 0, { cd: 0, hp: 500 }); T.face(e.pos.x, e.pos.z);
    let bolt = null;
    for (let i = 0; i < 200 && !bolt; i++) { T.frame(1); bolt = Game.projectiles.find((q) => q.kind === 'bolt'); }
    ok(!!bolt, 'a gunner aims and fires a bolt');
    for (let i = 0; i < 60 && bolt && bolt.hostile && distXZ(bolt.pos, p.pos) > 2.6; i++) T.frame(1);
    const hpG = e.hp;
    T.tap('Mouse0'); T.frame(4);
    ok(bolt && !bolt.hostile, 'a slash sends the bolt back');
    for (let i = 0; i < 60 && e.hp === hpG; i++) T.frame(1);
    ok(e.hp < hpG, `the returned bolt hits the gunner (${hpG - e.hp})`);

    // a grenadier's grenade: tether it in flight, time slows, the kick sends it home
    p = T.fresh(); e = T.enemy('grenadier', 13, 0, { cd: 0, hp: 500 }); T.face(e.pos.x, e.pos.z);
    let gren = null;
    for (let i = 0; i < 240 && !gren; i++) { T.frame(1); gren = Game.projectiles.find((q) => q.kind === 'grenade'); }
    ok(!!gren, 'a grenadier throws a pulse grenade');
    if (gren) {
      T.frame(14);
      ok(!!gren.impact, 'a flying grenade marks where it will land');
      T.aimAt(gren.pos);
      T.tap('Mouse2');
      let bt = false;
      for (let i = 0; i < 30 && !bt; i++) { T.frame(1); bt = Game.btT > 0; }
      ok(bt && gren.state === 'caught', 'tethering the grenade catches it and slows time');
      for (let i = 0; i < 200 && gren.state !== 'kicked' && !gren.dead; i++) T.aimAt(e.center());
      ok(gren.state === 'kicked' && !!p.kickAnim, 'reeling in kicks it and flips you off it');
      const hpE = e.hp;
      for (let i = 0; i < 120 && !gren.dead; i++) T.frame(1);
      ok(e.hp < hpE, `the kicked grenade hits its thrower (${hpE - e.hp})`);
    }

    // barrels: a slash lights one; the tether swings another and throws it into a scrapper
    p = T.fresh(); e = T.enemy('scrapper', 4.5, 0, { hp: 500 });
    let br = new Barrel({ x: p.pos.x + 2.2, y: p.pos.y, z: p.pos.z }); Game.props.push(br);
    T.face(br.pos.x, br.pos.z);
    T.tap('Mouse0'); T.frame(70);
    ok(br.dead && e.hp < 500, `a slashed barrel explodes and hurts a scrapper (${500 - e.hp})`);
    p = T.fresh(); e = T.enemy('scrapper', 12, 3, { hp: 500 });
    br = new Barrel({ x: p.pos.x + 6, y: p.pos.y, z: p.pos.z }); Game.props.push(br);
    T.frame(5); T.aimAt(br.center());
    T.press('Mouse2'); T.frame(25);
    ok(p.towing(), 'holding the tether on a barrel tows it');
    T.aimAt(e.center(), -0.02); T.frame(18);
    T.release('Mouse2');
    for (let i = 0; i < 120 && !br.dead; i++) T.frame(1);
    ok(br.dead && e.hp < 500, `a thrown barrel bursts on a scrapper (${500 - e.hp})`);

    // zip: hold the tether on a scrapper and arrive in a strike that refunds its cost
    p = T.fresh(); e = T.enemy('scrapper', 9, 0, { hp: 500 }); T.frame(3); T.aimAt(e.center());
    const sh0 = p.shield;
    T.press('Mouse2'); T.frame(60); T.release('Mouse2');
    ok(e.hp <= 500 - 22 && Math.abs(p.shield - sh0) < 0.01, `a zip strike hits (${500 - e.hp}) and refunds the tether`);

    // plunge from the air onto a scrapper below
    p = T.fresh(); e = T.enemy('scrapper', 0.3, 0, { hp: 500, frozen: true });
    p.vel.y = 22; p.onGround = false; T.frame(15);
    T.press('KeyC'); T.tap('Mouse0'); T.frame(60); T.release('KeyC');
    ok(e.hp < 475, `a plunge lands a shockwave on a scrapper below (${500 - e.hp})`);

    // slide attacks: a light one throws rubble and cuts, a heavy one launches you and the scrapper
    p = T.fresh(); T.face(p.pos.x + 10, p.pos.z); T.press('KeyW'); T.frame(30); T.press('KeyC'); T.frame(3);
    e = T.enemy('scrapper', fwdX(p.yaw) * 2, fwdZ(p.yaw) * 2, { hp: 500, frozen: true });
    T.tap('Mouse0');
    let rocks = 0;
    for (let i = 0; i < 12; i++) { T.frame(1); rocks = Math.max(rocks, Game.projectiles.filter((q) => q.kind === 'rock').length); }
    T.frame(22); T.release('KeyC'); T.release('KeyW'); T.frame(10);
    ok(rocks >= 6 && e.hp < 500, `a light slide attack throws rubble (${rocks} rocks) and cuts (${500 - e.hp})`);
    p = T.fresh(); T.face(p.pos.x + 10, p.pos.z); T.press('KeyW'); T.frame(30); T.press('KeyC'); T.frame(2);
    e = T.enemy('scrapper', fwdX(p.yaw) * 4.6, fwdZ(p.yaw) * 4.6, { hp: 500, frozen: true });
    T.press('Mouse0'); T.frame(20); T.release('Mouse0'); T.frame(8);
    ok(!p.onGround && p.vel.y > 0 && e.hp < 500 && e.vel.y > 0, `a heavy slide attack launches you and the scrapper (${500 - e.hp})`);
    T.release('KeyC'); T.release('KeyW');

    // the heavy slam's ground ring reaches a scrapper behind you
    p = T.fresh(); e = T.enemy('scrapper', 2.4, 0, { hp: 999 }); const far = T.enemy('scrapper', -6, 0, { hp: 500, frozen: true });
    T.face(e.pos.x, e.pos.z);
    for (let i = 0; i < 3; i++) { T.press('Mouse0'); T.frame(12); T.release('Mouse0'); T.frame(i < 2 ? 18 : 60); e.pos.x = p.pos.x + 2.4; e.pos.z = p.pos.z; e.vel.x = e.vel.z = 0; }
    ok(far.hp < 500, `the heavy slam's ground ring hits a scrapper 6 m behind (${500 - far.hp})`);

    // Overload shocks everything close, then refuses until its cooldown is done
    p = T.fresh(); const o1 = T.enemy('scrapper', 3, 0), o2 = T.enemy('scrapper', -2, 2);
    T.tap('KeyF'); T.frame(10);
    ok(o1.hp < o1.maxHp && o2.hp < o2.maxHp && p.utilCD > 9, 'Overload shocks everything close and starts its cooldown');
    T.tap('KeyF'); T.frame(2);
    ok(p.utilFlash > 0, 'Overload on cooldown is refused');

    // bullet jump out of a slide; wall slide and wall kick off a building
    p = T.fresh(); Camera.pitch = 0.35; T.press('KeyW'); T.frame(30); T.press('KeyC'); T.frame(3);
    const bx = p.pos.x, bz = p.pos.z; T.tap('Space'); T.frame(2);
    const bullet = p.bulletT > 0 && p.vel.y > 8;
    T.release('KeyC'); T.release('KeyW'); T.frame(40);
    ok(bullet && Math.hypot(p.pos.x - bx, p.pos.z - bz) > 8, `crouch-slide plus jump bullet-jumps (${Math.hypot(p.pos.x - bx, p.pos.z - bz).toFixed(1)} m)`);
    p = T.fresh(); p.pos.z = p.prev.z = -7 + 0.42; Camera.yaw = 0; T.frame(2);
    T.press('KeyW'); T.press('Space'); T.frame(55);
    const wallSlid = p.wallSliding;
    T.release('Space'); T.frame(1); T.press('Space'); T.frame(2);
    ok(wallSlid && p.vel.z > 10 && p.vel.y > 15, `pushing into a wall slides down it, and jumping kicks off (out ${p.vel.z.toFixed(1)}, up ${p.vel.y.toFixed(1)})`);
    T.release('KeyW'); T.release('Space');

    // a dash leaves afterimages
    p = T.fresh(); T.tap('ShiftLeft'); T.frame(6);
    ok(Views.ghosts.some((g) => g.mesh.visible), 'a dash leaves afterimages');

    // ---------- Phase 3: navigation, the other enemies, the wave modes ----------
    // a scrapper on the street climbs onto the 5.9 m roof you stand on, and one on a roof comes down to you
    const roof = World.boxes.find((b) => b.kind === 'building' && Math.abs(b.max.y - 5.91) < 0.05);
    const rx = (roof.min.x + roof.max.x) / 2;
    p = T.fresh(); S.gameplay.invincible = true;
    p.pos.x = p.prev.x = rx; p.pos.y = p.prev.y = roof.max.y; p.pos.z = p.prev.z = -11; Camera.snap(p);
    e = T.enemy('scrapper', 0, 13, { hp: 999 }); e.pos.y = 0;
    let hopped = false, up = false;
    for (let i = 0; i < 720 && !up; i++) { T.frame(1); hopped = hopped || !!e.hop; up = e.pos.y > roof.max.y - 0.1 && distXZ(e.pos, p.pos) < 3; }
    ok(up && hopped, `a scrapper jumps up onto the roof you stand on (${hopped ? 'jumped' : 'no jump'}, at ${e.pos.y.toFixed(1)} m, ${distXZ(e.pos, p.pos).toFixed(1)} m from you)`);
    p = T.fresh(); S.gameplay.invincible = true;
    p.pos.x = p.prev.x = rx; p.pos.z = p.prev.z = 3; Camera.snap(p);
    e = T.enemy('scrapper', 0, -14, { hp: 999 }); e.pos.y = roof.max.y;
    let down = false;
    for (let i = 0; i < 600 && !down; i++) { T.frame(1); down = e.pos.y < 0.2 && distXZ(e.pos, p.pos) < 3; }
    ok(down, `a scrapper on a roof drops to the street to reach you (at ${e.pos.y.toFixed(1)} m, ${distXZ(e.pos, p.pos).toFixed(1)} m away)`);
    S.gameplay.invincible = false;

    // a drone hovers above head height, dives, and a parry on the dive knocks it out of the air
    p = T.fresh(); e = T.enemy('drone', 6, 0, { hp: 999 }); e.pos.y = p.pos.y + 4;
    T.frame(120);
    ok(e.pos.y - p.pos.y > 3.5, `a drone hovers above head height (${(e.pos.y - p.pos.y).toFixed(1)} m up)`);
    e.cd = 0;
    let dived = false;
    for (let i = 0; i < 240 && !e.glinted; i++) { T.frame(1); dived = dived || e.state === 'dive'; }
    ok(e.glinted, 'a drone glints before its dive lands');
    const pd = Game.stats.parries;
    T.frame(6); T.press('KeyE');
    for (let i = 0; i < 40 && Game.stats.parries === pd; i++) T.frame(1);
    T.release('KeyE'); T.frame(2);
    ok(Game.stats.parries === pd + 1 && e.stun > 0, 'pressing parry on the drone\'s glint parries the dive and staggers it');

    // a brute shrugs off a light; its slam sends a ground wave that hits you standing and misses you jumping
    p = T.fresh(); e = T.enemy('brute', 2.8, 0, { hp: 999 }); T.face(e.pos.x, e.pos.z);
    T.tap('Mouse0'); T.frame(12);
    ok(e.hp < 999 && e.stun <= 0, `a light hurts a brute without staggering it (${999 - e.hp})`);
    p = T.fresh(); e = T.enemy('brute', 7, 0, { hp: 999 }); e.yaw = yawOf(-1, 0); e.startWind('slamWind');
    for (let i = 0; i < 150 && p.shield === PC.MAX_SHIELD; i++) T.frame(1);
    ok(p.shield < PC.MAX_SHIELD, `a brute's ground wave hits you standing (shield ${p.shield.toFixed(0)})`);
    p = T.fresh(); e = T.enemy('brute', 7, 0, { hp: 999 }); e.yaw = yawOf(-1, 0); e.startWind('slamWind');
    for (let i = 0; i < 150 && e.state !== 'slam'; i++) T.frame(1);
    T.press('Space'); T.frame(20); T.release('Space'); T.frame(50);
    ok(p.shield === PC.MAX_SHIELD && p.hp === PC.MAX_HP && Game.hazards.length === 0, 'jumping clears the ground wave');

    // a shield scrapper blocks from the front, not from behind; a heavy or a parried bash knocks the shield aside
    p = T.fresh(); e = T.enemy('shielder', 2.4, 0, { hp: 999 }); e.yaw = yawOf(-1, 0); T.face(e.pos.x, e.pos.z);
    T.tap('Mouse0'); T.frame(16);
    ok(e.hp === 999, 'a shield scrapper blocks a slash from the front');
    T.frame(30); T.press('Mouse0'); T.frame(14); T.release('Mouse0'); T.frame(16);
    ok(e.guardBrokenT > 0, 'a heavy from the front knocks its shield aside');
    p = T.fresh(); e = T.enemy('shielder', 2.4, 0, { hp: 999 }); e.yaw = yawOf(1, 0); T.face(e.pos.x, e.pos.z);
    T.tap('Mouse0'); T.frame(10);
    ok(e.hp < 999, `a slash from behind gets past the shield (${999 - e.hp})`);
    p = T.fresh(); e = T.enemy('shielder', 2.0, 0, { cd: 0, hp: 999 }); e.yaw = yawOf(-1, 0); T.face(e.pos.x, e.pos.z);
    for (let i = 0; i < 160 && !e.glinted; i++) T.frame(1);
    T.frame(6); T.press('KeyE');
    for (let i = 0; i < 40 && e.guardBrokenT <= 0; i++) T.frame(1);
    T.release('KeyE'); T.frame(2);
    ok(e.guardBrokenT > 0, 'parrying its bash breaks its guard');

    // an armoured crawler ignores slashes until a plunge cracks it
    p = T.fresh(); e = T.enemy('crawler', 2.4, 0, { hp: 999 }); T.face(e.pos.x, e.pos.z);
    T.tap('Mouse0'); T.frame(16);
    ok(e.hp === 999, 'a crawler\'s armour shrugs off a slash');
    p = T.fresh(); e = T.enemy('crawler', 0.3, 0, { hp: 999, frozen: true });
    p.vel.y = 22; p.onGround = false; T.frame(15);
    T.press('KeyC'); T.tap('Mouse0'); T.frame(60); T.release('KeyC');
    ok(e.crackT > 0 && e.hp < 999, `a plunge cracks its armour (${999 - e.hp})`);
    const hpc = e.hp; e.stun = 0; e.pos.x = p.pos.x + 2.2; e.pos.z = p.pos.z; T.face(e.pos.x, e.pos.z); T.frame(20);
    T.tap('Mouse0'); T.frame(16);
    ok(e.hp < hpc, 'slashes land once it is cracked');

    // a sniper on a perch lays its laser and fires; get close and it zips to another perch; zip up and hit it
    p = T.fresh();
    const perch = Arena.perches().filter((q) => { const d = distXZ(q, p.pos); return d > 12 && d < 30; }).find((q) => {
      const c = p.chest(), dx = c.x - q.x, dy = c.y - q.y - 1.42, dz = c.z - q.z, l = Math.hypot(dx, dy, dz);
      return !World.raycast({ x: q.x, y: q.y + 1.42, z: q.z }, { x: dx / l, y: dy / l, z: dz / l }, l - 0.3);
    });
    ok(!!perch, 'a perch near the start has a clear shot at you');
    if (perch) {
      e = new Enemy('sniper', perch, {}); e.spawning = false; e.cd = 0; Game.enemies.push(e);
      let locked = false, shot = null;
      for (let i = 0; i < 300 && !shot; i++) { T.frame(1); locked = locked || e.laser() === 2; shot = Game.projectiles.find((q) => q.kind === 'bolt' && q.col.outer === '#ff3a52'); }
      ok(locked && !!shot, 'a sniper locks its laser and fires');
      Game.projectiles = [];
      p.pos.x = p.prev.x = perch.x + 1.5; p.pos.y = p.prev.y = perch.y; p.pos.z = p.prev.z = perch.z; p.vel.y = 0; Camera.snap(p);
      e.fleeCD = 0; e.setState('perch');
      let zipped = false;
      for (let i = 0; i < 240 && !(zipped && e.state === 'perch'); i++) { T.frame(1); zipped = zipped || e.state === 'zip'; }
      ok(zipped && e.state === 'perch' && dist3(e.pos, perch) > 5, `getting close sends it zipping to another perch (${dist3(e.pos, perch).toFixed(1)} m away)`);
      p = T.fresh(); e.pos = { x: perch.x, y: perch.y, z: perch.z }; e.prev = { ...e.pos }; e.cd = 99; e.fleeCD = 99; e.hp = e.maxHp = 500; Game.enemies.push(e);
      T.frame(3); T.aimAt(e.center());
      T.press('Mouse2'); T.frame(70); T.release('Mouse2');
      ok(e.hp < 500, `you can tether up to a sniper and hit it (${500 - e.hp})`);
    }

    // endless: clearing wave 2 offers three upgrades; Ember Wake makes a dash cut
    Game.toMenu(); UI.act('endless'); S.gameplay.invincible = false;
    T.frame(5); Director.wave = 2; Director.state = 'fight'; Director.queue = []; Game.enemies = [];
    for (let i = 0; i < 120 && Game.state !== 'pick'; i++) T.frame(1);
    ok(Game.state === 'pick' && document.querySelectorAll('#pick-cards .card').length === 3, 'clearing endless wave 2 offers three upgrades');
    if (Game.state === 'pick') { Game.chooseUpgrade(UI.pickIds[0]); }
    ok(Game.state === 'playing' && Game.upgrades.size === 1, 'picking one applies it and the run goes on');
    p = Game.player; Game.upgrades.add('emberWake'); Director.state = 'idle';
    e = T.enemy('scrapper', 3, 0, { hp: 500 }); T.face(e.pos.x, e.pos.z);
    T.press('KeyW'); T.tap('ShiftLeft'); T.frame(20); T.release('KeyW');
    ok(e.hp < 500, `Ember Wake: a dash through a scrapper cuts it (${500 - e.hp})`);
    // elites wear a gold outline
    makeElite(e); T.frame(2);
    ok(Render.models.get(e) && Render.models.get(e).outline.visible, 'an elite wears a gold outline');

    // the demo: six waves until the rival lands, the second bringing shield scrappers
    Game.toMenu(); UI.act('demo'); T.frame(2);
    Director.wave = 1; Director.nextWave();
    ok(Director.demoWaves() === 6 && Director.waveName === 'SHIELD WALL' && Director.queue.includes('shielder'), `demo wave 2 is ${Director.waveName} with shield scrappers, of ${Director.demoWaves()} waves`);
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
    // endless from wave 6, so every enemy type turns up
    UI.act('endless');
    Director.wave = 5;
    S.gameplay.invincible = true;
    T.frame(1); Render.draw(1 / 60);
    const progs0 = Gfx.renderer.info.programs.length;
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'ShiftLeft', 'Mouse0', 'KeyE', 'Mouse2', 'KeyF'];
    const B = World.def.bounds, PM = Camera.PITCH_MAX + 1e-6;
    const inBox = (b) => World.overlap(b.pos.x, b.pos.y + 0.02, b.pos.z, b.r * 0.9, b.h - 0.04);
    let maxEnemies = 0;
    const seen = new Set();
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
      if (Game.state === 'pick') Game.chooseUpgrade(UI.pickIds[0]);
      if (f === Math.floor(frames / 2)) { Game.pause(); if (Game.state !== 'paused') fail('pause failed'); await UI.resumeGame(); if (Game.state !== 'playing') fail('resume failed'); }
      T.frame(1);
      if (f % 3 === 0) Render.draw(1 / 60);
      maxEnemies = Math.max(maxEnemies, Game.enemies.length);
      for (const e of Game.enemies) seen.add(e.type);
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
      for (const o of Game.projectiles.concat(Game.props)) if (!o.dead && ![o.pos.x, o.pos.y, o.pos.z].every(isFinite)) fail(`${o.kind} position not finite at frame ${f}`);
      if (problems.length) break;
    }
    if (Gfx.renderer.info.programs.length !== progs0) fail(`shaders compiled mid-fight: ${progs0} programs before, ${Gfx.renderer.info.programs.length} after`);
    const r = { problems, wave: Director.wave, kills: Game.stats.kills, maxEnemies, types: [...seen].join(' '), style: Game.rank() ? Game.rank().r : '-', time: Game.time.toFixed(1), calls: Gfx.renderer.info.render.calls, progs: Gfx.renderer.info.programs.length };
    Game.toMenu();
    S.visuals.resScale = 1; Render.resize();
    return r;
  }, Math.round(seconds * 60));
  await page.waitForTimeout(300);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  if (keys.some((k) => !k.startsWith('slashyslash3d.'))) errors.push(`storage keys outside slashyslash3d.*: ${keys.join(', ')}`);
  if (!keys.includes('slashyslash3d.settings.v1') || !keys.includes('slashyslash3d.save.v1')) errors.push(`3D saves missing: ${keys.join(', ')}`);
  console.log(`  endless from wave 6: ${res.time}s simulated, wave ${res.wave}, ${res.kills} kills, up to ${res.maxEnemies} enemies (${res.types}), style ${res.style}, ${res.calls} draw calls, ${res.progs} shader programs`);
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
