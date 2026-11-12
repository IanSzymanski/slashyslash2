'use strict';
// REAP-R's effects in the world, as the boss or as the player, synced each rendered frame: the jet's flame off
// the back of the scythe, the thrown scythe spinning, the whirlwind's reach marked on the ground (red for the
// boss's, violet for yours) and the shell that closes on it as it winds up, the thread of the reaping from its
// hand to you, torn souls and the threads they hang on, the Harvest's rift, and their lights; and on the HUD,
// the dread closing in at the screen's edges and an arrow to a soul that's out of view. The tears themselves
// are RiftViews' (rift.js). Every material is made once here or shares a shader with one that is.
const ReaperViews = {
  ready: false, kinds: new Set(['scythe', 'soul', 'harvest']),

  init() {
    const add = BossViews.add, G = BossViews.geos;
    this.thread = FX.stripMesh(24); this.soulThread = FX.stripMesh(24);
    this.thread.visible = this.soulThread.visible = false;
    // the whirlwind's reach: a ring and a faint disc on the ground, and the shell closing on it
    this.ring = new THREE.Mesh(G.flatRing, add('#ff2a3a', { opacity: 0.9 }));
    this.disc = new THREE.Mesh(G.disc, add('#ff2a3a', { opacity: 0.16 }));
    this.shell = new THREE.Mesh(G.sphere, add('#ff2a3a', { opacity: 0.2, side: THREE.FrontSide }));
    this.rings = [0, 1].map(() => new THREE.Mesh(G.flatRing, add('#ff2a3a', { opacity: 0.8 })));
    // yours, as REAP-R: the whirlwind's reach as it charges, and the edge of your dread
    this.pRing = new THREE.Mesh(G.flatRing, add(RIFT_COL.main, { opacity: 0.8 }));
    this.pDisc = new THREE.Mesh(G.disc, add(RIFT_COL.main, { opacity: 0.12 }));
    this.aura = new THREE.Mesh(G.flatRing, add(RIFT_COL.main, { opacity: 0.1 }));
    for (const o of this.shows()) { o.visible = false; o.renderOrder = 2; Gfx.scene.add(o); }
    this.ready = true;
  },
  shows() { return [this.ring, this.disc, this.shell, ...this.rings, this.pRing, this.pDisc, this.aura]; },
  prewarmShow() {
    if (!this.ready) this.init();
    for (const o of [this.thread, this.soulThread, ...this.shows()]) o.visible = true;
  },
  prewarmHide() { for (const o of [this.thread, this.soulThread, ...this.shows()]) o.visible = false; },

  // ---------- the thrown scythe, souls and the Harvest, through Views ----------
  make(o) {
    const add = BossViews.add, G = BossViews.geos;
    if (o.kind === 'scythe') {
      const R = Rig.build(MODELS.reaperScythe);
      R.mesh.rotation.order = 'YXZ';
      Gfx.scene.add(R.mesh);
      return { reaper: true, rig: R, lit: null };
    }
    const g = new THREE.Group();
    if (o.kind === 'soul') {
      const orb = new THREE.Mesh(G.sphere, add('#ffffff', { opacity: 0.9, side: THREE.FrontSide })), halo = new THREE.Mesh(G.sphere, add(RIFT_COL.main, { opacity: 0.35, side: THREE.FrontSide }));
      const tail = new THREE.Mesh(G.cone, add('#d8b0ff', { opacity: 0.5 }));
      g.add(halo, orb, tail);
      g.userData = { orb, halo, tail };
    } else if (o.kind === 'harvest') {
      const ring = new THREE.Mesh(G.flatRing, add(RIFT_COL.main, { opacity: 0.9 })), disc = new THREE.Mesh(G.disc, add(RIFT_COL.main, { opacity: 0.2 })), inner = new THREE.Mesh(G.flatRing, add('#ffffff', { opacity: 0.7 }));
      g.add(disc, ring, inner);
      g.userData = { ring, disc, inner };
    } else return null;
    for (const m of g.children) m.renderOrder = 2;
    Gfx.scene.add(g);
    return { reaper: true, g };
  },
  update(o, v, t) {
    if (o.kind === 'scythe') {
      // flat, spinning like a saw about its middle
      const R = v.rig;
      R.mesh.visible = !o.hidden;
      R.mesh.position.set(o.pos.x, o.pos.y, o.pos.z);
      R.mesh.rotation.set(Math.PI / 2, o.spin, 0.25);
      R.mat.emissive.setScalar(0.25);
      if (!v.lit || dist3(v.lit, o.pos) > 1.5) { Render.feet(R.feet, o.pos); v.lit = { x: o.pos.x, y: o.pos.y, z: o.pos.z }; }
      return;
    }
    const U = v.g.userData;
    if (o.kind === 'soul') {
      const k = clamp(o.held / SOUL.MAX, 0.2, 1), b = 0.5 + 0.5 * Math.sin(t * 7), late = o.t > SOUL.LIFE * 0.65 && ((t * 10) | 0) % 2;
      v.g.position.set(o.pos.x, o.pos.y + Math.sin(t * 2.4) * 0.12, o.pos.z);
      U.orb.scale.setScalar(0.16 + 0.12 * k + 0.03 * b + 0.2 * o.pulse);
      U.halo.scale.setScalar(0.5 + 0.35 * k + 0.08 * b + 0.5 * o.pulse);
      U.halo.material.color.set(late ? '#ffffff' : RIFT_COL.main);
      U.halo.material.opacity = 0.3 + 0.15 * b;
      U.tail.scale.set(0.16 + 0.1 * k, 0.9 + 0.3 * b, 0.16 + 0.1 * k);
      U.tail.position.y = -0.1;
    } else if (o.kind === 'harvest') {
      const k = clamp(o.t / 0.3, 0, 1), R = o.R * easeOutCubic(k), pull = (o.t * 1.4) % 1;
      v.g.position.set(o.pos.x, o.pos.y + 0.06, o.pos.z);
      U.ring.scale.setScalar(R); U.disc.scale.setScalar(R);
      U.inner.scale.setScalar(Math.max(0.05, R * (1 - pull)));
      U.inner.material.opacity = 0.7 * pull;
      U.disc.material.opacity = 0.14 + 0.1 * Math.sin(t * 9);
      U.ring.material.color.set(o.t > o.dur - 0.4 && ((t * 16) | 0) % 2 ? '#ffffff' : RIFT_COL.main);
    }
  },
  dispose(v) {
    if (v.rig) { Gfx.scene.remove(v.rig.mesh); v.rig.geo.dispose(); v.rig.mat.dispose(); v.rig.outline.material.dispose(); return; }
    Gfx.scene.remove(v.g);
    for (const m of v.g.children) m.material.dispose();
  },

  // the jet's flame: k is how hard it's burning (0 a pilot light, 1 a full burn)
  jet(R, k, on) {
    const J = R && R.jet;
    if (!J) return;
    J.g.visible = !!on;
    if (!on) return;
    const S = REAPER_SCALE, fl = 0.85 + 0.3 * Math.random();
    J.g.scale.set((0.07 + 0.07 * k) * S, (0.07 + 0.07 * k) * S, (0.16 + 1.1 * k) * S * fl);
  },
  // a wavering line of light from a to b
  line(mesh, a, b, w, outer, core, jag) {
    const n = 12, pts = [], cp = Gfx.camera.position, o = hexLinear(outer), c = hexLinear(core);
    for (let i = 0; i < n; i++) { const u = i / (n - 1), j = i && i < n - 1 ? jag : 0; pts.push({ x: lerp(a.x, b.x, u) + rand(-j, j), y: lerp(a.y, b.y, u) + rand(-j, j), z: lerp(a.z, b.z, u) + rand(-j, j) }); }
    mesh.visible = true;
    FX.writeStrip(mesh, pts.concat(pts.slice().reverse()), w, cp, (i, out) => { const q = i < n ? o : c; out[0] = q[0]; out[1] = q[1]; out[2] = q[2]; }, n);
  },

  sync() {
    if (!this.ready) return;
    const t = Game.realTime, P = Game.player;
    for (const o of [this.thread, this.soulThread, ...this.shows()]) o.visible = false;
    this.syncPlayer(t);
    // a torn soul hangs on a thread back to you
    const soul = Game.hazards.find((h) => h.kind === 'soul' && !h.dead);
    if (soul && P && !P.dead) this.line(this.soulThread, soul.pos, P.chest(), 0.035, '#6a30c0', '#d8b0ff', 0.05);
    const r = Game.enemies.find((e) => e.type === 'reaper' && !e.dead), R = r && r.model;
    if (!r || !R) return;
    const a = r.act, I = r.intro;
    // the tear it arrives by, held open through its entry
    if (I && r.spawning && I.tearAt && I.open > 0.01) RiftViews.hold(I.tearAt, I.open, { h: 5.2, w: 2.3 });
    let jk = 0.12;
    if (a && a.kind === 'melee') jk = a.phase === 'swing' ? 1 : 0.2 + 0.5 * clamp(a.t / a.wind, 0, 1);
    else if (a && a.kind === 'whirl') jk = a.phase === 'wind' ? 0.2 + 0.8 * clamp(a.t / a.wind, 0, 1) : a.phase === 'spin' ? 1.2 : 0;
    else if (a && a.kind === 'throw' && a.phase === 'wind') jk = 0.3 + 0.7 * clamp(a.t / a.wind, 0, 1);
    this.jet(R, jk, R.mesh.visible && !r.scytheOut && !r.dying && r.stunT <= 0 && !(I && !I.lit) && !(a && a.kind === 'whirl' && a.phase === 'vent'));
    if (!R.mesh.visible) return;
    // the whirlwind: its reach on the ground, rings closing on it and a red shell as it winds up
    if (a && a.kind === 'whirl' && a.phase !== 'vent') {
      const g = r.pos.y + 0.07, wind = a.phase === 'wind', k = wind ? clamp(a.t / a.wind, 0, 1) : 1, fl = ((t * 20) | 0) % 2;
      this.ring.visible = this.disc.visible = true;
      this.ring.position.set(r.pos.x, g, r.pos.z); this.disc.position.set(r.pos.x, g - 0.01, r.pos.z);
      this.ring.scale.setScalar(RWHIRL.R); this.disc.scale.setScalar(RWHIRL.R);
      this.ring.material.opacity = wind ? 0.5 + 0.4 * k : fl ? 1 : 0.7;
      this.disc.material.opacity = wind ? 0.06 + 0.16 * k : 0.2;
      if (wind) {
        this.rings.forEach((m, i) => { const u = (t * 1.6 + i * 0.5) % 1; m.visible = true; m.position.set(r.pos.x, g, r.pos.z); m.scale.setScalar(lerp(RWHIRL.R, 1.2, u)); m.material.opacity = 0.7 * u; });
        const c = r.chest();
        this.shell.visible = true;
        this.shell.position.set(c.x, c.y - 0.3, c.z);
        this.shell.scale.setScalar(lerp(4.2, 2.1, k));
        this.shell.material.opacity = 0.1 + 0.2 * k;
      }
    }
    // the reaping: the thread from its left hand to you, thin while it reaches, taut and bright while it pulls
    if (a && a.kind === 'reap' && P && !P.dead) {
      const pull = a.phase === 'pull';
      this.line(this.thread, r.handL(), P.chest(), pull ? 0.11 : 0.05, pull ? '#b060ff' : '#5a2a9a', '#ffffff', pull ? 0.03 : 0.12);
    }
  },
  // REAP-R as the player: the jet, the whirlwind's reach as it charges and spins, the edge of its dread
  syncPlayer(t) {
    const P = Game.player, R = typeof Render !== 'undefined' && Render.rigs && Render.rigs.reaper;
    if (!R) return;
    if (!P || P.charId !== 'reaper' || P.dead || !R.mesh.visible) { this.jet(R, 0, false); return; }
    const A = P.attack, W = P.whirl;
    let jk = 0.1;
    if (W) jk = W.phase === 'charge' ? 0.2 + 0.8 * W.k : 1.2;
    else if (A && A.swept) jk = 1;
    else if (P.harvestT > 0 || P.iaido) jk = 1.2;
    this.jet(R, jk, !P.scytheOut && !(P.warpT > 0));
    const g = World.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.4), y = (g === -Infinity ? P.pos.y : g) + 0.07;
    if (W) {
      const Rr = W.phase === 'charge' ? lerp(RP_WHIRL.R0, RP_WHIRL.R1, W.k) : W.R, fl = ((t * 20) | 0) % 2;
      this.pRing.visible = this.pDisc.visible = true;
      this.pRing.position.set(P.pos.x, y, P.pos.z); this.pDisc.position.set(P.pos.x, y - 0.01, P.pos.z);
      this.pRing.scale.setScalar(Rr); this.pDisc.scale.setScalar(Rr);
      this.pRing.material.color.set(W.phase === 'charge' && W.k >= 1 && fl ? '#ffffff' : RIFT_COL.main);
      this.pRing.material.opacity = W.phase === 'charge' ? 0.35 + 0.5 * W.k : 0.9;
      this.pDisc.material.opacity = W.phase === 'charge' ? 0.05 + 0.08 * W.k : 0.16;
    } else if (P.onGround && Game.state === 'playing') {
      this.aura.visible = true;
      this.aura.position.set(P.pos.x, y, P.pos.z);
      this.aura.scale.setScalar(RP_DREAD.R);
      this.aura.material.opacity = 0.06 + 0.03 * Math.sin(t * 2);
    }
  },
  // its lights: the chest core, the blade (red as the whirlwind builds), a soul, the Harvest
  pushLights() {
    const P = Game.player, PR = typeof Render !== 'undefined' && Render.rigs && Render.rigs.reaper;
    if (P && P.charId === 'reaper' && !P.dead && PR && PR.mesh.visible && !P.scytheOut) {
      const b = P.bladeAt(0.6), W = P.whirl, s = P.sheathe, k = W ? (W.phase === 'charge' ? W.k : 1) : s && s.empowered ? s.charge || 0 : 0;
      Gfx.light(b.x, b.y, b.z, s && s.empowered && k >= 1 ? '#fff0c8' : RIFT_COL.main, 1.4 + 2.6 * k, 4 + 3 * k);
    }
    const r = Game.enemies.find((e) => e.type === 'reaper' && !e.dead);
    if (r && r.model && r.model.mesh.visible && !(r.dying && r.ko && (r.ko.stage === 'collapse' || r.ko.stage === 'down'))) {
      const c = r.chest(), a = r.act;
      Gfx.light(c.x, c.y, c.z, RIFT_COL.main, 1.6, 5);
      if (!r.scytheOut && !(r.intro && !r.intro.lit)) {
        const b = r.bladePos(), red = a && a.kind === 'whirl' && a.phase !== 'vent', gold = a && a.kind === 'melee' && a.phase === 'wind' && (a.m.big || a.glinted);
        Gfx.light(b.x, b.y, b.z, red ? '#ff2a3a' : gold ? '#ffd070' : RIFT_COL.main, red ? 3 + 4 * r.cueProgress() : gold ? 3 : 2.2, red ? 12 : 7);
      }
    }
    if (r && r.intro && r.spawning && r.intro.tearAt) { const q = r.intro.tearAt; Gfx.light(q.x, q.y, q.z, RIFT_COL.main, 2 + 6 * (r.intro.open || 0), 14); }
    for (const h of Game.hazards) {
      if (h.dead) continue;
      if (h.kind === 'soul') Gfx.light(h.pos.x, h.pos.y, h.pos.z, '#c890ff', 2.2 + 2 * h.pulse, 6);
      else if (h.kind === 'harvest') Gfx.light(h.pos.x, h.pos.y + 1.5, h.pos.z, RIFT_COL.main, 5, 14);
    }
    for (const b of Game.projectiles) if (b.kind === 'scythe' && !b.dead && !b.hidden) { Gfx.light(b.pos.x, b.pos.y, b.pos.z, RIFT_COL.main, 3, 7); break; }
  },

  // ---------- on the HUD ----------
  // Its dread: the screen's edges close in, in violet-black, pulsing with the heartbeat; and an arrow at the
  // screen's edge to your soul when it's out of view.
  drawHud(ctx, t) {
    const k = reaperDread();
    if (k > 0.05 && Game.state === 'playing' && !Game.cineActive()) {
      const beat = Math.pow(Math.max(0, Math.sin(t * lerp(5, 9, k))), 6), a = clamp(k * 0.6 + beat * 0.14 * k, 0, 0.8);
      const cx = VIEW_W / 2, cy = VIEW_H / 2, g = ctx.createRadialGradient(cx, cy, VIEW_H * lerp(0.62, 0.3, k), cx, cy, VIEW_W * 0.62);
      g.addColorStop(0, 'rgba(10,2,22,0)');
      g.addColorStop(1, `rgba(10,2,22,${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const soul = Game.hazards.find((h) => h.kind === 'soul' && !h.dead);
    if (soul && Game.state === 'playing' && !Game.cineActive()) Render.drawEdgeArrow(ctx, soul.pos, soul.t > SOUL.LIFE * 0.65 && ((t * 8) | 0) % 2 ? '#ffffff' : '#c080ff', t);
  },
};
