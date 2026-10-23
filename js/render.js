'use strict';
// Frame composition: character models and effects synced to the simulation, the 3D scene through Gfx,
// then the 480x270 pixel HUD on a canvas above it. The HUD is the 2D render.js HUD, plus the threat ring.

const Render = {
  hud: null, ctx: null, fps: 60, playerRig: null, hpTrail: 100, shTrail: 100,
  models: new Map(), pickups: new Map(), _v: null, _light: [0, 0, 0],

  init(glCanvas, hudCanvas) {
    Gfx.init(glCanvas);
    FX.init(Gfx.scene);
    this._v = new THREE.Vector3(); this._pv = new THREE.Vector3();
    this.hud = hudCanvas;
    hudCanvas.width = VIEW_W; hudCanvas.height = VIEW_H;
    this.ctx = hudCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.playerRig = Rig.build(MODELS.player);
    this.playerRig.mesh.visible = false;
    // yaw last, so the body's forward tilt and bank are about its own axes
    this.playerRig.mesh.rotation.order = 'YXZ';
    Gfx.scene.add(this.playerRig.mesh);
    this.pickupGeo = Gfx.boxGeometry([{ min: { x: -0.08, y: -0.22, z: -0.08 }, max: { x: 0.08, y: 0.22, z: 0.08 } }, { min: { x: -0.22, y: -0.08, z: -0.08 }, max: { x: 0.22, y: 0.08, z: 0.08 } }]);
    this.pickupMat = new THREE.MeshBasicMaterial({ color: '#5aff7a' });
    Views.init();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  // Compiles every shader the game uses while it loads, so the first scrapper, swing or kill doesn't hitch.
  // Three deletes a compiled program once no material uses it, so one material of each kind is kept for good.
  keep: [],
  prewarm() {
    const g = new THREE.Group(), r = Rig.build(MODELS.scrapper), ra = Rig.build(MODELS.aegis);
    r.outline.visible = true;
    ra.blade.visible = true;
    g.add(r.mesh, ra.mesh);
    for (const glow of [false, true]) g.add(new THREE.Mesh(r.parts[0].geo, FX.gibMaterial('#ffffff', glow)));
    g.add(new THREE.Mesh(this.pickupGeo, this.pickupMat));
    const o = { x: 0, y: 1, z: 0 };
    FX.swoosh({ x: 0, y: 1, z: 0, yaw: 0, r: 1, span: 1 });
    FX.slashLine(o, { x: 1, y: 1, z: 0 });
    FX.bolt(o, { x: 0, y: 2, z: 0 });
    FX.ring(o, 0.1, 1, 0.2);
    FX.glint(o);
    // a ground mark's material, kept so marks never compile mid-fight
    const decal = Gfx.decalMaterial('crack', o);
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decal));
    Views.prewarmShow(g);
    // the sawblade and the tutorial's marker, built now so they never compile mid-run
    SawView.build(); Tutorial.buildMarker();
    SawView.g.visible = Tutorial.marker.visible = true;
    Gfx.scene.add(g);
    this.playerRig.mesh.visible = true;
    Gfx.renderer.compile(Gfx.scene, Gfx.camera);
    this.playerRig.mesh.visible = false;
    Views.prewarmHide();
    SawView.g.visible = Tutorial.marker.visible = false;
    Gfx.scene.remove(g);
    this.keep.push(r.mat, r.outline.material, ra.mat, ra.blade.children[0].material, decal, ...FX.detachAll());
  },
  // The 2D game's 16:9 frame; the 3D view renders at the frame's native size times the resolution scale.
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
    const w = Math.floor(VIEW_W * scale), h = Math.floor(VIEW_H * scale);
    const app = document.getElementById('app');
    app.style.width = w + 'px';
    app.style.height = h + 'px';
    // touch screens get larger menus and buttons (a finger, not a cursor)
    app.style.setProperty('--ui-scale', (typeof Touch !== 'undefined' && Touch.on() ? Math.max(h / 720, Math.min(1, h / 540)) : h / 720).toFixed(3));
    document.getElementById('scanlines').style.backgroundSize = '100% ' + Math.max(2, Math.round(scale)) + 'px';
    // Retro renders at the 2D game's 480x270; the canvas is already scaled up without smoothing
    if (S.visuals.retro) { Gfx.resize(VIEW_W, VIEW_H); return; }
    // phones have very dense screens and less to draw with: touch caps the pixel ratio lower
    const k = Math.min(typeof Touch !== 'undefined' && Touch.on() ? 1.5 : 2, window.devicePixelRatio || 1) * S.visuals.resScale;
    Gfx.resize(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k)));
  },
  // Characters are drawn between simulation ticks, so nothing stutters on fast screens.
  interp() {
    const a = clamp(Game.acc * 120, 0, 1), L = (o) => {
      const r = o.rp || (o.rp = { x: 0, y: 0, z: 0 });
      r.x = lerp(o.prev.x, o.pos.x, a); r.y = lerp(o.prev.y, o.pos.y, a); r.z = lerp(o.prev.z, o.pos.z, a);
    };
    if (Game.player) L(Game.player);
    for (const e of Game.enemies) L(e);
  },
  // screen position on the 480x270 HUD, or null behind the camera
  project(p) {
    const v = this._v.set(p.x, p.y, p.z).project(Gfx.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * VIEW_W, y: ((1 - v.y) / 2) * VIEW_H, off: v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1 };
  },
  // A character standing between the camera and the player fades out: any of its feet, middle or head
  // close to a sight line from the camera to the player's chest or the pivot, or it's right at the lens.
  inCameraLine(e) {
    const P = Game.player;
    if (!P) return false;
    const a = Camera.pos, r = e.r + 0.3, pr = P.rp || P.pos;
    const ends = [{ x: pr.x, y: pr.y + P.chestH(), z: pr.z }, Camera.pivot];
    const q = e.rp || e.pos;
    for (const k of [0.15, 0.5, 0.9]) {
      const p = { x: q.x, y: q.y + e.h * k, z: q.z };
      if (dist3(p, a) < 1.6) return true;
      for (const b of ends) {
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, l2 = dx * dx + dy * dy + dz * dz;
        const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / l2, 0, 1) : 0;
        if (t < 0.92 && Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t), p.z - (a.z + dz * t)) < r) return true;
      }
    }
    return false;
  },
  feet(uniform, p) {
    const L = World.lightAt(p.x, p.y + 1, p.z, undefined, undefined, undefined, this._light);
    uniform.value.setRGB(L[0], L[1], L[2]);
  },

  syncModels(realDt) {
    const seen = new Set();
    for (const e of Game.enemies) {
      if (e.dead || !MODELS[e.type]) continue;
      seen.add(e);
      let R = this.models.get(e);
      if (!R) {
        R = Rig.build(MODELS[e.type]);
        R.mesh.rotation.order = 'YXZ';
        Gfx.scene.add(R.mesh);
        this.models.set(e, R);
        e.model = R;
      }
      const p = e.rp || e.pos;
      R.mesh.visible = e.showModel ? e.showModel() : !e.spawning;
      // a body that pitches over (the rival's knockout) lies on the street, not half in it
      R.mesh.position.set(p.x, p.y + Math.abs(Math.sin(e.tilt || 0)) * 0.35, p.z);
      R.mesh.rotation.set(e.tilt || 0, e.yaw, 0);
      Poses[e.type](R, e);
      if (e.emissive) R.mat.emissive.setScalar(e.emissive());
      else R.mat.emissive.setRGB(e.hitFlash > 0 ? 0.8 : e.cutMark && ((Game.realTime * 30) | 0) % 2 ? 0.6 : 0, e.hitFlash > 0 ? 0.8 : 0, e.hitFlash > 0 ? 0.8 : 0);
      const oc = e.outline ? e.outline() : e.elite ? '#ffd070' : null;
      R.outline.visible = !!oc;
      if (oc) R.outline.material.color.set(oc);
      const want = this.inCameraLine(e) ? 0.25 : 1;
      e.fade = approach(e.fade, want, realDt * 6);
      R.mat.opacity = e.fade;
      R.mat.depthWrite = e.fade > 0.99;
      this.feet(R.feet, p);
      // drones fly in the dark over the lamps: a floor under their shading keeps them readable against the sky
      if (e.type === 'drone') { const f = R.feet.value; f.setRGB(Math.max(f.r, 0.32), Math.max(f.g, 0.32), Math.max(f.b, 0.38)); }
    }
    for (const [e, R] of this.models) {
      if (seen.has(e)) continue;
      // the rival's body stays where it fell, as its husk
      if (e.husk && !e.husk.rig && !e.husk.dead) { e.husk.rig = R; R.outline.visible = false; this.models.delete(e); continue; }
      Gfx.scene.remove(R.mesh);
      R.geo.dispose(); R.mat.dispose(); R.outline.material.dispose();
      this.models.delete(e);
    }
    const live = new Set(Game.pickups);
    for (const pk of Game.pickups) {
      let m = this.pickups.get(pk);
      if (!m) { m = new THREE.Mesh(this.pickupGeo, this.pickupMat); Gfx.scene.add(m); this.pickups.set(pk, m); }
      m.position.set(pk.pos.x, pk.pos.y + 0.35 + Math.sin(pk.t * 5) * 0.08, pk.pos.z);
      m.rotation.y = pk.t * 2.5;
      m.visible = !(pk.t > 11 && ((pk.t * 10) | 0) % 2);
    }
    for (const [pk, m] of this.pickups) if (!live.has(pk)) { Gfx.scene.remove(m); this.pickups.delete(pk); }
    // the player: posed from the 2D pose, fading when the camera comes close, blinking while hurt
    const P = Game.player, R = this.playerRig;
    // the sawblade stands in for the body (ultimates.js)
    R.mesh.visible = !!P && !P.ult;
    SawView.sync();
    if (P) {
      const p = P.rp || P.pos, py = P.pivotY || 0;
      R.mesh.rotation.set(P.tilt || 0, P.yaw, P.bank || 0);
      // the body tips and rolls about a point pivotY up (the feet on the ground, its middle in the air)
      const v = this._pv.set(0, py, 0).applyEuler(R.mesh.rotation);
      R.mesh.position.set(p.x - v.x, p.y + py - v.y, p.z - v.z);
      PlayerPose.apply(R, P);
      // first person looks out from the model's eyes, wherever the pose has put the head (crouched, sliding,
      // leaning into a sprint), kept as an offset from the body so the camera never lags it
      const hv = Rig.boneWorld(R, 'head', this._hv || (this._hv = new THREE.Vector3()));
      P.eyeOff = { x: hv.x - p.x + fwdX(P.yaw) * 0.06, y: hv.y - p.y + 0.13, z: hv.z - p.z + fwdZ(P.yaw) * 0.06 };
      const want = Camera.fp || Camera.curDist >= 1 ? 1 : clamp(Camera.curDist - 0.4, 0, 1) / 0.6;
      const blink = P.blinkT > 0 && P.hurtT <= 0 && ((Game.realTime * 30) | 0) % 2 ? 0.55 : 1;
      R.mat.opacity = want * blink;
      R.mat.depthWrite = R.mat.opacity > 0.99;
      // the blade's halo burns brighter as the beam charges, and gold once it's full
      const ck = P.charging ? P.charging.k : 0, hot = ck >= 1 && ((Game.realTime * 16) | 0) % 2;
      R.extras[0].material.opacity = Math.min(1, 0.2 * want * (1 + 3.5 * ck));
      R.extras[0].material.color.set(ck >= 1 ? (hot ? '#ffd070' : '#ff8a3a') : '#ff1a2e');
      // in first person the screen's own hit effects stand in for the body's white flash
      R.mat.emissive.setScalar(P.hurtT > 0.12 && !Camera.fp ? 0.8 : 0);
      this.feet(R.feet, p);
    }
  },
  // the drawn blade lights what's around it
  bladeLight() {
    const P = Game.player, R = this.playerRig;
    if (P && P.ult) { const c = P.rp || P.pos; Gfx.light(c.x, c.y + SAW.R, c.z, '#ff2a48', 3, 7); return; }
    if (!P || P.dead || !R.mesh.visible) return;
    const v = this._v.set(0, 0.55, 0.03);
    R.bones.weapon.localToWorld(v);
    const sh = P.sheathe, ck = P.charging ? P.charging.k : sh && sh.empowered ? sh.charge : 0;
    Gfx.light(v.x, v.y, v.z, ck >= 1 ? '#ffb040' : '#ff2030', P.sheathe || P.idleT > 2.5 ? 0.5 : 1.4 + 2.6 * ck, 3.5 + 3 * ck);
    // in a Blackout you carry a little light of your own, as in 2D
    if (World.blackout) { const c = P.rp || P.pos; Gfx.light(c.x, c.y + 2.2, c.z, '#c8a0b8', 2.2, 11); }
  },

  draw(realDt) {
    this.fps = lerp(this.fps, 1 / Math.max(realDt, 0.001), 0.05);
    const G = Game, t = G.realTime;
    Gfx.flicker(t, realDt);
    Gfx.processRebake();
    this.syncModels(realDt);
    Views.sync();
    Tutorial.syncMarker(t);
    Training.sync(t);
    FX.sync(Gfx.camera);
    // bullet time drains the colour from the lit world; glowing parts and effects stay bright
    Gfx.desat.value = G.bulletK() * 0.85;
    Gfx.nearCut.value = Camera.fp && G.state === 'playing' ? 0.28 : 0;
    Gfx.beginFrame();
    this.bladeLight();
    BossViews.pushLights();
    Views.pushLights();
    FX.pushLights();
    Gfx.endFrame();
    Gfx.render();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    FPFX.render(ctx, realDt);
    this.drawTexts(ctx);
    if (FX.flashA > 0) {
      ctx.globalAlpha = Math.min(0.7, FX.flashA);
      ctx.fillStyle = FX.flashColor;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.globalAlpha = 1;
      FX.flashA = Math.max(0, FX.flashA - realDt * 6);
    }
    const inGame = G.player && (G.state === 'playing' || G.state === 'paused' || G.state === 'over' || G.state === 'pick');
    if (inGame && !G.cineActive()) this.drawHUD(ctx, realDt);
    if (inGame && G.cine) this.drawCine(ctx, G.cine, t);
    if (S.visuals.showFps) drawText(ctx, Math.round(this.fps) + ' FPS', VIEW_W - 4, VIEW_H - 9, { align: 'right', color: '#7a849c' });
  },
  drawTexts(ctx) {
    for (const tx of FX.texts) {
      if (!tx.always && !S.visuals.damageNumbers) continue;
      const k = tx.t / tx.dur;
      if (k > 0.7 && ((tx.t * 20) | 0) % 2) continue;
      const s = this.project(tx);
      if (!s || s.off) continue;
      const pop = tx.t < 0.08 ? 1 + (1 - tx.t / 0.08) : 1;
      drawText(ctx, tx.str, s.x, s.y, { color: tx.c, scale: Math.round(tx.scale * pop), align: 'center' });
    }
  },

  // ---------- HUD (from the 2D render.js) ----------
  drawHUD(ctx, dt) {
    const G = Game, p = G.player, t = G.realTime;
    this.hpTrail = this.hpTrail > p.hp ? Math.max(p.hp, this.hpTrail - dt * 40) : p.hp;
    this.shTrail = this.shTrail > p.shield ? Math.max(p.shield, this.shTrail - dt * 60) : p.shield;
    const x = 8, y = 8, w = 96;
    // shield
    ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#0e2230'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#d8f4ff'; ctx.fillRect(x, y, Math.round((w * this.shTrail) / PC.MAX_SHIELD), 4);
    const flash = p.shieldFlash > 0 && ((t * 20) | 0) % 2;
    ctx.fillStyle = flash ? '#ff3048' : p.shield < PC.TETHER_COST ? '#2a7aa0' : '#3ad0ff';
    ctx.fillRect(x, y, Math.round((w * p.shield) / PC.MAX_SHIELD), 4);
    ctx.fillStyle = '#a8ecff'; ctx.fillRect(x, y, Math.round((w * p.shield) / PC.MAX_SHIELD), 1);
    ctx.fillStyle = '#0b0910';
    for (let i = 1; i * PC.TETHER_COST < PC.MAX_SHIELD; i++) ctx.fillRect(x + Math.round((w * i * PC.TETHER_COST) / PC.MAX_SHIELD), y + 3, 1, 1);
    if (p.shieldDelay <= 0 && p.shield < PC.MAX_SHIELD && ((t * 6) | 0) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.round((w * p.shield) / PC.MAX_SHIELD), y, 1, 4); }
    if (p.shieldFullFlash > 0) { ctx.globalAlpha = p.shieldFullFlash / 0.45; ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 1, y - 1, w + 2, 6); ctx.globalAlpha = 1; }
    // hp
    const y2 = y + 7;
    ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, y2 - 1, w + 2, 6);
    ctx.fillStyle = '#300a12'; ctx.fillRect(x, y2, w, 4);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y2, Math.round((w * this.hpTrail) / PC.MAX_HP), 4);
    const low = p.hp < 30 && ((t * 5) | 0) % 2;
    ctx.fillStyle = low ? '#ff8a9a' : '#ff3048'; ctx.fillRect(x, y2, Math.round((w * p.hp) / PC.MAX_HP), 4);
    ctx.fillStyle = '#ff9aa8'; ctx.fillRect(x, y2, Math.round((w * p.hp) / PC.MAX_HP), 1);
    if (p.shieldOffT > 0) {
      ctx.fillStyle = ((t * 6) | 0) % 2 ? '#2a3a46' : '#1a2630'; ctx.fillRect(x, y, w, 4);
      drawText(ctx, 'OFF ' + Math.ceil(p.shieldOffT), x + w + 4, y - 1, { color: '#5a7a8a' });
    } else drawText(ctx, String(Math.ceil(p.shield)), x + w + 4, y - 1, { color: '#3ad0ff' });
    drawText(ctx, String(Math.ceil(p.hp)), x + w + 4, y2 - 1, { color: '#ff5a6a' });
    // dash charges
    for (let i = 0; i < PC.DASH_CHARGES; i++) {
      const dx = x + 3 + i * 9, dy = y2 + 10;
      const full = i < p.dashCharges;
      const part = i === p.dashCharges ? p.dashRecharge / PC.DASH_RECHARGE : 0;
      ctx.fillStyle = '#0b0910'; this.diamond(ctx, dx, dy, 4);
      ctx.fillStyle = full ? '#ffffff' : '#3a1a24'; this.diamond(ctx, dx, dy, 3);
      if (!full && part > 0) this.fillDiamond(ctx, dx, dy, part, '#ff3a52');
    }
    drawText(ctx, 'DASH', x + 22, y2 + 8, { color: '#7a849c' });
    // upgrades picked this run
    let ux = x;
    for (const id of G.upgrades) {
      ctx.fillStyle = '#0b0910'; ctx.fillRect(ux - 1, y2 + 17, 13, 9);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(ux, y2 + 18, 11, 7);
      drawText(ctx, UPGRADES[id].tag, ux + 6, y2 + 19, { align: 'center', color: '#ffd070', outline: null });
      ux += 14;
    }
    // parry stance: cooldown and shield cost
    {
      const px = x + 48, py = y2 + 10;
      const cdK = p.parryCD > 0 ? 1 - p.parryCD / PC.PARRY_CD : 1;
      const afford = p.shield >= PC.PARRY_COST || S.gameplay.invincible;
      const fl = p.parryFlash > 0 && ((t * 20) | 0) % 2;
      ctx.fillStyle = '#0b0910'; this.diamond(ctx, px, py, 4);
      ctx.fillStyle = fl ? '#ff3048' : p.sheathe ? '#ffe8a0' : cdK >= 1 && afford ? '#ffd070' : '#3a2a1a'; this.diamond(ctx, px, py, 3);
      if (cdK < 1) this.fillDiamond(ctx, px, py, cdK, '#ffd070');
      drawText(ctx, 'PARRY', px + 7, y2 + 8, { color: afford ? '#7a849c' : '#5a4a4a' });
    }
    // utility: fills as its cooldown runs down, flashes when pressed too early; a charge fills it white-hot
    // and it flickers gold once full
    const U = p.utility();
    if (U) {
      const ux = x + 88, uy = y2 + 10, C = p.charging;
      const k = p.utilCD > 0 ? 1 - p.utilCD / U.cooldown : 1;
      const fl = p.utilFlash > 0 && ((t * 20) | 0) % 2;
      ctx.fillStyle = '#0b0910'; this.diamond(ctx, ux, uy, 4);
      ctx.fillStyle = fl ? '#ffffff' : C ? '#3a1a24' : k >= 1 ? '#ff3a52' : '#3a1a24'; this.diamond(ctx, ux, uy, 3);
      if (C) this.fillDiamond(ctx, ux, uy, Math.max(0.05, C.k), C.k >= 1 ? (((t * 16) | 0) % 2 ? '#ffffff' : '#ffd070') : '#ffd0d8');
      else if (k < 1) this.fillDiamond(ctx, ux, uy, k, '#a01c30');
      drawText(ctx, (hudKey('utility') + ' ' + U.hud).trim(), ux + 7, y2 + 8, { color: k >= 1 ? '#7a849c' : '#5a4a5a' });
    }
    // wave info
    const D = Director;
    if (D.wave > 0) {
      const label = G.mode === 'duel' ? 'MELEE DUEL' : G.mode === 'boss' ? 'RIVAL FIGHT' : (G.mode === 'demo' ? 'DEMO ' : 'ENDLESS ') + 'WAVE ' + D.wave;
      drawText(ctx, label, VIEW_W / 2, 6, { align: 'center', color: '#ffd0d8' });
      let sub;
      if (D.state === 'fight') sub = D.remaining() + ' HOSTILES' + (D.modifier ? ' - ' + WAVE_MODIFIERS[D.modifier].name : '');
      else if (D.state === 'break') sub = D.wave >= D.lastWave() ? '' : 'NEXT WAVE ' + Math.ceil(D.breakT);
      if (sub) drawText(ctx, sub, VIEW_W / 2, 14, { align: 'center', color: '#9a8aa8' });
    }
    // score + combo
    drawText(ctx, String(G.stats.score).padStart(7, '0'), VIEW_W - 8, 6, { align: 'right', color: '#ffffff' });
    if (G.combo >= 2) {
      const pop = G.comboPop > 0 ? 1 : 0;
      drawText(ctx, G.combo + ' HIT', VIEW_W - 8, 16 - pop, { align: 'right', color: '#ff8a9a', scale: 2 });
    }
    // style rank: grows with varied moves, multiplies score and ultimate charge
    const rank = G.rank();
    if (rank || G.style > 1) {
      const i = rank ? STYLE_RANKS.indexOf(rank) : STYLE_RANKS.length;
      const next = STYLE_RANKS[i - 1], lo = rank ? rank.th : 0;
      const k = next ? clamp((G.style - lo) / (next.th - lo), 0, 1) : 1;
      if (rank) {
        const big = G.rankPop > 0 ? 4 : 3;
        drawText(ctx, rank.r, VIEW_W - 8, 30 - (big - 3) * 2, { align: 'right', color: rank.c, scale: big });
        drawText(ctx, 'x' + rank.mul.toFixed(2), VIEW_W - 8, 47, { align: 'right', color: '#9a8aa8' });
      }
      const bw = 40;
      ctx.fillStyle = '#300a12'; ctx.fillRect(VIEW_W - 8 - bw, 54, bw, 2);
      ctx.fillStyle = rank ? rank.c : '#9ab0d0'; ctx.fillRect(VIEW_W - 8 - bw, 54, Math.round(bw * k), 2);
    }
    // announcements: big between fights, smaller and higher up while enemies are active
    const combat = D.state === 'fight' && G.enemies.some((e) => !e.dead && !e.spawning);
    let ay = combat ? 34 : 64;
    for (const a of G.announcements) {
      const k = a.t / a.dur;
      const sc = combat ? (a.small ? 1 : 2) : a.small ? 1 : a.t < 0.1 ? 4 : 3;
      const step = combat ? (a.small ? 15 : 22) : a.small ? 16 : 32;
      if (k > 0.8 && ((a.t * 20) | 0) % 2) { ay += step; continue; }
      const slide = a.t < 0.12 ? Math.round((1 - a.t / 0.12) * 30) : 0;
      drawText(ctx, a.text, VIEW_W / 2 + slide, ay, { align: 'center', color: a.color, scale: sc, outline: '#0b0910' });
      if (a.sub) drawText(ctx, a.sub, VIEW_W / 2 - slide, ay + sc * 5 + 3, { align: 'center', color: '#e8d8e0', outline: combat ? '#0b0910' : undefined });
      ay += step;
    }
    if (p.hp < 30 && !p.dead) {
      ctx.globalAlpha = 0.18 + Math.sin(t * 6) * 0.08;
      ctx.fillStyle = '#ff0020';
      ctx.fillRect(0, 0, VIEW_W, 3); ctx.fillRect(0, VIEW_H - 3, VIEW_W, 3); ctx.fillRect(0, 0, 3, VIEW_H); ctx.fillRect(VIEW_W - 3, 0, 3, VIEW_H);
      ctx.globalAlpha = 1;
    }
    const boss = G.enemies.find((e) => e.isBoss && !e.dead && !e.spawning);
    if (boss) this.drawBossBar(ctx, boss, t);
    if (G.state === 'playing') {
      if (S.visuals.indicators) this.drawThreatRing(ctx, p, t);
      const bt = G.bulletK();
      if (bt > 0 && (G.btKind === 'riposte' || G.btKind === 'peril')) this.drawParryCue(ctx, bt, t);
      else if (bt > 0) this.drawReboundCue(ctx, p, bt, t);
      this.drawCrosshair(ctx, p);
    }
    if (G.mode === 'training') Training.drawHud(ctx, t);
    if (p.ult && G.state === 'playing') SawView.drawHud(ctx, p, t);
    this.drawUltMeter(ctx, x + 9, y2 + 31, p, t);
  },
  // the ultimate's meter: twelve teeth filling round a disc as kills charge it, spinning and flashing when
  // it's ready (hold the key), turning while the saw runs
  drawUltMeter(ctx, cx, cy, p, t) {
    const ready = p.ultCharge >= 1, active = !!p.ult;
    const spin = active ? p.ult.spin : ready ? t * 4 : 0, n = 12;
    for (let i = 0; i < n; i++) {
      const a = spin + (i / n) * TAU - Math.PI / 2;
      const lit = active || i / n < p.ultCharge;
      ctx.fillStyle = '#0b0910';
      pline(ctx, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, cx + Math.cos(a + 0.3) * 9, cy + Math.sin(a + 0.3) * 9, 3);
      ctx.fillStyle = lit ? (ready && ((t * 8) | 0) % 2 ? '#ffffff' : '#ff3048') : '#3a1a24';
      pline(ctx, cx + Math.cos(a) * 5, cy + Math.sin(a) * 5, cx + Math.cos(a + 0.3) * 8, cy + Math.sin(a + 0.3) * 8, 1);
    }
    ctx.fillStyle = '#0b0910'; pdisc(ctx, cx, cy, 5);
    ctx.fillStyle = active || ready ? '#b8142a' : '#3a1a24'; pdisc(ctx, cx, cy, 4);
    if (p.ultHold > 0) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 16 * p.ultHold; i++) { const a = -Math.PI / 2 + (i / 16) * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 11), 1, 1); }
    }
    const key = hudKey('ultimate');
    if (active) drawText(ctx, 'SAWBLADE', cx + 13, cy - 3, { color: '#ffffff' });
    else drawText(ctx, (ready ? key + ' ' : '') + 'SAWBLADE', cx + 13, cy - 3, { color: ready ? (((t * 3) | 0) % 2 ? '#ff8a9a' : '#ffffff') : '#5a4a5a' });
  },
  // ---------- the rival ----------
  // Its health along the bottom of the screen with the half-health mark of phase 1 and its shield.
  drawBossBar(ctx, b, t) {
    const w = 220, x = Math.round(VIEW_W / 2 - w / 2), y = VIEW_H - 18;
    drawText(ctx, b.name, x, y - 9, { color: '#bfd4ff' });
    ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
    ctx.fillStyle = '#300a12'; ctx.fillRect(x, y, w, 4);
    const k = Math.max(0, b.hp) / b.maxHp;
    ctx.fillStyle = b.stunT > 0 && ((t * 10) | 0) % 2 ? '#ffffff' : '#4a7aff'; ctx.fillRect(x, y, Math.round(w * k), 4);
    ctx.fillStyle = '#a8c4ff'; ctx.fillRect(x, y, Math.round(w * k), 1);
    if (!b.duel && b.phase === 1) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w / 2, y - 2, 1, 8); }
    if (b.shield) {
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#9cc4ff';
      for (let i = 0; i < w; i += 2) if (((i + ((t * 20) | 0)) >> 1) % 3) ctx.fillRect(x + i, y, 1, 4);
      ctx.globalAlpha = 1;
    }
  },
  // Its riposte (gold) or red flash (red) in bullet time: a reticle on its eye closes as the flash nears.
  drawParryCue(ctx, k, t) {
    const r = Game.btOwner, p = Game.player, peril = Game.btKind === 'peril';
    if (!r || r.dead || !p || p.dead || !r.visorPos) return;
    const s = this.project(r.visorPos());
    if (!s) return;
    const col = peril ? '#ff2a3a' : '#ffd070', q = r.cueProgress ? r.cueProgress() : 1;
    // speed lines converging on the middle of the view, where you are
    ctx.globalAlpha = 0.3 * k;
    ctx.fillStyle = peril ? '#ffd0d4' : '#fff4d0';
    const cx = VIEW_W / 2, cy = VIEW_H / 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + Math.sin(i * 5.1) * 0.2, r0 = 50 + ((i * 29 + ((t * 260) | 0)) % 80), r1 = r0 + 22 + (i % 3) * 8;
      pline(ctx, cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, 1);
    }
    ctx.globalAlpha = 1;
    const rr = Math.round(4 + (1 - q) * 16);
    ctx.fillStyle = q >= 1 && ((t * 20) | 0) % 2 ? '#ffffff' : col;
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + Math.PI / 4;
      pline(ctx, s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, s.x + Math.cos(a) * (rr + 4), s.y + Math.sin(a) * (rr + 4), 1);
    }
  },
  // Cutscene letterbox bars, the skip prompt, captions, and the title and knockout cards.
  drawCine(ctx, C, t) {
    const k = easeOutCubic(clamp(C.bars, 0, 1)), bh = Math.round(30 * k);
    if (bh <= 0) return;
    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, VIEW_W, bh); ctx.fillRect(0, VIEW_H - bh, VIEW_W, bh);
    if (C.skippable && !C.closing && k > 0.9) {
      const hold = clamp(C.skipHold / 0.5, 0, 1);
      drawText(ctx, 'HOLD ' + (Touch.on() ? 'PARRY' : hudKey('sheathe')) + ' TO SKIP', VIEW_W - 8, VIEW_H - 12, { align: 'right', color: hold > 0 ? '#ffffff' : '#7a6a7a' });
      ctx.fillStyle = '#3a3040'; ctx.fillRect(VIEW_W - 58, VIEW_H - 5, 50, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(VIEW_W - 58, VIEW_H - 5, Math.round(50 * hold), 1);
    }
    if (C.caption && k > 0.9) {
      const cap = C.caption;
      drawText(ctx, cap.text, VIEW_W / 2, VIEW_H - bh + 7, { align: 'center', color: cap.color || '#ffffff', scale: 2 });
      if (cap.sub) drawText(ctx, cap.sub, VIEW_W / 2, VIEW_H - bh + 20, { align: 'center', color: '#9a8aa8' });
    }
    if (C.big && C.big.style === 'title') this.drawTitleCard(ctx, C.big, C.bigT);
    else if (C.big) {
      const bt = C.bigT, sc = bt < 0.08 ? 9 : bt < 0.16 ? 7 : 6;
      const shake = bt < 0.3 ? Math.round((Math.random() - 0.5) * 4 * (1 - bt / 0.3)) : 0;
      drawText(ctx, C.big.text, VIEW_W / 2 + shake, VIEW_H / 2 - sc * 3 + shake, { align: 'center', color: C.big.color || '#ffd070', scale: sc, outline: '#0b0910' });
      if (C.big.sub && bt > 0.5) drawText(ctx, C.big.sub, VIEW_W / 2, VIEW_H / 2 + sc * 3 + 6, { align: 'center', color: '#e8d8e0', outline: '#0b0910' });
    }
  },
  // A boss title: rules wipe out from the centre, the name slams in, then the subtitle.
  drawTitleCard(ctx, B, bt) {
    const y = 52, col = B.color || '#7aa8ff', cxm = VIEW_W / 2;
    const w = Math.round(easeOutCubic(clamp(bt / 0.22, 0, 1)) * 150);
    ctx.fillStyle = col;
    ctx.fillRect(cxm - w, y - 9, w * 2, 1); ctx.fillRect(cxm - w, y + 40, w * 2, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cxm - w - 1, y - 11, 1, 5); ctx.fillRect(cxm + w, y - 11, 1, 5);
    ctx.fillRect(cxm - w - 1, y + 38, 1, 5); ctx.fillRect(cxm + w, y + 38, 1, 5);
    if (B.tag && bt > 0.1) drawText(ctx, B.tag, cxm, y - 19, { align: 'center', color: '#7a9aa6' });
    if (bt > 0.12) {
      const t2 = bt - 0.12, sc = t2 < 0.05 ? 8 : 6;
      const shake = t2 < 0.25 ? Math.round((Math.random() - 0.5) * 4 * (1 - t2 / 0.25)) : 0;
      drawText(ctx, B.text, cxm + shake, y + (6 - sc) * 2.5 + 3 + shake, { align: 'center', color: t2 < 0.08 ? '#ffffff' : col, scale: sc, outline: '#0b0910' });
    }
    if (B.sub && bt > 0.55) drawText(ctx, B.sub, cxm, y + 45, { align: 'center', color: '#e8d8e0', outline: '#0b0910' });
  },
  // Bullet time on a tethered grenade: speed lines converging on it, a closing reticle, and the line
  // the kick will send it along (toward the crosshair).
  drawReboundCue(ctx, p, k, t) {
    const T = p.tether;
    if (!T || T.mode !== 'rebound' || !T.target) return;
    const s = this.project(T.target.pos);
    if (!s) return;
    const gx = s.x, gy = s.y;
    ctx.globalAlpha = 0.35 * k;
    ctx.fillStyle = '#e0f0ff';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + Math.sin(i * 7.3) * 0.2, r0 = 70 + ((i * 37 + ((t * 240) | 0)) % 90), r1 = r0 + 26 + (i % 3) * 10;
      pline(ctx, gx + Math.cos(a) * r0, gy + Math.sin(a) * r0, gx + Math.cos(a) * r1, gy + Math.sin(a) * r1, 1);
    }
    ctx.globalAlpha = 1;
    const rr = 6 + 14 * clamp(Game.btT / Game.btDur, 0, 1);
    ctx.fillStyle = '#ffd070';
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2) + t * 3;
      pline(ctx, gx + Math.cos(a) * rr, gy + Math.sin(a) * rr, gx + Math.cos(a) * (rr + 4), gy + Math.sin(a) * (rr + 4), 1);
    }
    const cx = VIEW_W / 2, cy = VIEW_H / 2, L = Math.hypot(cx - gx, cy - gy) || 1;
    for (let d = 14; d < L; d += 5) {
      ctx.fillStyle = d < 60 ? '#ffffff' : '#ffd070';
      ctx.fillRect(Math.round(gx + ((cx - gx) * d) / L), Math.round(gy + ((cy - gy) * d) / L), 1, 1);
    }
  },
  diamond(ctx, cx, cy, r) {
    for (let yy = -r; yy <= r; yy++) { const h = r - Math.abs(yy); ctx.fillRect(cx - h, cy + yy, h * 2 + 1, 1); }
  },
  fillDiamond(ctx, cx, cy, k, color) {
    ctx.fillStyle = color;
    const hh = Math.round(k * 7);
    for (let yy = 0; yy < hh; yy++) { const ry = cy + 3 - yy, half = 3 - Math.abs(ry - cy); if (half >= 0) ctx.fillRect(cx - half, ry, half * 2 + 1, 1); }
  },
  // Threats the camera can't show sit on a ring around the crosshair, in the direction they are:
  // ahead at the top, behind at the bottom. White while winding up, bright on a glint, red where a hit came from.
  drawThreatRing(ctx, p, t) {
    const cx = VIEW_W / 2, cy = VIEW_H / 2, R = 30;
    const mark = (yaw, color, size) => {
      const a = angDiff(Camera.yaw, yaw), mx = cx - Math.sin(a) * R, my = cy - Math.cos(a) * R;
      const ox = -Math.sin(a), oy = -Math.cos(a);
      ctx.fillStyle = '#0b0910'; ctx.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 5, 5);
      ctx.fillStyle = color;
      for (let i = 0; i < size; i++) {
        const px = mx + ox * (1 - i), py = my + oy * (1 - i);
        ctx.fillRect(Math.round(px - oy * i * 0.7), Math.round(py + ox * i * 0.7), 1, 1);
        ctx.fillRect(Math.round(px + oy * i * 0.7), Math.round(py - ox * i * 0.7), 1, 1);
        ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
      }
    };
    // the Glints Only modifier leaves just the glints and where hits came from
    const glintsOnly = Game.mod('glints');
    for (const e of Game.enemies) {
      // (the training dummy standing idle isn't a threat)
      if (e.dead || glintsOnly || (e.type === 'dummy' && e.state === 'idle')) continue;
      const s = this.project(e.center());
      if (s && !s.off) continue;
      const yaw = yawOf(e.pos.x - Camera.pos.x, e.pos.z - Camera.pos.z);
      mark(yaw, e.windingUp() ? (((t * 12) | 0) % 2 ? '#ffffff' : '#ff3030') : e.spawning ? '#ff9a3a' : '#ff5a3a', e.windingUp() ? 4 : 3);
    }
    for (const g of FX.glints) {
      if (!g.threat) continue;
      const s = this.project(g);
      if (s && !s.off) continue;
      mark(yawOf(g.x - Camera.pos.x, g.z - Camera.pos.z), '#ffe8a0', 5);
    }
    for (const m of p.hitMarks) if (((m.t * 16) | 0) % 2) mark(m.yaw, '#ff1030', 5);
  },
  // Red while the tether would catch something (an enemy, barrel or grenade near the line, or a surface in
  // reach) and you can pay for it; grey otherwise.
  drawCrosshair(ctx, p) {
    const x = VIEW_W / 2, y = VIEW_H / 2;
    const hand = p.hand(), afford = p.ult || p.shield >= PC.TETHER_COST || S.gameplay.invincible;
    const target = p.tetherTarget(hand);
    const live = !Tutorial.locked('tether') && ((target && (afford || target.kind === 'grenade')) || (afford && dist3(Camera.aim, hand) <= PC.TETHER_RANGE));
    const col = live ? '#ff3a52' : '#7a6a7a';
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - 5, y - 1, 3, 3); ctx.fillRect(x + 3, y - 1, 3, 3); ctx.fillRect(x - 1, y - 5, 3, 3); ctx.fillRect(x - 1, y + 3, 3, 3);
    ctx.fillStyle = col;
    ctx.fillRect(x - 4, y, 2, 1); ctx.fillRect(x + 3, y, 2, 1); ctx.fillRect(x, y - 4, 1, 2); ctx.fillRect(x, y + 3, 1, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
    // the sword beam's charge: a ring round the crosshair filling clockwise, flickering gold once full
    const C = p.charging;
    if (C && C.k > 0) {
      const N = 32, R = 9, n = Math.ceil(C.k * N), full = C.k >= 1, flick = ((Game.realTime * 16) | 0) % 2;
      const pts = [];
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / N) * TAU; pts.push([Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R)]); }
      ctx.fillStyle = '#0b0910';
      for (const [px, py] of pts) ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.fillStyle = full ? (flick ? '#ffffff' : '#ffd070') : '#ff8a9a';
      for (const [px, py] of pts) ctx.fillRect(px, py, 1, 1);
    }
    // the parry counter's charge: a gold ring filling clockwise, with a tick at each tier; flickering white
    // and pulsing out once full
    const sh = p.sheathe;
    if (sh && sh.empowered) {
      const k = sh.charge, N = 40, full = k >= 1, flick = ((Game.realTime * 16) | 0) % 2;
      const R = full ? 11 + Math.round(Math.abs(Math.sin(Game.realTime * 9)) * 2) : 11, n = Math.max(1, Math.ceil(k * N));
      const pts = [];
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / N) * TAU; pts.push([Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R)]); }
      ctx.fillStyle = '#0b0910';
      for (const [px, py] of pts) ctx.fillRect(px - 1, py - 1, 3, 3);
      for (let t = 1; t < COUNTER.TIERS; t++) { const a = -Math.PI / 2 + (t / COUNTER.TIERS) * TAU; ctx.fillRect(Math.round(x + Math.cos(a) * R) - 2, Math.round(y + Math.sin(a) * R) - 2, 5, 5); }
      ctx.fillStyle = full ? (flick ? '#ffffff' : '#ffd070') : '#ffb040';
      for (const [px, py] of pts) ctx.fillRect(px, py, 1, 1);
      for (let t = 1; t < COUNTER.TIERS; t++) {
        const a = -Math.PI / 2 + (t / COUNTER.TIERS) * TAU;
        ctx.fillStyle = k >= t / COUNTER.TIERS ? '#ffffff' : '#5a4a3a';
        ctx.fillRect(Math.round(x + Math.cos(a) * R) - 1, Math.round(y + Math.sin(a) * R) - 1, 3, 3);
      }
    }
  },
};
