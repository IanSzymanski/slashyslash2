'use strict';
// Effects in 3D: particles, sword trails, slash lines, lightning, rings, glints, gibs, short-lived
// lights, projected text and the screen flash. update(dt) runs in the fixed tick, so slow motion slows
// it as in 2D; sync() writes everything to the GPU once per rendered frame. Speeds are in m/s.

const PALETTES = {
  red: [[255, 246, 246], [255, 92, 110], [226, 24, 50], [120, 8, 30]],
  gold: [[255, 255, 238], [255, 214, 120], [255, 70, 70], [150, 10, 36]],
  enemy: [[255, 250, 220], [255, 200, 90], [230, 110, 40], [120, 40, 20]],
  cyan: [[240, 255, 255], [120, 240, 255], [30, 170, 210], [10, 60, 90]],
};
const _lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const PAL_LIN = {};
for (const k in PALETTES) PAL_LIN[k] = PALETTES[k].map((c) => c.map(_lin));
// colour along a palette: 1 is its hot end, 0 its dark end
function palAt(pal, k, out) {
  const P = PAL_LIN[pal] || PAL_LIN.red, x = clamp(1 - k, 0, 1) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(x)), f = x - i;
  for (let j = 0; j < 3; j++) out[j] = lerp(P[i][j], P[i + 1][j], f);
  return out;
}
// a random direction within a cone of full angle spread around dir (or anywhere when dir is null)
function coneDir(dir, spread) {
  const u = rand(-1, 1), a = rand(0, TAU), s = Math.sqrt(1 - u * u);
  const r = { x: s * Math.cos(a), y: u, z: s * Math.sin(a) };
  if (!dir || spread >= TAU) return r;
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1, d = { x: dir.x / l, y: dir.y / l, z: dir.z / l };
  let px = d.y * r.z - d.z * r.y, py = d.z * r.x - d.x * r.z, pz = d.x * r.y - d.y * r.x;
  const pl = Math.hypot(px, py, pz) || 1;
  px /= pl; py /= pl; pz /= pl;
  const th = rand(0, spread / 2), c = Math.cos(th), sn = Math.sin(th);
  return { x: d.x * c + px * sn, y: d.y * c + py * sn, z: d.z * c + pz * sn };
}

