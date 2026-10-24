'use strict';
// DOM overlays: main menu, pause, results, how-to-play and the settings panel. Runs need the pointer locked.

const UI = {
  tab: 'enemies',
  returnTo: 'menu',

  init() {
    this.root = document.getElementById('ui');
    this.panels = {};
    for (const el of this.root.querySelectorAll('.overlay')) this.panels[el.id] = el;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      Sound.init();
      Sound.play('ui');
      this.act(b.dataset.act, b);
    });
    this.root.addEventListener('mouseover', (e) => {
      const b = e.target.closest('button');
      if (b && b !== this._hover) { this._hover = b; Sound.play('uiHover'); }
    });
    for (const b of document.querySelectorAll('#settings .tabs button')) {
      b.addEventListener('click', () => { this.tab = b.dataset.tab; this.renderSettings(); });
    }
    try { const t = safeStorageGet('slashyslash3d.tab'); if (t && SETTINGS_SCHEMA[t]) this.tab = t; } catch (e) { /* ignore */ }
    this.refreshBest();
    this.refreshChar();
    window.addEventListener('keydown', (e) => {
      if (Game.state !== 'pick' || !this.pickIds) return;
      const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code) % 3;
      if (i >= 0 && this.pickIds[i]) { e.preventDefault(); Sound.play('ui'); Game.chooseUpgrade(this.pickIds[i]); }
    });
  },
  show(id) {
    if (!id && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    // any panel needs the cursor back (results, upgrade picks, pause)
    if (id) Input.releaseLock();
    for (const k in this.panels) this.panels[k].hidden = k !== id;
    document.body.classList.toggle('in-menu', !!id);
    if (id === 'howto') this.renderHowTo();
    if (id === 'settings') this.renderSettings();
    if (id === 'train') Training.render();
    const first = id && this.panels[id].querySelector('button');
    if (first) first.focus({ preventScroll: true });
  },
  hideAll() { this.show(null); },
  pausePanel() { return Game.mode === 'training' ? 'train' : 'pause'; },
  openPanel() { return Object.keys(this.panels).find((k) => !this.panels[k].hidden) || null; },
  // A run starts on the click that asked for it, since locking the pointer needs one. If the browser
  // refuses (it does for about a second after Esc), the run waits paused with a hint.
  startRun(mode) {
    Touch.enterPlay();
    Game.newRun(mode);
    return Input.requestLock().then((ok) => { if (!ok) { Game.pause(); this.lockHint(true); } });
  },
  resumeGame() {
    return Input.requestLock().then((ok) => { if (ok) { this.lockHint(false); Game.resume(); } else this.lockHint(true); });
  },
  lockHint(on) { const el = document.getElementById('lock-hint'); if (el) el.hidden = !on; },
  act(a, el) {
    switch (a) {
      case 'char': SaveData.character = SaveData.character === 'aegis' ? 'ronin' : 'aegis'; saveProgress(); this.refreshChar(); break;
      case 'demo': this.startRun('demo'); break;
      case 'endless': this.startRun('endless'); break;
      case 'boss': this.startRun('boss'); break;
      case 'duel': this.startRun('duel'); break;
      case 'training': this.startRun('training'); break;
      case 'test': this.startRun('test'); break;
      case 'street': this.startRun('street'); break;
      case 'pick': Game.chooseUpgrade(el.dataset.id); break;
      case 'resume': this.resumeGame(); break;
      case 'restart': this.startRun(Game.mode); break;
      case 'continue-endless': this.startRun('endless'); break;
      case 'quit': Game.toMenu(); break;
      case 'settings': this.returnTo = Game.state === 'menu' ? 'menu' : Game.state === 'over' ? 'over' : this.pausePanel(); this.show('settings'); break;
      case 'howto': this.returnTo = Game.state === 'menu' ? 'menu' : this.pausePanel(); this.show('howto'); break;
      case 'back': this.show(this.returnTo); break;
      default:
        if (a.startsWith('train-')) Training.act(a, el);
        break;
      case 'reset-tab':
        if (this.tab === 'enemies') { resetSettings('enemies'); resetSettings('gameplay'); }
        else resetSettings(this.tab === 'audio' ? 'audio' : this.tab);
        Sound.applyVolumes(); Render.resize(); this.applyVisualToggles();
        this.renderSettings();
        break;
    }
  },
  // the character picker on the title screen
  refreshChar() {
    const a = SaveData.character === 'aegis', b = document.getElementById('btn-char');
    if (!b) return;
    b.classList.toggle('aegis', a);
    document.getElementById('char-name').textContent = a ? 'AEGIS-07' : 'RONIN';
    document.getElementById('char-sub').textContent = a ? 'gun and beam, or blade and block' : 'katana, parry and counter';
  },
  refreshBest() {
    const el = document.getElementById('best');
    if (el) el.textContent = `Best endless: wave ${SaveData.bestWave} · ${SaveData.bestScore.toLocaleString()} pts${SaveData.demoCleared ? ' · Demo cleared' : ''}${SaveData.unlocks.aegis ? ' · AEGIS-07 beaten' : ''}`;
  },
  applyVisualToggles() {
    document.getElementById('scanlines').hidden = !S.visuals.scanlines;
  },

  // ---------- endless upgrade pick ----------
  showPick(ids) {
    this.pickIds = ids;
    document.getElementById('pick-cards').innerHTML = ids.map((id, i) => {
      const u = UPGRADES[id];
      return `<button type="button" class="card" data-act="pick" data-id="${id}"><span class="key">${i + 1}</span><b>${u.name}</b><small>${u.desc}</small></button>`;
    }).join('');
    this.show('pick');
  },

  // ---------- results ----------
  showOver(victory) {
    const st = Game.stats;
    const boss = Game.mode === 'boss', duel = Game.mode === 'duel';
    document.getElementById('over-title').textContent = victory ? (duel ? 'Duel won' : boss ? 'Rival defeated' : 'Demo complete') : 'Signal lost';
    let sub;
    if (victory && duel) sub = 'You beat AEGIS-07 blade to blade. Practice only: the full Rival Fight is the one that counts.';
    else if (victory && !boss && !Director.rivalBuilt()) sub = 'All six demo waves cleared. AEGIS-07 joins the demo as its last wave in a later build.';
    else if (victory) sub = boss ? 'AEGIS-07 is down.' : 'All demo waves cleared, rival included.';
    else if (duel) sub = 'AEGIS-07 won the duel. Parry a swing, let it parry your counter, then parry its gold riposte.';
    else if (boss) sub = 'AEGIS-07 holds the street. Tether its pulse grenade and kick it back to break the shield.';
    else if (Game.mode === 'endless') sub = `You held the street until wave ${Director.wave}.`;
    else sub = Director.wave === 0 ? 'Down before the first wave.' : `Down on wave ${Director.wave} of ${Director.demoWaves()}.`;
    document.getElementById('over-sub').textContent = sub;
    const mm = Math.floor(st.time / 60), ss = Math.floor(st.time % 60).toString().padStart(2, '0');
    const rows = [
      ['Wave', Director.wave], ['Kills', st.kills], ['Score', st.score.toLocaleString()],
      ['Best combo', st.maxCombo], ['Parries', st.parries], ['Time', `${mm}:${ss}`],
    ];
    document.getElementById('over-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    document.getElementById('over-continue').hidden = !victory || duel;
    this.refreshBest();
    this.show('over');
  },

  // ---------- how to play ----------
  renderHowTo() {
    // on a touch screen, the buttons' names stand in for the keys
    const touch = Touch.on(), actionLabel = (a) => (touch ? Touch.label(a) : window.actionLabel(a));
    const rows = [
      touch ? ['Look (drag anywhere on the right; a held button drags too)', 'Right thumb'] : ['Look (click the game to lock the mouse)', 'Mouse'],
      touch ? ['Switch first and third person', '1P / 3P button'] : ['Zoom the camera; all the way in is first person', 'Mouse wheel'],
      touch ? ['Move: the stick appears under your thumb; push further to run', 'Left thumb'] : ['Move (relative to the camera); keep running and it builds to a sprint', `${actionLabel('forward')} · ${actionLabel('left')} · ${actionLabel('back')} · ${actionLabel('right')}`],
      ['Skid turn: reverse at speed to plant a hand and push off', `${actionLabel('back')} while sprinting`],
      ['Vault over cars and anything chest-high', 'Run into it'],
      ['Climb a ledge you can reach (a container from the street)', 'Walk or jump into it'],
      ['Jump / double jump', actionLabel('jump')],
      ['Wall cling: holds while a move key is held, then slides; let go to drop; jump to kick off', `Jump into a wall, ${actionLabel('jump')}`],
      ['Crouch · slide while running', actionLabel('crouch')],
      ['Bullet jump (toward the crosshair)', `${actionLabel('crouch')} + ${actionLabel('jump')}`],
    ];
    const ronin = [
      ['Dash (2 charges, invulnerable)', `${actionLabel('dash')} + direction`],
      ['Dash slash (hold for a heavy one)', `${actionLabel('attack')} during a dash`],
      ['Slash string (toward the crosshair, up or down too)', `Tap ${actionLabel('attack')}`],
      ['Heavy attack, on the ground (mix into strings: L H L, L L H)', `Hold ${actionLabel('attack')}`],
      ['Ground cut (hold: rock eruption launcher)', `${actionLabel('attack')} while sliding`],
      ['Plunge + shockwave (in the air)', `Hold ${actionLabel('attack')}`],
      ['Cut down street lamps; slashes and blasts drop them', actionLabel('attack')],
      ['Parry stance (15 shield, refunded on parry)', actionLabel('sheathe')],
      ['Counter after a parry', `Release ${actionLabel('sheathe')}`],
      ['Sword beam: tap for a quick blade, hold for a massive wave; both fly at the crosshair, and a hit breaks the charge', actionLabel('utility')],
      ['Tether: tap fling, hold zip (at a ledge\'s edge or the crane: up onto it)', actionLabel('tether')],
      ['Grab, swing and throw barrels', `Hold ${actionLabel('tether')}, release`],
      ['Rebound a pulse grenade: reel in, kick it back', `${actionLabel('tether')} on it, aim`],
      ['Sawblade ultimate (when charged)', `Hold ${actionLabel('ultimate')} 1s`],
    ];
    // AEGIS-07 as the player: two modes on F, the gun and beam or the blade and block. Its touch buttons are
    // named for what they do in each mode.
    const aL = (a, mode) => (!touch ? actionLabel(a) : a === 'utility' ? 'MODE' : a === 'sheathe' ? (mode === 'gun' ? 'BEAM' : 'BLOCK') : actionLabel(a));
    const aegis = [
      ['Switch weapon mode, gunner or melee (letting go, dashing, attacking or a hit cancels it)', `Hold ${aL('utility')} 1s`],
      ['Gunner: machine gun, single-target rounds from a 40-round magazine', `Hold ${actionLabel('attack')}`],
      touch ? ['Gunner: reloads itself when the magazine runs dry', 'Automatic'] : ['Gunner: reload (it also reloads itself when empty)', actionLabel('reload')],
      ['Gunner: beam (20 shield, drains while held); pierces everything on its line; you stand still, or hover drifting side to side as it pushes you back', `Hold ${aL('sheathe', 'gun')}`],
      ['Melee: two lunging swipes and a thrust (toward the crosshair)', `Tap ${actionLabel('attack')}`],
      ['Melee: overhead cleave that throws a ring across the ground', `Hold ${actionLabel('attack')}`],
      ['Melee: slide attack, a low sweep that launches', `${actionLabel('attack')} while sliding`],
      ['Melee: jet plunge (in the air)', `Hold ${actionLabel('attack')}`],
      ['Melee: block on the blade (15 shield, refunded on a block)', aL('sheathe', 'blade')],
      ['Melee: pulse burst after a block; hold to draw the arm back for more', `Release ${aL('sheathe', 'blade')}`],
      ['Jet dash (2 charges, invulnerable); in melee, attack out of it for a boosted thrust', `${actionLabel('dash')} + direction`],
      ['Hover on the jets: keep jump held in the air, off a jump or a double jump (2.6 s per airtime; let go or crouch to drop)', `Hold ${actionLabel('jump')}`],
      ['Tether: tap fling, hold zip; grab barrels; reel in and kick grenades', actionLabel('tether')],
      ['Orbital strike (charged by kills): hold to aim in slow motion, then press it again or attack to fire', `Hold ${actionLabel('ultimate')}, then ${actionLabel('ultimate')} or ${actionLabel('attack')}`],
    ];
    const rival = [
      ['AEGIS-07 shielded: slash its bolts back (8 cracks) or kick its grenade back', `${actionLabel('attack')} · ${actionLabel('tether')}`],
      ['AEGIS-07 gold flash: parry its riposte to stun it', actionLabel('sheathe')],
      ['AEGIS-07 red flash: no parry stops it; dash through to its back', actionLabel('dash')],
      ['AEGIS-07 strike rings: get out before the light erupts', 'Move · ' + actionLabel('dash')],
      ['Pause (training: spawn panel)', actionLabel('pause')],
      ['Skip a cutscene you have seen', `Hold ${actionLabel('sheathe')}`],
      ['Pick an endless upgrade', touch ? 'Tap a card' : 'Click, or 1 / 2 / 3'],
    ];
    const all = rows.concat(SaveData.character === 'aegis' ? aegis : ronin, rival);
    document.getElementById('howto-table').innerHTML = all.map(([a, k]) => `<tr><td>${a}</td><td><kbd>${k}</kbd></td></tr>`).join('');
  },

  // ---------- settings ----------
  fmt(v, f) {
    if (f === 'x') return v.toFixed(2) + 'x';
    if (f === '%') return Math.round(v * 100) + '%';
    if (f === 's') return v.toFixed(1) + 's';
    if (f === 'ms') return Math.round(v * 1000) + ' ms';
    if (f === 'm') return v.toFixed(2) + ' m';
    return String(Math.round(v));
  },
  renderSettings() {
    for (const b of document.querySelectorAll('#settings .tabs button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    safeStorageSet('slashyslash3d.tab', this.tab);
    const body = document.getElementById('settings-body');
    body.innerHTML = '';
    let items = SETTINGS_SCHEMA[this.tab];
    // the controls you're using come first
    if (this.tab === 'controls' && !Touch.on()) { const k = items.findIndex((i) => i.type === 'heading' && i.label.startsWith('Keyboard')); items = items.slice(k).concat(items.slice(0, k)); }
    for (const item of items) body.appendChild(this.renderItem(item));
  },
  renderItem(item) {
    const id = item.key ? 'set-' + item.key.replace(/\./g, '-') : '';
    if (item.type === 'heading') {
      const h = document.createElement('h3'); h.textContent = item.label; return h;
    }
    if (item.type === 'range') {
      const row = document.createElement('div'); row.className = 'row';
      const v = getPath(S, item.key);
      row.innerHTML = `<label for="${id}">${item.label}</label><input type="range" id="${id}" min="${item.min}" max="${item.max}" step="${item.step}" value="${v}"><output>${this.fmt(v, item.fmt)}</output>`;
      const input = row.querySelector('input'), out = row.querySelector('output');
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        setPath(S, item.key, val);
        out.textContent = this.fmt(val, item.fmt);
        if (item.custom && S.enemies.preset !== 'custom') { S.enemies.preset = 'custom'; this.syncPreset(); }
        if (item.key.startsWith('audio.')) Sound.applyVolumes();
        if (item.key === 'visuals.resScale') Render.resize();
        saveSettings();
      });
      return row;
    }
    if (item.type === 'toggle') {
      const row = document.createElement('div'); row.className = 'row toggle';
      const v = getPath(S, item.key);
      row.innerHTML = `<label for="${id}">${item.label}</label><input type="checkbox" class="switch" id="${id}" ${v ? 'checked' : ''}>`;
      const input = row.querySelector('input');
      input.addEventListener('change', () => {
        setPath(S, item.key, input.checked);
        if (item.key === 'visuals.scanlines') this.applyVisualToggles();
        if (item.key === 'visuals.retro') Render.resize();
        if (item.key === 'audio.muteOnBlur') Sound.setFocus(document.hasFocus());
        saveSettings();
      });
      return row;
    }
    if (item.type === 'preset') {
      const row = document.createElement('div'); row.className = 'row preset';
      row.innerHTML = `<label>${item.label}</label><div class="seg" role="group"></div>`;
      const seg = row.querySelector('.seg');
      for (const o of item.options) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = o; b.dataset.preset = o; b.id = 'preset-' + o;
        if (o === 'custom') b.disabled = true;
        b.addEventListener('click', () => { Sound.play('ui'); applyPreset(o); this.renderSettings(); });
        seg.appendChild(b);
      }
      setTimeout(() => this.syncPreset(), 0);
      return row;
    }
    if (item.type === 'bindings') {
      const wrap = document.createElement('div'); wrap.className = 'binds';
      wrap.innerHTML = '<p class="hint">Click a slot, then press a key or mouse button. Esc cancels, Backspace clears.</p>';
      const table = document.createElement('table');
      for (const a of ACTIONS) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${a.label}</td>`;
        for (let i = 0; i < 2; i++) {
          const td = document.createElement('td');
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'key'; b.id = `bind-${a.id}-${i}`;
          b.textContent = codeLabel(S.controls.bindings[a.id][i]);
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            b.textContent = 'Press…'; b.classList.add('listening');
            setTimeout(() => Input.capture((code) => {
              b.classList.remove('listening');
              if (code !== 'Escape' || a.id === 'pause') {
                if (code) for (const other of ACTIONS) {
                  const arr = S.controls.bindings[other.id];
                  for (let j = 0; j < 2; j++) if (arr[j] === code && !(other.id === a.id && j === i)) arr[j] = '';
                }
                S.controls.bindings[a.id][i] = code;
                saveSettings();
              }
              this.renderSettings();
            }), 0);
          });
          td.appendChild(b); tr.appendChild(td);
        }
        table.appendChild(tr);
      }
      wrap.appendChild(table);
      return wrap;
    }
    if (item.type === 'choice') {
      const row = document.createElement('div'); row.className = 'row preset';
      row.innerHTML = `<label>${item.label}</label><div class="seg" role="group"></div>`;
      const seg = row.querySelector('.seg'), v = getPath(S, item.key);
      for (const [val, name] of item.options) {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = name; b.classList.toggle('on', v === val);
        b.addEventListener('click', () => {
          Sound.play('ui'); setPath(S, item.key, val); saveSettings();
          if (item.key === 'controls.touch') Touch.changed();
          this.renderSettings();
        });
        seg.appendChild(b);
      }
      return row;
    }
    if (item.type === 'test-sound') {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = '<label>Preview</label><div class="seg"><button type="button" id="test-slash">Slash</button><button type="button" id="test-parry">Parry</button><button type="button" id="test-boom">Shockwave</button></div>';
      row.querySelector('#test-slash').addEventListener('click', () => { Sound.init(); Sound.play('swing', { stage: 3 }); });
      row.querySelector('#test-parry').addEventListener('click', () => { Sound.init(); Sound.play('parry'); });
      row.querySelector('#test-boom').addEventListener('click', () => { Sound.init(); Sound.play('shockwave', { power: 1 }); });
      return row;
    }
    return document.createElement('div');
  },
  syncPreset() {
    for (const b of document.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === S.enemies.preset);
  },
};
