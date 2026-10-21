'use strict';
// Meshes for the simulation's non-character objects, synced each rendered frame: bolts, rubble, pulse
// grenades and their blast zones, barrels, the tether line, gunner lasers, grenadier arcs, and the
// player's afterimages. Every material is made once here and compiled in Render.prewarm.

const Views = {
  map: new Map(), mats: null, geos: null, ghosts: [], lasers: [], arcs: [], zones: [], tetherMesh: null,
  GHOSTS: 10, LASERS: 6, ARCS: 4, ZONES: 8, LASER_N: 40, ARC_N: 28,

  init() {
    const add = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }, o));
    this.mats = {
      boltH: add('#ff7a2a'), boltF: add('#ff2a48'), boltCore: add('#fff4d0'),
      shell: Gfx.litMaterial({ color: '#1c2a30' }, 'feet', FX.gibFeet),
      gFly: new THREE.MeshBasicMaterial({ color: '#4af0ff' }), gCaught: new THREE.MeshBasicMaterial({ color: '#ffd070' }),
      gKick: new THREE.MeshBasicMaterial({ color: '#ff5a6a' }), white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
      halo: add('#4af0ff', { side: THREE.DoubleSide }),
    };
    this.geos = {
      bolt: new THREE.BoxGeometry(0.08, 0.08, 0.8), boltCore: new THREE.BoxGeometry(0.035, 0.035, 0.55), rock: new THREE.BoxGeometry(1, 1, 1),
      sphere: new THREE.SphereGeometry(1, 8, 6), ring: new THREE.RingGeometry(0.8, 1, 32), flatRing: new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2),
    };
    // afterimages share the player's geometry; each has its own skeleton of loose bones posed by copying
    const src = Render.playerRig.mesh;
    for (let i = 0; i < this.GHOSTS; i++) {
      const bones = src.skeleton.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
      const m = new THREE.SkinnedMesh(Render.playerRig.geo, add('#ff2a48', { opacity: 0.5 }));
      m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
      m.frustumCulled = false; m.visible = false;
      Gfx.scene.add(m);
      this.ghosts.push({ mesh: m, fx: null });
    }
    this.tetherMesh = FX.stripMesh(24);
    for (let i = 0; i < this.LASERS; i++) this.lasers.push(FX.stripMesh(this.LASER_N));
    for (let i = 0; i < this.ARCS; i++) this.arcs.push(FX.stripMesh(this.ARC_N));
    for (let i = 0; i < this.ZONES; i++) {
      const z = new THREE.Mesh(this.geos.flatRing, add('#4af0ff', { side: THREE.DoubleSide }));
      z.visible = false; z.renderOrder = 2;
      Gfx.scene.add(z);
      this.zones.push(z);
    }
    for (const m of [this.tetherMesh, ...this.lasers, ...this.arcs]) m.visible = false;
  },
  // everything once, visible, for the shader compile
  prewarmShow(group) {
    const add = (m) => { group.add(m); return m; };
    add(new THREE.Mesh(this.geos.bolt, this.mats.boltH));
    add(new THREE.Mesh(this.geos.sphere, this.mats.shell));
    add(new THREE.Mesh(this.geos.sphere, this.mats.gFly));
    add(new THREE.Mesh(this.geos.ring, this.mats.halo));
    add(new THREE.Mesh(this.geos.rock, FX.gibMaterial('#5c5464', false)));
    this.ghosts[0].mesh.visible = true;
    this.zones[0].visible = true;
    this.tetherMesh.visible = true;
  },
  prewarmHide() {
    this.ghosts[0].mesh.visible = false; this.zones[0].visible = false; this.tetherMesh.visible = false;
  },

  sync() {
    const t = Game.realTime, live = new Set();
    for (const list of [Game.projectiles, Game.props]) {
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
    this.syncTells(t);
  },
  make(o) {
    const M = this.mats, G = this.geos, g = new THREE.Group();
    if (o.kind === 'bolt') {
      g.add(new THREE.Mesh(G.bolt, o.hostile ? M.boltH : M.boltF), new THREE.Mesh(G.boltCore, M.boltCore));
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
      g.children[0].material = o.hostile ? this.mats.boltH : this.mats.boltF;
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
    if (v.rig) { Gfx.scene.remove(v.rig.mesh); v.rig.geo.dispose(); v.rig.mat.dispose(); v.rig.outline.material.dispose(); return; }
    Gfx.scene.remove(v.group);
    if (v.group.userData.halo) v.group.userData.halo.material.dispose();
  },

  // Afterimages: each new request copies the player's current bone matrices into a free pool mesh.
  syncGhosts() {
    const src = Render.playerRig, sb = src.mesh.skeleton.bones;
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

  // The tether: a crackling line from the right hand to the hook.
  syncTether() {
    const P = Game.player, T = P && P.tether, m = this.tetherMesh;
    m.visible = !!T && !P.dead;
    if (!m.visible) return;
    const h = Rig.boneWorld(Render.playerRig, 'handR', this._h || (this._h = new THREE.Vector3()));
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
        const hit = World.raycast(o, d, 36);
        let len = hit ? hit.t : 36;
        // it ends on you when it reaches you
        if (P && !P.dead) {
          const c = P.chest(), tp = (c.x - o.x) * d.x + (c.y - o.y) * d.y + (c.z - o.z) * d.z;
          if (tp > 0 && tp < len && Math.hypot(o.x + d.x * tp - c.x, o.y + d.y * tp - c.y, o.z + d.z * tp - c.z) < 0.6) len = tp;
        }
        const N = this.LASER_N, pts = [];
        for (let i = 0; i < N; i++) { const k = (i / (N - 1)) * len; pts.push({ x: o.x + d.x * k, y: o.y + d.y * k, z: o.z + d.z * k }); }
        const on = hexLinear(L === 2 ? (((t * 30) | 0) % 2 ? '#ffffff' : '#ffd0a0') : '#ff7a3a'), off = [0, 0, 0];
        m.visible = true;
        FX.writeStrip(m, pts, L === 2 ? 0.05 : 0.035, cp, (i, out) => { const c = L === 2 || ((i >> 1) % 2 === 0) ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
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
