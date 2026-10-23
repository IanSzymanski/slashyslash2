'use strict';
// Touch controls, the usual layout for a mobile action game: a floating stick under the left thumb (it
// appears wherever that thumb lands), the rest of the screen drags the camera, and a cluster of buttons
// under the right thumb (attack largest, then jump, dash, parry, tether, the sword beam, slide, and the
// ultimate once it's charged). Dragging from a held button turns the camera too, so you can aim while you
// hold attack or the tether. Pause and a first/third person toggle sit top right. The layer covers the whole
// screen, so on phones wider than 16:9 the buttons sit in the bars beside the picture.
// Buttons press virtual keys ("T:<action>") that Input reads like any binding, so holds (heavy attacks,
// zips, the beam's charge, the parry stance) work exactly as they do on a keyboard.
// It turns on by itself on touch screens (Settings > Controls: touch controls auto, on or off), never needs
// the mouse locked, asks for full screen and landscape where the browser allows it, and buzzes on hits
// where the device can.

const TOUCH_BUTTONS = [
  // action, label, class (its place in the cluster)
  ['attack', 'ATK', 'b-attack'], ['jump', 'JUMP', 'b-jump'], ['dash', 'DASH', 'b-dash'], ['sheathe', 'PARRY', 'b-parry'],
  ['tether', 'TETHER', 'b-tether'], ['utility', 'BEAM', 'b-beam'], ['crouch', 'SLIDE', 'b-crouch'], ['ultimate', 'ULT', 'b-ult'],
];
const TOUCH_NAMES = { attack: 'ATTACK', jump: 'JUMP', dash: 'DASH', sheathe: 'PARRY', tether: 'TETHER', utility: 'BEAM', crouch: 'SLIDE', ultimate: 'ULT', pause: 'the pause button', forward: 'stick up', back: 'stick back', left: 'stick left', right: 'stick right' };

