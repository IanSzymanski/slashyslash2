'use strict';
// Boot and the main loop. Mouse look is applied once per rendered frame in real time; the simulation
// runs in core.js at a fixed 120 Hz.

(function boot() {
  let last = performance.now(), unlockedT = 0;
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
    // the lock as the browser has it; playing without it for more than a moment (a hotkey took it, say) pauses,
    // so the resume panel is there to take it back
    Input.syncLock();
    unlockedT = Game.state === 'playing' && Input.lockRequired && !Touch.on() && !Input.pointerLocked && !Input.lockPending ? unlockedT + realDt : 0;
    if (unlockedT > 0.35) { unlockedT = 0; Game.pause(); }
    const look = Input.takeLook();
    // a bug in one frame is logged, not allowed to stop the loop
    try {
      const wheel = Input.takeWheel();
      if (Game.state === 'playing') {
        if (!Game.cineActive()) { Camera.look(look.x, look.y); Camera.zoom(wheel); }
        Game.step(realDt);
        Render.interp();
        const p = Game.player, C = Game.cine;
        if (C && C.shot && !C.closing) Camera.update(realDt, Camera.cine(C, realDt), 0);
        else {
          if (Camera.cineView) Camera.endCine(p, C && C.focus);
          Camera.follow(p, realDt);
          // a bigger character is framed from further back (AEGIS-07 stands 2.4 m); the camera pulls back while the sawblade runs
          const camD = (p.ult ? Math.max(S.camera.distance, 7.5) : S.camera.distance) * (p.camScale || 1);
          Camera.update(realDt, camD, p.dashT > 0 || p.iaido ? 8 : 5 * clamp((Controller.hspeed(p) - p.M.RUN) / (p.M.SPRINT - p.M.RUN), 0, 1));
        }
      } else if (Game.state === 'menu') {
        // the title screen: a slow orbit framed for the arena
        const O = World.def.orbit;
        Camera.orbit(Arena.center(), Game.realTime, O.pitch, O.lift);
        Camera.update(realDt, O.dist);
        Input.consume();
      } else {
        if (Game.player) { Render.interp(); Camera.update(realDt); }
        Input.consume();
      }
    } catch (err) { console.error(err); Input.consume(); }
    try { Render.draw(realDt); } catch (err) { console.error(err); }
    Touch.sync();
    requestAnimationFrame(frame);
  }
  function start() {
    const gl = document.getElementById('gl'), hud = document.getElementById('hud');
    try { Render.init(gl, hud); } catch (err) {
      console.warn(err);
      document.getElementById('nogl').hidden = false;
      return;
    }
    Arena.load('crossroads');
    Render.prewarm();
    Input.init(gl);
    Touch.init();
    Input.gameKeysActive = () => Game.state === 'playing';
    // Esc never reaches the page while the pointer is locked, so losing the lock is what pauses; a lock that turns
    // up while a panel is open (and nothing asked for it) is handed back, so the panel keeps its cursor
    Input.onLockChange = (locked) => {
      if (!locked && Game.state === 'playing' && !Touch.on()) Game.pause();
      else if (locked && Game.state !== 'playing' && !Input.lockPending) Input.releaseLock();
    };
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
    // clicking the scene beside the pause panel resumes (which also retries a refused lock);
    // clicking it mid-run without the lock, after an upgrade pick say, takes the lock back
    gl.addEventListener('mousedown', () => {
      if (Game.state === 'paused' && UI.openPanel() === UI.pausePanel()) UI.resumeGame();
      else if (Game.state === 'playing' && Input.lockRequired && !Touch.on() && !Input.pointerLocked) Input.requestLock();
    });
    const wake = () => { Sound.init(); Sound.startMusic(); };
    document.addEventListener('pointerdown', wake, { once: true });
    document.addEventListener('keydown', wake, { once: true });
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
