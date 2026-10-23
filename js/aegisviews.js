'use strict';
// AEGIS as the player, in the world: the flames from its back jets, the shoulder cannon's charge and beam, the
// gun's spinning barrels and muzzle flash, the orbital strike's arc and landing ring while it aims; and the
// objects its fight leaves in the world through Views: machine-gun rounds, strike probes, and the strikes
// themselves (the warning ring and siren pulses, then the column of light), the rival's included. Every
// material is made once here or shares a shader compiled in Render.prewarm.

const AegisViews = {
  ready: false, kinds: new Set(['round', 'probe', 'strike']),

  init() {
    const add = (color, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }, o));
    this.add = add;
    const tube = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true).translate(0, 0.5, 0);
    const cone = new THREE.ConeGeometry(1, 1, 8, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
    this.geos = {
      tube, cone, sphere: new THREE.SphereGeometry(1, 14, 10), ring: new THREE.RingGeometry(0.85, 1, 40),
      flatRing: new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2), disc: new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      round: new THREE.BoxGeometry(0.06, 0.06, 1).translate(0, 0, -0.5), roundCore: new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5),
      bar: new THREE.BoxGeometry(1, 0.02, 0.1),
    };
    const G = this.geos;
    this.mats = { round: add(AEGIS_P.glow, { opacity: 0.9 }), roundCore: add('#f0fcff', { opacity: 1 }) };
    // the jets: an outer flame round a hot core, one per pod
    this.flames = [0, 1].map(() => {
      const g = new THREE.Group(), outer = new THREE.Mesh(G.cone, add(AEGIS_P.glow, { opacity: 0.8 })), core = new THREE.Mesh(G.cone, add('#eafcff', { opacity: 0.9 }));
      core.scale.set(0.45, 0.7, 0.45);
      g.add(outer, core);
      g.userData = { outer, core };
      return g;
    });
    // the beam, its rings, the flare where it hits, and the charge at the lens
    this.beam = new THREE.Group();
    const bo = new THREE.Mesh(G.tube, add(AEGIS_P.glow, { opacity: 0.6 })), bc = new THREE.Mesh(G.tube, add('#f0fcff', { opacity: 0.95 })), bh = new THREE.Mesh(G.tube, add(AEGIS_P.glow, { opacity: 0.16 }));
    this.beam.add(bo, bc, bh);
    this.beam.userData = { bo, bc, bh };
    this.beamRings = [0, 1, 2].map(() => new THREE.Mesh(G.ring, add(AEGIS_P.hi, { opacity: 0.8 })));
    this.flare = new THREE.Mesh(G.sphere, add('#d0f6ff', { opacity: 0.8 }));
    this.charge = new THREE.Mesh(G.sphere, add(AEGIS_P.hi, { opacity: 0.85 }));
    this.chargeHalo = new THREE.Mesh(G.sphere, add(AEGIS_P.glow, { opacity: 0.25, side: THREE.FrontSide }));
    this.chargeRings = [0, 1, 2].map(() => new THREE.Mesh(G.ring, add(AEGIS_P.hi, { opacity: 0.8 })));
    // the gun: barrels spinning at the muzzle and a flash on each shot
    this.gunRing = new THREE.Mesh(BossViews.bladeRingGeo(), add(AEGIS_P.hi, { opacity: 0.8 }));
    this.muzzleFlash = new THREE.Mesh(G.sphere, add('#eafcff', { opacity: 0.9 }));
    // the strike's arc and where it lands
    this.arcLine = FX.stripMesh(26);
    this.marker = new THREE.Group();
    const mr = new THREE.Mesh(G.flatRing, add(AEGIS_P.hi, { opacity: 0.9 })), mi = new THREE.Mesh(G.flatRing, add(AEGIS_P.glow, { opacity: 0.8 })), md = new THREE.Mesh(G.disc, add(AEGIS_P.glow, { opacity: 0.12 }));
    const mx1 = new THREE.Mesh(G.bar, add(AEGIS_P.hi, { opacity: 0.9 })), mx2 = new THREE.Mesh(G.bar, mx1.material);
    mx1.rotation.y = Math.PI / 4; mx2.rotation.y = -Math.PI / 4;
    this.marker.add(mr, mi, md, mx1, mx2);
    this.marker.userData = { mr, mi, md, mx1, mx2 };
    this.parts = [...this.flames, this.beam, ...this.beamRings, this.flare, this.charge, this.chargeHalo, ...this.chargeRings, this.gunRing, this.muzzleFlash, this.marker];
    for (const o of this.parts) { o.visible = false; o.renderOrder = 2; Gfx.scene.add(o); }
    this.arcLine.visible = false;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._d = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0); this._dn = new THREE.Vector3(0, -1, 0); this._z = new THREE.Vector3(0, 0, 1);
    this.ready = true;
  },
  prewarmShow(group) {
    if (!this.ready) this.init();
    for (const o of this.parts) o.visible = true;
    const s = this.make({ kind: 'strike', col: STRIKE_COL.ult, R: 1, hostile: false });
    s.group.visible = true;
    this._pre = s;
  },
  prewarmHide() {
    for (const o of this.parts) o.visible = false;
    if (this._pre) { this.dispose(this._pre); this._pre = null; }
  },

  // ---------- rounds, probes and strikes through Views ----------
  make(o) {
    const G = this.geos, g = new THREE.Group();
    if (o.kind === 'round') {
      g.add(new THREE.Mesh(G.round, this.mats.round), new THREE.Mesh(G.roundCore, this.mats.roundCore));
    } else if (o.kind === 'probe') {
      const C = o.col, core = new THREE.Mesh(G.sphere, this.add('#ffffff', { opacity: 1 })), shell = new THREE.Mesh(G.sphere, this.add(C.glow, { opacity: 0.6 })), halo = new THREE.Mesh(G.ring, this.add(C.hi, { opacity: 0.7 }));
      g.add(shell, core, halo);
      g.userData = { core, shell, halo, own: true };
    } else if (o.kind === 'strike') {
      const C = o.col, add = this.add;
      const outer = new THREE.Mesh(G.tube, add(C.glow, { opacity: 0.6 })), core = new THREE.Mesh(G.tube, add(C.core, { opacity: 0.95 })), haze = new THREE.Mesh(G.tube, add(C.glow, { opacity: 0.18 }));
      const pool = new THREE.Mesh(G.disc, add(C.glow, { opacity: 0.2 })), ring = new THREE.Mesh(G.flatRing, add(C.hi, { opacity: 0.9 })), inner = new THREE.Mesh(G.flatRing, add(C.glow, { opacity: 0.7 }));
      const thread = new THREE.Mesh(G.tube, add(C.hi, { opacity: 0.7 })), orb = new THREE.Mesh(G.sphere, add('#ffffff', { opacity: 1 }));
      pool.position.y = ring.position.y = inner.position.y = 0.06;
      g.add(haze, outer, core, pool, ring, inner, thread, orb);
      g.userData = { outer, core, haze, pool, ring, inner, thread, orb, own: true };
    } else return null;
    Gfx.scene.add(g);
    return { aegis: true, group: g };
  },
  update(o, v, t) {
    const g = v.group, U = g.userData;
    if (o.kind === 'round') {
      const a = o.tail, b = o.pos, dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.hypot(dx, dy, dz);
      g.position.set(b.x, b.y, b.z);
      if (L > 1e-4) { this._d.set(-dx / L, -dy / L, -dz / L); g.quaternion.setFromUnitVectors(this._z.set(0, 0, -1), this._d); }
      g.scale.set(1, 1, Math.max(0.4, L));
      return;
    }
    g.position.set(o.pos.x, o.pos.y, o.pos.z);
    if (o.kind === 'probe') {
      const s = o.size, pulse = 1 + Math.sin(t * 40) * 0.15;
      U.core.scale.setScalar(0.12 * s); U.shell.scale.setScalar(0.24 * s * pulse);
      U.halo.quaternion.copy(Gfx.camera.quaternion); U.halo.scale.setScalar(0.45 * s * pulse);
      U.core.material.color.set(((t * 24) | 0) % 2 ? '#ffffff' : o.col.hi);
      return;
    }
    // a strike: the warning ring and the thread from the sky while it pulses, then the column
    const R = o.R, k = o.charge ? o.charge() : 1, up = o.phase === 'erupt', blink = ((t * (6 + 18 * k)) | 0) % 2;
    U.ring.scale.set(R, 1, R);
    U.ring.material.opacity = up ? 0.4 * (1 - o.erupted / o.cfg.erupt) : 0.5 + 0.45 * (blink ? 1 : k);
    U.inner.scale.set(R * (up ? 1 : lerp(0.15, 1, (t * 1.6) % 1)), 1, R * (up ? 1 : lerp(0.15, 1, (t * 1.6) % 1)));
    U.inner.material.opacity = up ? 0 : 0.6 * (1 - ((t * 1.6) % 1));
    U.pool.scale.set(R, 1, R);
    U.pool.material.opacity = up ? 0.35 : 0.08 + 0.2 * k;
    U.thread.visible = !up && ((t * 30) | 0) % 3 !== 0;
    U.thread.scale.set(0.04 + 0.12 * k, 60, 0.04 + 0.12 * k);
    U.orb.visible = !up;
    U.orb.scale.setScalar((o.hostile ? 0.1 : 0.15) * (1 + (blink ? 0.4 : 0)));
    U.orb.position.y = 0.2;
    const show = up;
    U.outer.visible = U.core.visible = U.haze.visible = show;
    if (show) {
      // bursts open, roars, then narrows away
      const e = o.erupted, E = o.cfg.erupt, open = easeOutBack(clamp(e / 0.12, 0, 1)), close = clamp((E - e) / 0.3, 0, 1), W = R * open * close, wob = 1 + Math.sin(t * 50) * 0.05;
      U.outer.scale.set(W * wob, 60, W * wob); U.core.scale.set(W * 0.42, 60, W * 0.42); U.haze.scale.set(W * 1.2 * wob, 60, W * 1.2 * wob);
      U.outer.material.opacity = 0.55 * close; U.core.material.opacity = (((t * 30) | 0) % 2 ? 1 : 0.8) * close; U.haze.material.opacity = 0.18 * close;
    }
  },
  dispose(v) {
    Gfx.scene.remove(v.group);
    if (v.group.userData.own) for (const c of v.group.children) c.material.dispose();
  },

  // ---------- the player ----------
  // a point in a bone's frame (metres before the model's scale), in the world
  bonePt(R, name, x, y, z) {
    const b = R.bones[name], v = this._v;
    b.updateWorldMatrix(true, false);
    return v.set(x * AEGIS_SCALE, y * AEGIS_SCALE, z * AEGIS_SCALE).applyMatrix4(b.matrixWorld);
  },
  lensAt(R) { const v = this.bonePt(R, 'cannon', 0, 0.08, -0.37); return { x: v.x, y: v.y, z: v.z }; },
  muzzleAt(R) { const v = this.bonePt(R, 'foreR', 0, -0.42, 0); return { x: v.x, y: v.y, z: v.z }; },
  sync() {
    if (!this.ready) return;
    for (const o of this.parts) o.visible = false;
    this.arcLine.visible = false;
    const p = Game.player, R = Render.rigs && Render.rigs.aegis;
    if (!p || p.charId !== 'aegis' || !R || !R.mesh.visible || p.dead || Game.state === 'menu') return;
    const t = Game.realTime, cp = Gfx.camera.position, fp = Camera.fp;
    // jets
    if (p.thrust > 0.04 && !fp) {
      const q = this._q, d = this._d;
      if (p.dashT > 0) { const l = Math.hypot(p.dashVX, p.dashVZ) || 1; d.set(-p.dashVX / l, -0.45, -p.dashVZ / l).normalize(); }
      else if (p.plunge) d.set(0, 1, 0);
      else d.set(-fwdX(p.yaw) * 0.3, -1, -fwdZ(p.yaw) * 0.3).normalize();
      q.setFromUnitVectors(this._dn, d);
      [-1, 1].forEach((x, i) => {
        const F = this.flames[i], n = this.bonePt(R, 'pack', x * 0.175, -0.27, 0.07);
        F.visible = true;
        F.position.copy(n);
        F.quaternion.copy(q);
        const L = 0.2 + p.thrust * 1.4 * (0.85 + Math.random() * 0.3), w = 0.09 + p.thrust * 0.08;
        F.scale.set(w, L, w);
        F.userData.outer.material.opacity = 0.5 + 0.4 * p.thrust;
      });
    }
    // the beam: charging at the lens, then firing
    const B = p.beamAct, lens = this.lensAt(R);
    if (B) {
      if (B.phase === 'charge') this.showCharge(lens, clamp(B.t / AP.BEAM_CHARGE, 0, 1), t);
      else {
        const d = B.dir, o = lens, dv = this._d.set(d.x, d.y, d.z);
        // from the lens to where the gameplay beam ends
        const go = B.o || o, ex = go.x + d.x * B.len, ey = go.y + d.y * B.len, ez = go.z + d.z * B.len;
        const len = Math.max(0.5, Math.hypot(ex - o.x, ey - o.y, ez - o.z));
        dv.set(ex - o.x, ey - o.y, ez - o.z).normalize();
        const wob = 1 + Math.sin(t * 60) * 0.08, U = this.beam.userData;
        this.beam.visible = true;
        this.beam.position.set(o.x, o.y, o.z);
        this.beam.quaternion.setFromUnitVectors(this._up, dv);
        U.bo.scale.set(0.34 * wob, len, 0.34 * wob); U.bc.scale.set(0.13, len, 0.13); U.bh.scale.set(0.8 * wob, len, 0.8 * wob);
        this.beamRings.forEach((m, i) => {
          const k = (t * 1.8 + i / 3) % 1, s = k * Math.min(len, 9);
          m.visible = true;
          m.position.set(o.x + dv.x * s, o.y + dv.y * s, o.z + dv.z * s);
          m.quaternion.setFromUnitVectors(this._z.set(0, 0, 1), dv);
          m.scale.setScalar(0.4 + k * 0.7);
          m.material.opacity = 0.8 * (1 - k);
        });
        this.flare.visible = true;
        this.flare.position.set(ex, ey, ez);
        this.flare.scale.setScalar(0.5 + Math.random() * 0.2);
        this.charge.visible = true;
        this.charge.position.set(o.x, o.y, o.z);
        this.charge.scale.setScalar(0.32 * wob);
        this.charge.material.color.set('#ffffff');
      }
    } else if (p.ultCharging > 0) this.showCharge(lens, clamp(p.ultCharging / AP.ULT_HOLD, 0, 1), t);
    else if (p.ultAim) {
      // aiming: a steady orb in the lens, so the arc and its ring read past it
      this.charge.visible = true;
      this.charge.position.set(lens.x, lens.y, lens.z);
      this.charge.scale.setScalar(0.16 + Math.sin(t * 30) * 0.02);
      this.charge.material.color.set(((t * 8) | 0) % 2 ? '#ffffff' : AEGIS_P.hi);
    }
    // the gun: the barrels spin while it fires, a flash on each shot
    const G = p.gun;
    if (p.mode === 'gun' && (G.firing || G.flash > 0) && !fp) {
      const m = this.muzzleAt(R), d = p.aimDir;
      this.gunRing.visible = true;
      this.gunRing.position.set(m.x, m.y, m.z);
      this.gunRing.quaternion.setFromUnitVectors(this._z.set(0, 0, 1), this._d.set(d.x, d.y, d.z));
      this.gunRing.rotateZ(t * 40);
      this.gunRing.scale.setScalar(0.16);
      if (G.flash > 0) {
        this.muzzleFlash.visible = true;
        this.muzzleFlash.position.set(m.x + d.x * 0.15, m.y + d.y * 0.15, m.z + d.z * 0.15);
        this.muzzleFlash.scale.setScalar(0.08 + Math.random() * 0.08);
      }
    }
    // aiming the strike: the arc, dashed, and the ring it will erupt in
    const A = p.ultAim;
    if (A && A.plan) {
      const P = A.plan, on = hexLinear(((t * 10) | 0) % 2 ? '#ffffff' : AEGIS_P.hi), off = [0, 0, 0], pts = P.pts.slice(0, 26);
      while (pts.length < 26) pts.push(pts[pts.length - 1]);
      this.arcLine.visible = true;
      FX.writeStrip(this.arcLine, pts, 0.06, cp, (i, out) => { const c = (i >> 1) % 2 === 0 ? on : off; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; });
      const L = P.land, U = this.marker.userData, Rs = STRIKE.ult.R;
      this.marker.visible = true;
      this.marker.position.set(L.x, L.y + 0.06, L.z);
      U.mr.scale.set(Rs, 1, Rs);
      U.mi.scale.setScalar(Rs * (1 - ((t * 0.8) % 1)));
      U.md.scale.set(Rs, 1, Rs);
      U.mx1.scale.set(Rs * 0.5, 1, 1); U.mx2.scale.set(Rs * 0.5, 1, 1);
      U.mx1.material.color.set(((t * 8) | 0) % 2 ? '#ffffff' : AEGIS_P.hi);
    }
  },
  // the shoulder cannon charging: a growing orb at the lens with rings closing on it
  showCharge(o, k, t) {
    this.charge.visible = true;
    this.charge.position.set(o.x, o.y, o.z);
    this.charge.scale.setScalar(0.07 + 0.36 * k + Math.sin(t * 40) * 0.03);
    this.charge.material.color.set(((t * (12 + 24 * k)) | 0) % 2 ? '#ffffff' : AEGIS_P.glow);
    this.chargeHalo.visible = true;
    this.chargeHalo.position.set(o.x, o.y, o.z);
    this.chargeHalo.scale.setScalar(0.35 + 0.8 * k + Math.sin(t * 25) * 0.05);
    this.chargeHalo.material.opacity = 0.1 + 0.22 * k;
    this.chargeRings.forEach((m, i) => {
      const u = (t * (1.4 + 2 * k) + i / 3) % 1;
      m.visible = true;
      m.position.set(o.x, o.y, o.z);
      m.quaternion.copy(Gfx.camera.quaternion);
      m.scale.setScalar(lerp(2.1, 0.15, u));
      m.material.opacity = 0.9 * u * (0.4 + 0.6 * k);
    });
  },
  // its lights: the jets, the beam along its length, the charge, and every strike and probe
  pushLights() {
    const p = Game.player, R = Render.rigs && Render.rigs.aegis, t = Game.realTime;
    for (const h of Game.hazards) {
      if (h.kind !== 'strike' || h.dead) continue;
      const g = h.pos, C = h.col;
      if (h.phase === 'erupt') Gfx.light(g.x, g.y + 4, g.z, C.glow, h.hostile ? 5 : 9, h.R * 4);
      else Gfx.light(g.x, g.y + 0.8, g.z, C.glow, (1 + 3 * h.charge()) * (((t * (4 + 10 * h.charge())) | 0) % 2 ? 1 : 0.4), h.R * 1.6);
    }
    for (const o of Game.projectiles) if (o.kind === 'probe' && !o.dead) Gfx.light(o.pos.x, o.pos.y, o.pos.z, o.col.glow, 2.5, 5);
    if (!p || p.charId !== 'aegis' || p.dead || !R || !R.mesh.visible) return;
    if (p.thrust > 0.3) { const n = this.bonePt(R, 'pack', 0, -0.4, 0.1); Gfx.light(n.x, n.y, n.z, AEGIS_P.glow, 2 * p.thrust, 5); }
    const B = p.beamAct;
    if (B && B.phase === 'fire' && B.o) for (const k of [0.15, 0.5, 0.9]) { const s = B.len * k; Gfx.light(B.o.x + B.dir.x * s, B.o.y + B.dir.y * s, B.o.z + B.dir.z * s, AEGIS_P.glow, 2.5, 7); }
    else if (B || p.ultCharging > 0 || p.ultAim) { const o = this.lensAt(R); Gfx.light(o.x, o.y, o.z, AEGIS_P.glow, 3, 6); }
    if (p.gun.flash > 0) { const m = this.muzzleAt(R); Gfx.light(m.x, m.y, m.z, AEGIS_P.glow, 2.4, 5); }
  },
};