const Touch = {
  el: null, seen: false, coarse: false, stick: null, look: null, held: new Map(), btn: {}, lastShown: null,
  init() {
    this.coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    // a touch anywhere marks this as a touch device for 'auto'; a mouse or a key press marks it as not
    window.addEventListener('touchstart', () => { if (!this.seen) { this.seen = true; this.changed(); } }, { passive: true, capture: true });
    window.addEventListener('mousemove', (e) => { if (this.seen && !this.coarse && Math.abs(e.movementX) + Math.abs(e.movementY) > 0 && !e.sourceCapabilities?.firesTouchEvents) { this.seen = false; this.changed(); } });
    const el = (this.el = document.createElement('div'));
    el.id = 'touch'; el.hidden = true;
    el.innerHTML = `<div class="t-stick"><div class="t-base"></div><div class="t-knob"></div></div>
      ${TOUCH_BUTTONS.map(([a, l, c]) => `<button type="button" class="t-btn ${c}" data-a="${a}" aria-label="${TOUCH_NAMES[a]}"><span>${l}</span></button>`).join('')}
      <button type="button" class="t-top t-pause" data-a="pause" aria-label="Pause"><span>II</span></button>
      <button type="button" class="t-top t-view" data-a="view" aria-label="First or third person"><span>1P</span></button>`;
    document.body.appendChild(el);
    for (const b of el.querySelectorAll('[data-a]')) this.btn[b.dataset.a] = b;
    this.stickEl = el.querySelector('.t-stick'); this.knob = el.querySelector('.t-knob');
    const opt = { passive: false };
    el.addEventListener('touchstart', (e) => this.start(e), opt);
    el.addEventListener('touchmove', (e) => this.move(e), opt);
    el.addEventListener('touchend', (e) => this.end(e), opt);
    el.addEventListener('touchcancel', (e) => this.end(e), opt);
    // a touch screen's mouse emulation must never press anything in the game
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    const rot = (this.rotEl = document.createElement('div'));
    rot.id = 'rotate'; rot.hidden = true;
    rot.innerHTML = '<div><b>Turn your device sideways</b><p>SlashySlash plays in landscape.</p></div>';
    document.body.appendChild(rot);
    window.addEventListener('resize', () => this.changed());
    if (window.matchMedia) window.matchMedia('(orientation: portrait)').addEventListener?.('change', () => this.changed());
    this.changed();
  },
  // whether touch controls are in use
  on() {
    const m = (S.controls && S.controls.touch) || 'auto';
    return m === 'on' || (m === 'auto' && (this.coarse || this.seen));
  },
  label(a) { return TOUCH_NAMES[a] || actionLabel(a); },
  portrait() { return window.innerHeight > window.innerWidth * 1.05; },
  changed() {
    document.body.classList.toggle('touch', this.on());
    if (typeof Render !== 'undefined' && Render.hud) Render.resize();
    const need = document.getElementById('need');
    if (need) need.textContent = this.on() ? 'Touch controls: the left thumb moves, the right thumb looks and fights. Best in landscape, full screen.' : 'Keyboard and mouse. Starting a mode locks the mouse; Esc releases it and pauses.';
  },

  // ---------- touches ----------
  start(e) {
    e.preventDefault();
    if (typeof Sound !== 'undefined') Sound.init();
    for (const t of e.changedTouches) {
      const b = t.target.closest && t.target.closest('[data-a]');
      if (b) { this.pressBtn(t, b.dataset.a); continue; }
      // left part of the screen: the stick appears under the thumb; the rest: camera look
      if (t.clientX < window.innerWidth * 0.42 && !this.stick) {
        this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: 0, y: 0 };
        this.stickEl.classList.add('on');
        this.stickEl.style.left = t.clientX + 'px'; this.stickEl.style.top = t.clientY + 'px';
        this.setKnob(0, 0);
      } else if (!this.look) this.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  },
  move(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const S0 = this.stick;
      if (S0 && t.identifier === S0.id) {
        const R = this.radius(), dx = t.clientX - S0.x0, dy = t.clientY - S0.y0, l = Math.hypot(dx, dy);
        // past the rim the base follows the thumb, so the stick never runs out of travel
        if (l > R * 1.25) { const k = (l - R * 1.25) / l; S0.x0 += dx * k; S0.y0 += dy * k; this.stickEl.style.left = S0.x0 + 'px'; this.stickEl.style.top = S0.y0 + 'px'; }
        const ex = t.clientX - S0.x0, ey = t.clientY - S0.y0, el = Math.hypot(ex, ey), m = Math.min(1, el / R);
        // a dead zone at the middle; past it, the push ramps to a full run at 85% of the way out
        const amt = m < 0.12 ? 0 : Math.min(1, (m - 0.12) / 0.73);
        S0.x = el > 0 ? (ex / el) * amt : 0; S0.y = el > 0 ? (-ey / el) * amt : 0;
        this.setKnob(el > R ? (ex / el) * R : ex, el > R ? (ey / el) * R : ey);
        continue;
      }
      const L = this.look && t.identifier === this.look.id ? this.look : this.held.get(t.identifier);
      if (L && L.look !== false) {
        const dx = t.clientX - L.x, dy = t.clientY - L.y;
        // a held button only starts turning the camera once the thumb has clearly moved
        if (L.btn && !L.dragging && Math.hypot(t.clientX - L.sx, t.clientY - L.sy) < 12) continue;
        if (L.btn) L.dragging = true;
        L.x = t.clientX; L.y = t.clientY;
        this.addLook(dx, dy);
      }
    }
  },
  end(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.stickEl.classList.remove('on'); this.stickEl.style.left = this.stickEl.style.top = ''; this.setKnob(0, 0); continue; }
      if (this.look && t.identifier === this.look.id) { this.look = null; continue; }
      const H = this.held.get(t.identifier);
      if (H) { this.held.delete(t.identifier); this.releaseBtn(H.a); }
    }
  },
  pressBtn(t, a) {
    if (a === 'pause') { if (Game.state === 'playing') Game.pause(); return; }
    if (a === 'view') {
      // first person and back again
      S.camera.distance = S.camera.distance > 0.5 ? 0 : (this.lastDist || DEFAULT_SETTINGS.camera.distance);
      if (S.camera.distance === 0) this.lastDist = this.lastDist || DEFAULT_SETTINGS.camera.distance;
      saveSettings();
      return;
    }
    this.held.set(t.identifier, { a, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, btn: true, dragging: false });
    this.btn[a].classList.add('down');
    Input.pressCode('T:' + a);
    this.buzz(6);
  },
  releaseBtn(a) {
    // another finger may still be on it
    for (const H of this.held.values()) if (H.a === a) return;
    this.btn[a].classList.remove('down');
    Input.releaseCode('T:' + a);
  },
  // lets go of everything (a pause, a panel opening, the page hidden)
  clear() {
    for (const H of this.held.values()) { this.btn[H.a].classList.remove('down'); Input.releaseCode('T:' + H.a); }
    this.held.clear(); this.stick = null; this.look = null;
    if (this.stickEl) { this.stickEl.classList.remove('on'); this.stickEl.style.left = this.stickEl.style.top = ''; this.setKnob(0, 0); }
  },
  radius() { return Math.min(window.innerWidth, window.innerHeight) * 0.13 * (S.controls.touchSize || 1); },
  setKnob(x, y) { this.knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`; },
  // a drag across the screen turns the camera about as far as a mouse moving the same number of pixels on a
  // 1080p screen would, scaled for this screen and by the touch look setting
  addLook(dx, dy) {
    const k = 1.7 * (1080 / Math.max(320, Math.min(window.innerWidth, window.innerHeight * 16 / 9))) * (S.controls.touchLook || 1);
    Input.lookDX += dx * k; Input.lookDY += dy * k;
  },
  // the analog stick for player.intent(): x right, y forward, each -1..1, or null when it isn't held
  axis() { return this.stick && (this.stick.x || this.stick.y) ? this.stick : null; },
  buzz(ms) { if (S.controls.vibrate !== false && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* not allowed */ } },

  // full screen and landscape on the tap that starts a mode, where the browser allows it
  enterPlay() {
    if (!this.on()) return;
    const d = document.documentElement;
    try {
      if (!document.fullscreenElement && d.requestFullscreen && S.controls.fullscreen !== false) {
        d.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
      }
    } catch (e) { /* not allowed in a frame, say */ }
  },

  // each frame: show the layer while playing, and keep the buttons' states current
  sync() {
    if (!this.el) return;
    // in a cutscene only the parry button stays, to hold for a skip
    const show = this.on() && Game.state === 'playing', cine = show && Game.cineActive();
    if (show !== this.lastShown) { this.el.hidden = !show; this.lastShown = show; if (!show) this.clear(); }
    if (cine !== this.lastCine) { this.el.classList.toggle('cine', cine); this.lastCine = cine; this.stick = null; this.stickEl.classList.remove('on'); }
    const rot = this.on() && this.portrait();
    if (this.rotEl.hidden === rot) this.rotEl.hidden = !rot;
    if (rot && Game.state === 'playing') Game.pause();
    if (!show) return;
    const p = Game.player;
    if (!p) return;
    this.el.style.setProperty('--t-size', S.controls.touchSize || 1);
    this.el.style.setProperty('--t-alpha', S.controls.touchOpacity == null ? 0.6 : S.controls.touchOpacity);
    const U = p.utility(), cd = U && p.utilCD > 0 ? 1 - p.utilCD / U.cooldown : 1;
    this.btn.utility.style.setProperty('--cd', p.charging ? p.charging.k : cd);
    this.btn.utility.classList.toggle('cooling', !p.charging && cd < 1);
    this.btn.utility.classList.toggle('full', !!(p.charging && p.charging.k >= 1));
    this.btn.sheathe.classList.toggle('cooling', p.parryCD > 0 || (p.shield < PC.PARRY_COST && !S.gameplay.invincible));
    this.btn.dash.classList.toggle('cooling', p.dashCharges <= 0);
    this.btn.ultimate.hidden = !(p.ultCharge >= 1 || p.ult);
    this.btn.view.firstElementChild.textContent = S.camera.distance > 0.5 ? '1P' : '3P';
  },
};
