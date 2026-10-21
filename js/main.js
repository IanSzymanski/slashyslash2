'use strict';
// Boot and the main loop. Mouse look is applied once per rendered frame in real time; the simulation
// runs in core.js at a fixed 120 Hz.

(function boot() {
  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    Game.realTime += realDt;
    if (Input.wasPressed('pause')) {
      const open = UI.openPanel();
      if (Game.state === 'playing') Game.pause();
      else if (open === 'settings' || open === 'howto') UI.act('back');
      // Esc can't resume: browsers don't let it lock the pointer
      else if (Game.state === 'paused' && !Input.pressed.has('Escape')) UI.resumeGame();
      Input.consume();
    }
    const look = Input.takeLook();
    // a bug in one frame is logged, not allowed to stop the loop
    try {
      if (Game.state === 'playing') {
        if (!Game.cineActive()) Camera.look(look.x, look.y);
        Game.step(realDt);
        Camera.follow(Game.player, realDt);
        Camera.update(realDt);
      } else if (Game.state === 'menu') {
        Camera.orbit(Arena.center(), Game.realTime);
        Camera.update(realDt, 9);
        Input.consume();
      } else {
        if (Game.player) Camera.update(realDt);
        Input.consume();
      }
    } catch (err) { console.error(err); Input.consume(); }
    try { Render.draw(realDt); } catch (err) { console.error(err); }
    requestAnimationFrame(frame);
  }
  function start() {
    const gl = document.getElementById('gl'), hud = document.getElementById('hud');
    try { Render.init(gl, hud); } catch (err) {
      console.warn(err);
      document.getElementById('nogl').hidden = false;
      return;
    }
    World.build(TEST_ROOM);
    Gfx.buildLevel(TEST_ROOM);
    Input.init(gl);
    Input.gameKeysActive = () => Game.state === 'playing';
    // Esc never reaches the page while the pointer is locked, so losing the lock is what pauses
    Input.onLockChange = (locked) => { if (!locked && Game.state === 'playing') Game.pause(); };
    UI.init();
    UI.applyVisualToggles();
    Game.toMenu();
    window.addEventListener('blur', () => { Sound.setFocus(false); Game.pause(); });
    window.addEventListener('focus', () => Sound.setFocus(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) Game.pause(); });
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape' || Input.codes('pause').includes('Escape')) return;
      const open = UI.openPanel();
      if (open === 'settings' || open === 'howto') UI.act('back');
    });
    // clicking the scene beside the pause panel resumes, which also retries a refused lock
    gl.addEventListener('mousedown', () => { if (Game.state === 'paused' && UI.openPanel() === UI.pausePanel()) UI.resumeGame(); });
    const wake = () => { Sound.init(); Sound.startMusic(); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
