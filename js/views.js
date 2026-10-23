'use strict';
// Meshes for the simulation's non-character objects, synced each rendered frame: bolts, rubble, pulse
// grenades and their blast zones, barrels, the tether line, gunner lasers, grenadier arcs, and the
// player's afterimages. The rival's own effects are in rivalviews.js. Every material is made once here and
// compiled in Render.prewarm.

const Views = {
  map: new Map(), mats: null, geos: null, ghosts: [], lasers: [], arcs: [], zones: [], zips: [], beams: [], tetherMesh: null, rain: null, ash: null,
  GHOSTS: 10, LASERS: 6, ARCS: 4, ZONES: 8, ZIPS: 3, BEAMS: 8, LASER_N: 40, ARC_N: 28,

  init() {
    const add = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }, o));
    this.mats = {
      boltH: add('#ff7a2a'), boltF: add('#ff2a48'), boltS: add('#ff3a52'), boltB: add('#2f6bff'), boltCore: add('#fff4d0'),
      shell: Gfx.litMaterial({ color: '#1c2a30' }, 'feet', FX.gibFeet),
      gFly: new THREE.MeshBasicMaterial({ color: '#4af0ff' }), gCaught: new THREE.MeshBasicMaterial({ color: '#ffd070' }),
      gKick: new THREE.MeshBasicMaterial({ color: '#ff5a6a' }), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      halo: add('#4af0ff', { side: THREE.DoubleSide }),
    };
    this.geos = {
      bolt: new THREE.BoxGeometry(0.08, 0.08, 0.8), boltCore: new THREE.BoxGeometry(0.035, 0.035, 0.55), rock: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 8, 6), ring: new THREE.RingGeometry(0.8, 1, 32), flatRing: new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
      // the brute's ground wave: an open band 1 m tall standing on the ground
      band: new THREE.CylinderGeometry(1, 1, 1, 48, 1, true).translate(0, 0.5, 0),
      beam: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    };
    // afterimages share a player rig's geometry; each has its own skeleton of loose bones posed by copying.
    // Each character's rig has its own pool.
    this.ghostPools = new Map();
    for (const k in Render.rigs) {
      const R = Render.rigs[k], src = R.mesh, pool = [];
      for (let i = 0; i < this.GHOSTS; i++) {
        const bones = src.skeleton.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
        const m = new THREE.SkinnedMesh(R.geo, add('#ff2a48', { opacity: 0.5 }));
        m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
        m.frustumCulled = false; m.visible = false;
        Gfx.scene.add(m);
        pool.push({ mesh: m, fx: null });
      }
      this.ghostPools.set(R, pool);
    }
    this.ghosts = this.ghostPools.get(Render.playerRig);
    this.tetherMesh = FX.stripMesh(24);
    for (let i = 0; i < this.ZIPS; i++) this.zips.push(FX.stripMesh(24));
    // spawn beams: a column of light where an enemy is arriving
    for (let i = 0; i < this.BEAMS; i++) {
      const b = new THREE.Mesh(this.geos.beam, add('#ff6a3a'));
      b.visible = false; b.renderOrder = 2;
      Gfx.scene.add(b);
      this.beams.push(b);
    }
    for (let i = 0; i < this.LASERS; i++) this.lasers.push(FX.stripMesh(this.LASER_N));
    for (let i = 0; i < this.ARCS; i++) this.arcs.push(FX.stripMesh(this.ARC_N));
    for (let i = 0; i < this.ZONES; i++) {
      const z = new THREE.Mesh(this.geos.flatRing, add('#4af0ff', { side: THREE.DoubleSide }));
      z.visible = false; z.renderOrder = 2;
      Gfx.scene.add(z);
      this.zones.push(z);
    }
    for (const m of [this.tetherMesh, ...this.zips, ...this.lasers, ...this.arcs]) m.visible = false;
    this.initWeather();
    BossViews.init();
    AegisViews.init();
  },
  // everything once, visible, for the shader compile
  prewarmShow(group) {
    const add = (m) => { group.add(m); return m; };
    const add_wave = () => this.waveMat();
    add(new THREE.Mesh(this.geos.bolt, this.mats.boltH));
    add(new THREE.Mesh(this.geos.sphere, this.mats.shell));
    add(new THREE.Mesh(this.geos.sphere, this.mats.gFly));
    add(new THREE.Mesh(this.geos.ring, this.mats.halo));
    add(new THREE.Mesh(this.geos.band, add_wave()));
    this.beams[0].visible = true;
    this.rain.visible = this.ash.visible = true;
    add(new THREE.Mesh(this.geos.rock, FX.gibMaterial('#5c5464', false)));
    for (const pool of this.ghostPools.values()) pool[0].mesh.visible = true;
    this.zones[0].visible = true;
    this.tetherMesh.visible = true;
    BossViews.prewarmShow(group);
    AegisViews.prewarmShow(group);
  },
  prewarmHide() {
    for (const pool of this.ghostPools.values()) pool[0].mesh.visible = false;
    this.zones[0].visible = false; this.tetherMesh.visible = false; this.beams[0].visible = false;
    BossViews.prewarmHide();
    AegisViews.prewarmHide();
  },
  waveMat() { return new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }); },

  sync() {
    const t = Game.realTime, live = new Set();
    for (const list of [Game.projectiles, Game.props, Game.hazards]) {
      for (const o of list) {
        if (o.dead) continue;
        live.add(o);
        let v = this.map.get(o);
        if (!v) { v = this.make(o); if (!v) continue; this.map.set(o, v); }
        this.update(o, v, t);
      }
    }
    for (const [o, v] of this.map) if (!live.has(o)) { this.dispose(v); this.map.delete(o); }
    this.syncGhosts();
    this.syncTether();
    this.syncZips();
    this.syncBeams(t);
    this.syncWeather();
    this.syncTells(t);
    BossViews.sync();
    AegisViews.sync();
  },
  make(o) {
    if (BossViews.kinds.has(o.kind)) return BossViews.make(o);
    if (AegisViews.kinds.has(o.kind)) return AegisViews.make(o);
    const M = this.mats, G = this.geos, g = new THREE.Group();
    if (o.kind === 'bolt') {
      g.add(new THREE.Mesh(G.bolt, this.boltMat(o)), new THREE.Mesh(G.boltCore, M.boltCore));
    } else if (o.kind === 'wave') {
      const band = new THREE.Mesh(G.band, this.waveMat());
      band.renderOrder = 2;
      g.add(band);
      g.userData = { band };
    } else if (o.kind === 'rock') {
      g.add(new THREE.Mesh(G.rock, FX.gibMaterial(o.color, false)));
      g.scale.setScalar(o.size);
    } else if (o.kind === 'grenade') {
      const s = o.size;
      const shell = new THREE.Mesh(G.sphere, M.shell), core = new THREE.Mesh(G.sphere, M.gFly), halo = new THREE.Mesh(G.ring, M.halo.clone());
      shell.scale.setScalar(0.24 * s); core.scale.setScalar(0.15 * s); halo.scale.setScalar(0.45 * s);
      g.add(shell, core, halo);
      g.userData = { core, halo };
    } else if (o.kind === 'barrel') {
      const R = Rig.build(MODELS.barrel);
      R.feet.value.setRGB(0.3, 0.26, 0.34);
      Gfx.scene.add(R.mesh);
      return { rig: R, lit: null };
    } else return null;
    Gfx.scene.add(g);
    return { group: g };
  },
  update(o, v, t) {
    if (v.boss) { BossViews.update(o, v, t); return; }
    if (v.aegis) { AegisViews.update(o, v, t); return; }
    if (v.rig) {
      const R = v.rig, m = R.mesh;
      m.position.set(o.pos.x, o.pos.y, o.pos.z);
      m.rotation.y = o.yaw;
      const blink = o.fuse >= 0 && ((o.fuse * 16) | 0) % 2;
      R.mat.emissive.setScalar(blink ? 0.9 : 0);
      // re-light only after it moves a little
      if (!v.lit || dist3(v.lit, o.pos) > 0.5) { Render.feet(R.feet, o.pos); v.lit = { x: o.pos.x, y: o.pos.y, z: o.pos.z }; }
      return;
    }
    const g = v.group;
    g.position.set(o.pos.x, o.pos.y, o.pos.z);
    if (o.kind === 'bolt') {
      const s = Math.hypot(o.vel.x, o.vel.y, o.vel.z) || 1;
      if (!this._z) { this._z = new THREE.Vector3(0, 0, 1); this._d = new THREE.Vector3(); }
      this._d.set(o.vel.x / s, o.vel.y / s, o.vel.z / s);
      g.quaternion.setFromUnitVectors(this._z, this._d);
      g.children[0].material = this.boltMat(o);
    } else if (o.kind === 'wave') {
      // a band of light that shrinks as it runs out: clear its top to get over it
      const k = o.t / o.dur, r = o.radius(), band = g.userData.band;
      band.scale.set(r, 0.65 * (1 - k * 0.6), r);
      band.material.opacity = 0.9 * (1 - k * k);
      band.material.color.set(((o.t * 24) | 0) % 2 ? '#ffd080' : '#ff7a2a');
    } else if (o.kind === 'rock') {
      const k = 1.2 - o.life;
      g.rotation.set(o.spin.x * k, o.spin.y * k, o.spin.z * k);
    } else if (o.kind === 'grenade') {
      const { core, halo } = g.userData, blink = ((o.t * 14) | 0) % 2;
      const st = o.state, c = st === 'flying' ? '#4af0ff' : st === 'caught' ? '#ffd070' : '#ff5a6a';
      core.material = blink ? this.mats.white : st === 'flying' ? this.mats.gFly : st === 'caught' ? this.mats.gCaught : this.mats.gKick;
      halo.material.color.set(c);
      halo.material.opacity = 0.5 + 0.3 * Math.sin(o.t * 20);
      halo.quaternion.copy(Gfx.camera.quaternion);
      halo.scale.setScalar((0.5 + 0.06 * Math.sin(o.t * 20)) * o.size);
    }
  },
  dispose(v) {
    if (v.boss) { BossViews.dispose(v); return; }
    if (v.aegis) { AegisViews.dispose(v); return; }
    if (v.rig) { Gfx.scene.remove(v.rig.mesh); v.rig.geo.dispose(); v.rig.mat.dispose(); v.rig.outline.material.dispose(); return; }
    Gfx.scene.remove(v.group);
    if (v.group.userData.halo) v.group.userData.halo.material.dispose();
    if (v.group.userData.band) v.group.userData.band.material.dispose();
  },
  boltMat(o) { return !o.hostile ? this.mats.boltF : o.col && o.col.outer === '#ff3a52' ? this.mats.boltS : o.col && o.col.outer === '#2f6bff' ? this.mats.boltB : this.mats.boltH; },

  // Afterimages: each new request copies the player's current bone matrices into a free pool mesh (from the
  // pool for the rig the player is drawn with).
  syncGhosts() {
    const src = Render.playerRig, sb = src.mesh.skeleton.bones, pool = this.ghostPools.get(src);
    if (pool !== this.ghosts) {
      for (const s of this.ghosts) { s.mesh.visible = false; s.fx = null; }
      for (const g of FX.ghosts) g.slot = null;
      this.ghosts = pool;
    }
    const used = new Set();
    for (const g of FX.ghosts) {
      if (g.slot === null) {
        const free = this.ghosts.find((s) => !s.fx || !FX.ghosts.includes(s.fx));
        if (!free) continue;
        free.fx = g; g.slot = free;
        src.mesh.updateMatrixWorld(true);
        free.mesh.skeleton.bones.forEach((b, i) => b.matrixWorld.copy(sb[i].matrixWorld));
        free.mesh.material.color.set(g.color);
      }
      used.add(g.slot);
      g.slot.mesh.visible = true;
      g.slot.mesh.material.opacity = g.alpha * (1 - g.t / g.dur);
    }
    for (const s of this.ghosts) if (!used.has(s)) { s.mesh.visible = false; s.fx = null; }
  },

  // The tether: a crackling line from the left hand (the one reaching along it) to the hook.
  syncTether() {
    const P = Game.player, T = P && P.tether, m = this.tetherMesh;
    m.visible = !!T && !P.dead;
    if (!m.visible) return;
    const h = Rig.boneWorld(Render.playerRig, 'handL', this._h || (this._h = new THREE.Vector3()));
    const n = 12, pts = [], a = h, b = T.pos, jag = T.phase === 'retract' ? 0.02 : 0.07;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1), j = i && i < n - 1 ? jag * Math.sin(k * Math.PI) : 0;
      pts.push({ x: lerp(a.x, b.x, k) + rand(-j, j), y: lerp(a.y, b.y, k) + rand(-j, j), z: lerp(a.z, b.z, k) + rand(-j, j) });
    }
    const outer = hexLinear(T.mode === 'rebound' ? '#ffb040' : '#ff2a44'), core = hexLinear('#ffe8ee');
    FX.writeStrip(m, pts.concat(pts.slice().reverse()), 0.06, Gfx.camera.position, (i, out) => {
      const c = i < n ? outer : core;
      out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
    }, n);
  },

  // Weather, as in 2D: rain streaks and drifting ash in a box around the camera, recycled as they leave it.
  // A drop stops at the first surface below where it started, so none fall under the overpass.
  RAIN: 700, ASH: 260, WB: 18,
  initWeather() {
    const mk = (n, per) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * per * 3), 3)); return g; };
    this.rain = new THREE.LineSegments(mk(this.RAIN, 2), new THREE.LineBasicMaterial({ color: '#7a7cb4', transparent: true, opacity: 0.4, depthWrite: false }));
    this.ash = new THREE.Points(mk(this.ASH, 1), new THREE.PointsMaterial({ color: '#9a8a9a', size: 0.05, transparent: true, opacity: 0.8, depthWrite: false }));
    for (const m of [this.rain, this.ash]) { m.frustumCulled = false; Gfx.scene.add(m); }
    this.drops = []; this.flakes = [];
    for (let i = 0; i < this.RAIN; i++) this.drops.push({ x: 0, y: -1e9, z: 0, v: rand(17, 23), floor: 0 });
    for (let i = 0; i < this.ASH; i++) this.flakes.push({ x: 0, y: -1e9, z: 0, v: rand(0.5, 1.3), ph: rand(0, TAU) });
    this.wLast = 0;
  },
  syncWeather() {
    const on = S.visuals.weather;
    this.rain.visible = this.ash.visible = on;
    if (!on) return;
    const now = Game.realTime, dt = clamp(now - this.wLast, 0, 0.1) * (Game.state === 'playing' || Game.state === 'menu' ? Game.slowScale : 0);
    this.wLast = now;
    const c = Gfx.camera.position, W = this.WB;
    const respawn = (d, top) => {
      d.x = c.x + rand(-W, W); d.z = c.z + rand(-W, W); d.y = top ? c.y + rand(8, 16) : c.y + rand(-8, 16);
      d.floor = World.groundAt(d.x, d.z, d.y);
    };
    const rp = this.rain.geometry.attributes.position, ra = rp.array;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y -= d.v * dt; d.x -= 3 * dt;
      if (d.y < d.floor || d.y < c.y - 10 || Math.abs(d.x - c.x) > W || Math.abs(d.z - c.z) > W) respawn(d, d.y > -1e8 && d.y < d.floor);
      const o = i * 6;
      ra[o] = d.x; ra[o + 1] = d.y; ra[o + 2] = d.z; ra[o + 3] = d.x + 0.09; ra[o + 4] = d.y + 0.6; ra[o + 5] = d.z;
    }
    rp.needsUpdate = true;
    const ap = this.ash.geometry.attributes.position, aa = ap.array;
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.ph += dt; f.y -= f.v * dt; f.x += (Math.sin(f.ph * 1.3) * 0.5 - 0.35) * dt; f.z += Math.cos(f.ph * 0.9) * 0.3 * dt;
      if (f.y < c.y - 10 || Math.abs(f.x - c.x) > W || Math.abs(f.z - c.z) > W || f.y < World.groundAt(f.x, f.z, f.y + 0.05)) respawn(f, false);
      aa[i * 3] = f.x; aa[i * 3 + 1] = f.y; aa[i * 3 + 2] = f.z;
    }
    ap.needsUpdate = true;
  },
  // A sniper reeling itself to another perch: its grapple line from the left hand to where it's going.
  syncZips() {
    let zi = 0;
    for (const e of Game.enemies) {
      if (e.dead || e.state !== 'zip' || !e.zipTo || !e.model || zi >= this.zips.length) continue;
      const m = this.zips[zi++], h = Rig.boneWorld(e.model, 'handL', this._zh || (this._zh = new THREE.Vector3()));
      const b = { x: e.zipTo.x, y: e.zipTo.y + 0.3, z: e.zipTo.z }, n = 12, pts = [];
      for (let i = 0; i < n; i++) { const k = i / (n - 1), j = i && i < n - 1 ? 0.06 * Math.sin(k * Math.PI) : 0; pts.push({ x: lerp(h.x, b.x, k) + rand(-j, j), y: lerp(h.y, b.y, k) + rand(-j, j), z: lerp(h.z, b.z, k) + rand(-j, j) }); }
      const outer = hexLinear('#a01828'), core = hexLinear('#ffd0d8');
      m.visible = true;
      FX.writeStrip(m, pts.concat(pts.slice().reverse()), 0.05, Gfx.camera.position, (i, out) => { const c = i < n ? outer : core; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }, n);
    }
    for (; zi < this.zips.length; zi++) this.zips[zi].visible = false;
  },
  // Where an enemy is arriving: a column of light that narrows until it steps out.
  syncBeams(t) {
    let bi = 0;
    for (const e of Game.enemies) {
      if (!e.spawning || e.dead || bi >= this.beams.length) continue;
      const b = this.beams[bi++], k = 1 - e.spawnT / 0.75, w = Math.max(0.06, (1 - k) * 0.5);
      const base = e.pos.y, top = e.flying ? e.pos.y + 7 : World.groundAt(e.pos.x, e.pos.z, 200) > base + 1 ? base + 9 : base + 30;
      b.visible = ((t * 30) | 0) % 3 !== 0;
      b.position.set(e.pos.x, base, e.pos.z);
      b.scale.set(w, top - base, w);
      b.material.opacity = 0.35 + 0.4 * k;
    }
    for (; bi < this.beams.length; bi++) this.beams[bi].visible = false;
  },
  // Enemy tells in the world: the gunner's laser (dashed while it tracks, solid white once locked), the
  // grenadier's arc with its landing zone, and the blast zone under every hostile grenade in flight.
  syncTells(t) {
    let li = 0, ai = 0, zi = 0;
    const cp = Gfx.camera.position;
    const zone = (pos, R, color) => {
      const z = this.zones[zi++];
      if (!z) return;
      z.visible = true;
      z.position.set(pos.x, pos.y + 0.05, pos.z);
      const k = 0.85 + 0.15 * Math.sin(t * 14);
      z.scale.set(R * k, 1, R * k);
      z.material.color.set(color);
      z.material.opacity = 0.55 + 0.25 * Math.sin(t * 20);
    };
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const L = e.laser ? e.laser() : 0;
      if (L && li < this.lasers.length) {
        const m = this.lasers[li++], o = e.muzzle(), d = e.aimDir, P = Game.player;
        const far = e.type === 'sniper' ? 48 : 36, hit = World.raycast(o, d, far);
        let len = hit ? hit.t : far;
        // it ends on you when it reaches you
        if (P && !P.dead) {
          const c = P.chest(), tp = (c.x - o.x) * d.x + (c.y - o.y) * d.y + (c.z - o.z) * d.z;
          if (tp > 0 && tp < len && Math.hypot(o.x + d.x * tp - c.x, o.y + d.y * tp - c.y, o.z + d.z * tp - c.z) < 0.6) len = tp;
        }
        const N = this.LASER_N, pts = [];
        for (let i = 0; i < N; i++) { const k = (i / (N - 1)) * len; pts.push({ x: o.x + d.x * k, y: o.y + d.y * k, z: o.z + d.z * k }); }
        const sn = e.type === 'sniper';
        const on = hexLinear(L === 2 ? (((t * 30) | 0) % 2 ? '#ffffff' : sn ? '#ff3a52' : '#ffd0a0') : sn ? '#ff3a52' : '#ff7a3a'), off = [0, 0, 0];
        m.visible = true;
        FX.writeStrip(m, pts, L === 2 ? 0.05 : 0.035, cp, (i, out) => { const c = L === 2 || (sn ? (i >> 1) % 3 !== 2 : (i >> 1) % 2 === 0) ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      }
      if (e.type === 'grenadier' && e.state === 'throwWind' && e.plan && ai < this.arcs.length) {
        const m = this.arcs[ai++], P = e.plan, N = this.ARC_N, pts = [];
        for (let i = 0; i < N; i++) {
          const tt = (i / (N - 1)) * P.T;
          pts.push({ x: P.o.x + P.v.x * tt, y: P.o.y + P.v.y * tt - 0.5 * GRENADIER_G * tt * tt, z: P.o.z + P.v.z * tt });
        }
        const k = clamp(e.st / e.tele(1.0), 0, 1), on = hexLinear(k > 0.8 ? '#ffffff' : '#4af0ff'), off = [0, 0, 0];
        m.visible = ((e.t * 12) | 0) % 3 !== 0;
        FX.writeStrip(m, pts, 0.05, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
        const end = pts[N - 1], gy = World.groundAt(end.x, end.z, end.y + 0.6);
        zone({ x: end.x, y: gy > -Infinity ? gy : end.y, z: end.z }, 3.6, '#4af0ff');
      }
    }
    for (const g of Game.projectiles) if (g.kind === 'grenade' && g.hostile && g.impact && !g.dead) zone(g.impact, g.R, '#4af0ff');
    for (; li < this.lasers.length; li++) this.lasers[li].visible = false;
    for (; ai < this.arcs.length; ai++) this.arcs[ai].visible = false;
    for (; zi < this.zones.length; zi++) this.zones[zi].visible = false;
  },
  // lights from the brightest objects: bolts, grenades and lit barrels, up to three
  pushLights() {
    // the two drones nearest the camera light themselves and what's below them
    const cp = Gfx.camera.position;
    const drones = Game.enemies.filter((e) => e.type === 'drone' && !e.dead && !e.spawning).sort((a, b) => dist3(a.pos, cp) - dist3(b.pos, cp));
    for (const d of drones.slice(0, 2)) Gfx.light(d.pos.x, d.pos.y + 0.2, d.pos.z, d.state === 'tele' || d.state === 'dive' ? '#ff6040' : '#ffc070', 1.6, 5);
    let n = 0;
    for (const o of Game.projectiles) {
      if (n >= 3) return;
      if (o.dead) continue;
      if (o.kind === 'bolt') { Gfx.light(o.pos.x, o.pos.y, o.pos.z, o.hostile ? o.col.light : '#ff3048', 1.6, 2.6); n++; }
      else if (o.kind === 'grenade') { Gfx.light(o.pos.x, o.pos.y, o.pos.z, o.state === 'flying' ? '#4af0ff' : o.state === 'caught' ? '#ffd070' : '#ff3048', 2, 3.6); n++; }
    }
    for (const p of Game.props) {
      if (n >= 3) return;
      if (!p.dead && p.fuse >= 0) { const c = p.center(); Gfx.light(c.x, c.y, c.z, '#ffb040', 1.4, 2.6); n++; }
    }
  },
};
