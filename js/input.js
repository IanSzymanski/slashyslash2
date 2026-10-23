'use strict';
// Keyboard + mouse state with rebindable actions, plus pointer lock for mouse look. Codes are KeyboardEvent.code or "Mouse<n>".

const Input = {
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
  mx: VIEW_W / 2,
  my: VIEW_H / 2,
  onCanvas: false,
  captureCb: null,
  canvas: null,
  gameKeysActive: () => false,
  // cutscenes lock every game action except pause
  locked: false,
  // mouse look: deltas pile up while the pointer is locked and main.js takes them once per rendered frame
  lockRequired: false, pointerLocked: false, lockPending: false, lookDX: 0, lookDY: 0, onLockChange: null,
  // rawMovement: false once raw input was refused, so later locks skip asking; recent: average event size
  rawMovement: null, recentX: 0, recentY: 0,
  // scroll wheel notches (positive away from you), taken once per rendered frame
  wheel: 0,

  init(canvas) {
    this.canvas = canvas;
    const press = (code) => {
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    };
    const release = (code) => {
      if (this.down.has(code)) this.released.add(code);
      this.down.delete(code);
    };
    window.addEventListener('keydown', (e) => {
      if (this.captureCb) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const cb = this.captureCb; this.captureCb = null;
        cb(e.code === 'Backspace' || e.code === 'Delete' ? '' : e.code);
        return;
      }
      if (e.repeat) { if (this.gameKeysActive() && this.isGameCode(e.code)) e.preventDefault(); return; }
      press(e.code);
      if (this.gameKeysActive() && this.isGameCode(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => release(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });

    const updatePos = (e) => {
      const r = canvas.getBoundingClientRect();
      this.mx = ((e.clientX - r.left) / r.width) * VIEW_W;
      this.my = ((e.clientY - r.top) / r.height) * VIEW_H;
    };
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) this.addLook(e.movementX || 0, e.movementY || 0);
      else updatePos(e);
    });
    this.lockRequired = typeof canvas.requestPointerLock === 'function';
    document.addEventListener('pointerlockchange', () => this.syncLock());
    canvas.addEventListener('mouseenter', () => (this.onCanvas = true));
    canvas.addEventListener('mouseleave', () => (this.onCanvas = false));
    window.addEventListener('mousedown', (e) => {
      if (this.captureCb) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const cb = this.captureCb; this.captureCb = null;
        cb('Mouse' + e.button);
        return;
      }
      if (e.target !== canvas) return;
      if (!this.pointerLocked) updatePos(e);
      press('Mouse' + e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => release('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // the wheel zooms the camera while playing; a trackpad's small deltas add up to notches
    window.addEventListener('wheel', (e) => {
      if (!this.gameKeysActive() || (e.target !== canvas && !this.pointerLocked)) return;
      e.preventDefault();
      this.wheel += clamp(e.deltaY / (e.deltaMode === 1 ? 3 : 100), -3, 3);
    }, { passive: false });
    window.addEventListener('contextmenu', (e) => { if (this.captureCb || this.gameKeysActive()) e.preventDefault(); });
  },

  isGameCode(code) {
    const b = S.controls.bindings;
    for (const k in b) if (b[k].includes(code)) return true;
    return code === 'Space' || code.startsWith('Arrow');
  },
  codes(action) { return S.controls.bindings[action] || []; },
  blocked(action) { return this.locked && action !== 'pause'; },
  isDown(action) { if (this.blocked(action)) return false; for (const c of this.codes(action)) if (c && this.down.has(c)) return true; return false; },
  wasPressed(action) { if (this.blocked(action)) return false; for (const c of this.codes(action)) if (c && this.pressed.has(c)) return true; return false; },
  wasReleased(action) { if (this.blocked(action)) return false; for (const c of this.codes(action)) if (c && this.released.has(c)) return true; return false; },
  consume() { this.pressed.clear(); this.released.clear(); },
  clear() {
    for (const c of this.down) this.released.add(c);
    this.down.clear();
  },
  capture(cb) { this.captureCb = cb; },

  // Without raw input, Chrome can report the hidden cursor being recentred as one huge movement, which
  // snaps the camera after the same amount of turning each time. A lone event far beyond recent ones is dropped.
  addLook(dx, dy) {
    const big = Math.max(250, window.innerWidth * 0.3);
    if (Math.abs(dx) > big && Math.abs(dx) > this.recentX * 6) dx = 0;
    if (Math.abs(dy) > big && Math.abs(dy) > this.recentY * 6) dy = 0;
    this.recentX = this.recentX * 0.8 + Math.abs(dx) * 0.2;
    this.recentY = this.recentY * 0.8 + Math.abs(dy) * 0.2;
    this.lookDX += dx; this.lookDY += dy;
  },
  // Resolves true once the pointer is locked. Needs a click or key press, and Chrome refuses a
  // re-lock for about a second after Esc, so callers must handle false. Asks for raw input first and
  // falls back to a plain lock where it isn't supported.
  requestLock() {
    this.syncLock(true);
    if (!this.lockRequired || this.pointerLocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false, timer = 0;
      this.lockPending = true;
      const finish = (ok) => {
        if (done) return;
        done = true; clearTimeout(timer); this.lockPending = false;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(ok);
      };
      // browsers that return a promise report failures through it, so the error event only counts without one
      let promised = false;
      const onChange = () => { if (document.pointerLockElement === this.canvas) finish(true); };
      const onError = () => { if (!promised) finish(false); };
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      timer = setTimeout(() => finish(false), 1500);
      const attempt = (raw) => {
        let r;
        try { r = raw ? this.canvas.requestPointerLock({ unadjustedMovement: true }) : this.canvas.requestPointerLock(); }
        catch (e) { if (raw) { this.rawMovement = false; attempt(false); } else finish(false); return; }
        if (r && typeof r.then === 'function') {
          promised = true;
          r.then(null, (e) => {
            if (raw && e && e.name === 'NotSupportedError') { this.rawMovement = false; attempt(false); } else finish(false);
          });
        } else if (raw) this.rawMovement = false;
      };
      attempt(this.rawMovement !== false);
    });
  },
  releaseLock() { if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock(); },
  // The lock as the browser has it, checked every frame as well as on its events: a browser or system hotkey
  // can take the lock without the event reaching the page, which used to leave the game thinking it still
  // had the mouse (cursor showing, clicks never asking for the lock again).
  // quiet: bring the flag up to date without the change callback (a lock request is about to settle it anyway)
  syncLock(quiet = false) {
    const locked = !!this.canvas && document.pointerLockElement === this.canvas;
    if (locked === this.pointerLocked) return;
    this.pointerLocked = locked;
    if (!locked) this.lookDX = this.lookDY = 0;
    if (!quiet && this.onLockChange) this.onLockChange(locked);
  },
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; },
  takeLook() {
    const d = { x: this.lookDX, y: this.lookDY };
    this.lookDX = this.lookDY = 0;
    return d;
  },
};

function codeLabel(code) {
  if (!code) return '—';
  if (code === 'Mouse0') return 'LMB';
  if (code === 'Mouse1') return 'MMB';
  if (code === 'Mouse2') return 'RMB';
  if (code.startsWith('Mouse')) return 'M' + code.slice(5);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[code];
  const map = { ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt', Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', CapsLock: 'Caps' };
  return map[code] || code;
}
// Primary binding in a form the 3x5 HUD font can draw.
function hudKey(action) {
  const c = (S.controls.bindings[action] || [])[0];
  if (!c) return '-';
  const arrows = { ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN' };
  return (arrows[c] || codeLabel(c)).toUpperCase();
}
function actionLabel(action) {
  const b = S.controls.bindings[action] || [];
  return b.filter(Boolean).map(codeLabel).join(' / ') || '—';
}
