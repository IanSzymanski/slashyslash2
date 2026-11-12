'use strict';
// The Rift's working parts (riftmap.js lays it out), and tears in reality wherever they open.
//   The moat of void round the dais throws out whatever falls in, torn at (the river's code in foundry.js does
//   it, for any arena's `lava` marked `void`); enemies won't walk into it, they take the bridges.
//   Standing tears stand in pairs: step into one and you come out of its twin, on the arch or the gallery or
//   back on the ground. Only you can use them (REAP-R makes its own).
//   RiftViews draws the void, and every tear: the standing ones, and the ones REAP-R opens to step through, to
//   throw its scythe through, or to arrive by, as the boss or as the player.
const RIFT_NAMES = ['HOLLOW HOUR', 'GRAVE TIDE', 'ECLIPSE', 'LAST RITES', 'VOID CALL', 'DEAD BELLS', 'ASH CHOIR', 'TORN VEIL'];
// a standing tear: how close you have to come, and how long the pair rests after sending you
const GATE = { R: 1.15, COOL: 1.5 };
const RIFT_COL = { main: '#a050ff', hi: '#d8b0ff', deep: '#3a0a7a', spark: { c0: '#ffffff', c1: '#b060ff', c2: '#3a0a7a' } };

const Rift = {
  // the arena's standing tears, there on every wave
  resetProps() {
    const D = World.def;
    if (!D || !D.gates) return;
    for (const G of D.gates) {
      if (Game.hazards.some((h) => h.kind === 'riftgate' && h.spot === G)) continue;
      const a = new RiftGate(G.a, G), b = new RiftGate(G.b, G);
      a.twin = b; b.twin = a;
      Game.hazards.push(a, b);
    }
  },
  // Moves a body through a tear to q at once: the view goes with it rather than swinging after it.
  shift(b, q) {
    const dx = q.x - b.pos.x, dy = q.y - b.pos.y, dz = q.z - b.pos.z;
    b.pos.x = b.prev.x = q.x; b.pos.y = b.prev.y = q.y; b.pos.z = b.prev.z = q.z;
    if (b.rp) { b.rp.x = q.x; b.rp.y = q.y; b.rp.z = q.z; }
    if (b === Game.player && typeof Camera !== 'undefined' && Camera.pivot) { Camera.pivot.x += dx; Camera.pivot.y += dy; Camera.pivot.z += dz; }
  },
  // a burst where something goes into or comes out of a tear
  burst(at, k = 1) {
    FX.sparks(at, Math.round(16 * k), null, TAU, 3, 12 * k + 4, Object.assign({ g: 0, life: 0.6 }, RIFT_COL.spark));
    FX.ring(at, 0.2, 2.2 * k, 0.25, { c: RIFT_COL.main, flat: false });
    FX.light(at, RIFT_COL.main, 4 * k, 7, 0.25);
  },
};

// One of a pair of standing tears.
class RiftGate {
  constructor(pos, spot) {
    this.kind = 'riftgate'; this.spot = spot; this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.twin = null; this.t = rand(0, 6); this.cool = 0; this.flash = 0; this.dead = false;
  }
  center() { return { x: this.pos.x, y: this.pos.y + 1.6, z: this.pos.z }; }
  update(dt) {
    this.t += dt;
    if (this.cool > 0) this.cool -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);
    const P = Game.player, c = this.center();
    if (Math.random() < 0.25) { const a = rand(0, TAU); FX.sparks({ x: c.x + Math.cos(a) * 0.9, y: c.y + rand(-1.3, 1.3), z: c.z + Math.sin(a) * 0.9 }, 1, { x: -Math.cos(a), y: 0, z: -Math.sin(a) }, 0.3, 1, 2.5, Object.assign({ g: 0, life: 0.7 }, RIFT_COL.spark)); }
    if (!P || P.dead || P.ult || this.cool > 0 || !this.twin || Game.cineActive()) return;
    if (distXZ(P.pos, this.pos) > GATE.R || P.pos.y < this.pos.y - 0.6 || P.pos.y > this.pos.y + 2.8) return;
    const q = this.twin.pos;
    if (!World.boxFree(q.x, q.y + 0.02, q.z, P.r, P.h)) return;
    if (P.tether) P.releaseTether();
    P.mantle = null; P.vault = null;
    Controller.dropCling(P);
    Rift.burst(c);
    Rift.shift(P, { x: q.x, y: q.y + 0.02, z: q.z });
    P.vel.x *= 0.35; P.vel.z *= 0.35; P.vel.y = Math.max(0, P.vel.y * 0.2);
    P.iframes = Math.max(P.iframes, 0.25);
    this.cool = this.twin.cool = GATE.COOL; this.flash = this.twin.flash = 1;
    Rift.burst(this.twin.center(), 1.3);
    FX.flash('#b080ff', 0.22);
    Sound.play('warp');
    if (typeof FPFX !== 'undefined') FPFX.kick('dash', { dir: { x: fwdX(P.yaw), z: fwdZ(P.yaw) } });
  }
}

