'use strict';
// Procedural WebAudio sound effects and music. No audio files. Effects can be placed in the world.

const Sound = (() => {
  let ac = null;
  let comp, master, lowpass, sfxBus, musicBus, reverbIn, noiseBuf, crackleBuf;
  let focusMute = 1;
  const last = {};
  const GAP = { hit: 0.025, step: 0.09, sawHit: 0.045, spark: 0.03, enemyShoot: 0.04, shieldHit: 0.05, land: 0.06, barrelHit: 0.05, kill: 0.02, enemyWindup: 0.05, glint: 0.06, thud: 0.08, scrape: 0.12, grab: 0.1 };

  function makeNoise(sec) {
    const n = (ac.sampleRate * sec) | 0, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function makeCrackle(sec) {
    const sr = ac.sampleRate, n = (sr * sec) | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0);
    let on = false, cnt = 0, amp = 0, ph = 0, fr = 0;
    for (let i = 0; i < n; i++) {
      if (--cnt <= 0) {
        on = Math.random() < 0.55;
        cnt = (Math.random() * 0.006 + 0.0004) * sr;
        amp = Math.random() * 0.9 + 0.1;
        fr = 150 + Math.random() * 3200;
      }
      if (on) { ph += fr / sr; d[i] = ((ph % 1) < 0.5 ? 1 : -1) * amp * 0.55 + (Math.random() * 2 - 1) * amp * 0.45; }
      else d[i] = (Math.random() * 2 - 1) * 0.02;
    }
    return b;
  }
  function makeIR(sec, decay) {
    const sr = ac.sampleRate, n = (sr * sec) | 0, b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return b;
  }

  function init() {
    if (ac) { resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass'; lowpass.frequency.value = 20000; lowpass.Q.value = 0.8;
    comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
    master = ac.createGain();
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    const reverb = ac.createConvolver();
    reverb.buffer = makeIR(2.2, 2.6);
    reverbIn = ac.createGain();
    const reverbOut = ac.createGain();
    reverbOut.gain.value = 0.32;
    sfxBus.connect(lowpass);
    musicBus.connect(lowpass);
    reverbIn.connect(reverb); reverb.connect(reverbOut); reverbOut.connect(lowpass);
    lowpass.connect(comp); comp.connect(master); master.connect(ac.destination);
    noiseBuf = makeNoise(2.5);
    crackleBuf = makeCrackle(1.5);
    applyVolumes();
  }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }
  function applyVolumes() {
    if (!ac) return;
    const t = ac.currentTime;
    master.gain.setTargetAtTime(S.audio.master * focusMute, t, 0.03);
    sfxBus.gain.setTargetAtTime(S.audio.sfx, t, 0.03);
    musicBus.gain.setTargetAtTime(S.audio.music * 0.6, t, 0.05);
  }
  function setFocus(focused) {
    focusMute = focused || !S.audio.muteOnBlur ? 1 : 0;
    applyVolumes();
  }
  function setSlow(on) {
    if (!ac) return;
    lowpass.frequency.setTargetAtTime(on ? 1200 : 20000, ac.currentTime, on ? 0.04 : 0.15);
  }

  // set by play() while a positional sound builds its nodes
  let posDest = null;
  function route(node, o) {
    node.connect(o.dest || posDest || sfxBus);
    if (o.rev) {
      const s = ac.createGain();
      s.gain.value = o.rev;
      node.connect(s); s.connect(reverbIn);
    }
  }
  function envGain(t, a, dur, vol) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    return g;
  }
  function tone(o) {
    const t = ac.currentTime + (o.delay || 0), a = o.a || 0.004;
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    const pm = o.pm || 1;
    osc.frequency.setValueAtTime(o.f0 * pm, t);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 * pm), t + (o.slide || a + o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = envGain(t, a, o.dur, o.vol);
    osc.connect(g); route(g, o);
    osc.start(t); osc.stop(t + a + o.dur + 0.05);
  }
  function noise(o) {
    const t = ac.currentTime + (o.delay || 0), a = o.a || 0.004;
    const src = ac.createBufferSource();
    src.buffer = o.buf || noiseBuf;
    if (o.rate) src.playbackRate.value = o.rate;
    const f = ac.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.Q.value = o.q || 1;
    const pm = o.pm || 1;
    f.frequency.setValueAtTime(o.f0 * pm, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1 * pm, t + a + o.dur);
    const g = envGain(t, a, o.dur, o.vol);
    src.connect(f); f.connect(g); route(g, o);
    const len = a + o.dur + 0.05;
    const off = Math.random() * Math.max(0, src.buffer.duration - len - 0.05);
    src.start(t, off, len);
  }
  function crackle(dur, vol, o = {}) {
    noise(Object.assign({ buf: crackleBuf, dur, vol, type: 'highpass', f0: o.f || 1200, q: 0.7 }, o));
  }

  const R = {
    swing(p) {
      const pm = rand(0.92, 1.08);
      if (p.stage === 3) {
        noise({ dur: 0.26, vol: 0.5, f0: 2600, f1: 280, q: 1.1, pm });
        tone({ type: 'sine', f0: 150, f1: 48, dur: 0.18, vol: 0.32 });
        tone({ type: 'square', f0: 320, f1: 80, dur: 0.12, vol: 0.05 });
        crackle(0.22, 0.26, { f: 900 });
      } else {
        noise({ dur: 0.13, vol: 0.34, f0: 3600, f1: 700, q: 1.2, pm });
        tone({ type: 'sine', f0: 2700, f1: 2200, dur: 0.08, vol: 0.04, pm });
        crackle(0.1, 0.17);
      }
    },
    hit(p) {
      const h = p.heavy;
      tone({ type: 'sine', f0: h ? 170 : 230, f1: h ? 38 : 55, dur: h ? 0.17 : 0.1, vol: h ? 0.7 : 0.48 });
      noise({ dur: h ? 0.1 : 0.06, vol: h ? 0.45 : 0.32, type: 'lowpass', f0: 3200, f1: 300 });
      tone({ type: 'square', f0: 1700, f1: 420, dur: 0.03, vol: 0.06 });
      crackle(h ? 0.14 : 0.06, h ? 0.22 : 0.12);
    },
    kill() {
      tone({ type: 'square', f0: 520, f1: 60, dur: 0.18, vol: 0.12 });
      noise({ dur: 0.26, vol: 0.38, f0: 1300, f1: 180, q: 0.8 });
      crackle(0.26, 0.24, { f: 800 });
      tone({ type: 'sine', f0: 95, f1: 30, dur: 0.24, vol: 0.45 });
    },
    explode(p) {
      const v = p.big ? 1 : 0.75;
      noise({ dur: 0.75, vol: 0.85 * v, type: 'lowpass', f0: 3200, f1: 70, rev: 0.4 });
      tone({ type: 'sine', f0: 110, f1: 24, dur: 0.65, vol: 0.85 * v });
      crackle(0.3, 0.22);
    },
    dash() {
      noise({ dur: 0.17, vol: 0.34, f0: 600, f1: 4200, q: 0.8 });
      tone({ type: 'sawtooth', f0: 220, f1: 880, dur: 0.1, vol: 0.035 });
      crackle(0.13, 0.13);
    },
    jump() {
      tone({ type: 'square', f0: 260, f1: 520, dur: 0.06, vol: 0.05 });
      noise({ dur: 0.05, vol: 0.08, type: 'highpass', f0: 2000 });
    },
    djump() {
      noise({ dur: 0.16, vol: 0.2, f0: 900, f1: 2600, q: 0.9 });
      tone({ type: 'triangle', f0: 420, f1: 940, dur: 0.1, vol: 0.07 });
    },
    bulletjump() {
      noise({ dur: 0.28, vol: 0.36, f0: 380, f1: 3200, q: 0.8 });
      crackle(0.22, 0.2);
      tone({ type: 'sawtooth', f0: 140, f1: 620, dur: 0.2, vol: 0.05 });
    },
    walljump() {
      noise({ dur: 0.08, vol: 0.2, f0: 1500, q: 1.5 });
      tone({ type: 'square', f0: 300, f1: 620, dur: 0.06, vol: 0.05 });
    },
    land(p) {
      noise({ dur: 0.08, vol: 0.22 * (p.v || 1), type: 'lowpass', f0: 600, f1: 140 });
    },
    step() { noise({ dur: 0.03, vol: 0.05, type: 'lowpass', f0: 500 }); },
    slide() {
      noise({ dur: 0.32, vol: 0.13, f0: 2600, f1: 1400, q: 1.4 });
      crackle(0.15, 0.06);
    },
    sheathe() {
      tone({ type: 'triangle', f0: 2300, f1: 1800, dur: 0.04, vol: 0.12 });
      noise({ dur: 0.06, vol: 0.12, type: 'highpass', f0: 4200 });
      tone({ type: 'sine', f0: 5200, dur: 0.12, vol: 0.025, delay: 0.03 });
    },
    chargeFull() {
      tone({ type: 'sine', f0: 1318, dur: 0.5, vol: 0.11, rev: 0.35 });
      tone({ type: 'sine', f0: 1976, dur: 0.5, vol: 0.07, delay: 0.04, rev: 0.35 });
      crackle(0.15, 0.15);
    },
    quickdraw() {
      tone({ type: 'sine', f0: 3300, f1: 2800, dur: 0.22, vol: 0.07, rev: 0.25 });
      noise({ dur: 0.15, vol: 0.42, f0: 4200, f1: 800, q: 1 });
      crackle(0.1, 0.16);
    },
    iaido(p) {
      const pw = 0.5 + (p.power || 1) * 0.5;
      tone({ type: 'sine', f0: 3400, dur: 0.55, vol: 0.11, rev: 0.45 });
      tone({ type: 'sine', f0: 5100, dur: 0.35, vol: 0.05, rev: 0.45 });
      noise({ dur: 0.42, vol: 0.6, f0: 5200, f1: 240, q: 0.9 });
      tone({ type: 'sine', f0: 115, f1: 26, dur: 0.6, vol: 0.9 * pw });
      noise({ dur: 0.5, vol: 0.45 * pw, type: 'lowpass', f0: 1300, f1: 60, rev: 0.3 });
      crackle(0.42, 0.3, { f: 700 });
      if (p.empowered) {
        for (const f of [220, 330, 440]) tone({ type: 'sawtooth', f0: f, f1: f / 2, dur: 0.6, vol: 0.045, rev: 0.4 });
        tone({ type: 'sine', f0: 70, f1: 20, dur: 0.9, vol: 0.8 });
      }
    },
    cut() {
      noise({ dur: 0.09, vol: 0.42, type: 'highpass', f0: 3200 });
      tone({ type: 'sine', f0: 190, f1: 38, dur: 0.26, vol: 0.62 });
      crackle(0.22, 0.24);
    },
    parry() {
      for (const f of [1046, 1568, 2637, 3729]) tone({ type: 'sine', f0: f, dur: 0.75, vol: 0.085, rev: 0.55, detune: rand(-12, 12) });
      noise({ dur: 0.08, vol: 0.42, type: 'highpass', f0: 3000 });
      tone({ type: 'sine', f0: 320, f1: 70, dur: 0.5, vol: 0.32 });
      crackle(0.28, 0.26);
    },
    tetherFire() {
      tone({ type: 'sawtooth', f0: 1500, f1: 260, dur: 0.14, vol: 0.06 });
      crackle(0.15, 0.2);
      noise({ dur: 0.1, vol: 0.13, f0: 3200, f1: 1000, q: 1 });
    },
    tetherAttach() {
      tone({ type: 'square', f0: 190, f1: 120, dur: 0.05, vol: 0.09 });
      noise({ dur: 0.05, vol: 0.28, f0: 2300, q: 3 });
      crackle(0.12, 0.24);
    },
    tetherMiss() { tone({ type: 'sine', f0: 620, f1: 200, dur: 0.12, vol: 0.05 }); },
    zip() {
      noise({ dur: 0.3, vol: 0.24, f0: 300, f1: 1600, q: 0.9 });
      crackle(0.24, 0.2);
    },
    noShield() {
      tone({ type: 'square', f0: 220, dur: 0.06, vol: 0.07 });
      tone({ type: 'square', f0: 165, dur: 0.08, vol: 0.07, delay: 0.07 });
    },
    hurt() {
      tone({ type: 'square', f0: 170, f1: 50, dur: 0.18, vol: 0.18 });
      noise({ dur: 0.18, vol: 0.45, type: 'lowpass', f0: 2200, f1: 200 });
      crackle(0.1, 0.14);
    },
    shieldHit() {
      tone({ type: 'sine', f0: 1500, f1: 700, dur: 0.1, vol: 0.11 });
      noise({ dur: 0.06, vol: 0.2, type: 'highpass', f0: 5000 });
      crackle(0.08, 0.1);
    },
    shieldBreak() {
      noise({ dur: 0.36, vol: 0.4, type: 'highpass', f0: 2600, rev: 0.3 });
      tone({ type: 'triangle', f0: 1500, f1: 300, dur: 0.35, vol: 0.12 });
      tone({ type: 'triangle', f0: 1100, f1: 200, dur: 0.4, vol: 0.1, delay: 0.03 });
    },
    // shield starts recharging: a soft rising hum with a click
    shieldRegen() {
      tone({ type: 'triangle', f0: 220, f1: 660, dur: 0.45, vol: 0.07, a: 0.08, rev: 0.3 });
      tone({ type: 'sine', f0: 440, f1: 1320, dur: 0.45, vol: 0.04, a: 0.1 });
      noise({ dur: 0.03, vol: 0.08, type: 'highpass', f0: 5000 });
    },
    // shield fully charged: two bright notes and a shimmer
    shieldFull() {
      tone({ type: 'triangle', f0: 1046, dur: 0.12, vol: 0.07, rev: 0.4 });
      tone({ type: 'triangle', f0: 1568, dur: 0.22, vol: 0.07, delay: 0.08, rev: 0.5 });
      tone({ type: 'sine', f0: 3136, dur: 0.25, vol: 0.025, delay: 0.08, rev: 0.5 });
      noise({ dur: 0.2, vol: 0.05, type: 'highpass', f0: 7000, delay: 0.06 });
    },
    ultReady() {
      [660, 880, 1320, 1760].forEach((f, i) => tone({ type: 'triangle', f0: f, dur: 0.25, vol: 0.07, delay: i * 0.07, rev: 0.4 }));
    },
    ultActivate() {
      tone({ type: 'sawtooth', f0: 55, f1: 110, dur: 1, vol: 0.14 });
      tone({ type: 'sawtooth', f0: 82, f1: 165, dur: 1, vol: 0.1 });
      noise({ dur: 1, vol: 0.8, type: 'lowpass', f0: 4200, f1: 100, rev: 0.5 });
      tone({ type: 'sine', f0: 130, f1: 24, dur: 0.85, vol: 0.9 });
      crackle(0.6, 0.38);
    },
    ultEnd() {
      tone({ type: 'sawtooth', f0: 220, f1: 60, dur: 0.4, vol: 0.07 });
      noise({ dur: 0.3, vol: 0.25, type: 'lowpass', f0: 1500, f1: 200 });
    },
    sawHit() {
      noise({ dur: 0.05, vol: 0.24, f0: 3200, q: 2 });
      tone({ type: 'square', f0: 900, f1: 300, dur: 0.04, vol: 0.045 });
    },
    enemyWindup(p) {
      const pm = p.pm || 1;
      tone({ type: 'square', f0: 880 * pm, dur: 0.05, vol: 0.045 });
      tone({ type: 'square', f0: 1175 * pm, dur: 0.06, vol: 0.045, delay: 0.07 });
    },
    enemyShoot() {
      tone({ type: 'square', f0: 1300, f1: 180, dur: 0.12, vol: 0.07 });
      noise({ dur: 0.1, vol: 0.14, f0: 2000, f1: 500 });
    },
    enemyMelee() { noise({ dur: 0.12, vol: 0.24, f0: 1500, f1: 400, q: 1 }); },
    slam() {
      tone({ type: 'sine', f0: 95, f1: 24, dur: 0.5, vol: 0.85 });
      noise({ dur: 0.5, vol: 0.6, type: 'lowpass', f0: 1600, f1: 60, rev: 0.3 });
    },
    shockwave(p) {
      const v = 0.6 + (p.power || 0.5) * 0.4;
      tone({ type: 'sine', f0: 120, f1: 22, dur: 0.6, vol: 0.95 * v });
      noise({ dur: 0.55, vol: 0.7 * v, type: 'lowpass', f0: 2600, f1: 60, rev: 0.4 });
      crackle(0.35, 0.3, { f: 600 });
    },
    plungeStart() {
      tone({ type: 'sine', f0: 1300, f1: 300, dur: 0.25, vol: 0.06 });
      noise({ dur: 0.25, vol: 0.22, f0: 2200, f1: 600 });
    },
    droneDive() { tone({ type: 'sawtooth', f0: 300, f1: 950, dur: 0.35, vol: 0.045 }); },
    spawn() {
      noise({ dur: 0.1, vol: 0.12, f0: 300, f1: 3200, a: 0.4 });
      tone({ type: 'sine', f0: 200, f1: 900, dur: 0.1, vol: 0.05, a: 0.4 });
    },
    waveStart() {
      for (const f of [220, 261.6, 329.6]) tone({ type: 'sawtooth', f0: f, dur: 1.1, vol: 0.045, a: 0.05, rev: 0.5 });
      tone({ type: 'sine', f0: 55, dur: 1, vol: 0.38 });
      noise({ dur: 0.8, vol: 0.28, type: 'lowpass', f0: 900, f1: 100 });
    },
    waveClear() {
      [523, 659, 784, 1046].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.18, vol: 0.045, delay: i * 0.08, rev: 0.3 }));
    },
    pickup() {
      tone({ type: 'sine', f0: 800, f1: 1600, dur: 0.12, vol: 0.09 });
      tone({ type: 'sine', f0: 1200, f1: 2400, dur: 0.1, vol: 0.06, delay: 0.05 });
    },
    barrelHit() {
      tone({ type: 'square', f0: 300, f1: 200, dur: 0.05, vol: 0.06 });
      noise({ dur: 0.05, vol: 0.18, f0: 1000, q: 2 });
    },
    reflect() {
      tone({ type: 'square', f0: 2000, f1: 600, dur: 0.1, vol: 0.07 });
      crackle(0.12, 0.2);
    },
    denied() {
      tone({ type: 'square', f0: 330, dur: 0.04, vol: 0.05 });
      tone({ type: 'square', f0: 250, dur: 0.05, vol: 0.05, delay: 0.05 });
    },
    unsheathe() {
      tone({ type: 'triangle', f0: 1600, f1: 2200, dur: 0.05, vol: 0.06 });
      noise({ dur: 0.05, vol: 0.06, type: 'highpass', f0: 3500 });
    },
    groundCut() {
      noise({ dur: 0.34, vol: 0.32, f0: 1800, f1: 600, q: 1.2 });
      crackle(0.28, 0.22, { f: 900 });
      tone({ type: 'square', f0: 140, f1: 60, dur: 0.2, vol: 0.08 });
    },
    // a gauntlet dragged over concrete: a skid turn's hand, a cling sliding down a wall
    scrape(p) {
      noise({ dur: 0.3 * (p.len || 1), vol: 0.2, f0: 2200, f1: 900, q: 1.6 });
      crackle(0.26 * (p.len || 1), 0.16, { f: 1600 });
    },
    // fingers driven into a wall
    grab() {
      noise({ dur: 0.07, vol: 0.28, type: 'lowpass', f0: 1400, f1: 300 });
      crackle(0.1, 0.18, { f: 1100 });
      tone({ type: 'square', f0: 220, f1: 90, dur: 0.06, vol: 0.05 });
    },
    // a street lamp cut: the clang of the pole, the power arcing out
    lampCut() {
      tone({ type: 'triangle', f0: 880, f1: 620, dur: 0.5, vol: 0.09, rev: 0.4 });
      tone({ type: 'triangle', f0: 1320, f1: 1100, dur: 0.35, vol: 0.05, rev: 0.4 });
      crackle(0.4, 0.22, { f: 2200 });
      noise({ dur: 0.12, vol: 0.2, type: 'highpass', f0: 3000 });
    },
    // the lamp's top hitting the street: metal, then glass
    lampCrash() {
      tone({ type: 'sine', f0: 140, f1: 45, dur: 0.3, vol: 0.55 });
      noise({ dur: 0.25, vol: 0.35, type: 'lowpass', f0: 1200, f1: 200 });
      for (let i = 0; i < 6; i++) tone({ type: 'sine', f0: 3000 + Math.random() * 3000, dur: 0.08, vol: 0.04, delay: 0.03 + i * 0.025 });
      noise({ dur: 0.2, vol: 0.18, type: 'highpass', f0: 5000, delay: 0.02 });
    },
    rocks() {
      for (let i = 0; i < 5; i++) noise({ dur: 0.05, vol: 0.18, type: 'lowpass', f0: 900 + Math.random() * 1200, delay: i * 0.03 + Math.random() * 0.02 });
      tone({ type: 'sine', f0: 120, f1: 50, dur: 0.15, vol: 0.4 });
    },
    throw() {
      noise({ dur: 0.18, vol: 0.32, f0: 500, f1: 3000, q: 0.9 });
      crackle(0.15, 0.18);
    },
    // the machine gun's barrels spinning up: a whir that climbs, with clicks that run together
    gunSpin(p) {
      const d = p.dur || 0.55;
      tone({ type: 'sawtooth', f0: 110, f1: 620, dur: d, vol: 0.05, a: d * 0.4, slide: d });
      tone({ type: 'square', f0: 55, f1: 310, dur: d, vol: 0.03, a: d * 0.4, slide: d });
      noise({ dur: d, vol: 0.1, f0: 800, f1: 4200, q: 2, a: d * 0.7 });
      for (let i = 0; i < 9; i++) tone({ type: 'square', f0: 2400, dur: 0.012, vol: 0.035, delay: d * (1 - Math.pow(1 - i / 9, 1.8)) });
    },
    bossGun() {
      tone({ type: 'square', f0: 900, f1: 220, dur: 0.05, vol: 0.06 });
      noise({ dur: 0.05, vol: 0.2, f0: 2600, f1: 900, q: 1.2 });
    },
    lockBeep(p) { tone({ type: 'square', f0: 1400 * (p.pm || 1), dur: 0.035, vol: 0.05 }); },
    bossShieldBreak() {
      noise({ dur: 0.6, vol: 0.55, type: 'highpass', f0: 2200, rev: 0.5 });
      for (const f of [1800, 1350, 900, 600]) tone({ type: 'triangle', f0: f, f1: f * 0.4, dur: 0.5, vol: 0.08, rev: 0.4 });
      tone({ type: 'sine', f0: 110, f1: 28, dur: 0.7, vol: 0.8 });
    },
    shieldUp() {
      tone({ type: 'sine', f0: 300, f1: 1400, dur: 0.5, vol: 0.09, a: 0.2, rev: 0.4 });
      crackle(0.3, 0.12);
    },
    shieldDeflect() {
      tone({ type: 'triangle', f0: 2400, f1: 1800, dur: 0.08, vol: 0.07 });
      noise({ dur: 0.04, vol: 0.12, type: 'highpass', f0: 5000 });
    },
    bossRoar() {
      tone({ type: 'sawtooth', f0: 70, f1: 45, dur: 0.9, vol: 0.12, a: 0.05, rev: 0.5 });
      tone({ type: 'square', f0: 105, f1: 66, dur: 0.8, vol: 0.06 });
      crackle(0.6, 0.3, { f: 500 });
    },
    pulse() {
      tone({ type: 'sine', f0: 140, f1: 30, dur: 0.7, vol: 0.9 });
      noise({ dur: 0.5, vol: 0.5, type: 'lowpass', f0: 2600, f1: 120, rev: 0.4 });
      for (const f of [1800, 1200]) tone({ type: 'square', f0: f, f1: f * 0.25, dur: 0.35, vol: 0.05, rev: 0.4 });
      crackle(0.5, 0.4, { f: 600 });
    },
    // the shoulder cannon charging: a growl and a whine rising together, a swell of hiss, ticks that come faster,
    // and a bright lock tone as it fires
    laserCharge(p) {
      const d = p.dur || 0.85;
      tone({ type: 'sawtooth', f0: 90, f1: 1400, dur: d, vol: 0.07, a: d * 0.3, slide: d });
      tone({ type: 'sawtooth', f0: 91, f1: 1410, dur: d, vol: 0.05, a: d * 0.3, slide: d, detune: 14 });
      tone({ type: 'sine', f0: 42, f1: 95, dur: d, vol: 0.22, a: d * 0.5, slide: d });
      noise({ dur: d, vol: 0.14, f0: 400, f1: 3200, q: 1.4, a: d * 0.8 });
      crackle(d, 0.2, { f: 900 });
      for (let i = 0; i < 8; i++) tone({ type: 'square', f0: 1800 + i * 120, dur: 0.025, vol: 0.03, delay: d * (1 - Math.pow(1 - i / 8, 2)) });
      for (const f of [2637, 3520]) tone({ type: 'sine', f0: f, dur: 0.18, vol: 0.06, delay: d, rev: 0.4 });
    },
    beamCharge() {
      tone({ type: 'sawtooth', f0: 120, f1: 900, dur: 0.85, vol: 0.06, a: 0.05 });
      crackle(0.8, 0.18);
    },
    // the bright "shing" that warns a melee hit is coming
    glint() {
      tone({ type: 'sine', f0: 4200, f1: 4500, dur: 0.2, vol: 0.07, rev: 0.45 });
      tone({ type: 'triangle', f0: 2800, f1: 3100, dur: 0.12, vol: 0.05 });
      noise({ dur: 0.03, vol: 0.1, type: 'highpass', f0: 6500 });
    },
    timeSlow() {
      tone({ type: 'sine', f0: 900, f1: 90, dur: 0.6, vol: 0.12, rev: 0.6 });
      tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 0.5, vol: 0.05 });
      noise({ dur: 0.5, vol: 0.25, type: 'bandpass', f0: 3000, f1: 300, q: 2, rev: 0.5 });
      tone({ type: 'sine', f0: 60, f1: 40, dur: 0.25, vol: 0.5, delay: 0.05 });
      tone({ type: 'sine', f0: 60, f1: 40, dur: 0.25, vol: 0.35, delay: 0.42 });
    },
    rebound() {
      tone({ type: 'sine', f0: 120, f1: 1400, dur: 0.18, vol: 0.12 });
      noise({ dur: 0.28, vol: 0.5, f0: 1800, f1: 6000, q: 1.2 });
      tone({ type: 'triangle', f0: 1900, f1: 1500, dur: 0.3, vol: 0.09, rev: 0.5 });
      tone({ type: 'sine', f0: 160, f1: 40, dur: 0.22, vol: 0.6 });
      crackle(0.3, 0.3, { f: 800 });
    },
    blocked() {
      tone({ type: 'triangle', f0: 1600, f1: 900, dur: 0.25, vol: 0.08, rev: 0.4 });
      noise({ dur: 0.3, vol: 0.25, type: 'lowpass', f0: 2000, f1: 200 });
      tone({ type: 'sine', f0: 120, f1: 50, dur: 0.3, vol: 0.4 });
    },
    limiterPop() {
      tone({ type: 'square', f0: 700, f1: 180, dur: 0.08, vol: 0.06 });
      noise({ dur: 0.08, vol: 0.3, type: 'highpass', f0: 2500 });
      tone({ type: 'sine', f0: 140, f1: 60, dur: 0.1, vol: 0.35 });
    },
    enrageCharge() {
      tone({ type: 'sawtooth', f0: 50, f1: 420, dur: 1.1, vol: 0.09, a: 0.1, rev: 0.4 });
      tone({ type: 'square', f0: 75, f1: 630, dur: 1.1, vol: 0.04, a: 0.1, detune: 12 });
      crackle(1.1, 0.25, { f: 700 });
    },
    enrageRoar() {
      tone({ type: 'sawtooth', f0: 95, f1: 55, dur: 1.2, vol: 0.16, a: 0.04, rev: 0.6 });
      tone({ type: 'square', f0: 142, f1: 80, dur: 1.1, vol: 0.07, detune: -15 });
      tone({ type: 'sine', f0: 70, f1: 30, dur: 1.2, vol: 0.7 });
      noise({ dur: 1.0, vol: 0.4, type: 'bandpass', f0: 700, f1: 300, q: 0.8, rev: 0.5 });
      crackle(1.0, 0.45, { f: 400 });
    },
    // last hit: a hard impact that rings out under the slow motion
    koHit() {
      tone({ type: 'sine', f0: 180, f1: 26, dur: 1.4, vol: 1.0 });
      noise({ dur: 0.5, vol: 0.6, type: 'lowpass', f0: 4000, f1: 100, rev: 0.6 });
      for (const f of [2400, 1600, 1210]) tone({ type: 'triangle', f0: f, f1: f * 0.97, dur: 1.6, vol: 0.05, a: 0.01, rev: 0.7 });
      crackle(0.4, 0.4, { f: 600 });
    },
    thud() {
      tone({ type: 'sine', f0: 110, f1: 35, dur: 0.25, vol: 0.7 });
      noise({ dur: 0.18, vol: 0.35, type: 'lowpass', f0: 900, f1: 120 });
    },
    ko() {
      for (const [f, d] of [[196, 0], [247, 0.0], [294, 0], [392, 0.12]]) tone({ type: 'triangle', f0: f, dur: 1.4, vol: 0.09, delay: d, rev: 0.6 });
      tone({ type: 'sine', f0: 98, f1: 92, dur: 1.6, vol: 0.4, rev: 0.5 });
      noise({ dur: 0.6, vol: 0.2, type: 'highpass', f0: 4000, rev: 0.6 });
    },
    rankUp() {
      tone({ type: 'square', f0: 880, f1: 1320, dur: 0.08, vol: 0.04 });
      tone({ type: 'triangle', f0: 1760, dur: 0.12, vol: 0.04, delay: 0.05, rev: 0.3 });
    },
    guardUp() {
      tone({ type: 'triangle', f0: 700, f1: 1400, dur: 0.18, vol: 0.08, rev: 0.4 });
      noise({ dur: 0.12, vol: 0.18, type: 'highpass', f0: 4000 });
      tone({ type: 'sine', f0: 140, f1: 90, dur: 0.15, vol: 0.3 });
    },
    // holding attack crossed into a heavy: a low tightening hum with a click
    heavyDraw() {
      tone({ type: 'sawtooth', f0: 90, f1: 180, dur: 0.12, vol: 0.06, a: 0.02 });
      tone({ type: 'triangle', f0: 1400, f1: 2100, dur: 0.06, vol: 0.05 });
      noise({ dur: 0.04, vol: 0.12, type: 'highpass', f0: 4200 });
    },
    heavySwing() {
      noise({ dur: 0.34, vol: 0.42, f0: 1400, f1: 160, q: 0.9 });
      tone({ type: 'sine', f0: 120, f1: 34, dur: 0.3, vol: 0.5 });
      crackle(0.2, 0.2, { f: 700 });
    },
    kick() {
      tone({ type: 'sine', f0: 210, f1: 55, dur: 0.14, vol: 0.7 });
      noise({ dur: 0.07, vol: 0.4, type: 'lowpass', f0: 2600, f1: 400 });
      tone({ type: 'square', f0: 900, f1: 300, dur: 0.04, vol: 0.05 });
    },
    overload() {
      tone({ type: 'sawtooth', f0: 1600, f1: 120, dur: 0.4, vol: 0.09 });
      tone({ type: 'sine', f0: 140, f1: 30, dur: 0.45, vol: 0.75 });
      noise({ dur: 0.4, vol: 0.5, type: 'bandpass', f0: 3200, f1: 500, q: 0.8, rev: 0.4 });
      crackle(0.45, 0.45, { f: 900 });
    },
    utilReady() {
      tone({ type: 'triangle', f0: 880, dur: 0.07, vol: 0.05 });
      tone({ type: 'triangle', f0: 1320, dur: 0.1, vol: 0.05, delay: 0.06, rev: 0.3 });
      crackle(0.08, 0.06);
    },
    // blades lock: a bright ring with a grinding edge
    clash() {
      for (const f of [1760, 2349, 3136]) tone({ type: 'triangle', f0: f, f1: f * 0.94, dur: 0.5, vol: 0.06, rev: 0.5 });
      noise({ dur: 0.25, vol: 0.3, f0: 4000, f1: 1500, q: 2 });
      tone({ type: 'sine', f0: 260, f1: 90, dur: 0.3, vol: 0.35 });
    },
    // red flash: a low hit and a sour stab, then a rising tone that peaks where the dash belongs
    // the red flash: nothing like the riposte's bright rise. A sub drop and a tritone alarm that pulses faster,
    // a dark growl climbing under it, then a dissonant metal shriek and a bass hit as its eye flashes
    peril(p) {
      const d = p.dur || 0.6;
      tone({ type: 'sine', f0: 95, f1: 32, dur: 0.6, vol: 0.55 });
      noise({ dur: 0.35, vol: 0.4, type: 'lowpass', f0: 900, f1: 120 });
      for (let i = 0; i < 4; i++) {
        const at = d * (1 - Math.pow(1 - i / 4, 1.6));
        for (const f of [233, 330]) tone({ type: 'square', f0: f, f1: f * 0.94, dur: 0.07, vol: 0.05, delay: at });
      }
      tone({ type: 'sawtooth', f0: 46, f1: 190, dur: d, vol: 0.16, a: d * 0.5, slide: d });
      tone({ type: 'sawtooth', f0: 47, f1: 196, dur: d, vol: 0.12, a: d * 0.5, slide: d, detune: 25 });
      noise({ dur: d, vol: 0.18, f0: 300, f1: 2400, q: 2, a: d * 0.8 });
      tone({ type: 'sine', f0: 60, f1: 28, dur: 0.6, vol: 0.6, delay: d });
      for (const f of [1661, 2349, 3322]) tone({ type: 'square', f0: f, f1: f * 0.9, dur: 0.22, vol: 0.03, delay: d, rev: 0.5 });
      noise({ dur: 0.3, vol: 0.4, type: 'highpass', f0: 2500, delay: d, rev: 0.4 });
    },
    perilDodge() {
      noise({ dur: 0.22, vol: 0.3, f0: 3200, f1: 700, q: 1.2 });
      tone({ type: 'sine', f0: 1320, f1: 2640, dur: 0.22, vol: 0.06, rev: 0.5 });
    },
    // the riposte is coming: a rising tone that peaks where the parry belongs
    riposteCue(p) {
      const d = p.dur || 0.45;
      tone({ type: 'sine', f0: 440, f1: 1760, dur: d, vol: 0.08, a: 0.02, slide: d });
      tone({ type: 'triangle', f0: 220, f1: 880, dur: d, vol: 0.05, a: 0.02, slide: d });
      tone({ type: 'sine', f0: 2637, dur: 0.12, vol: 0.06, delay: d, rev: 0.4 });
    },
    // AEGIS-07 arrives: the street rumbles, a beacon erupts, the title hits
    beaconRumble() {
      tone({ type: 'sawtooth', f0: 38, f1: 70, dur: 0.8, vol: 0.12, a: 0.25, rev: 0.4 });
      noise({ dur: 0.8, vol: 0.35, type: 'lowpass', f0: 300, f1: 900, a: 0.3 });
      crackle(0.7, 0.18, { f: 500 });
    },
    beaconErupt() {
      tone({ type: 'sine', f0: 150, f1: 24, dur: 1.1, vol: 1.0 });
      noise({ dur: 1.2, vol: 0.8, type: 'lowpass', f0: 4200, f1: 90, rev: 0.6 });
      tone({ type: 'sawtooth', f0: 110, f1: 880, dur: 1.2, vol: 0.06, rev: 0.5 });
      noise({ dur: 1.0, vol: 0.3, f0: 600, f1: 5000, q: 1, rev: 0.5 });
      crackle(1.0, 0.5, { f: 700 });
    },
    titleHit() {
      tone({ type: 'sine', f0: 90, f1: 30, dur: 1.0, vol: 0.9 });
      for (const f of [196, 293.7, 392, 587.3]) tone({ type: 'sawtooth', f0: f, dur: 1.2, vol: 0.035, a: 0.01, rev: 0.6 });
      noise({ dur: 0.3, vol: 0.4, type: 'highpass', f0: 3000, rev: 0.5 });
      crackle(0.3, 0.3);
    },
    ui() { tone({ type: 'square', f0: 660, dur: 0.04, vol: 0.05 }); },
    uiHover() { tone({ type: 'sine', f0: 990, dur: 0.02, vol: 0.02 }); },
    gameOver() {
      tone({ type: 'sawtooth', f0: 220, f1: 55, dur: 1.5, vol: 0.09, rev: 0.5 });
      noise({ dur: 1, vol: 0.3, type: 'lowpass', f0: 1200, f1: 80 });
    },
  };

  // at: optional world position { x, y, z }; the sound pans and fades with distance from the listener
  function play(name, p = {}, at = null) {
    if (!ac || !R[name]) return;
    const now = ac.currentTime;
    const gap = GAP[name] || 0.012;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    try {
      if (at) posDest = panner(at);
      R[name](p);
    } catch (e) { /* ignore audio node errors */ } finally { posDest = null; }
  }
  // HRTF so a glint behind you sounds behind you
  function panner(at) {
    const pn = ac.createPanner();
    pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse';
    pn.refDistance = 4; pn.maxDistance = 80; pn.rolloffFactor = 1.1;
    if (pn.positionX) { pn.positionX.value = at.x; pn.positionY.value = at.y; pn.positionZ.value = at.z; }
    else pn.setPosition(at.x, at.y, at.z);
    pn.connect(sfxBus);
    return pn;
  }
  // The camera is the listener: position plus forward vector, y up.
  function setListener(pos, fwd) {
    if (!ac) return;
    const L = ac.listener;
    if (L.positionX) {
      L.positionX.value = pos.x; L.positionY.value = pos.y; L.positionZ.value = pos.z;
      L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // ---------- loops ----------
  const activeLoops = new Set();
  function stopAll() { for (const l of [...activeLoops]) l.stop(); }
  function loop(kind) {
    if (!ac) return { set() {}, stop() {} };
    const t = ac.currentTime;
    const out = ac.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.connect(sfxBus);
    const nodes = [];
    const mk = (n) => { nodes.push(n); return n; };
    const crack = mk(ac.createBufferSource());
    crack.buffer = crackleBuf; crack.loop = true;
    const crackF = ac.createBiquadFilter(); crackF.type = 'highpass'; crackF.frequency.value = 1500;
    const crackG = ac.createGain(); crackG.gain.value = 0;
    crack.connect(crackF); crackF.connect(crackG); crackG.connect(out);
    crack.start(t);
    let api;
    if (kind === 'charge' || kind === 'ultHold') {
      const o1 = mk(ac.createOscillator()), o2 = mk(ac.createOscillator());
      o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 9;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 4;
      const g = ac.createGain(); g.gain.value = 0.5;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(out);
      o1.start(t); o2.start(t);
      const base = kind === 'charge' ? 70 : 50;
      api = {
        set(v) {
          const n = ac.currentTime;
          o1.frequency.setTargetAtTime(base + 320 * v, n, 0.03);
          o2.frequency.setTargetAtTime((base + 320 * v) * 0.5, n, 0.03);
          f.frequency.setTargetAtTime(300 + 3200 * v, n, 0.03);
          out.gain.setTargetAtTime(0.05 + 0.1 * v, n, 0.03);
          crackG.gain.setTargetAtTime(0.05 + 0.4 * v, n, 0.03);
        },
      };
    } else if (kind === 'reel') {
      const o = mk(ac.createOscillator()); o.type = 'square'; o.frequency.value = 58;
      const lfo = mk(ac.createOscillator()); lfo.frequency.value = 18;
      const lg = ac.createGain(); lg.gain.value = 0.5;
      const g = ac.createGain(); g.gain.value = 0.5;
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
      lfo.connect(lg); lg.connect(g.gain);
      o.connect(f); f.connect(g); g.connect(out);
      o.start(t); lfo.start(t);
      crackG.gain.value = 0.25;
      out.gain.setTargetAtTime(0.09, t, 0.02);
      api = { set(v) { o.frequency.setTargetAtTime(58 + 60 * v, ac.currentTime, 0.05); } };
    } else if (kind === 'saw') {
      const o1 = mk(ac.createOscillator()), o2 = mk(ac.createOscillator());
      o1.type = 'sawtooth'; o2.type = 'sawtooth';
      o1.frequency.value = 95; o2.frequency.value = 97.5;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.9;
      const lfo = mk(ac.createOscillator()); lfo.frequency.value = 7;
      const lg = ac.createGain(); lg.gain.value = 300;
      lfo.connect(lg); lg.connect(f.frequency);
      const g = ac.createGain(); g.gain.value = 0.55;
      o1.connect(f); o2.connect(f); f.connect(g); g.connect(out);
      const grind = mk(ac.createBufferSource()); grind.buffer = noiseBuf; grind.loop = true;
      const gf = ac.createBiquadFilter(); gf.type = 'bandpass'; gf.frequency.value = 3500; gf.Q.value = 1.5;
      const gg = ac.createGain(); gg.gain.value = 0;
      grind.connect(gf); gf.connect(gg); gg.connect(out);
      o1.start(t); o2.start(t); lfo.start(t); grind.start(t);
      out.gain.setTargetAtTime(0.16, t, 0.05);
      crackG.gain.value = 0.2;
      api = {
        set(speed, grinding) {
          const n = ac.currentTime;
          o1.frequency.setTargetAtTime(90 + speed * 0.35, n, 0.05);
          o2.frequency.setTargetAtTime(92.5 + speed * 0.36, n, 0.05);
          gg.gain.setTargetAtTime(grinding ? 0.5 : 0, n, 0.03);
        },
      };
    }
    if (kind === 'beam') {
      const o1 = mk(ac.createOscillator()), o2 = mk(ac.createOscillator());
      o1.type = 'sawtooth'; o2.type = 'sawtooth'; o1.frequency.value = 110; o2.frequency.value = 113.5;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.7;
      const hiss = mk(ac.createBufferSource()); hiss.buffer = noiseBuf; hiss.loop = true;
      const hf = ac.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3000;
      const hg = ac.createGain(); hg.gain.value = 0.35;
      o1.connect(f); o2.connect(f); f.connect(out); hiss.connect(hf); hf.connect(hg); hg.connect(out);
      o1.start(t); o2.start(t); hiss.start(t);
      crackG.gain.value = 0.35;
      out.gain.setTargetAtTime(0.14, t, 0.03);
      api = { set() {} };
    }
    let stopped = false;
    activeLoops.add(api);
    api.stop = () => {
      if (stopped) return;
      stopped = true;
      activeLoops.delete(api);
      const n = ac.currentTime;
      out.gain.cancelScheduledValues(n);
      out.gain.setTargetAtTime(0.0001, n, 0.04);
      for (const nd of nodes) { try { nd.stop(n + 0.3); } catch (e) { /* already stopped */ } }
    };
    return api;
  }

  // ---------- music ----------
  const M = { on: false, step: 0, next: 0, timer: 0, bpm: 132, layers: null, intensity: 0 };
  const CHORDS = [
    [110, [220, 261.63, 329.63]],
    [87.31, [174.61, 220, 261.63]],
    [130.81, [261.63, 329.63, 392]],
    [98, [196, 246.94, 293.66]],
  ];
  const BASS = [1, 0, 1, 2, 0, 0, 1, 0, 1, 0, 1, 2, 0, 1, 0, 2];
  function musicTone(dest, type, f, t, a, d, vol, filt) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    let n = o;
    if (filt) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = filt.q || 1;
      fl.frequency.setValueAtTime(filt.f0, t);
      if (filt.f1) fl.frequency.exponentialRampToValueAtTime(filt.f1, t + a + d);
      o.connect(fl); n = fl;
    }
    n.connect(g); g.connect(dest);
    o.start(t); o.stop(t + a + d + 0.05);
  }
  function musicNoise(dest, t, d, vol, type, f, q) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q || 1;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5, d + 0.05);
  }
  function playStep(step, t) {
    const L = M.layers, spb = 60 / M.bpm, s16 = spb / 4;
    const bar = (step >> 4) & 3, st = step & 15;
    const [root, chord] = CHORDS[bar];
    if (st === 0) for (const f of chord) for (const dt of [-7, 7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt;
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 850;
      const g = ac.createGain(), dur = spb * 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.45);
      g.gain.setValueAtTime(0.018, t + dur - 0.2);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
      o.connect(fl); fl.connect(g); g.connect(L.pad);
      o.start(t); o.stop(t + dur + 0.5);
    }
    const b = BASS[st];
    if (b) musicTone(L.bass, 'sawtooth', b === 2 ? root : root / 2, t, 0.005, s16 * 1.6, 0.16, { f0: 1000, f1: 160, q: 6 });
    if (st % 4 === 0) {
      const o = ac.createOscillator(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
      const g = ac.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      o.connect(g); g.connect(L.drums); o.start(t); o.stop(t + 0.3);
    }
    if (st === 4 || st === 12) {
      musicNoise(L.drums, t, 0.16, 0.26, 'bandpass', 1900, 0.7);
      musicTone(L.drums, 'triangle', 190, t, 0.002, 0.08, 0.12, null);
    }
    if (st % 2 === 1) musicNoise(L.drums, t, 0.03, st % 4 === 3 ? 0.07 : 0.035, 'highpass', 7500, 1);
    const arp = [chord[0] * 2, chord[1] * 2, chord[2] * 2, chord[1] * 2];
    musicTone(L.arp, 'square', arp[st & 3] * (st >= 8 ? 2 : 1), t, 0.003, s16 * 0.9, 0.028, { f0: 2600, f1: 900, q: 2 });
  }
  function startMusic() {
    if (!ac || M.on) return;
    M.on = true;
    const mk = (v) => { const g = ac.createGain(); g.gain.value = v; g.connect(musicBus); return g; };
    if (!M.layers) {
      M.layers = { pad: mk(1), bass: mk(0.7), drums: mk(0), arp: null };
      const d = ac.createDelay(1); d.delayTime.value = (60 / M.bpm) * 0.75;
      const fb = ac.createGain(); fb.gain.value = 0.32;
      const arp = ac.createGain(); arp.gain.value = 0;
      arp.connect(musicBus); arp.connect(d); d.connect(fb); fb.connect(d); d.connect(musicBus);
      M.layers.arp = arp;
    }
    M.next = ac.currentTime + 0.1;
    M.timer = setInterval(() => {
      if (!ac) return;
      if (M.next < ac.currentTime - 0.5) M.next = ac.currentTime + 0.05;
      while (M.next < ac.currentTime + 0.15) {
        playStep(M.step, M.next);
        M.next += 60 / M.bpm / 4;
        M.step = (M.step + 1) % 64;
      }
    }, 25);
    setIntensity(M.intensity);
  }
  function setIntensity(v) {
    M.intensity = v;
    if (!ac || !M.layers) return;
    const n = ac.currentTime;
    M.layers.drums.gain.setTargetAtTime(v, n, 0.4);
    M.layers.arp.gain.setTargetAtTime(v * 0.9, n, 0.6);
    M.layers.bass.gain.setTargetAtTime(0.45 + v * 0.45, n, 0.4);
  }

  return {
    init, resume, applyVolumes, setFocus, setSlow, play, setListener, loop, stopAll, startMusic, setIntensity,
    get ready() { return !!ac; },
    get loopCount() { return activeLoops.size; },
  };
})();
