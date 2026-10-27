'use strict';
// KRAG's effects in the world, synced each rendered frame: the mohawk of flame fed by its heat (tearing up off
// its head at full heat), the smouldering footprints it leaves, the chain from its right hand when it swings
// on a post or a corner, the Molten Fist's red shell and the wedge of street it will blow apart, the mark where
// a leap will land, and the molten vents its stomps raise (through Views). Every material is made once here
// or shares a shader with one that is, and compiled in Render.prewarm.

const KragViews = {
  ready: false, kinds: new Set(['vent']), prints: [], PRINTS: 28, _gt: 0,

  init() {
    const add = BossViews.add, G = BossViews.geos;
    this.wedgeGeo = this.fanGeo(FIST.HALF, 18);
    // the footprints: one instanced quad, an additive ember print that cools to nothing
    const quad = new THREE.PlaneGeometry(0.34, 0.6).rotateX(-Math.PI / 2);
    this.footMat = new THREE.MeshBasicMaterial({ map: this.printTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.foot = new THREE.InstancedMesh(quad, this.footMat, this.PRINTS);
    this.foot.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.PRINTS * 3), 3);
    this.foot.frustumCulled = false; this.foot.renderOrder = 1;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color(); this._y = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.PRINTS; i++) { this.foot.setMatrixAt(i, this._m.makeScale(0, 0, 0)); this.foot.setColorAt(i, this._c.setRGB(0, 0, 0)); }
    Gfx.scene.add(this.foot);
    this.chain = FX.stripMesh(16);
    this.chain.visible = false;
    // the Fist: the red shell closing on it, rings closing on its feet, the lane it lunges down and the wedge
    this.aura = new THREE.Mesh(G.sphere, add('#ff2a3a', { opacity: 0.2, side: THREE.FrontSide }));
    this.auraRings = [0, 1].map(() => new THREE.Mesh(G.flatRing, add('#ff2a3a', { opacity: 0.9 })));
    this.wedge = new THREE.Mesh(this.wedgeGeo, add('#ff2a3a', { opacity: 0.35 }));
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5), add('#ff2a3a', { opacity: 0.3 }));
    // a leap's landing: a ring and a cross on the street
    this.mark = new THREE.Group();
    const mr = new THREE.Mesh(G.flatRing, add(KRAG_ORANGE, { opacity: 0.9 })), mx1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.14), add(KRAG_ORANGE, { opacity: 0.9 })), mx2 = mx1.clone();
    mx1.rotation.y = Math.PI / 4; mx2.rotation.y = -Math.PI / 4; mx2.material = mx1.material;
    this.mark.add(mr, mx1, mx2);
    this.mark.userData = { mr, mx: mx1.material };
    // the circle it will swing round, faint on the street
    this.circle = new THREE.Mesh(G.flatRing, add(KRAG_ORANGE, { opacity: 0.35 }));
    for (const o of [this.aura, ...this.auraRings, this.wedge, this.lane, this.mark, this.circle]) { o.visible = false; o.renderOrder = 2; Gfx.scene.add(o); }
    this.ready = true;
  },
  // a flat fan pointing down -z, unit radius, half-angle h, its apex at the origin
  fanGeo(h, n) {
    const pos = [0, 0, 0], idx = [];
    for (let i = 0; i <= n; i++) { const a = lerp(-h, h, i / n); pos.push(Math.sin(a), 0, -Math.cos(a)); }
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  },
  // a blocky boot print, toes forward (-z): white on black, for additive glow
  printTexture() {
    const c = makeCanvas(16, 28), g = c.ctx;
    g.fillStyle = '#000000'; g.fillRect(0, 0, 16, 28);
    g.fillStyle = '#ffffff';
    g.fillRect(3, 9, 10, 9); g.fillRect(4, 19, 8, 7);
    for (const x of [2, 6, 10]) g.fillRect(x, 2, 4, 5);
    g.fillStyle = '#7a7a7a'; g.fillRect(5, 11, 6, 5);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  prewarmShow(group) {
    if (!this.ready) this.init();
    this.foot.setMatrixAt(0, this._m.makeTranslation(0, 0, 0)); this.foot.setColorAt(0, this._c.setRGB(1, 0.5, 0.2));
    this.foot.instanceMatrix.needsUpdate = true; this.foot.instanceColor.needsUpdate = true;
    for (const o of [this.chain, this.aura, this.auraRings[0], this.wedge, this.lane, this.mark, this.circle]) o.visible = true;
  },
  prewarmHide() {
    this.foot.setMatrixAt(0, this._m.makeScale(0, 0, 0)); this.foot.instanceMatrix.needsUpdate = true;
    for (const o of [this.chain, this.aura, this.auraRings[0], this.wedge, this.lane, this.mark, this.circle]) o.visible = false;
  },
  // a footprint where a foot came down (kragboss.js calls it from a footfall)
  footprint(q, yaw, side) {
    this.prints.push({ x: q.x, y: q.y, z: q.z, yaw: yaw + (side === 'R' ? -0.08 : 0.08), t: Game.time });
    if (this.prints.length > this.PRINTS) this.prints.shift();
  },

  // ---------- vents through Views ----------
  make(o) {
    if (o.kind !== 'vent') return null;
    const add = BossViews.add, G = BossViews.geos;
    const disc = new THREE.Mesh(G.disc, add(KRAG_ORANGE, { opacity: 0.4 })), ring = new THREE.Mesh(G.flatRing, add('#ffd070', { opacity: 0.9 }));
    const col = new THREE.Mesh(G.tube, add('#ff5a1a', { opacity: 0.7 })), core = new THREE.Mesh(G.tube, add('#ffe0a0', { opacity: 0.9 }));
    const g = new THREE.Group();
    g.add(disc, ring, col, core);
    g.renderOrder = 2;
    for (const m of g.children) m.renderOrder = 2;
    Gfx.scene.add(g);
    return { krag: true, g, disc, ring, col, core };
  },
  update(o, v, t) {
    const p = o.pos, R = o.R, cp = Gfx.camera.position;
    // a column of fire beside the lens would fill the view: it thins out as the camera comes close
    const near = clamp((Math.hypot(cp.x - p.x, cp.z - p.z) - 1.5) / 5, 0.2, 1);
    v.g.position.set(p.x, p.y + 0.05, p.z);
    if (o.phase === 'tell') {
      // a glowing pool that brightens and pulses faster as it nears eruption
      const k = clamp(o.t / o.delay, 0, 1), pulse = 0.5 + 0.5 * Math.sin(t * (10 + 30 * k));
      v.disc.scale.setScalar(R * (0.5 + 0.5 * k)); v.disc.material.opacity = 0.15 + 0.35 * k * (0.6 + 0.4 * pulse);
      v.ring.scale.setScalar(R); v.ring.material.opacity = 0.3 + 0.6 * k;
      v.ring.material.color.set(k > 0.8 && ((t * 20) | 0) % 2 ? '#ffffff' : '#ffd070');
      v.col.visible = v.core.visible = false;
    } else if (o.phase === 'erupt') {
      const k = clamp(o.t / VENT.ERUPT, 0, 1), up = easeOutCubic(clamp(o.t / 0.08, 0, 1)), wob = 1 + Math.sin(t * 50) * 0.08;
      v.col.visible = v.core.visible = true;
      v.col.scale.set(R * 0.5 * wob, 4.2 * up, R * 0.5 * wob); v.core.scale.set(R * 0.16, 4.6 * up, R * 0.16);
      v.col.material.opacity = 0.42 * (1 - k * 0.5) * near; v.core.material.opacity = 0.7 * (1 - k * 0.4) * near;
      v.disc.scale.setScalar(R * 1.2); v.disc.material.opacity = 0.6;
      v.ring.scale.setScalar(R * (1 + k * 0.6)); v.ring.material.opacity = 0.8 * (1 - k);
    } else {
      const k = clamp(o.t / 0.4, 0, 1);
      v.col.scale.y = 4.2 * (1 - k); v.core.scale.y = 4.6 * (1 - k);
      v.col.material.opacity = 0.2 * (1 - k); v.core.material.opacity = 0.35 * (1 - k);
      v.disc.material.opacity = 0.6 * (1 - k); v.ring.material.opacity = 0;
    }
  },
  dispose(v) {
    Gfx.scene.remove(v.g);
    for (const m of v.g.children) m.material.dispose();
  },

  // ---------- KRAG itself ----------
  sync() {
    if (!this.ready) return;
    const t = Game.realTime, cp = Gfx.camera.position;
    for (const o of [this.chain, this.aura, ...this.auraRings, this.wedge, this.lane, this.mark, this.circle]) o.visible = false;
    this.syncPrints();
    const r = Game.enemies.find((e) => e.type === 'krag' && !e.dead), R = r && r.model;
    if (!r || !R) return;
    this.syncMohawk(r, R, t);
    if (!R.mesh.visible) return;
    const a = r.act;
    // the chain from its right hand to the post or corner
    if (a && a.kind === 'swing' && (a.phase === 'fire' || a.phase === 'reel' || a.phase === 'orbit')) {
      const h = r.fistR(), k = a.phase === 'fire' ? a.line : 1, n = 8, pts = [];
      const b = { x: lerp(h.x, a.hook.x, k), y: lerp(h.y, a.hook.y, k), z: lerp(h.z, a.hook.z, k) };
      for (let i = 0; i < n; i++) { const u = i / (n - 1), j = i && i < n - 1 ? 0.05 : 0; pts.push({ x: lerp(h.x, b.x, u) + rand(-j, j), y: lerp(h.y, b.y, u) + rand(-j, j) - Math.sin(u * Math.PI) * (a.phase === 'orbit' ? 0 : 0.25), z: lerp(h.z, b.z, u) + rand(-j, j) }); }
      const outer = hexLinear('#ff6a1a'), core = hexLinear('#ffe0b0');
      this.chain.visible = true;
      FX.writeStrip(this.chain, pts.concat(pts.slice().reverse()), 0.08, cp, (i, out) => { const c = i < n ? outer : core; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }, n);
      const C = a.plan.C;
      this.circle.visible = a.phase !== 'fire';
      this.circle.position.set(C.x, r.pos.y + 0.05, C.z);
      this.circle.scale.setScalar(a.plan.R);
    }
    // the Fist winding up: a red shell closing on it, rings closing on its feet, and the street it will blow
    // apart: the lane its lunge takes and the wedge beyond, white once its visor flashes
    if (a && a.kind === 'punch' && a.phase === 'wind') {
      const k = r.cueProgress(), c = r.chest(), flash = k >= 1, p = r.rp || r.pos;
      this.aura.visible = true;
      this.aura.position.set(c.x, c.y - 0.4, c.z);
      this.aura.scale.set(lerp(3.8, 1.9, k), lerp(3.6, 2.4, k), lerp(3.8, 1.9, k));
      this.aura.material.color.set(flash && ((t * 30) | 0) % 2 ? '#ffffff' : '#ff2a3a');
      this.aura.material.opacity = flash ? 0.45 : 0.1 + 0.3 * k;
      this.auraRings.forEach((m, i) => {
        const u = flash ? 1 : (k * 1.6 + i * 0.5) % 1;
        m.visible = true;
        m.position.set(p.x, p.y + 0.06, p.z);
        m.scale.setScalar(lerp(9, 1.8, u));
        m.material.color.set(flash ? '#ffffff' : '#ff2a3a');
        m.material.opacity = flash ? 0.9 : 0.3 + 0.6 * u;
      });
      const yaw = a.locked ? a.lockYaw : r.yaw, d = Math.hypot(a.tx - p.x, a.tz - p.z), L = clamp(d - 1.4, 0, FIST.LUNGE), show = clamp((a.t / a.wind - 0.2) / 0.3, 0, 1);
      if (show > 0) {
        const ax = p.x + fwdX(yaw) * (L - 0.5), az = p.z + fwdZ(yaw) * (L - 0.5), col = flash && ((t * 24) | 0) % 2 ? '#ffffff' : '#ff2a3a';
        this.wedge.visible = true;
        this.wedge.position.set(ax, p.y + 0.07, az);
        this.wedge.rotation.y = yaw;
        this.wedge.scale.setScalar(FIST.CONE);
        this.wedge.material.color.set(col); this.wedge.material.opacity = (0.12 + 0.25 * k) * show;
        if (L > 0.6) {
          this.lane.visible = true;
          this.lane.position.set(p.x, p.y + 0.065, p.z);
          this.lane.rotation.y = yaw;
          this.lane.scale.set(1.6, 1, L);
          this.lane.material.color.set(col); this.lane.material.opacity = (0.1 + 0.2 * k) * show;
        }
      }
    }
    // a leap's landing mark, blinking faster as it comes down
    if (a && a.kind === 'jump' && a.phase !== 'land') {
      const U = this.mark.userData, L = r.leap, near = L ? clamp(L.t / L.T, 0, 1) : 0;
      const on = ((t * (a.phase === 'air' ? 8 + 16 * near : 6)) | 0) % 2;
      this.mark.visible = true;
      this.mark.position.set(a.to.x, a.to.y + 0.06, a.to.z);
      this.mark.scale.setScalar(a.phase === 'crouch' ? lerp(2.8, 1.8, clamp(a.t / a.wind, 0, 1)) : lerp(1.8, KJUMP.R / 0.95, near));
      U.mr.material.color.set(near > 0.75 && on ? '#ffffff' : on ? KRAG_ORANGE : '#ffb040');
      U.mx.color.copy(U.mr.material.color);
    }
  },
  // The mohawk: tongues sized by the heat, flickering, swept back by its speed; torn up tall and wide at full
  // heat; a flicker while stunned; dark before it's lit and once it's down.
  syncMohawk(r, R, t) {
    const F = R.flames;
    if (!F) return;
    const ko = r.dying && r.ko && (r.ko.stage === 'collapse' || r.ko.stage === 'down');
    F.g.visible = R.mesh.visible && !ko && !(r.intro && !r.intro.lit);
    if (!F.g.visible) return;
    const k = r.heatK(), max = r.charged(), stun = r.stunT > 0, flare = r.act && r.act.kind === 'flare';
    const size = stun ? 0.25 : r.dying ? 0.4 : max ? (flare ? 2.4 : 1.9) : 0.45 + 0.75 * k;
    const sp = Math.hypot(r.vel.x, r.vel.z), back = clamp(sp / 20, 0, 0.7) + 0.15;
    F.g.rotation.x = back;
    for (const q of F.tongues) {
      const fl = 0.75 + 0.25 * Math.sin(t * (max ? 31 : 19) + q.ph) + 0.12 * Math.sin(t * 47 + q.ph * 2.3);
      const h = 0.42 * q.base * size * fl, w = 0.06 * (0.8 + 0.4 * size) * (0.9 + 0.1 * fl);
      q.g.scale.set(w, h, w * 1.3);
    }
    F.outer.color.set(max ? (((t * 14) | 0) % 2 ? '#ff9a3a' : '#ff6a1a') : stun ? '#7a2a10' : '#ff5a1a');
    F.inner.color.set(max ? '#fff0c0' : '#ffd060');
    F.outer.opacity = stun ? 0.5 : 0.85;
  },
  syncPrints() {
    const now = Game.time, M = this.foot, n0 = this._n || 0;
    this.prints = this.prints.filter((q) => now - q.t < 6 && now >= q.t);
    for (let i = 0; i < this.PRINTS; i++) {
      const q = this.prints[i];
      if (!q) { M.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; }
      const age = (now - q.t) / 6, k = Math.pow(1 - age, 1.6);
      this._q.setFromAxisAngle(this._y, q.yaw);
      this._p.set(q.x, q.y + 0.015, q.z); this._s.set(1, 1, 1);
      M.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      M.setColorAt(i, this._c.setRGB(1.0 * k, (0.42 + 0.3 * k) * k, 0.12 * k * k));
    }
    if (n0 || this.prints.length) { M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; }
    this._n = this.prints.length;
  },
  // its lights: the chest core and the mohawk by the heat, the fist as it charges or guards charged, vents
  pushLights() {
    const r = Game.enemies.find((e) => e.type === 'krag' && !e.dead);
    if (r && r.model && r.model.mesh.visible && !(r.dying && r.ko && (r.ko.stage === 'collapse' || r.ko.stage === 'down'))) {
      const k = r.heatK(), c = r.chest(), a = r.act;
      Gfx.light(c.x, c.y, c.z, '#ff7a2a', 0.8 + 2.2 * k, 4 + 3 * k);
      if (!(r.intro && !r.intro.lit)) { const h = r.crestPos(); Gfx.light(h.x, h.y + 0.3, h.z, '#ff9a3a', r.charged() ? 3.5 : 1 + 1.5 * k, 5 + 3 * k); }
      const hot = a && ((a.kind === 'punch' && a.phase === 'wind') || (a.kind === 'guard' && a.charged));
      if (hot) { const f = r.fistPos(), q = a.kind === 'punch' ? r.cueProgress() : 1; Gfx.light(f.x, f.y, f.z, a.kind === 'punch' ? (q >= 1 ? '#ffffff' : '#ff2a3a') : '#ffd070', 2 + 4 * q, 6 + 6 * q); }
      if (r.intro && r.spawning && r.intro.stage === 'fall') Gfx.light(r.pos.x, r.pos.y + 1.5, r.pos.z, '#ff8a2a', 6, 18);
    }
    let n = 0;
    for (const h of Game.hazards) {
      if (h.kind !== 'vent' || h.phase !== 'erupt' || n >= 2) continue;
      Gfx.light(h.pos.x, h.pos.y + 1.6, h.pos.z, '#ff7a2a', 3, 7); n++;
    }
  },
};