// ---------- drawing it ----------
const RiftViews = {
  ready: false, TEARS: 14, pool: [], shots: [], held: [], voidTex: null,

  init() {
    const add = BossViews.add;
    this.geo = this.tearGeo();
    for (let i = 0; i < this.TEARS; i++) {
      const g = new THREE.Group();
      const glow = new THREE.Mesh(this.geo, add(RIFT_COL.main, { opacity: 0.5 })), rim = new THREE.Mesh(this.geo, add('#ffffff', { opacity: 0.9 }));
      // its heart is the dark behind the world: drawn over the glow, not added to it
      const core = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: '#05020a', transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      glow.renderOrder = 2; rim.renderOrder = 3; core.renderOrder = 4;
      g.add(glow, rim, core);
      g.visible = false;
      Gfx.scene.add(g);
      this.pool.push({ g, glow, rim, core });
    }
    this.ready = true;
  },
  prewarmShow() { if (!this.ready) this.init(); this.pool[0].g.visible = true; },
  prewarmHide() { this.pool[0].g.visible = false; },
  // A tear, upright in the xy plane, 1 tall and 1 across at its widest: a ragged slit that zigzags down its
  // length and comes to a point at each end.
  tearGeo() {
    const N = 14, pos = [], idx = [], R = mulberry32(4421);
    for (let i = 0; i <= N; i++) {
      const u = i / N, w = Math.pow(Math.sin(Math.PI * u), 0.75) * 0.5 * (0.7 + 0.5 * R()), cx = i === 0 || i === N ? 0 : (i % 2 ? 0.1 : -0.1) * (0.5 + R());
      pos.push(cx - w, u - 0.5, 0, cx + w, u - 0.5, 0);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  },
  // The void as a tiling texture: near black, drifts of violet through it, a few far lights.
  voidTexture() {
    const N = 128, c = makeCanvas(N, N), g = c.ctx, R = mulberry32(6607), pts = [];
    for (let i = 0; i < 9; i++) pts.push([R() * N, R() * N, 14 + R() * 26]);
    for (let y = 0; y < N; y += 2) {
      for (let x = 0; x < N; x += 2) {
        let k = 0;
        for (const [px, py, pr] of pts) {
          let dx = Math.abs(x - px), dy = Math.abs(y - py);
          dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
          k += Math.max(0, 1 - Math.hypot(dx, dy) / pr);
        }
        const n = R();
        k = clamp(k * 0.8 + (n - 0.5) * 0.25, 0, 1);
        g.fillStyle = k > 0.8 ? '#7a3ae0' : k > 0.55 ? '#4a1e9a' : k > 0.3 ? '#2a1060' : k > 0.12 ? '#150830' : '#08030f';
        g.fillRect(x, y, 2, 2);
      }
    }
    for (let i = 0; i < 46; i++) { g.fillStyle = R() < 0.3 ? '#ffffff' : '#c8a8ff'; g.fillRect((R() * N) | 0, (R() * N) | 0, 1, 1); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    return t;
  },
  // the void's surface over a reach of the moat (foundry.js lays it and drifts it)
  voidMat(w, l) {
    const tex = (this.voidTex || (this.voidTex = this.voidTexture())).clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / 8, l / 8);
    return new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' });
  },

  // A tear that rips open at `at`, holds and closes: o.h tall, o.w across, for o.dur seconds; o.yaw to stand it
  // across a line (it faces the camera otherwise), o.col its light, o.delay to open late.
  tear(at, o = {}) {
    this.shots.push({ x: at.x, y: at.y, z: at.z, h: o.h || 3.4, w: o.w || 1.3, dur: o.dur || 0.6, t0: Game.time + (o.delay || 0), yaw: o.yaw, col: o.col || null, roll: o.roll || 0 });
    if (this.shots.length > this.TEARS) this.shots.shift();
  },
  // a tear held open this frame, k of the way open (0 to 1)
  hold(at, k, o = {}) { this.held.push({ x: at.x, y: at.y, z: at.z, h: o.h || 3.4, w: o.w || 1.3, k, yaw: o.yaw, col: o.col || null, roll: o.roll || 0 }); },
  sync() {
    if (!this.ready) return;
    const now = Game.time, t = Game.realTime, cp = Gfx.camera.position;
    this.shots = this.shots.filter((s) => now - s.t0 < s.dur && s.t0 - now < 3);
    if (Game.state !== 'menu' || Showroom.active) for (const h of Game.hazards) if (h.kind === 'riftgate' && !h.dead) this.hold(h.center(), 1, { h: 3.3 + 0.5 * h.flash, w: 1.2 + 0.6 * h.flash + 0.08 * Math.sin(h.t * 3), col: h.cool > 0 ? '#5a3a9a' : null });
    let i = 0;
    const draw = (q, k) => {
      const T = this.pool[i];
      if (!T || k <= 0.01) return;
      i++;
      const fl = 0.9 + 0.1 * Math.sin(t * 31 + i * 1.7), W = q.w * (0.2 + 0.8 * k) * fl, H = q.h * easeOutCubic(k);
      T.g.visible = true;
      T.g.position.set(q.x, q.y, q.z);
      T.g.rotation.set(0, q.yaw !== undefined && q.yaw !== null ? q.yaw : Math.atan2(cp.x - q.x, cp.z - q.z), q.roll || 0);
      T.glow.scale.set(W * 1.7, H * 1.1, 1); T.rim.scale.set(W * 1.16, H * 1.03, 1); T.core.scale.set(W, H, 1);
      T.glow.material.color.set(q.col || RIFT_COL.main);
      T.glow.material.opacity = 0.5 * k * fl; T.rim.material.opacity = 0.85 * k; T.core.material.opacity = Math.min(1, k * 1.5);
    };
    for (const s of this.shots) { const a = now - s.t0; if (a >= 0) draw(s, Math.min(clamp(a / 0.1, 0, 1), clamp((s.dur - a) / 0.18, 0, 1))); }
    for (const q of this.held) draw(q, q.k);
    for (; i < this.pool.length; i++) this.pool[i].g.visible = false;
    this.held.length = 0;
  },
  // the newest tear lights what's round it, and the standing tear nearest you
  pushLights() {
    const now = Game.time, s = this.shots[this.shots.length - 1], P = Game.player;
    if (s && now >= s.t0) Gfx.light(s.x, s.y, s.z, RIFT_COL.main, 3.5 * clamp((s.dur - (now - s.t0)) / 0.3, 0, 1), 8);
    if (!P) return;
    let best = null, bd = 30;
    for (const h of Game.hazards) { if (h.kind !== 'riftgate' || h.dead) continue; const d = dist3(h.pos, P.pos); if (d < bd) { bd = d; best = h; } }
    if (best) { const c = best.center(); Gfx.light(c.x, c.y, c.z, RIFT_COL.main, 2 + 3 * best.flash, 8); }
  },
};
