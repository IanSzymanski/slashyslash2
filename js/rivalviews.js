'use strict';
// AEGIS-07's effects in the world, synced each rendered frame: its shield bubble with the cracks your returned
// bolts leave, the flames from its back thrusters, the shoulder cannon's charge and beam, the gun's aim line,
// the pulse grenade charging in its hand with its arc, the dive bomb's mark, the beacon it arrives in, its
// afterimages in a dash, and its husk through Views (its orbital strikes are drawn by aegisviews.js). Every
// material is made once here and compiled in Render.prewarm.

const BossViews = {
  mats: null, geos: null, ready: false, kinds: new Set(['husk']),
  ghosts: [], ghostRig: null, GHOSTS: 6,

  init() {
    const add = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }, o));
    this.add = add;
    // an open tube 1 m tall standing on its base, for beams and columns; a cone pointing down from its base
    const tube = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
    const cone = new THREE.ConeGeometry(1, 1, 8, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
    this.geos = { tube, cone, sphere: new THREE.SphereGeometry(1, 16, 12), ring: new THREE.RingGeometry(0.85, 1, 40), flatRing: new THREE.RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2), disc: new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2) };
    this.geos.wire = this.latticeGeo();
    this.geos.cracks = this.crackGeo();
    this.mats = {
      bubble: add('#2f6bff', { opacity: 0.1, side: THREE.FrontSide }),
      wire: new THREE.LineBasicMaterial({ color: '#4a8aff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      crack: new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
    };
    const G = this.geos, M = this.mats;
    // the shield: a soft shell, a turning wire lattice, and the cracks
    this.shield = new THREE.Group();
    this.shield.add(new THREE.Mesh(G.sphere, M.bubble), new THREE.LineSegments(G.wire, M.wire), new THREE.LineSegments(G.cracks, M.crack));
    // two jets, each an outer flame round a hot core
    this.flames = [0, 1].map(() => {
      const g = new THREE.Group(), outer = new THREE.Mesh(G.cone, add('#2f6bff', { opacity: 0.8 })), core = new THREE.Mesh(G.cone, add('#e8f0ff', { opacity: 0.9 }));
      core.scale.set(0.45, 0.7, 0.45);
      g.add(outer, core);
      g.userData = { outer, core };
      return g;
    });
    // the beam: outer glow, core, rings travelling out along it, a flare where it hits, and the lens's charge
    this.beam = new THREE.Group();
    const bo = new THREE.Mesh(G.tube, add('#2f6bff', { opacity: 0.6 })), bc = new THREE.Mesh(G.tube, add('#f0f6ff', { opacity: 0.95 })), bh = new THREE.Mesh(G.tube, add('#2f6bff', { opacity: 0.18 }));
    this.beam.add(bo, bc, bh);
    this.beam.userData = { bo, bc, bh };
    this.beamRings = [0, 1, 2].map(() => new THREE.Mesh(G.ring, add('#9cc4ff', { opacity: 0.8 })));
    this.flare = new THREE.Mesh(G.sphere, add('#c8dcff', { opacity: 0.8 }));
    this.charge = new THREE.Mesh(G.sphere, add('#9cc4ff', { opacity: 0.85 }));
    this.orb = new THREE.Mesh(G.sphere, add('#9cc4ff', { opacity: 0.9 }));
    this.orbHalo = new THREE.Mesh(G.ring, add('#4a8aff', { opacity: 0.7 }));
    // the entry beacon: an outer column, its core, and a pool of light at its foot
    this.beacon = new THREE.Group();
    const co = new THREE.Mesh(G.tube, add('#2f6bff', { opacity: 0.55 })), cc = new THREE.Mesh(G.tube, add('#e8f0ff', { opacity: 0.9 })), cp = new THREE.Mesh(G.disc, add('#2f6bff', { opacity: 0.5 }));
    this.beacon.add(co, cc, cp);
    this.beacon.userData = { co, cc, cp };
    // the dive bomb's mark on the street
    this.mark = new THREE.Group();
    const mr = new THREE.Mesh(G.flatRing, add('#4a8aff', { opacity: 0.9 })), mx1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.12), add('#4a8aff', { opacity: 0.9 })), mx2 = mx1.clone();
    mx1.rotation.y = Math.PI / 4; mx2.rotation.y = -Math.PI / 4; mx2.material = mx1.material;
    this.mark.add(mr, mx1, mx2);
    this.mark.userData = { mr, mx: mx1.material };
    this.zone = new THREE.Mesh(G.flatRing, add('#4a8aff', { opacity: 0.7 }));
    // the machine gun's barrels spinning up: a ring of three blades at the muzzle
    this.gunRing = new THREE.Mesh(this.bladeRingGeo(), add('#9cc4ff', { opacity: 0.8 }));
    // the beam's charge: rings closing on the lens and a halo round it
    this.chargeRings = [0, 1, 2].map(() => new THREE.Mesh(G.ring, add('#9cc4ff', { opacity: 0.8 })));
    this.chargeHalo = new THREE.Mesh(G.sphere, add('#2f6bff', { opacity: 0.25, side: THREE.FrontSide }));
    // the red flash's charge: a red shell closing on it and rings closing on its feet
    this.perilAura = new THREE.Mesh(G.sphere, add('#ff2a3a', { opacity: 0.2, side: THREE.FrontSide }));
    this.perilRings = [0, 1].map(() => new THREE.Mesh(G.flatRing, add('#ff2a3a', { opacity: 0.9 })));
    this.aimLine = FX.stripMesh(40); this.arcLine = FX.stripMesh(28); this.diveLine = FX.stripMesh(24); this.zipLine = FX.stripMesh(24);
    for (const o of [this.shield, ...this.flames, this.beam, ...this.beamRings, this.flare, this.charge, this.orb, this.orbHalo, this.beacon, this.mark, this.zone, ...this.chargeRings, this.chargeHalo, this.perilAura, ...this.perilRings, this.gunRing]) { o.visible = false; o.renderOrder = 2; Gfx.scene.add(o); }
    for (const m of [this.aimLine, this.arcLine, this.diveLine, this.zipLine]) m.visible = false;
    this.ready = true;
  },
  // three blades round a hub in the xy plane, radius 1, for the gun's spin-up
  bladeRingGeo() {
    const pos = [], idx = [];
    for (let b = 0; b < 3; b++) {
      const a0 = (b / 3) * TAU, a1 = a0 + 0.7, n = pos.length / 3;
      for (let i = 0; i <= 6; i++) {
        const a = lerp(a0, a1, i / 6);
        pos.push(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0, Math.cos(a), Math.sin(a), 0);
      }
      for (let i = 0; i < 6; i++) { const q = n + i * 2; idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  },
  // the shield's lattice: rings of latitude and meridians over a unit sphere, as line pairs
  latticeGeo() {
    const pos = [], N = 32, P = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    for (const lat of [-1.05, -0.55, 0, 0.55, 1.05]) for (let i = 0; i < N; i++) pos.push(...P(lat, (i / N) * TAU), ...P(lat, ((i + 1) / N) * TAU));
    for (let m = 0; m < 10; m++) { const lon = (m / 10) * TAU; for (let i = 0; i < 12; i++) pos.push(...P(-1.4 + (i / 12) * 2.8, lon), ...P(-1.4 + ((i + 1) / 12) * 2.8, lon)); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  },
  // eight jagged cracks over a unit sphere; the shield shows as many as it has taken
  crackGeo() {
    const R = mulberry32(88), pos = [], v = new THREE.Vector3();
    for (let i = 0; i < SHIELD_CRACKS; i++) {
      const a = (i / SHIELD_CRACKS) * TAU + R() * 0.4, b = (R() - 0.5) * 1.6;
      let p = new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b));
      for (let s = 0; s < 5; s++) {
        v.copy(p).add(new THREE.Vector3((R() - 0.5) * 0.4, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4)).normalize().multiplyScalar(1.01);
        pos.push(p.x, p.y, p.z, v.x, v.y, v.z);
        p = v.clone();
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return g;
  },
  prewarmShow(group) {
    if (!this.ready) this.init();
    for (const o of [this.shield, this.flames[0], this.beam, this.beamRings[0], this.flare, this.beacon, this.mark, this.chargeRings[0], this.chargeHalo, this.perilAura, this.perilRings[0]]) o.visible = true;
  },
  prewarmHide() { for (const o of [this.shield, this.flames[0], this.beam, this.beamRings[0], this.flare, this.beacon, this.mark, this.chargeRings[0], this.chargeHalo, this.perilAura, this.perilRings[0]]) o.visible = false; },

  // ---------- hazards through Views ----------
  make(o) {
    if (o.kind === 'husk') return { boss: true, husk: o };
    return null;
  },
  update(o, v, t) {
    if (v.husk) {
      const R = o.rig;
      if (R) { const k = o.fade ? 1 - o.fade / 0.5 : 1; R.mat.opacity = k; R.mat.depthWrite = k > 0.99; if (R.blade) R.blade.visible = false; }
    }
  },
  dispose(v) {
    const R = v.husk && v.husk.rig;
    if (R) { Gfx.scene.remove(R.mesh); R.geo.dispose(); R.mat.dispose(); R.outline.material.dispose(); v.husk.rig = null; }
  },

  // ---------- the rival itself ----------
  sync() {
    if (!this.ready) return;
    const t = Game.realTime, r = Game.enemies.find((e) => e.isBoss && !e.dead), R = r && r.model;
    const hide = [this.shield, ...this.flames, this.beam, ...this.beamRings, this.flare, this.charge, this.orb, this.orbHalo, this.beacon, this.mark, this.zone, this.aimLine, this.arcLine, this.diveLine, this.zipLine, ...this.chargeRings, this.chargeHalo, this.perilAura, ...this.perilRings, this.gunRing];
    for (const o of hide) o.visible = false;
    if (!r) { this.syncGhosts(null); return; }
    this.syncBeacon(r, t);
    if (!R || !R.mesh.visible) { this.syncGhosts(R); return; }
    const a = r.act, cp = Gfx.camera.position;
    // shield
    const S = this.shield;
    if (!r.dying && (r.shield || (r.phase === 1 && r.shieldDownT > 0 && r.shieldDownT < 2 && ((t * 10) | 0) % 2))) {
      const c = r.rp || r.pos, pulse = 1 + Math.sin(t * 6) * 0.02;
      S.visible = true;
      S.position.set(c.x, c.y + r.h * 0.55, c.z);
      S.scale.set(1.45 * pulse, 1.75 * pulse, 1.45 * pulse);
      S.rotation.y = t * 0.4;
      S.children[0].visible = r.shield;
      S.children[0].material.opacity = r.deflectT > 0 ? 0.3 : 0.08 + 0.04 * Math.sin(t * 5);
      S.children[1].material.color.set(r.deflectT > 0 ? '#ffffff' : '#4a8aff');
      S.children[1].material.opacity = r.shield ? 0.4 : 0.8;
      S.children[2].visible = r.shield && r.cracks > 0;
      S.children[2].geometry.setDrawRange(0, r.cracks * 10);
    }
    // jets
    if (r.thrust > 0.04) {
      const D = r.dash, v = this._v || (this._v = new THREE.Vector3()), q = this._q || (this._q = new THREE.Quaternion()), down = this._dn || (this._dn = new THREE.Vector3(0, -1, 0));
      if (D) { const l = Math.hypot(D.vx, D.vz) || 1; v.set(-D.vx / l, -0.45, -D.vz / l).normalize(); }
      else v.set(-fwdX(r.yaw) * 0.3, -1, -fwdZ(r.yaw) * 0.3).normalize();
      q.setFromUnitVectors(down, v);
      [-1, 1].forEach((x, i) => {
        const F = this.flames[i], n = r.boneAt('pack', x * 0.175, -0.27, 0.07);
        if (!n) return;
        F.visible = true;
        F.position.set(n.x, n.y, n.z);
        F.quaternion.copy(q);
        const L = 0.2 + r.thrust * 1.5 * (0.85 + Math.random() * 0.3), w = 0.1 + r.thrust * 0.08;
        F.scale.set(w, L, w);
        F.userData.outer.material.color.set(r.mode === 'charge' && !D ? '#7aa8ff' : '#2f6bff');
        F.userData.outer.material.opacity = 0.5 + 0.4 * r.thrust;
      });
    }
    // the machine gun: barrels spinning up at the muzzle, and a fan of tracer light opening over the area its
    // spray will cover, flickering faster as it spins up and burning white just before it fires
    if (a && a.kind === 'gun' && a.t < r.tele(GUN.WIND)) {
      const o = r.muzzle(), d = a.aimDir, k = a.spin || 0, F = r.gunFan(a), L = 9 * easeOutCubic(Math.min(1, k * 1.6));
      const yaw0 = yawOf(d.x, d.z), p0 = Math.asin(clamp(d.y, -1, 1)), side = a.pattern === 'sweep' ? a.side : 1;
      const ray = (yo, po, s) => { const y = yaw0 + yo * side, pp = p0 + po; return { x: o.x + fwdX(y) * Math.cos(pp) * s, y: o.y + Math.sin(pp) * s, z: o.z + fwdZ(y) * Math.cos(pp) * s }; };
      // its outline: out along one edge, round the far end, back along the other
      const N = 10, pts = [o];
      for (let i = 0; i <= N; i++) { const u = i / N; pts.push(ray(lerp(F[0], F[1], u), lerp(F[2], F[3], u), L)); }
      pts.push(o);
      const lock = a.t > r.tele(GUN.WIND) - 0.12, flick = ((t * (10 + 30 * k)) | 0) % 2;
      const on = hexLinear(lock ? '#ffffff' : flick ? '#9cc4ff' : '#4a8aff');
      this.aimLine.visible = true;
      FX.writeStrip(this.aimLine, pts, lock ? 0.05 : 0.03, cp, (i, out) => { out[0] = on[0]; out[1] = on[1]; out[2] = on[2]; });
      // the spinning barrel ring at the muzzle
      this.gunRing.visible = true;
      this.gunRing.position.set(o.x, o.y, o.z);
      this.gunRing.quaternion.setFromUnitVectors(this._z || (this._z = new THREE.Vector3(0, 0, 1)), this._gd || (this._gd = new THREE.Vector3()));
      this._gd.set(d.x, d.y, d.z);
      this.gunRing.quaternion.setFromUnitVectors(this._z, this._gd);
      this.gunRing.rotateZ(t * (8 + 40 * k));
      this.gunRing.scale.setScalar(0.14 + 0.12 * k);
      this.gunRing.material.color.set(lock ? '#ffffff' : '#9cc4ff');
      this.gunRing.material.opacity = 0.5 + 0.5 * k;
    }
    // the beam: charging at the lens, then firing
    const B = r.beam;
    if (B && a && a.kind === 'beam') {
      const o = B.o;
      if (!B.firing) {
        const k = clamp(B.k, 0, 1);
        this.charge.visible = true;
        this.charge.position.set(o.x, o.y, o.z);
        this.charge.scale.setScalar(0.08 + 0.42 * k + Math.sin(t * 40) * 0.03);
        this.charge.material.color.set(((t * (12 + 24 * k)) | 0) % 2 ? '#ffffff' : '#4a8aff');
        this.chargeHalo.visible = true;
        this.chargeHalo.position.set(o.x, o.y, o.z);
        this.chargeHalo.scale.setScalar(0.4 + 0.9 * k + Math.sin(t * 25) * 0.05);
        this.chargeHalo.material.opacity = 0.1 + 0.25 * k;
        this.chargeRings.forEach((m, i) => {
          const u = (t * (1.4 + 2 * k) + i / 3) % 1;
          m.visible = true;
          m.position.set(o.x, o.y, o.z);
          m.quaternion.copy(Gfx.camera.quaternion);
          m.scale.setScalar(lerp(2.4, 0.15, u));
          m.material.opacity = 0.9 * u * (0.4 + 0.6 * k);
        });
        // where it will fire, dashed
        const d = B.dir, N = 40, L = 30, pts = [];
        for (let i = 0; i < N; i++) { const s = (i / (N - 1)) * L; pts.push({ x: o.x + d.x * s, y: o.y + d.y * s, z: o.z + d.z * s }); }
        const on = hexLinear(k > 0.8 ? '#ffffff' : '#4a8aff'), off = [0, 0, 0];
        this.aimLine.visible = ((t * 20) | 0) % 3 !== 0;
        FX.writeStrip(this.aimLine, pts, 0.04, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      } else {
        const d = B.dir, q = this._bq || (this._bq = new THREE.Quaternion()), up = this._up || (this._up = new THREE.Vector3(0, 1, 0)), dv = this._dv || (this._dv = new THREE.Vector3());
        dv.set(d.x, d.y, d.z);
        q.setFromUnitVectors(up, dv);
        const wob = 1 + Math.sin(t * 60) * 0.08, U = this.beam.userData;
        this.beam.visible = true;
        this.beam.position.set(o.x, o.y, o.z);
        this.beam.quaternion.copy(q);
        U.bo.scale.set(0.3 * wob, B.len, 0.3 * wob); U.bc.scale.set(0.11, B.len, 0.11); U.bh.scale.set(0.7 * wob, B.len, 0.7 * wob);
        // rings run out from the muzzle along it
        this.beamRings.forEach((m, i) => {
          const k = ((t * 1.6 + i / 3) % 1), s = k * Math.min(B.len, 8);
          m.visible = true;
          m.position.set(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s);
          m.quaternion.setFromUnitVectors(this._z || (this._z = new THREE.Vector3(0, 0, 1)), dv);
          m.scale.setScalar(0.35 + k * 0.6);
          m.material.opacity = 0.8 * (1 - k);
        });
        this.flare.visible = true;
        this.flare.position.set(o.x + d.x * B.len, o.y + d.y * B.len, o.z + d.z * B.len);
        this.flare.scale.setScalar(0.45 + Math.random() * 0.2);
        this.charge.visible = true;
        this.charge.position.set(o.x, o.y, o.z);
        this.charge.scale.setScalar(0.3 * wob);
        this.charge.material.color.set('#ffffff');
      }
    }
    // the red flash gathering: a red shell closing on its body and rings closing on its feet, white once its eye
    // flashes
    if (a && a.move === 'peril' && a.phase === 'wind') {
      const k = r.cueProgress(), c = r.chest(), flash = k >= 1, p = r.rp || r.pos;
      this.perilAura.visible = true;
      this.perilAura.position.set(c.x, c.y - 0.3, c.z);
      this.perilAura.scale.set(lerp(4.6, 1.7, k), lerp(4, 2.2, k), lerp(4.6, 1.7, k));
      this.perilAura.material.color.set(flash && ((t * 30) | 0) % 2 ? '#ffffff' : '#ff2a3a');
      this.perilAura.material.opacity = flash ? 0.45 : 0.1 + 0.3 * k;
      this.perilRings.forEach((m, i) => {
        const u = flash ? 1 : (k * 1.6 + i * 0.5) % 1;
        m.visible = true;
        m.position.set(p.x, p.y + 0.06, p.z);
        m.scale.setScalar(lerp(9, 1.6, u));
        m.material.color.set(flash ? '#ffffff' : '#ff2a3a');
        m.material.opacity = flash ? 0.9 : 0.3 + 0.6 * u;
      });
    }
    // the pulse grenade charging in its left hand, and the arc it will fly with where it lands
    if (a && a.kind === 'grenade' && !a.thrown && a.plan) {
      const o = r.orbPos(), k = clamp(a.t / r.tele(1.15), 0, 1);
      this.orb.visible = this.orbHalo.visible = true;
      this.orb.position.set(o.x, o.y, o.z); this.orb.scale.setScalar(0.12 + 0.14 * k);
      this.orb.material.color.set(((t * 20) | 0) % 2 ? '#ffffff' : '#9cc4ff');
      this.orbHalo.position.set(o.x, o.y, o.z); this.orbHalo.quaternion.copy(Gfx.camera.quaternion); this.orbHalo.scale.setScalar(0.6 - k * 0.25 + Math.sin(t * 30) * 0.03);
      const P = a.plan, N = 28, pts = [];
      for (let i = 0; i < N; i++) { const tt = (i / (N - 1)) * P.T; pts.push({ x: P.o.x + P.v.x * tt, y: P.o.y + P.v.y * tt - 0.5 * GRENADE_G * tt * tt, z: P.o.z + P.v.z * tt }); }
      const on = hexLinear(k > 0.8 ? '#ffffff' : '#4a8aff'), off = [0, 0, 0];
      this.arcLine.visible = ((t * 12) | 0) % 3 !== 0;
      FX.writeStrip(this.arcLine, pts, 0.05, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      const end = pts[N - 1], gy = World.groundAt(end.x, end.z, end.y + 0.6);
      this.zone.visible = true;
      this.zone.position.set(end.x, (gy > -Infinity ? gy : end.y) + 0.05, end.z);
      this.zone.scale.setScalar(5.1 * (0.85 + 0.15 * Math.sin(t * 14)));
    }
    // the dive bomb's mark: under you from the charge, blinking faster through the hang, white once locked,
    // with a line down to it
    if (a && a.kind === 'dive') {
      const U = this.mark.userData, on = a.locked || ((t * (a.phase === 'hang' ? 16 : a.phase === 'rise' ? 10 : 6)) | 0) % 2;
      this.mark.visible = true;
      this.mark.position.set(a.tx, a.ty + 0.06, a.tz);
      this.mark.scale.setScalar(a.phase === 'crouch' ? lerp(2.4, 1.4, clamp(a.t / r.tele(DIVE.CHARGE), 0, 1)) : 1.4);
      U.mr.material.color.set(a.locked ? '#ffffff' : on ? '#4a8aff' : '#9cc4ff');
      U.mx.color.copy(U.mr.material.color);
      if (a.phase === 'hang' && a.locked) {
        const c = r.chest(), N = 24, pts = [];
        for (let i = 0; i < N; i++) { const k = i / (N - 1); pts.push({ x: lerp(c.x, a.tx, k), y: lerp(c.y, a.ty, k), z: lerp(c.z, a.tz, k) }); }
        const col = hexLinear('#9cc4ff'), off = [0, 0, 0];
        this.diveLine.visible = true;
        FX.writeStrip(this.diveLine, pts, 0.04, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? col : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      }
    }
    // a tether zip: the line from its left hand to the hook, flying out, then taut while it reels in
    if (a && a.kind === 'zip' && a.phase !== 'drop') {
      const h = r.orbPos(), k = a.phase === 'fire' ? a.line : 1, n = 12, pts = [], jag = a.phase === 'fire' ? 0.08 : 0.04;
      const b = { x: lerp(h.x, a.hook.x, k), y: lerp(h.y, a.hook.y, k), z: lerp(h.z, a.hook.z, k) };
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), j = i && i < n - 1 ? jag * Math.sin(u * Math.PI) : 0;
        pts.push({ x: lerp(h.x, b.x, u) + rand(-j, j), y: lerp(h.y, b.y, u) + rand(-j, j), z: lerp(h.z, b.z, u) + rand(-j, j) });
      }
      const outer = hexLinear('#2f6bff'), core = hexLinear('#e8f0ff');
      this.zipLine.visible = true;
      FX.writeStrip(this.zipLine, pts.concat(pts.slice().reverse()), 0.07, cp, (i, out) => { const c = i < n ? outer : core; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }, n);
    }
    this.syncGhosts(R, r);
  },
  // The column of light it arrives in: a thread at first, a wide beacon as it erupts, narrowing round the
  // silhouette, gone as it stands.
  syncBeacon(r, t) {
    const I = r.intro;
    if (!I || !r.spawning) return;
    const ct = I.ct, U = this.beacon.userData;
    let W = 0;
    if (I.stage === 'gather') W = ct > 0.4 && ((t * 30) | 0) % 3 ? 0.06 : 0;
    else if (I.stage === 'erupt') W = 0.4 + 1.6 * easeOutBack(clamp((ct - 0.75) / 0.2, 0, 1)) + Math.sin(t * 50) * 0.12;
    else if (I.stage === 'emerge') W = lerp(2.0, 1.0, clamp((ct - 2.0) / 0.4, 0, 1)) + Math.sin(t * 50) * 0.08;
    else if (I.stage === 'rise') W = (1 - clamp((ct - 2.55) / 0.12, 0, 1)) * 1.0;
    const pool = I.stage === 'gather' ? ct / 0.75 : W > 0 ? 1 : 0;
    if (W <= 0.01 && pool <= 0) return;
    const p = r.pos;
    this.beacon.visible = true;
    this.beacon.position.set(p.x, p.y, p.z);
    U.co.visible = U.cc.visible = W > 0.01;
    U.co.scale.set(W, 60, W); U.cc.scale.set(Math.max(0.04, W * 0.35), 60, Math.max(0.04, W * 0.35));
    U.cp.position.y = 0.05;
    U.cp.scale.setScalar(0.6 + pool * 2.4 + Math.sin(t * 30) * 0.1);
    U.cp.material.opacity = 0.25 + 0.35 * pool;
  },
  // afterimages of its dashes: each request copies its current bone matrices into a free pool mesh
  syncGhosts(R, r) {
    if (R && this.ghostRig !== R) this.buildGhosts(R);
    if (!R) { for (const g of this.ghosts) g.mesh.visible = false; return; }
    const dt = clamp(Game.realTime - (this._gt || Game.realTime), 0, 0.1) * Game.slowScale;
    this._gt = Game.realTime;
    if (r && r.ghostReq) {
      const free = this.ghosts.find((g) => g.t >= g.dur);
      r.ghostReq = 0;
      if (free) {
        R.mesh.updateMatrixWorld(true);
        const sb = R.mesh.skeleton.bones;
        free.mesh.skeleton.bones.forEach((b, i) => b.matrixWorld.copy(sb[i].matrixWorld));
        free.t = 0; free.dur = 0.22;
        free.mesh.material.color.set('#2f6bff');
      }
    }
    for (const g of this.ghosts) {
      g.t += dt;
      g.mesh.visible = g.t < g.dur;
      if (g.mesh.visible) g.mesh.material.opacity = 0.45 * (1 - g.t / g.dur);
    }
  },
  buildGhosts(R) {
    for (const g of this.ghosts) { Gfx.scene.remove(g.mesh); g.mesh.material.dispose(); }
    this.ghosts = [];
    this.ghostRig = R;
    const src = R.mesh;
    for (let i = 0; i < this.GHOSTS; i++) {
      const bones = src.skeleton.bones.map(() => { const b = new THREE.Bone(); b.matrixAutoUpdate = false; b.matrixWorldAutoUpdate = false; return b; });
      const m = new THREE.SkinnedMesh(R.geo, this.add('#2f6bff', { opacity: 0.45, side: THREE.FrontSide }));
      m.bind(new THREE.Skeleton(bones, src.skeleton.boneInverses), src.bindMatrix);
      m.frustumCulled = false; m.visible = false;
      Gfx.scene.add(m);
      this.ghosts.push({ mesh: m, t: 1, dur: 0 });
    }
  },
  // its lights: the visor, the drawn blade, the jets, and the beam along its length
  pushLights() {
    const r = Game.enemies.find((e) => e.isBoss && !e.dead);
    if (!r || !r.model || !r.model.mesh.visible) return;
    if (r.dying && r.ko && (r.ko.stage === 'collapse' || r.ko.stage === 'down')) return;
    const v = r.visorPos();
    Gfx.light(v.x, v.y, v.z, '#4a8aff', 1.2, 3.5);
    if (r.bladeOut > 0.5) { const b = r.bladeTip(); Gfx.light(b.x, b.y, b.z, '#4a8aff', 1.6, 4.5); }
    if (r.thrust > 0.3) { const n = r.boneAt('pack', 0, -0.4, 0.1); if (n) Gfx.light(n.x, n.y, n.z, '#4a8aff', 2 * r.thrust, 5); }
    const B = r.beam;
    if (B && !B.firing) Gfx.light(B.o.x, B.o.y, B.o.z, '#4a8aff', 1 + 4 * clamp(B.k, 0, 1), 3 + 7 * clamp(B.k, 0, 1));
    const A = r.act;
    if (A && A.move === 'peril' && A.phase === 'wind') { const k = r.cueProgress(), c = r.chest(); Gfx.light(c.x, c.y, c.z, k >= 1 ? '#ffffff' : '#ff2a3a', 2 + 5 * k, 6 + 8 * k); }
    if (B && B.firing) for (const k of [0.15, 0.5, 0.9]) { const s = B.len * k; Gfx.light(B.o.x + B.dir.x * s, B.o.y + B.dir.y * s, B.o.z + B.dir.z * s, '#4a8aff', 2.5, 7); }
    if (r.intro && r.spawning) Gfx.light(r.pos.x, r.pos.y + 3, r.pos.z, '#4a8aff', r.intro.stage === 'gather' ? 1.5 : 5, 16);
  },
};
