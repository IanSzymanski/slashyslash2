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
  lockRequired: false, pointerLocked: false, lookDX: 0, lookDY: 0, onLockChange: null,

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
      if (this.pointerLocked) { this.lookDX += e.movementX || 0; this.lookDY += e.movementY || 0; }
      else updatePos(e);
    });
    this.lockRequired = typeof canvas.requestPointerLock === 'function';
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      if (!this.pointerLocked) this.lookDX = this.lookDY = 0;
      if (was !== this.pointerLocked && this.onLockChange) this.onLockChange(this.pointerLocked);
    });
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

  // Resolves true once the pointer is locked. Needs a click or key press, and Chrome refuses a
  // re-lock for about a second after Esc, so callers must handle false.
  requestLock() {
    if (!this.lockRequired || this.pointerLocked) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false, timer = 0;
      const finish = (ok) => {
        if (done) return;
        done = true; clearTimeout(timer);
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onError);
        resolve(ok);
      };
      const onChange = () => { if (document.pointerLockElement === this.canvas) finish(true); };
      const onError = () => finish(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onError);
      timer = setTimeout(() => finish(false), 1500);
      try {
        const r = this.canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => finish(false));
      } catch (e) { finish(false); }
    });
  },
  releaseLock() { if (this.canvas && document.pointerLockElement === this.canvas) document.exitPointerLock(); },
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
