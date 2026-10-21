'use strict';
// Frame composition: character models and effects synced to the simulation, the 3D scene through Gfx,
// then the 480x270 pixel HUD on a canvas above it. The HUD is the 2D render.js HUD, plus the threat ring.

const Render = {
  hud: null, ctx: null, fps: 60, standIn: null, hpTrail: 100, shTrail: 100,
  models: new Map(), pickups: new Map(), _v: null, _light: [0, 0, 0],

  init(glCanvas, hudCanvas) {
    Gfx.init(glCanvas);
    FX.init(Gfx.scene);
    this._v = new THREE.Vector3();
    this.hud = hudCanvas;
    hudCanvas.width = VIEW_W; hudCanvas.height = VIEW_H;
    this.ctx = hudCanvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.standIn = Gfx.standIn();
    this.standIn.visible = false;
    Gfx.scene.add(this.standIn);
    this.pickupGeo = Gfx.boxGeometry([{ min: { x: -0.08, y: -0.22, z: -0.08 }, max: { x: 0.08, y: 0.22, z: 0.08 } }, { min: { x: -0.22, y: -0.08, z: -0.08 }, max: { x: 0.22, y: 0.08, z: 0.08 } }]);
    this.pickupMat = new THREE.MeshBasicMaterial({ color: '#5aff7a' });
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  // Compiles every shader the game uses while it loads, so the first scrapper, swing or kill doesn't hitch.
  // Three deletes a compiled program once no material uses it, so one material of each kind is kept for good.
  keep: [],
  prewarm() {
    const g = new THREE.Group(), r = Rig.build(MODELS.scrapper);
    r.outline.visible = true;
    g.add(r.mesh);
    for (const glow of [false, true]) g.add(new THREE.Mesh(r.parts[0].geo, FX.gibMaterial('#ffffff', glow)));
    g.add(new THREE.Mesh(this.pickupGeo, this.pickupMat));
    const o = { x: 0, y: 1, z: 0 };
    FX.swoosh({ x: 0, y: 1, z: 0, yaw: 0, r: 1, span: 1 });
    FX.slashLine(o, { x: 1, y: 1, z: 0 });
    FX.bolt(o, { x: 0, y: 2, z: 0 });
    FX.ring(o, 0.1, 1, 0.2);
    FX.glint(o);
    Gfx.scene.add(g);
    Gfx.renderer.compile(Gfx.scene, Gfx.camera);
    Gfx.scene.remove(g);
    this.keep.push(r.mat, r.outline.material, ...FX.detachAll());
  },
  // The 2D game's 16:9 frame; the 3D view renders at the frame's native size times the resolution scale.
  resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
    const w = Math.floor(VIEW_W * scale), h = Math.floor(VIEW_H * scale);
    const app = document.getElementById('app');
    app.style.width = w + 'px';
    app.style.height = h + 'px';
    app.style.setProperty('--ui-scale', (h / 720).toFixed(3));
    document.getElementById('scanlines').style.backgroundSize = '100% ' + Math.max(2, Math.round(scale)) + 'px';
    const k = Math.min(2, window.devicePixelRatio || 1) * S.visuals.resScale;
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
      if (e.dead || !MODELS[e.def.model]) continue;
      seen.add(e);
      let R = this.models.get(e);
      if (!R) {
        R = Rig.build(MODELS[e.def.model]);
        Gfx.scene.add(R.mesh);
        this.models.set(e, R);
        e.model = R;
      }
      const p = e.rp || e.pos;
      R.mesh.visible = !e.spawning;
      R.mesh.position.set(p.x, p.y, p.z);
      R.mesh.rotation.y = e.yaw;
      Poses[e.type](R, e);
      R.mat.emissive.setRGB(e.hitFlash > 0 ? 0.8 : e.cutMark && ((Game.realTime * 30) | 0) % 2 ? 0.6 : 0, e.hitFlash > 0 ? 0.8 : 0, e.hitFlash > 0 ? 0.8 : 0);
      R.outline.visible = !!e.elite;
      const want = this.inCameraLine(e) ? 0.25 : 1;
      e.fade = approach(e.fade, want, realDt * 6);
      R.mat.opacity = e.fade;
      R.mat.depthWrite = e.fade > 0.99;
      this.feet(R.feet, p);
    }
    for (const [e, R] of this.models) {
      if (seen.has(e)) continue;
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
    // the player stand-in: squashes to the crouch and slide heights, leans into dashes, fades when the camera is close
    const P = Game.player, S0 = this.standIn;
    S0.visible = !!P;
    if (P) {
      const p = P.rp || P.pos;
      S0.position.set(p.x, p.y, p.z);
      S0.rotation.set(P.dead ? -Math.PI / 2 * Math.min(1, P.deadT * 3) : P.dashT > 0 ? -0.35 : P.sliding ? 0.5 : 0, P.yaw, 0, 'YXZ');
      S0.scale.y = P.h / PC.H;
      const want = Camera.curDist < 1 ? clamp(Camera.curDist - 0.4, 0, 1) / 0.6 : 1;
      const blink = P.iframes > 0 && P.hurtT > 0 && ((Game.realTime * 20) | 0) % 2 ? 0.4 : 1;
      for (const m of S0.userData.mats) m.opacity = want * blink;
      this.feet(S0.userData.feet, p);
    }
  },

  draw(realDt) {
    this.fps = lerp(this.fps, 1 / Math.max(realDt, 0.001), 0.05);
    const G = Game, t = G.realTime;
    for (const m of Gfx.fireMats) m.color.setRGB(1, 0.55 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.3), 0.2);
    this.syncModels(realDt);
    FX.sync(Gfx.camera);
    Gfx.beginFrame();
    FX.pushLights();
    Gfx.endFrame();
    Gfx.render();

    const ctx = this.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
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
    // wave info
    const D = Director;
    if (D.wave > 0) {
      const label = G.mode === 'scrappers' ? 'SCRAPPER WAVE ' + D.wave : G.mode === 'duel' ? 'MELEE DUEL' : G.mode === 'boss' ? 'RIVAL FIGHT' : (G.mode === 'demo' ? 'DEMO ' : 'ENDLESS ') + 'WAVE ' + D.wave;
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
    if (G.state === 'playing') {
      if (S.visuals.indicators) this.drawThreatRing(ctx, p, t);
      this.drawCrosshair(ctx);
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
    for (const e of Game.enemies) {
      if (e.dead) continue;
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
  drawCrosshair(ctx) {
    const x = VIEW_W / 2, y = VIEW_H / 2;
    const col = Camera.aimEnemy ? '#ff3a52' : '#c8b8c8';
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - 5, y - 1, 3, 3); ctx.fillRect(x + 3, y - 1, 3, 3); ctx.fillRect(x - 1, y - 5, 3, 3); ctx.fillRect(x - 1, y + 3, 3, 3);
    ctx.fillStyle = col;
    ctx.fillRect(x - 4, y, 2, 1); ctx.fillRect(x + 3, y, 2, 1); ctx.fillRect(x, y - 4, 1, 2); ctx.fillRect(x, y + 3, 1, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1);
  },
};
