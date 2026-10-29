'use strict';
// KRAG's effects in the world, synced each rendered frame: the mohawk of flame fed by its heat (tearing up off
// its head at full heat), the smouldering footprints it leaves, the glowing cracks its stomps, slams and
// landings split in the street (white hot, cooling through orange to nothing), fireballs, the halo round a
// limb winding a stopper (gold) or the arm coming up to guard (blue), the chain from its right hand when it
// swings on a post or a corner, the Molten Fist's red shell and the cone of street it will split open, the
// molten chasm it leaves, the mark where a leap will land, and the molten vents its stomps raise (through Views). Every material is made
// once here or shares a shader with one that is, and compiled in Render.prewarm.

const KragViews = {
  ready: false, kinds: new Set(['vent']), prints: [], PRINTS: 28, _gt: 0, cracks: [], balls: [],
  CRACKS: { burst: 24, burst2: 24, line: 14 }, BALLS: 10, CHASMS: 2,

  init() {
    const add = BossViews.add, G = BossViews.geos;
    this.wedgeGeo = this.fanGeo(FIST.HALF, 18);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color(); this._y = new THREE.Vector3(0, 1, 0);
    // the footprints: one instanced quad, an additive ember print that cools to nothing
    const quad = new THREE.PlaneGeometry(0.34, 0.6).rotateX(-Math.PI / 2);
    this.footMat = new THREE.MeshBasicMaterial({ map: this.printTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.foot = this.instanced(quad, this.footMat, this.PRINTS, 1);
    // the cracks: two round bursts and a long split, each an instanced additive quad
    this.crackMesh = {};
    for (const k of Object.keys(this.CRACKS)) {
      const geo = k === 'line' ? new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5) : new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: this.crackTexture(k), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.crackMesh[k] = this.instanced(geo, mat, this.CRACKS[k], 1);
    }
    // the Fist's chasm: the cone of street split open, fissures fanning out over a molten floor (instanced, so
    // it shares the cracks' shader)
    this.chasmMat = new THREE.MeshBasicMaterial({ map: this.chasmTexture(), color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.chasm = this.instanced(this.fanUVGeo(FIST.HALF, 24), this.chasmMat, this.CHASMS, 1);
    // fireballs: an outer shell and a white core, swelling and burning out
    this.ballPool = [];
    for (let i = 0; i < this.BALLS; i++) {
      const outer = new THREE.Mesh(G.sphere, add('#ff8a2a', { opacity: 0.8, side: THREE.FrontSide })), core = new THREE.Mesh(G.sphere, add('#fff0c0', { opacity: 0.9, side: THREE.FrontSide }));
      for (const m of [outer, core]) { m.visible = false; m.renderOrder = 3; Gfx.scene.add(m); }
      this.ballPool.push({ outer, core });
    }
    // the halo round a limb as a tell: gold for a stopper, blue for the guard coming up
    this.halo = new THREE.Mesh(G.sphere, add('#ffd070', { opacity: 0.4, side: THREE.FrontSide }));
    this.haloCore = new THREE.Mesh(G.sphere, add('#ffffff', { opacity: 0.6, side: THREE.FrontSide }));
    this.chain = FX.stripMesh(16);
    this.chain.visible = false;
    // the Fist: the red shell closing on it, rings closing on its feet, and the cone it will split open
    this.aura = new THREE.Mesh(G.sphere, add('#ff2a3a', { opacity: 0.2, side: THREE.FrontSide }));
    this.auraRings = [0, 1, 2].map(() => new THREE.Mesh(G.flatRing, add('#ff2a3a', { opacity: 0.9 })));
    this.wedge = new THREE.Mesh(this.wedgeGeo, add('#ff2a3a', { opacity: 0.35 }));
    this.wedgeEdge = new THREE.Mesh(this.fanEdgeGeo(FIST.HALF, 18), add('#ff2a3a', { opacity: 0.9 }));
    // a leap's landing: a ring and a cross on the street
    this.mark = new THREE.Group();
    const mr = new THREE.Mesh(G.flatRing, add(KRAG_ORANGE, { opacity: 0.9 })), mx1 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.02, 0.14), add(KRAG_ORANGE, { opacity: 0.9 })), mx2 = mx1.clone();
    mx1.rotation.y = Math.PI / 4; mx2.rotation.y = -Math.PI / 4; mx2.material = mx1.material;
    this.mark.add(mr, mx1, mx2);
    this.mark.userData = { mr, mx: mx1.material };
    // the circle it will swing round, faint on the street
    this.circle = new THREE.Mesh(G.flatRing, add(KRAG_ORANGE, { opacity: 0.35 }));
    for (const o of this.shows()) { o.visible = false; o.renderOrder = 2; Gfx.scene.add(o); }
    this.ready = true;
  },
  shows() { return [this.halo, this.haloCore, this.aura, ...this.auraRings, this.wedge, this.wedgeEdge, this.mark, this.circle]; },
  instanced(geo, mat, n, order) {
    const M = new THREE.InstancedMesh(geo, mat, n);
    M.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    M.frustumCulled = false; M.renderOrder = order;
    for (let i = 0; i < n; i++) { M.setMatrixAt(i, this._m.makeScale(0, 0, 0)); M.setColorAt(i, this._c.setRGB(0, 0, 0)); }
    Gfx.scene.add(M);
    return M;
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
  // the fan with texture coordinates: across it in u, out from the apex in v
  fanUVGeo(h, n) {
    const pos = [0, 0, 0], uv = [0.5, 0], idx = [];
    for (let i = 0; i <= n; i++) { const a = lerp(-h, h, i / n); pos.push(Math.sin(a), 0, -Math.cos(a)); uv.push(i / n, 1); }
    // wound to face up, like the cracks' quads, so it shares their shader
    for (let i = 1; i <= n; i++) idx.push(0, i + 1, i);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  },
  // The chasm in the fan's own space (the apex along the bottom edge, its end along the top): fissures running
  // out from the apex and branching, splits across them, molten pools, all over a faint glowing floor.
  chasmTexture() {
    const W = 128, H = 256, c = makeCanvas(W, H), g = c.ctx, R = mulberry32(2711), segs = [];
    g.fillStyle = '#000000'; g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { const a = 0.04 + 0.07 * R() * R(); g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; g.fillRect(x, y, 4, 4); }
    const walk = (x, y, a, L, w0, depth, bend = 0.45) => {
      for (let s = 0; s < L; s += 1.5) {
        a += (R() - 0.5) * bend;
        x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
        if (x < 1 || y < 1 || x > W - 2 || y > H - 2) return;
        const u = s / L;
        segs.push([x, y, lerp(w0, 1.2, u), lerp(1, 0.6, u)]);
        if (depth < 2 && R() < 0.03) walk(x, y, a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.7), L * (0.2 + R() * 0.3), Math.max(1, lerp(w0, 1, u) * 0.7), depth + 1);
      }
    };
    for (let i = 0; i < 8; i++) walk(8 + (i / 7) * (W - 16) + (R() - 0.5) * 8, H - 2, -Math.PI / 2 + (R() - 0.5) * 0.2, H - 6, 6, 0, 0.3);
    for (let i = 0; i < 18; i++) walk(R() * W, 10 + R() * (H - 20), (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.5, 14 + R() * 30, 3, 1);
    for (let i = 0; i < 26; i++) { const x = R() * W, y = R() * H, r = 2 + R() * 4; g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(Math.round(x - r), Math.round(y - r / 2), Math.round(r * 2), Math.round(r)); }
    for (const [x, y, w] of segs) { g.fillStyle = 'rgba(255,255,255,0.1)'; const d = Math.round(w + 6); g.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d); }
    for (const [x, y, w, a] of segs) { g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; const d = Math.max(1, Math.round(w)); g.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  // the fan's rim and sides as a thin band, so the wedge's edge reads hard against the street
  fanEdgeGeo(h, n) {
    const pos = [], idx = [], w = 0.035, quad = (a, b, c, d) => { const i = pos.length / 3; pos.push(...a, ...b, ...c, ...d); idx.push(i, i + 1, i + 2, i, i + 2, i + 3); };
    for (let i = 0; i < n; i++) {
      const a0 = lerp(-h, h, i / n), a1 = lerp(-h, h, (i + 1) / n);
      quad([Math.sin(a0) * (1 - w), 0, -Math.cos(a0) * (1 - w)], [Math.sin(a0), 0, -Math.cos(a0)], [Math.sin(a1), 0, -Math.cos(a1)], [Math.sin(a1) * (1 - w), 0, -Math.cos(a1) * (1 - w)]);
    }
    for (const s of [-1, 1]) {
      const ux = Math.sin(h * s), uz = -Math.cos(h * s), nx = -uz * s * w * 0.6, nz = ux * s * w * 0.6;
      quad([0, 0, 0], [ux, 0, uz], [ux + nx, 0, uz + nz], [nx, 0, nz]);
    }
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
  // Cracks as white on black for additive glow: jagged splits that thin as they run out and branch, each with a
  // faint wide glow round a hard core. 'burst' and 'burst2' run out all round a white-hot middle; 'line' runs
  // up the texture from the bottom edge, widening into a fan of branches (the Fist's split down the street).
  crackTexture(kind) {
    const W = 128, H = kind === 'line' ? 256 : 128, c = makeCanvas(W, H), g = c.ctx, R = mulberry32(kind === 'burst' ? 71 : kind === 'burst2' ? 193 : 457);
    g.fillStyle = '#000000'; g.fillRect(0, 0, W, H);
    const segs = [];
    const walk = (x, y, a, L, w0, depth, bend = 0.5) => {
      for (let s = 0; s < L; s += 1.5) {
        a += (R() - 0.5) * bend;
        x += Math.cos(a) * 1.5; y += Math.sin(a) * 1.5;
        if (x < 2 || y < 2 || x > W - 3 || y > H - 3) return;
        const u = s / L;
        segs.push([x, y, lerp(w0, 1, u), lerp(1, 0.5, u)]);
        if (depth < 2 && R() < 0.04) walk(x, y, a + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.7), L * (0.25 + R() * 0.3), Math.max(1, lerp(w0, 1, u) * 0.7), depth + 1);
      }
    };
    if (kind === 'line') {
      walk(W / 2, H - 3, -Math.PI / 2, H - 10, 5, 1, 0.35);
      const spine = segs.slice();
      for (let i = 8; i < spine.length; i += 7) {
        const [x, y, w] = spine[i], u = i / spine.length, s = R() < 0.5 ? -1 : 1;
        walk(x, y, -Math.PI / 2 + s * (0.5 + R() * 0.6), 10 + u * 46 + R() * 12, Math.max(1, w * 0.75), 1);
      }
    } else {
      const n = kind === 'burst' ? 8 : 10;
      for (let i = 0; i < n; i++) walk(W / 2, H / 2, (i / n) * TAU + (R() - 0.5) * 0.5, 36 + R() * 24, 4, 0);
    }
    for (const [x, y, w] of segs) { g.fillStyle = 'rgba(255,255,255,0.08)'; const d = Math.round(w + 5); g.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d); }
    for (const [x, y, w, a] of segs) { g.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`; const d = Math.max(1, Math.round(w)); g.fillRect(Math.round(x - d / 2), Math.round(y - d / 2), d, d); }
    // a white-hot core where the blow came down
    if (kind !== 'line') for (let i = 0; i < 70; i++) { const a = R() * TAU, r = Math.pow(R(), 0.7) * 9; g.fillStyle = `rgba(255,255,255,${(0.9 - r / 12).toFixed(2)})`; g.fillRect(Math.round(W / 2 + Math.cos(a) * r - 1), Math.round(H / 2 + Math.sin(a) * r - 1), 2, 2); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  prewarmShow(group) {
    if (!this.ready) this.init();
    for (const M of [this.foot, this.chasm, ...Object.values(this.crackMesh)]) { M.setMatrixAt(0, this._m.makeTranslation(0, 0, 0)); M.setColorAt(0, this._c.setRGB(1, 0.5, 0.2)); M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true; }
    for (const b of this.ballPool) b.outer.visible = b.core.visible = true;
    for (const o of [this.chain, ...this.shows()]) o.visible = true;
  },
  prewarmHide() {
    for (const M of [this.foot, this.chasm, ...Object.values(this.crackMesh)]) { M.setMatrixAt(0, this._m.makeScale(0, 0, 0)); M.instanceMatrix.needsUpdate = true; }
    for (const b of this.ballPool) b.outer.visible = b.core.visible = false;
    for (const o of [this.chain, ...this.shows()]) o.visible = false;
  },
  // a footprint where a foot came down (kragboss.js calls it from a footfall)
  footprint(q, yaw, side) {
    this.prints.push({ x: q.x, y: q.y, z: q.z, yaw: yaw + (side === 'R' ? -0.08 : 0.08), t: Game.time });
    if (this.prints.length > this.PRINTS) this.prints.shift();
  },
  // Glowing cracks split in the street at `at`: o.r across for a burst (shrunk to fit the ground it lies on),
  // or o.len long and o.w wide along o.yaw for a line. They race out over o.grow seconds and cool over o.life;
  // o.red for the Fist's wind-up.
  crack(at, o = {}) {
    const kind = o.kind || (Math.random() < 0.5 ? 'burst' : 'burst2'), y = World.groundAt(at.x, at.z, at.y + 0.6);
    if (y === -Infinity || Math.abs(y - at.y) > 1.2) return null;
    const yaw = o.yaw !== undefined ? o.yaw : rand(0, TAU);
    let sx, sz;
    if (kind === 'line') {
      sx = o.w || 3; sz = o.len || 8;
      // stop the split short where the street drops away or climbs
      for (let s = 1; s <= sz; s += 1) if (Math.abs(World.groundAt(at.x + fwdX(yaw) * s, at.z + fwdZ(yaw) * s, y + 0.6) - y) > 0.3) { sz = Math.max(1, s - 0.5); break; }
    } else {
      let r = o.r || 3;
      for (let tries = 0; tries < 3; tries++) {
        let ok = true;
        for (let i = 0; i < 8 && ok; i++) { const a = (i / 8) * TAU, gy = World.groundAt(at.x + Math.cos(a) * r * 0.45, at.z + Math.sin(a) * r * 0.45, y + 0.6); if (Math.abs(gy - y) > 0.25) ok = false; }
        if (ok) break;
        r *= 0.65;
      }
      sx = sz = r * 2;
    }
    const q = { kind, x: at.x, y: y + 0.02 + (this.cracks.length % 7) * 0.002, z: at.z, yaw, sx, sz, t0: Game.time + (o.delay || 0), life: o.life || 7, grow: o.grow || 0.16, red: !!o.red, ph: rand(0, TAU) };
    this.cracks.push(q);
    const same = this.cracks.filter((c) => c.kind === kind);
    if (same.length > this.CRACKS[kind]) this.cracks.splice(this.cracks.indexOf(same[0]), 1);
    return q;
  },
  // a fireball swelling to r and burning out over dur
  fireball(at, r, dur = 0.45) {
    this.balls.push({ x: at.x, y: at.y, z: at.z, r, dur, t0: Game.realTime });
    if (this.balls.length > this.BALLS) this.balls.shift();
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
    const p = o.pos, R = o.R, cp = Gfx.camera.position, H = o.tall || 1;
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
      const k = clamp(o.t / o.erupt, 0, 1), up = easeOutCubic(clamp(o.t / 0.08, 0, 1)), wob = 1 + Math.sin(t * 50) * 0.08;
      v.col.visible = v.core.visible = true;
      v.col.scale.set(R * 0.5 * wob, 4.2 * H * up, R * 0.5 * wob); v.core.scale.set(R * 0.16, 4.6 * H * up, R * 0.16);
      v.col.material.opacity = 0.42 * (1 - k * 0.5) * near; v.core.material.opacity = 0.7 * (1 - k * 0.4) * near;
      v.disc.scale.setScalar(R * 1.2); v.disc.material.opacity = 0.6;
      v.ring.scale.setScalar(R * (1 + k * 0.6)); v.ring.material.opacity = 0.8 * (1 - k);
    } else {
      const k = clamp(o.t / 0.4, 0, 1);
      v.col.scale.y = 4.2 * H * (1 - k); v.core.scale.y = 4.6 * H * (1 - k);
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
    for (const o of [this.chain, ...this.shows()]) o.visible = false;
    this.syncPrints();
    this.syncCracks(t);
    this.syncChasms(t);
    this.syncBalls(t);
    const r = Game.enemies.find((e) => e.type === 'krag' && !e.dead), R = r && r.model;
    if (!r || !R) return;
    this.syncMohawk(r, R, t);
    if (!R.mesh.visible) return;
    const a = r.act;
    this.syncHalo(r, a, t);
    // the chain from its right hand to the post or corner, taut once it swings
    if (a && a.kind === 'swing' && (a.phase === 'fire' || a.phase === 'reel' || a.phase === 'orbit')) {
      const h = r.fistR(), k = a.phase === 'fire' ? a.line : 1, n = 10, pts = [];
      const b = { x: lerp(h.x, a.hook.x, k), y: lerp(h.y, a.hook.y, k), z: lerp(h.z, a.hook.z, k) };
      for (let i = 0; i < n; i++) { const u = i / (n - 1), j = i && i < n - 1 ? 0.05 : 0; pts.push({ x: lerp(h.x, b.x, u) + rand(-j, j), y: lerp(h.y, b.y, u) + rand(-j, j) - Math.sin(u * Math.PI) * (a.phase === 'orbit' ? 0 : 0.4), z: lerp(h.z, b.z, u) + rand(-j, j) }); }
      const hot = a.phase === 'orbit' ? clamp(a.spd / KSWING.V1, 0, 1) : 0, outer = hexLinear(hot > 0.8 && ((t * 20) | 0) % 2 ? '#ffb040' : '#ff6a1a'), core = hexLinear('#ffe0b0');
      this.chain.visible = true;
      FX.writeStrip(this.chain, pts.concat(pts.slice().reverse()), 0.1 + 0.04 * hot, cp, (i, out) => { const c = i < n ? outer : core; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }, n);
      const C = a.plan.C;
      this.circle.visible = a.phase !== 'fire';
      this.circle.position.set(C.x, a.plan.g + 0.05, C.z);
      this.circle.scale.setScalar(a.plan.R);
      this.circle.material.opacity = 0.25 + 0.35 * hot;
    }
    // the Fist winding up: a red shell closing on it, rings closing on its feet, and the street it will split
    // open: one massive hard-edged cone from its feet, turning with it until it locks, white as its visor flashes
    if (a && a.kind === 'punch' && a.phase === 'wind') {
      const k = r.cueProgress(), c = r.chest(), flash = k >= 1, p = r.rp || r.pos, beat = 0.5 + 0.5 * Math.sin(t * (8 + 22 * k));
      this.aura.visible = true;
      this.aura.position.set(c.x, c.y - 0.4, c.z);
      this.aura.scale.set(lerp(5, 2.2, k), lerp(4.6, 2.8, k), lerp(5, 2.2, k));
      this.aura.material.color.set(flash && ((t * 30) | 0) % 2 ? '#ffffff' : '#ff2a3a');
      this.aura.material.opacity = flash ? 0.5 : 0.12 + 0.3 * k + 0.08 * beat;
      this.auraRings.forEach((m, i) => {
        const u = flash ? 1 : (k * 1.8 + i / 3) % 1;
        m.visible = true;
        m.position.set(p.x, p.y + 0.06, p.z);
        m.scale.setScalar(lerp(12, 2.2, u));
        m.material.color.set(flash ? '#ffffff' : '#ff2a3a');
        m.material.opacity = flash ? 0.9 : 0.3 + 0.6 * u;
      });
      const yaw = a.locked ? a.lockYaw : r.yaw, show = clamp((a.t / a.wind - 0.08) / 0.2, 0, 1);
      if (show > 0) {
        // its apex sits back so its edges match the hit's (KragViews and MoltenChasm agree on the cone)
        const back = 0.6 + this.apexBack(), ax = p.x - fwdX(yaw) * back, az = p.z - fwdZ(yaw) * back;
        const col = flash && ((t * 24) | 0) % 2 ? '#ffffff' : a.locked && ((t * 10) | 0) % 2 ? '#ff6a6a' : '#ff2a3a';
        for (const w of [this.wedge, this.wedgeEdge]) {
          w.visible = true;
          w.position.set(ax, p.y + (w === this.wedge ? 0.07 : 0.075), az);
          w.rotation.y = yaw;
          w.scale.setScalar((FIST.CONE + this.apexBack()) * (w === this.wedge ? lerp(0.25, 1, show) : 1));
          w.material.color.set(col);
        }
        this.wedge.material.opacity = (0.12 + 0.22 * k) * show + (a.locked ? 0.06 * beat : 0);
        this.wedgeEdge.material.opacity = (0.45 + 0.5 * k) * show;
      }
    }
    // a stopper winding: gold rings closing in on its feet
    if (a && a.kind === 'melee' && a.m.stopper && a.phase === 'wind') {
      const k = clamp(a.t / a.wind, 0, 1), p = r.rp || r.pos;
      this.auraRings.forEach((m, i) => {
        if (i > 1) return;
        const u = clamp(k * 1.25 - i * 0.25, 0, 1);
        m.visible = u > 0;
        m.position.set(p.x, p.y + 0.06, p.z);
        m.scale.setScalar(lerp(6, 1.3, easeOutCubic(u)));
        m.material.color.set(a.glinted && ((t * 24) | 0) % 2 ? '#ffffff' : '#ffd070');
        m.material.opacity = 0.35 + 0.6 * u;
      });
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
  // A tell on a limb: gold fire swelling round the limb that will throw a stopper, white at its glint; blue round
  // the onyx arm as the guard comes up.
  syncHalo(r, a, t) {
    let at = null, col = null, s = 0, op = 0;
    if (a && a.kind === 'melee' && a.m.stopper && a.phase === 'wind') {
      const k = clamp(a.t / a.wind, 0, 1);
      at = r.limbPos(a.m.limb); s = lerp(0.35, 0.85, k) * (1 + 0.12 * Math.sin(t * 40)); op = 0.25 + 0.35 * k;
      col = a.glinted && ((t * 24) | 0) % 2 ? '#ffffff' : '#ffd070';
    } else if (a && a.kind === 'guard' && a.t < a.rise + 0.1) {
      const k = clamp(a.t / Math.max(0.05, a.rise), 0, 1);
      at = r.fistPos(); s = lerp(1.3, 0.6, k); op = 0.55 * (1 - 0.6 * k);
      col = ((t * 26) | 0) % 2 ? '#bfe8ff' : '#3aa8ff';
    }
    if (!at) return;
    this.halo.visible = this.haloCore.visible = true;
    this.halo.position.set(at.x, at.y, at.z); this.haloCore.position.set(at.x, at.y, at.z);
    this.halo.scale.setScalar(s); this.haloCore.scale.setScalar(s * 0.45);
    this.halo.material.color.set(col); this.halo.material.opacity = op;
    this.haloCore.material.opacity = op * 0.9;
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
  // how far behind the cone's apex the drawn fan's point sits, so its edges pass 0.9 m either side of the apex
  apexBack() { return 0.9 / Math.tan(FIST.HALF); },
  // Each chasm: the fan swelling out with the split, white hot, then molten orange heaving while its floor
  // erupts, then cooling to a dull red and closing.
  syncChasms(t) {
    const M = this.chasm, list = Game.hazards.filter((h) => h.kind === 'chasm' && !h.dead);
    for (let i = 0; i < this.CHASMS; i++) {
      const h = list[i];
      if (!h) { M.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; }
      const b = this.apexBack(), R = Math.min(h.front, FIST.CONE) + b, F = h.f;
      this._q.setFromAxisAngle(this._y, h.yaw);
      this._p.set(h.o.x - F.x * b, h.o.y + 0.03, h.o.z - F.z * b); this._s.set(R, 1, R);
      M.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
      const u = h.t, heave = 0.85 + 0.15 * Math.sin(t * 6 + i) * Math.sin(t * 2.3);
      let r, g, bl;
      if (u < 0.35) { const k = u / 0.35; r = 1.8; g = lerp(1.5, 0.8, k); bl = lerp(1, 0.25, k); }
      else if (u < CHASM.ERUPT) { r = 1.5 * heave; g = 0.55 * heave; bl = 0.1 * heave; }
      else { const k = clamp((u - CHASM.ERUPT) / (CHASM.DUR - CHASM.ERUPT), 0, 1), f = Math.pow(1 - k, 1.3); r = lerp(1.5, 0.7, k) * f; g = lerp(0.55, 0.08, k) * f; bl = 0.06 * f; }
      M.setColorAt(i, this._c.setRGB(r, g, bl));
    }
    M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
  },
  // the colour of a crack u of the way through its life: white hot, orange, a dull red, gone
  crackColor(q, u, t, out) {
    const fl = 0.86 + 0.14 * Math.sin(t * 7 + q.ph) * Math.sin(t * 3.1 + q.ph * 2);
    let r, g, b;
    if (u < 0.08) { const k = u / 0.08; r = 1.6; g = lerp(1.3, 0.75, k); b = lerp(0.8, 0.22, k); }
    else if (u < 0.4) { const k = (u - 0.08) / 0.32; r = lerp(1.6, 1.0, k); g = lerp(0.75, 0.3, k); b = lerp(0.22, 0.05, k); }
    else { const k = (u - 0.4) / 0.6, f = Math.pow(1 - k, 1.4); r = 1.0 * f; g = lerp(0.3, 0.06, k) * f; b = 0.05 * f; }
    if (q.red) { g *= 0.35; b *= 0.6; }
    return out.setRGB(r * fl, g * fl, b * fl);
  },
  syncCracks(t) {
    const now = Game.time;
    this.cracks = this.cracks.filter((q) => now - q.t0 < q.life);
    for (const kind of Object.keys(this.CRACKS)) {
      const M = this.crackMesh[kind], list = this.cracks.filter((q) => q.kind === kind);
      for (let i = 0; i < this.CRACKS[kind]; i++) {
        const q = list[i];
        if (!q || now < q.t0) { M.setMatrixAt(i, this._m.makeScale(0, 0, 0)); continue; }
        const age = now - q.t0, g = easeOutCubic(clamp(age / q.grow, 0, 1));
        this._q.setFromAxisAngle(this._y, q.yaw);
        this._p.set(q.x, q.y, q.z);
        if (kind === 'line') this._s.set(q.sx * lerp(0.4, 1, g), 1, q.sz * g); else this._s.set(q.sx * lerp(0.3, 1, g), 1, q.sz * lerp(0.3, 1, g));
        M.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
        M.setColorAt(i, this.crackColor(q, age / q.life, t, this._c));
      }
      M.instanceMatrix.needsUpdate = true; M.instanceColor.needsUpdate = true;
    }
  },
  syncBalls(t) {
    const now = Game.realTime;
    this.balls = this.balls.filter((b) => now - b.t0 < b.dur);
    this.ballPool.forEach((P, i) => {
      const b = this.balls[i];
      P.outer.visible = P.core.visible = !!b;
      if (!b) return;
      const k = clamp((now - b.t0) / b.dur, 0, 1), s = b.r * lerp(0.25, 1, easeOutCubic(k));
      P.outer.position.set(b.x, b.y, b.z); P.core.position.set(b.x, b.y, b.z);
      P.outer.scale.setScalar(s); P.core.scale.setScalar(s * lerp(0.7, 0.2, k));
      P.outer.material.color.set(k < 0.25 ? '#ffd070' : k < 0.6 ? '#ff7a1a' : '#a8240a');
      P.outer.material.opacity = 0.75 * Math.pow(1 - k, 1.3);
      P.core.material.opacity = 0.95 * Math.pow(1 - k, 2);
    });
  },
  // its lights: the chest core and the mohawk by the heat, the fist as it charges or guards charged, fresh
  // cracks, fireballs and vents
  pushLights() {
    const r = Game.enemies.find((e) => e.type === 'krag' && !e.dead);
    if (r && r.model && r.model.mesh.visible && !(r.dying && r.ko && (r.ko.stage === 'collapse' || r.ko.stage === 'down'))) {
      const k = r.heatK(), c = r.chest(), a = r.act;
      Gfx.light(c.x, c.y, c.z, '#ff7a2a', 0.8 + 2.2 * k, 4 + 3 * k);
      if (!(r.intro && !r.intro.lit)) { const h = r.crestPos(); Gfx.light(h.x, h.y + 0.3, h.z, '#ff9a3a', r.charged() ? 3.5 : 1 + 1.5 * k, 5 + 3 * k); }
      const hot = a && ((a.kind === 'punch' && a.phase === 'wind') || (a.kind === 'guard' && a.charged));
      if (hot) { const f = r.fistPos(), q = a.kind === 'punch' ? r.cueProgress() : 1; Gfx.light(f.x, f.y, f.z, a.kind === 'punch' ? (q >= 1 ? '#ffffff' : '#ff2a3a') : '#ffd070', 2 + 4 * q, 6 + 6 * q); }
      if (a && a.kind === 'melee' && a.m.stopper && a.phase === 'wind') { const f = r.limbPos(a.m.limb); Gfx.light(f.x, f.y, f.z, '#ffd070', 2.5, 6); }
      if (a && a.kind === 'guard' && a.t < a.rise) { const f = r.fistPos(); Gfx.light(f.x, f.y, f.z, '#3aa8ff', 4, 7); }
    }
    if (r && r.intro && r.spawning) { const g = r.intro.g, k = r.intro.stage === 'quake' ? clamp(r.intro.ct / KINTRO.BURST, 0, 1) : 1; Gfx.light(r.pos.x, g + 0.6, r.pos.z, '#ff7a2a', 2 + 6 * k, 8 + 8 * k); }
    const now = Game.time;
    let n = 0;
    for (let i = this.cracks.length - 1; i >= 0 && n < 1; i--) { const q = this.cracks[i], age = now - q.t0; if (age >= 0 && age < 0.9) { Gfx.light(q.x, q.y + 0.5, q.z, q.red ? '#ff2a1a' : '#ff8a2a', 4 * (1 - age / 0.9), 6 + q.sz * 0.4); n++; } }
    for (const b of this.balls) { const k = (Game.realTime - b.t0) / b.dur; Gfx.light(b.x, b.y, b.z, '#ffa040', 8 * (1 - k), b.r * 4); break; }
    // a chasm lights the street it splits
    for (const h of Game.hazards) {
      if (h.kind !== 'chasm' || h.dead) continue;
      const k = h.t < CHASM.ERUPT ? 1 : clamp(1 - (h.t - CHASM.ERUPT) / (CHASM.DUR - CHASM.ERUPT), 0, 1);
      for (const s of [0.35, 0.75]) { const q = h.at(Math.min(h.front, FIST.CONE * s), 0); Gfx.light(q.x, q.y + 1.5, q.z, '#ff6a1a', 5 * k, 16); }
      break;
    }
    n = 0;
    for (const h of Game.hazards) {
      if (h.kind !== 'vent' || h.phase !== 'erupt' || n >= 2) continue;
      Gfx.light(h.pos.x, h.pos.y + 1.6, h.pos.z, '#ff7a2a', 3, 7); n++;
    }
  },
};