const FX = {
  flashA: 0, flashColor: '#ffffff',
  parts: [], swooshes: [], lines: [], bolts: [], rings: [], glints: [], gibList: [], texts: [], lights: [], decals: [], ghosts: [],
  MAX_DECALS: 30,
  MAX_PARTS: 3000, group: null, glow: null, solid: null, gibMats: new Map(), gibFeet: null,

  init(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const mk = (size, additive) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTS * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.MAX_PARTS * 4), 4));
      geo.setDrawRange(0, 0);
      // no depth writes, so a fading point never cuts a square out of what's behind it
      const mat = new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive });
      // points fade out within 2 m of the camera instead of filling the view
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vNear;')
          .replace('#include <fog_vertex>', '#include <fog_vertex>\nvNear = smoothstep( 0.8, 2.0, - mvPosition.z );');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vNear;')
          .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vNear;');
      };
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      scene.add(pts);
      return pts;
    };
    this.glow = mk(0.09, true);
    this.solid = mk(0.16, false);
    this.gibFeet = { value: new THREE.Color(0.3, 0.26, 0.34) };
  },
  clear() {
    this.parts.length = 0;
    for (const list of [this.swooshes, this.lines, this.bolts, this.rings, this.glints, this.gibList, this.decals]) {
      for (const o of list) this.drop(o);
      list.length = 0;
    }
    this.texts.length = 0; this.lights.length = 0; this.ghosts.length = 0;
    this.flashA = 0;
  },
  // removes every effect without disposing its material; returns the materials
  detachAll() {
    const mats = [];
    for (const list of [this.swooshes, this.lines, this.bolts, this.rings, this.glints, this.decals]) {
      for (const o of list) {
        if (o.mesh) { this.group.remove(o.mesh); mats.push(o.mesh.material); }
        if (o.extra) { for (const m of o.extra) { this.group.remove(m); mats.push(m.material); } o.extra = null; }
      }
      list.length = 0;
    }
    this.lights.length = 0;
    return mats;
  },
  drop(o) {
    if (o.extra) { for (const m of o.extra) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); } o.extra = null; }
    if (!o.mesh) return;
    this.group.remove(o.mesh);
    if (o.ownGeo) o.mesh.geometry.dispose();
    if (o.ownMat) o.mesh.material.dispose();
    o.mesh = null;
  },
  n(count) {
    const v = count * S.visuals.particles;
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
  },
  add(p) {
    if (this.parts.length >= this.MAX_PARTS) this.parts.splice(0, 60);
    this.parts.push(p);
    return p;
  },

  // ---------- particle spawners ----------
  sparks(pos, count, dir, spread, smin, smax, o = {}) {
    const c0 = hexLinear(o.c0 || '#fff4d0'), c1 = hexLinear(o.c1 || '#ff9a3a'), c2 = hexLinear(o.c2 || '#a01828');
    for (let i = this.n(count); i > 0; i--) {
      const d = coneDir(dir, spread), s = rand(smin, smax);
      this.add({ x: pos.x, y: pos.y, z: pos.z, vx: d.x * s, vy: d.y * s, vz: d.z * s, g: o.g === undefined ? 30 : o.g, drag: 2.5, t: 0, dur: rand(0.15, 0.4) * (o.life || 1), c0, c1, c2, glow: true });
    }
  },
  debris(pos, count, colors, speed = 12) {
    for (let i = this.n(count); i > 0; i--) {
      const d = coneDir({ x: 0, y: 1, z: 0 }, 2.6), s = rand(0.3, 1) * speed, c = hexLinear(pick(colors));
      this.add({ x: pos.x, y: pos.y, z: pos.z, vx: d.x * s, vy: d.y * s, vz: d.z * s, g: 40, drag: 0.5, t: 0, dur: rand(0.6, 1.2), c0: c, c1: c, c2: c, glow: false, bounce: true });
    }
  },
  dust(pos, count, o = {}) {
    const c = hexLinear(o.c || '#4a4252');
    for (let i = this.n(count); i > 0; i--) {
      const d = coneDir(o.dir || { x: 0, y: 1, z: 0 }, o.spread || 3), s = rand(0.3, 1) * (o.smax || 3);
      this.add({ x: pos.x + rand(-0.2, 0.2), y: pos.y + 0.05, z: pos.z + rand(-0.2, 0.2), vx: d.x * s, vy: Math.abs(d.y) * s * 0.4 + (o.rise || 0.6), vz: d.z * s, g: -0.5, drag: 3, t: 0, dur: rand(0.4, 0.9) * (o.life || 1), c0: c, c1: c, c2: c, glow: false, fade: true });
    }
  },
  // glowing cinders that drift up from a fire or an explosion
  embers(pos, count) {
    for (let i = this.n(count); i > 0; i--) {
      this.add({ x: pos.x + rand(-0.3, 0.3), y: pos.y, z: pos.z + rand(-0.3, 0.3), vx: rand(-1.4, 1.4), vy: rand(1.8, 5.5), vz: rand(-1.4, 1.4), g: -1, drag: 1.2, t: 0, dur: rand(0.5, 1.3),
        c0: hexLinear('#fff4d0'), c1: hexLinear('#ffb040'), c2: hexLinear('#a03010'), glow: true });
    }
  },
  oil(pos, count, dir, speed = 10) {
    const c = hexLinear('#1a1218');
    for (let i = this.n(count); i > 0; i--) {
      const d = coneDir(dir, 1.6), s = rand(0.4, 1) * speed;
      this.add({ x: pos.x, y: pos.y, z: pos.z, vx: d.x * s, vy: d.y * s, vz: d.z * s, g: 40, drag: 0.8, t: 0, dur: rand(0.4, 0.8), c0: c, c1: c, c2: c, glow: false });
    }
  },
  // short lightning crackles around a point
  elec(pos, r, count, o = {}) {
    for (let i = 0; i < count; i++) {
      const d = coneDir(null, TAU);
      this.bolt(pos, { x: pos.x + d.x * r, y: pos.y + d.y * r, z: pos.z + d.z * r }, rand(0.06, 0.12), { outer: o.outer, core: o.core, jag: r * 0.25, w: 0.04 });
    }
  },

  // ---------- meshes ----------
  // A sword trail: a curved ribbon around a centre (o.follow keeps it on a character). The arc lies in
  // the plane of the facing direction and a sweep axis tilted from horizontal by o.tilt; o.dir picks
  // which way the head travels. The head draws over o.sweep seconds, then the trail fades by o.dur.
  // With o.bolts, that many strands of lightning crawl along its lit stretch, each throwing a fork outward
  // (o.boltPal colours them apart from the trail).
  swoosh(o) {
    const s = Object.assign({ t: 0, dur: 0.24, sweep: 0.09, trail: 0.85, thick: 0.4, dir: 1, tilt: 0, pal: 'red', oy: 1.15, N: 24, bolts: 0 }, o);
    const geo = new THREE.BufferGeometry(), n = (s.N + 1) * 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const idx = [];
    for (let i = 0; i < s.N; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    geo.setIndex(idx);
    s.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    s.mesh.frustumCulled = false; s.ownGeo = true; s.ownMat = true;
    this.group.add(s.mesh);
    if (s.bolts) {
      s.extra = [];
      for (let i = 0; i < s.bolts; i++) s.extra.push(this.stripMesh(this.ARC_BOLT * 2), this.stripMesh(this.FORK_N * 2));
    }
    this.swooshes.push(s);
    return s;
  },
  ARC_BOLT: 18, FORK_N: 6,
  // a drawn slash: a camera-facing band from a to b that grows over o.grow seconds
  slashLine(a, b, o = {}) {
    const l = Object.assign({ a, b, t: 0, dur: 0.35, w: 0.2, pal: 'red', grow: 0.05 }, o);
    l.mesh = this.stripMesh(2); l.ownGeo = true; l.ownMat = true;
    this.lines.push(l);
    return l;
  },
  // Lightning from a to b: a jagged path by midpoint displacement, re-struck every frame, with o.forks short
  // branches off it.
  bolt(a, b, dur = 0.1, o = {}) {
    const B = { a, b, t: 0, dur, outer: hexLinear(o.outer || '#ff2a44'), core: hexLinear(o.core || '#ffe8ee'), jag: o.jag === undefined ? 0.3 : o.jag, w: o.w || 0.07, seg: 0, pts: null, forks: o.forks || 0 };
    const L = dist3(a, b), n = L > 3 ? 33 : L > 1 ? 17 : 9;
    B.n = n;
    B.mesh = this.stripMesh(n * 2); B.ownGeo = true; B.ownMat = true;
    if (B.forks) { B.extra = []; for (let i = 0; i < B.forks; i++) B.extra.push(this.stripMesh(this.FORK_N * 2)); }
    this.bolts.push(B);
    return B;
  },
  // n points from a to b, displaced sideways by midpoint subdivision: amp at the middle, halving each level
  jagPath(a, b, n, amp) {
    const P = new Array(n);
    P[0] = { x: a.x, y: a.y, z: a.z }; P[n - 1] = { x: b.x, y: b.y, z: b.z };
    const fill = (i, j, s) => {
      if (j - i < 2) return;
      const m = (i + j) >> 1, A = P[i], Bp = P[j];
      P[m] = { x: (A.x + Bp.x) / 2 + rand(-s, s), y: (A.y + Bp.y) / 2 + rand(-s, s), z: (A.z + Bp.z) / 2 + rand(-s, s) };
      fill(i, m, s * 0.55); fill(m, j, s * 0.55);
    };
    fill(0, n - 1, amp);
    return P;
  },
  // outer glow and a thin hot core along pts, k its brightness
  writeBolt(mesh, pts, w, cp, outer, core, k) {
    const n = pts.length;
    this.writeStrip(mesh, pts.concat(pts.slice().reverse()), w, cp, (i, out) => {
      const c = i < n ? outer : core;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k;
    }, n);
  },
  // a short branch thrown off point p toward dir (unit), len long
  writeFork(mesh, p, dir, len, w, cp, outer, core, k) {
    const N = this.FORK_N, end = { x: p.x + dir.x * len, y: p.y + dir.y * len, z: p.z + dir.z * len };
    this.writeBolt(mesh, this.jagPath(p, end, N, len * 0.3), w * 0.6, cp, outer, core, k * 0.8);
  },
  stripMesh(n) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    m.frustumCulled = false;
    this.group.add(m);
    return m;
  },
  // flat on the ground by default; o.flat === false stands it up facing the camera
  ring(pos, r0, r1, dur, o = {}) {
    const R = Object.assign({ x: pos.x, y: pos.y, z: pos.z, r0, r1, t: 0, dur, c: '#ff3a52', flat: true }, o);
    R.mesh = new THREE.Mesh(this.ringGeo || (this.ringGeo = new THREE.RingGeometry(0.88, 1, 40)), new THREE.MeshBasicMaterial({ color: R.c, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    R.ownMat = true;
    if (R.flat) R.mesh.rotation.x = -Math.PI / 2;
    this.group.add(R.mesh);
    this.rings.push(R);
    return R;
  },
  // Glints are drawn over walls and never shrink below a minimum size, so a tell reads at any distance.
  glint(pos, o = {}) {
    const g = Object.assign({ x: pos.x, y: pos.y, z: pos.z, t: 0, dur: 0.26, c: '#ffd070', size: 1, follow: null }, o);
    const m = new THREE.SpriteMaterial({ map: Gfx.starTexture(), color: g.c, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true, fog: false });
    g.mesh = new THREE.Sprite(m); g.mesh.renderOrder = 1000; g.ownMat = true;
    this.group.add(g.mesh);
    this.glints.push(g);
    this.light(pos, g.c, 3 * g.size, 4, g.dur);
    return g;
  },
  light(pos, color, intensity, distance, dur = 0.2) { this.lights.push({ x: pos.x, y: pos.y, z: pos.z, color, intensity, distance, t: 0, dur }); },
  // A mark on the ground where it lies under pos: 'gouge' (o.len metres along o.yaw, o.w wide), 'crack'
  // (o.len across) or 'scorch' (o.r radius). With o.wall (an outward normal) it's a gouge standing on a
  // wall instead, o.len tall. Marks start glowing hot, cool, and fade over their last second.
  decal(kind, pos, o = {}) {
    const wall = o.wall;
    const g = wall ? pos.y : World.groundAt(pos.x, pos.z, pos.y + 0.5);
    if (g === -Infinity || pos.y - g > 1) return;
    if (this.decals.length >= this.MAX_DECALS) this.drop(this.decals.shift());
    const d = Object.assign({ t: 0, dur: 6 }, o);
    const geo = wall ? this.wallGeo || (this.wallGeo = new THREE.PlaneGeometry(1, 1)) : this.decalGeo || (this.decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    const m = new THREE.Mesh(geo, Gfx.decalMaterial(kind, { x: pos.x + (wall ? wall.x * 0.3 : 0), y: g, z: pos.z + (wall ? wall.z * 0.3 : 0) }));
    d.mesh = m; d.ownMat = true; d.y = g;
    if (wall) { m.rotation.y = Math.atan2(wall.x, wall.z); this.stretchDecal(d, pos, pos); }
    else if (kind === 'gouge') { m.position.set(pos.x, g + 0.012, pos.z); m.scale.set(d.w || 0.7, 1, Math.abs(d.len || 2)); m.rotation.y = d.yaw || 0; }
    else { m.position.set(pos.x, g + 0.012, pos.z); const s = kind === 'scorch' ? (d.r || 1.5) * 2 : (d.len || 2.5); m.scale.set(s, 1, s); m.rotation.y = rand(0, TAU); }
    m.renderOrder = -1;
    this.group.add(m);
    this.decals.push(d);
    return d;
  },
  // Lays a gouge from a to b: along the ground, or down a wall for a wall mark. Keeps the mark hot while it grows.
  stretchDecal(d, a, b) {
    const m = d.mesh;
    if (!m) return;
    if (d.wall) {
      const n = d.wall, top = Math.max(a.y, b.y), bot = Math.min(a.y, b.y), len = Math.max(0.25, top - bot);
      m.position.set(a.x + n.x * 0.015, (top + bot) / 2, a.z + n.z * 0.015);
      m.scale.set(d.w || 0.16, len, 1);
    } else {
      const dx = b.x - a.x, dz = b.z - a.z, len = Math.max(0.3, Math.hypot(dx, dz));
      m.position.set((a.x + b.x) / 2, d.y + 0.012, (a.z + b.z) / 2);
      if (Math.hypot(dx, dz) > 0.01) m.rotation.y = yawOf(dx, dz);
      m.scale.set(d.w || 0.7, 1, len);
    }
    d.t = Math.min(d.t, 0.05);
  },
  // an afterimage of the player's current pose; render.js takes the snapshot
  ghost(color, dur, alpha) { if (this.ghosts.length < 24) this.ghosts.push({ color, dur, alpha, t: 0, slot: null }); },
  flash(color = '#ffffff', a = 0.5) {
    if (!S.visuals.flashes) return;
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  },
  // floating text in the world, drawn on the HUD; o.always shows it even with damage numbers off
  text(str, pos, o = {}) {
    if (this.texts.length > 40) this.texts.shift();
    this.texts.push(Object.assign({ str, x: pos.x + rand(-0.2, 0.2), y: pos.y, z: pos.z, t: 0, dur: 0.6, c: '#ffffff', scale: 1, vy: 1.6 }, o));
  },
  // Every part of a rigged model is already a separate rigid shape, so a death throws them off as gibs.
  gibs(e, o = {}) {
    const R = e.model;
    if (!R) return;
    R.mesh.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const c = e.center(), kv = o.kv || { x: 0, y: 0, z: 0 };
    const d = o.dir || { x: 0, y: 0, z: 1 }, dl = Math.hypot(d.x, d.z) || 1;
    // a cut throws the halves to either side of the blade's path
    const sx = -d.z / dl, sz = d.x / dl;
    for (const part of R.parts) {
      m.multiplyMatrices(part.bone.matrixWorld, part.local);
      m.decompose(p, q, sc);
      const mesh = new THREE.Mesh(part.geo, this.gibMaterial(part.color, part.glow));
      mesh.position.copy(p); mesh.quaternion.copy(q);
      this.group.add(mesh);
      const side = o.cut ? (sign((p.x - c.x) * sx + (p.z - c.z) * sz) || 1) * 4.5 : 0;
      const a = rand(0, TAU), out = rand(1.5, 4.5);
      this.gibList.push({
        mesh, t: 0, dur: rand(1.8, 2.6),
        vx: kv.x * 0.35 + Math.cos(a) * out + sx * side, vy: kv.y * 0.3 + rand(4, 9), vz: kv.z * 0.35 + Math.sin(a) * out + sz * side,
        ax: rand(-9, 9), ay: rand(-9, 9), az: rand(-9, 9), rest: false,
      });
    }
  },
  // Breaks an object into boxes: pieces [{ size: [w, h, d], at: [x, y, z] in obj's space, color }] thrown off
  // with velocity kv plus some scatter, tumbling and settling like gibs.
  shatter(obj, pieces, kv = { x: 0, y: 0, z: 0 }) {
    obj.updateMatrixWorld(true);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    for (const pc of pieces) {
      const key = pc.size.map((v) => Math.max(0.05, Math.round(v * 20) / 20)).join(',');
      const geo = this.boxGeos.get(key) || this.boxGeos.set(key, new THREE.BoxGeometry(...key.split(',').map(Number))).get(key);
      m.makeTranslation(pc.at[0], pc.at[1], pc.at[2]).premultiply(obj.matrixWorld);
      m.decompose(p, q, sc);
      const mesh = new THREE.Mesh(geo, this.gibMaterial(pc.color, !!pc.glow));
      mesh.position.copy(p); mesh.quaternion.copy(q);
      this.group.add(mesh);
      const a = rand(0, TAU), out = rand(0.8, 2.6);
      this.gibList.push({ mesh, t: 0, dur: rand(2.2, 3.2), vx: kv.x + Math.cos(a) * out, vy: kv.y + rand(1, 4), vz: kv.z + Math.sin(a) * out, ax: rand(-6, 6), ay: rand(-6, 6), az: rand(-6, 6), rest: false });
    }
  },
  boxGeos: new Map(),
  gibMaterial(color, glow) {
    const k = color + (glow ? ':g' : '');
    let mat = this.gibMats.get(k);
    if (!mat) {
      mat = glow ? new THREE.MeshBasicMaterial({ color }) : Gfx.litMaterial({ color }, 'feet', this.gibFeet);
      this.gibMats.set(k, mat);
    }
    return mat;
  },

  // ---------- simulation (fixed tick) ----------
  update(dt) {
    const parts = this.parts;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.dur) continue;
      p.vy -= p.g * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.bounce && p.y < 0 && World.def && World.groundAt(p.x, p.z, p.y + 0.5) > p.y) { p.y = World.groundAt(p.x, p.z, p.y + 0.5); p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      parts[w++] = p;
    }
    parts.length = w;
    const age = (list) => { let k = 0; for (const o of list) { o.t += dt; if (o.t >= o.dur) this.drop(o); else list[k++] = o; } list.length = k; };
    for (const L of [this.swooshes, this.lines, this.bolts, this.rings, this.glints]) age(L);
    for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; }
    this.texts = this.texts.filter((t) => t.t < t.dur);
    for (const l of this.lights) l.t += dt;
    this.lights = this.lights.filter((l) => l.t < l.dur);
    for (const g of this.ghosts) g.t += dt;
    this.ghosts = this.ghosts.filter((g) => g.t < g.dur);
    let kd = 0;
    for (const d of this.decals) {
      d.t += dt;
      if (d.t >= d.dur) { this.drop(d); continue; }
      // hot at first, cooling over a second and a half
      const hot = Math.max(0, 1 - d.t / 1.5);
      d.mesh.material.emissive.setRGB(1 * hot * hot, 0.3 * hot * hot, 0.08 * hot * hot);
      d.mesh.material.opacity = Math.min(1, d.dur - d.t);
      this.decals[kd++] = d;
    }
    this.decals.length = kd;
    let k = 0;
    for (const g of this.gibList) {
      g.t += dt;
      if (g.t >= g.dur) { this.group.remove(g.mesh); continue; }
      const m = g.mesh;
      if (!g.rest) {
        g.vy -= 40 * dt;
        m.position.x += g.vx * dt; m.position.y += g.vy * dt; m.position.z += g.vz * dt;
        m.rotation.x += g.ax * dt; m.rotation.y += g.ay * dt; m.rotation.z += g.az * dt;
        const gy = World.groundAt(m.position.x, m.position.z, m.position.y + 0.3);
        if (m.position.y < gy + 0.06) {
          m.position.y = gy + 0.06;
          if (Math.abs(g.vy) < 3) g.rest = true;
          g.vy *= -0.3; g.vx *= 0.5; g.vz *= 0.5; g.ax *= 0.5; g.ay *= 0.5; g.az *= 0.5;
        }
      }
      if (g.t > g.dur - 0.5) m.scale.setScalar(Math.max(0.01, (g.dur - g.t) / 0.5));
      this.gibList[k++] = g;
    }
    this.gibList.length = k;
  },

  // ---------- GPU sync (each rendered frame) ----------
  sync(cam) {
    this.syncPoints();
    const col = [0, 0, 0], cp = cam.position;
    for (const s of this.swooshes) this.syncSwoosh(s, col);
    for (const l of this.lines) {
      const k = clamp(l.t / l.grow, 0, 1), f = 1 - clamp((l.t - l.grow) / Math.max(0.01, l.dur - l.grow), 0, 1);
      const b = { x: lerp(l.a.x, l.b.x, k), y: lerp(l.a.y, l.b.y, k), z: lerp(l.a.z, l.b.z, k) };
      this.writeStrip(l.mesh, [l.a, b], l.w * (0.4 + 0.6 * f), cp, (i, out) => { palAt(l.pal, f * (i ? 1 : 0.7), out); out[0] *= f; out[1] *= f; out[2] *= f; });
    }
    for (const B of this.bolts) {
      // re-struck every frame so it flickers; a wide outer strip and a thin hot core
      const pts = this.jagPath(B.a, B.b, B.n, B.jag), f = 1 - B.t / B.dur;
      this.writeBolt(B.mesh, pts, B.w, cp, B.outer, B.core, f);
      if (B.extra) {
        for (const m of B.extra) {
          const p = pts[1 + ((Math.random() * (B.n - 2)) | 0)], d = coneDir(null, TAU);
          this.writeFork(m, p, d, rand(0.2, 0.5) * Math.max(0.6, B.jag * 3), B.w, cp, B.outer, B.core, f);
        }
      }
    }
    for (const R of this.rings) {
      const k = R.t / R.dur, r = lerp(R.r0, R.r1, R.ease === false ? k : easeOutCubic(k));
      R.mesh.position.set(R.x, R.y, R.z);
      R.mesh.scale.set(r, r, r);
      if (!R.flat) R.mesh.quaternion.copy(cam.quaternion);
      R.mesh.material.opacity = 1 - k;
    }
    for (const g of this.glints) {
      if (g.follow) { const p = g.follow(); g.x = p.x; g.y = p.y; g.z = p.z; }
      const k = g.t / g.dur, s = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const d = Math.hypot(g.x - cp.x, g.y - cp.y, g.z - cp.z);
      // never smaller than about 7% of the view's height, so a tell reads from across the street
      const size = g.size * Math.max(1.4, d * 0.09) * Math.max(0.05, s);
      g.mesh.position.set(g.x, g.y, g.z);
      g.mesh.scale.set(size * 1.6, size, 1);
    }
  },
  syncPoints() {
    const write = (pts, glow) => {
      const P = pts.geometry.attributes.position, C = pts.geometry.attributes.color;
      let n = 0;
      for (const p of this.parts) {
        if (p.glow !== glow) continue;
        const k = p.t / p.dur;
        const c = k < 0.5 ? [lerp(p.c0[0], p.c1[0], k * 2), lerp(p.c0[1], p.c1[1], k * 2), lerp(p.c0[2], p.c1[2], k * 2)] : [lerp(p.c1[0], p.c2[0], k * 2 - 1), lerp(p.c1[1], p.c2[1], k * 2 - 1), lerp(p.c1[2], p.c2[2], k * 2 - 1)];
        const f = glow ? 1 - k * k : 1;
        P.array[n * 3] = p.x; P.array[n * 3 + 1] = p.y; P.array[n * 3 + 2] = p.z;
        C.array[n * 4] = c[0] * f; C.array[n * 4 + 1] = c[1] * f; C.array[n * 4 + 2] = c[2] * f; C.array[n * 4 + 3] = p.fade ? 0.7 * (1 - k) : 1;
        n++;
      }
      pts.geometry.setDrawRange(0, n);
      P.needsUpdate = true; C.needsUpdate = true;
    };
    write(this.glow, true);
    write(this.solid, false);
  },
  syncSwoosh(s, col) {
    let cx = s.x, cy = s.y, cz = s.z;
    if (s.follow) { const p = s.follow.rp || s.follow.pos; cx = p.x; cy = p.y + s.oy; cz = p.z; }
    // forward pitched along the swing's aim, and the up tipped back with it (PlayerPose.arcDir's plane)
    const pa = s.pitch || 0, cp = Math.cos(pa), sp = Math.sin(pa), yx = fwdX(s.yaw), yz = fwdZ(s.yaw);
    const fx = yx * cp, fy = sp, fz = yz * cp, rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw);
    const ct = Math.cos(s.tilt), st = Math.sin(s.tilt);
    // sweep axis: the right vector tipped toward up by the tilt
    const ax = rx * ct - yx * sp * st, ay = cp * st, az = rz * ct - yz * sp * st;
    const P = s.mesh.geometry.attributes.position, C = s.mesh.geometry.attributes.color;
    const k = Math.min(1, s.t / s.sweep), fade = s.t < s.sweep ? 1 : 1 - (s.t - s.sweep) / Math.max(0.01, s.dur - s.sweep);
    const r1 = s.r, r0 = s.r * (1 - s.thick);
    for (let i = 0; i <= s.N; i++) {
      const u = i / s.N, th = s.dir * (u - 0.5) * s.span, c = Math.cos(th), sn = Math.sin(th);
      const dx = fx * c + ax * sn, dy = fy * c + ay * sn, dz = fz * c + az * sn;
      P.setXYZ(i * 2, cx + dx * r0, cy + dy * r0, cz + dz * r0);
      P.setXYZ(i * 2 + 1, cx + dx * r1, cy + dy * r1, cz + dz * r1);
      const lit = u <= k ? clamp(1 - (k - u) / Math.max(0.05, s.trail), 0, 1) * fade : 0;
      palAt(s.pal, lit, col);
      const g = lit > 0 ? 1 : 0;
      C.setXYZ(i * 2, col[0] * 0.25 * g, col[1] * 0.25 * g, col[2] * 0.25 * g);
      C.setXYZ(i * 2 + 1, col[0] * g * lit, col[1] * g * lit, col[2] * g * lit);
    }
    P.needsUpdate = true; C.needsUpdate = true;
    if (s.extra) this.syncSwooshBolts(s, cx, cy, cz, fx, fy, fz, ax, ay, az, r0, r1, k, fade);
  },
  // Lightning crawling along a trail's lit stretch: each strand follows the arc at its own radius with a jagged
  // path re-struck every frame, and throws a fork out past the blade's reach.
  syncSwooshBolts(s, cx, cy, cz, fx, fy, fz, ax, ay, az, r0, r1, k, fade) {
    const cp = Gfx.camera.position, N = this.ARC_BOLT, u1 = k, u0 = Math.max(0, k - s.trail * 0.8);
    const hot = this._boltHot || (this._boltHot = [0, 0, 0]), glow = this._boltGlow || (this._boltGlow = [0, 0, 0]);
    const bp = s.boltPal || s.pal;
    palAt(bp, 1, hot); palAt(bp, 0.55, glow);
    const at = (u, rad, out) => {
      const th = s.dir * (u - 0.5) * s.span, c = Math.cos(th), sn = Math.sin(th);
      out.x = cx + (fx * c + ax * sn) * rad; out.y = cy + (fy * c + ay * sn) * rad; out.z = cz + (fz * c + az * sn) * rad;
      return out;
    };
    for (let j = 0; j < s.extra.length; j += 2) {
      const strand = s.extra[j], fork = s.extra[j + 1];
      const show = fade > 0.03 && u1 - u0 > 0.03 && Math.random() > 0.12;
      strand.visible = fork.visible = show;
      if (!show) continue;
      const rad = lerp(r0, r1, rand(0.45, 1.05)), amp = 0.09 + 0.05 * (j / 2), pts = [];
      for (let i = 0; i < N; i++) {
        const p = at(lerp(u0, u1, i / (N - 1)), rad, {}), e = i && i < N - 1 ? amp : 0;
        p.x += rand(-e, e); p.y += rand(-e, e); p.z += rand(-e, e);
        pts.push(p);
      }
      const kk = fade * (0.75 + 0.25 * Math.random());
      this.writeBolt(strand, pts, 0.1, cp, glow, hot, kk);
      const fi = 2 + ((Math.random() * (N - 4)) | 0), q = pts[fi], dx = q.x - cx, dy = q.y - cy, dz = q.z - cz, l = Math.hypot(dx, dy, dz) || 1;
      const d = { x: dx / l + rand(-0.4, 0.4), y: dy / l + rand(-0.4, 0.4), z: dz / l + rand(-0.4, 0.4) }, dl = Math.hypot(d.x, d.y, d.z) || 1;
      this.writeFork(fork, q, { x: d.x / dl, y: d.y / dl, z: d.z / dl }, rand(0.35, 0.8), 0.1, cp, glow, hot, kk);
    }
  },
  // Writes a camera-facing band through pts. With split, the second half of pts is a thinner core strip.
  writeStrip(mesh, pts, w, cp, color, split = 0) {
    const P = mesh.geometry.attributes.position, C = mesh.geometry.attributes.color, out = [0, 0, 0];
    const cap = P.count / 2;
    for (let i = 0; i < cap; i++) {
      const p = pts[Math.min(i, pts.length - 1)], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(0, i - 1)];
      const tx = q.x - o.x, ty = q.y - o.y, tz = q.z - o.z;
      const vx = cp.x - p.x, vy = cp.y - p.y, vz = cp.z - p.z;
      let nx = ty * vz - tz * vy, ny = tz * vx - tx * vz, nz = tx * vy - ty * vx;
      const nl = Math.hypot(nx, ny, nz) || 1, hw = (split && i >= split ? w * 0.35 : w) / 2;
      nx = (nx / nl) * hw; ny = (ny / nl) * hw; nz = (nz / nl) * hw;
      P.setXYZ(i * 2, p.x - nx, p.y - ny, p.z - nz);
      P.setXYZ(i * 2 + 1, p.x + nx, p.y + ny, p.z + nz);
      color(i, out);
      C.setXYZ(i * 2, out[0], out[1], out[2]);
      C.setXYZ(i * 2 + 1, out[0], out[1], out[2]);
    }
    // the core strip must not join the outer one
    if (split) {
      const idx = mesh.geometry.index;
      const a = (split - 1) * 2;
      for (let j = 0; j < 6; j++) idx.array[(split - 1) * 6 + j] = a;
      idx.needsUpdate = true;
    }
    P.needsUpdate = true; C.needsUpdate = true;
  },
  // the most recent effect lights take the pool slots
  pushLights() {
    const L = this.lights;
    for (let i = L.length - 1, n = 0; i >= 0 && n < Gfx.POOL; i--, n++) {
      const l = L[i], k = 1 - l.t / l.dur;
      Gfx.light(l.x, l.y, l.z, l.color, l.intensity * k, l.distance);
    }
  },
};
