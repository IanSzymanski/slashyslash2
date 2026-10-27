'use strict';
// KRAG's body, from its concept sheets: a hulking cyborg about 2.9 m tall built of rust-brown pixel stone
// blocks, molten seams glowing between them and cracks of lava running across them. Its left arm is the
// standout: onyx plating, a pauldron twice the size of its right with a great spike on top, a ridge of spikes
// down the forearm and a fist as wide as its chest, spiked across the knuckles. A small helmet sunk between
// the shoulders has a dark face plate with three glowing slits; a mohawk of flame rises off its crest
// (kragviews.js feeds it with the heat). A hexagonal core burns in the chest, a spike juts from the right knee,
// and its feet glow at the toes and soles.
// KragPose turns its state (kragboss.js) into bone rotations, with IK for the limbs.

const KRAG_COL = {
  R1: '#ac6e46', R2: '#8a5636', R3: '#c28c58', R4: '#6a422c', D: '#2e201a', K: '#151012', G: '#c08a44',
  O1: '#2e2834', O2: '#1e1a24', O3: '#463c50', OS: '#3c3446',
  // its molten light, from cold to white hot (kragboss.js picks along it by heat)
  vein: '#ff6a1a', hot: '#ffb03a', white: '#fff0c8', dim: '#8a2a0a', off: '#2a1410',
};
const KRAG_SCALE = 1.45;
// the humanoid skeleton broadened: wide shoulders, the left arm longer and heavier, the head sunk forward
// between the shoulders, and a bone on the crest for the mohawk
const KRAG_BONES = [
  ['hips', null, 0, 0.9, 0],
  ['spine', 'hips', 0, 0.16, 0],
  ['chest', 'spine', 0, 0.3, 0],
  ['head', 'chest', 0, 0.28, -0.05],
  ['armL', 'chest', -0.44, 0.19, 0], ['foreL', 'armL', 0, -0.34, 0], ['handL', 'foreL', 0, -0.31, 0],
  ['armR', 'chest', 0.38, 0.18, 0], ['foreR', 'armR', 0, -0.3, 0], ['handR', 'foreR', 0, -0.27, 0],
  ['thighL', 'hips', -0.17, -0.03, 0], ['shinL', 'thighL', 0, -0.42, 0], ['footL', 'shinL', 0, -0.4, 0],
  ['thighR', 'hips', 0.17, -0.03, 0], ['shinR', 'thighR', 0, -0.42, 0], ['footR', 'shinR', 0, -0.4, 0],
  ['mohawk', 'head', 0, 0.3, 0.02],
];
// the foot bone sits this far (model units) above the sole
const KRAG_FOOT = 0.11;

function kragModel() {
  const C = KRAG_COL, parts = [], R = mulberry32(5150);
  const P = (bone, size, at, color, o = {}) => parts.push(Object.assign({ bone, size, at, color }, o));
  // fullbright lights; tag names the group kragboss.js recolours with the heat
  const L = (bone, size, at, tag, color = C.vein, o = {}) => parts.push(Object.assign({ bone, size, at, color, glow: true, plain: true, tag }, o));
  const rust = () => [C.R1, C.R1, C.R2, C.R3, C.R4][(R() * 5) | 0];
  const onyx = () => [C.O1, C.O1, C.O2, C.O3][(R() * 4) | 0];
  const spike = (bone, len, w, at, rot, color = C.OS) => P(bone, [w, len, w], at, color, { shape: 'hex', taper: 0.03, rot, plain: 0.4 });
  // A stone segment: a glowing core inside a grid of blocks, the seams between them showing the core. nx, ny
  // split it across and up; each block bulges a little and takes its own shade.
  const seg = (bone, [w, h, d], [x, y, z], o = {}) => {
    const nx = o.nx || 1, ny = o.ny || 2, g = o.gap || 0.03, tag = o.tag || 'vein', pal = o.pal || rust;
    L(bone, [w * 0.84, h * 0.94, d * 0.84], [x, y, z], tag);
    const bw = (w - (nx - 1) * g) / nx, bh = (h - (ny - 1) * g) / ny;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = 1 + (R() - 0.5) * 0.08;
        P(bone, [bw * k, bh, d * k], [x - w / 2 + bw / 2 + i * (bw + g), y - h / 2 + bh / 2 + j * (bh + g), z], pal(), o.taper ? { taper: o.taper } : {});
      }
    }
  };
  // a crack of lava across a face: a chain of thin glowing strips through points [u, v] on the face at depth z
  // (axis 'z': u across, v up), or on a side face at x (axis 'x': u along z, v up)
  const crack = (bone, axis, at, pts, tag = 'vein') => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const [u0, v0] = pts[i], [u1, v1] = pts[i + 1], len = Math.hypot(u1 - u0, v1 - v0), a = Math.atan2(v1 - v0, u1 - u0);
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      if (axis === 'z') L(bone, [len + 0.02, 0.022, 0.012], [mu, mv, at], tag, C.vein, { rot: [0, 0, a] });
      else L(bone, [0.012, 0.022, len + 0.02], [at, mv, mu], tag, C.vein, { rot: [-a, 0, 0] });
    }
  };

  // ---------- hips: pelvis, belt and buckle, hanging plates ----------
  P('hips', [0.62, 0.22, 0.42], [0, -0.03, 0], C.D, { plain: 0.6 });
  P('hips', [0.68, 0.08, 0.46], [0, 0.08, 0], C.R4);
  P('hips', [0.16, 0.09, 0.03], [0, 0.08, -0.245], C.G, { plain: 0.5 });
  for (const x of [-1, 1]) {
    P('hips', [0.22, 0.24, 0.06], [x * 0.16, -0.1, -0.22], rust(), { rot: [-0.12, 0, 0] });
    P('hips', [0.06, 0.26, 0.3], [x * 0.34, -0.08, 0], rust(), { rot: [0, 0, x * 0.12] });
    P('hips', [0.2, 0.22, 0.06], [x * 0.16, -0.08, 0.22], rust(), { rot: [0.12, 0, 0] });
  }
  // ---------- abdomen: blocks over the core, a dark plate under the chest ----------
  seg('spine', [0.6, 0.3, 0.42], [0, 0.1, 0], { nx: 2, ny: 2 });
  P('spine', [0.5, 0.06, 0.44], [0, 0.27, 0], C.D, { plain: 0.6 });
  // ---------- chest: a broad block torso, pec plates, the hex core, a high collar, vents on the back ----------
  seg('chest', [0.82, 0.46, 0.52], [0, 0.14, 0.02], { nx: 2, ny: 2, taper: 1.08 });
  for (const x of [-1, 1]) P('chest', [0.33, 0.22, 0.07], [x * 0.2, 0.24, -0.26], rust(), { rot: [0.05, 0, -x * 0.04] });
  P('chest', [0.3, 0.06, 0], [0, 0.04, -0.262], C.K, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6], plain: 0.6 });
  L('chest', [0.19, 0.07, 0], [0, 0.04, -0.28], 'core', C.hot, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6] });
  L('chest', [0.08, 0.075, 0], [0, 0.04, -0.29], 'core', C.white, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6] });
  crack('chest', 'z', -0.3, [[-0.35, 0.3], [-0.26, 0.2], [-0.29, 0.08], [-0.17, -0.02], [-0.12, 0.04]]);
  crack('chest', 'z', -0.3, [[0.36, 0.32], [0.3, 0.17], [0.22, 0.12], [0.24, -0.02], [0.12, 0.05]]);
  crack('chest', 'z', -0.3, [[-0.04, 0.33], [0.02, 0.22], [-0.03, 0.14]]);
  P('chest', [0.56, 0.16, 0.36], [0, 0.4, 0.05], rust());
  P('chest', [0.6, 0.05, 0.38], [0, 0.49, 0.05], C.R4);
  seg('chest', [0.64, 0.38, 0.09], [0, 0.16, 0.29], { nx: 2, ny: 2 });
  for (const x of [-1, 1]) {
    P('chest', [0.12, 0.2, 0.12], [x * 0.17, 0.38, 0.27], C.D, { plain: 0.6 });
    L('chest', [0.08, 0.02, 0.08], [x * 0.17, 0.485, 0.27], 'vein');
  }
  crack('chest', 'z', 0.34, [[-0.3, 0.3], [-0.12, 0.18], [-0.16, 0.0], [0.05, -0.05]]);
  // ---------- head: a squat helmet, dark face plate with three glowing slits, brow, jaw, the crest ----------
  P('head', [0.3, 0.28, 0.32], [0, 0.13, 0], rust(), { taper: 0.88 });
  P('head', [0.25, 0.16, 0.04], [0, 0.1, -0.165], C.K, { plain: 0.6 });
  for (const x of [-0.068, 0, 0.068]) L('head', [0.034, 0.11, 0.02], [x, 0.1, -0.19], 'visor', C.hot);
  P('head', [0.32, 0.05, 0.09], [0, 0.2, -0.14], C.R3);
  P('head', [0.2, 0.06, 0.09], [0, 0.0, -0.135], rust());
  for (const x of [-1, 1]) P('head', [0.05, 0.16, 0.24], [x * 0.165, 0.09, 0.0], rust());
  P('head', [0.07, 0.06, 0.28], [0, 0.28, 0.01], C.D, { plain: 0.6 });
  L('head', [0.04, 0.02, 0.26], [0, 0.315, 0.01], 'vein');
  // ---------- right arm: rust stone, a round pauldron, mechanical fist with glowing joints ----------
  seg('armR', [0.38, 0.3, 0.42], [0.06, 0.06, 0], { ny: 2 });
  P('armR', [0.42, 0.06, 0.45], [0.07, 0.22, 0], C.R3, { rot: [0, 0, -0.15] });
  P('armR', [0.18, 0.3, 0.18], [0, -0.16, 0], C.D, { shape: 'hex', plain: 0.6 });
  seg('armR', [0.25, 0.2, 0.25], [0, -0.19, 0], { ny: 2 });
  P('foreR', [0.18, 0.12, 0.18], [0, 0, 0], C.K, { shape: 'hex', plain: 0.6 });
  seg('foreR', [0.27, 0.28, 0.28], [0, -0.15, 0], { ny: 2, taper: 1.1 });
  P('foreR', [0.29, 0.035, 0.3], [0, -0.29, 0], C.G, { plain: 0.5 });
  P('handR', [0.2, 0.15, 0.2], [0, -0.06, 0], rust());
  P('handR', [0.19, 0.08, 0.13], [0, -0.15, -0.03], C.D, { plain: 0.6 });
  for (const x of [-0.055, 0.055]) L('handR', [0.04, 0.03, 0.02], [x, -0.13, -0.1], 'knuck');
  crack('foreR', 'x', 0.15, [[-0.1, -0.02], [0.0, -0.12], [-0.05, -0.2], [0.06, -0.27]]);
  // ---------- left arm: the onyx arm, massive and spiked ----------
  seg('armL', [0.58, 0.44, 0.6], [-0.1, 0.08, 0], { nx: 2, ny: 2, pal: onyx, tag: 'avein' });
  P('armL', [0.62, 0.07, 0.64], [-0.11, 0.31, 0], C.O3, { rot: [0, 0, 0.12] });
  spike('armL', 0.6, 0.22, [-0.16, 0.58, 0.02], [0, 0, 0.32]);
  spike('armL', 0.32, 0.13, [-0.38, 0.26, 0.2], [0.5, 0, 1.0]);
  spike('armL', 0.3, 0.12, [-0.4, 0.22, -0.18], [-0.5, 0, 1.05]);
  crack('armL', 'z', -0.31, [[-0.35, 0.26], [-0.2, 0.14], [-0.25, 0.0], [-0.08, -0.08]], 'avein');
  crack('armL', 'x', -0.4, [[-0.25, 0.25], [-0.1, 0.1], [0.08, 0.14], [0.22, -0.05]], 'avein');
  P('armL', [0.24, 0.3, 0.24], [0, -0.17, 0], C.O2, { shape: 'hex', plain: 0.6 });
  seg('armL', [0.38, 0.26, 0.4], [-0.02, -0.22, 0], { ny: 2, pal: onyx, tag: 'avein' });
  spike('armL', 0.22, 0.1, [-0.24, -0.2, 0.02], [0, 0, 1.3]);
  P('foreL', [0.28, 0.16, 0.28], [0, 0, 0], C.O2, { shape: 'hex', plain: 0.6 });
  seg('foreL', [0.44, 0.34, 0.46], [0, -0.17, 0], { nx: 2, ny: 2, pal: onyx, tag: 'avein', taper: 1.12 });
  spike('foreL', 0.3, 0.12, [-0.3, -0.06, 0.04], [0, 0, 1.2]);
  spike('foreL', 0.26, 0.11, [-0.3, -0.17, 0.04], [0, 0, 1.25]);
  spike('foreL', 0.22, 0.1, [-0.29, -0.27, 0.04], [0, 0, 1.3]);
  spike('foreL', 0.2, 0.09, [0.0, -0.12, 0.28], [1.3, 0, 0]);
  crack('foreL', 'z', -0.245, [[-0.18, 0.0], [-0.06, -0.08], [-0.12, -0.2], [0.04, -0.3]], 'avein');
  crack('foreL', 'x', -0.24, [[-0.2, -0.03], [-0.02, -0.14], [0.18, -0.1]], 'avein');
  P('foreL', [0.47, 0.04, 0.49], [0, -0.335, 0], C.G, { plain: 0.5 });
  // the fist: a block as wide as the chest, glowing knuckle plates in front, spikes across the knuckles
  seg('handL', [0.42, 0.3, 0.4], [0, -0.13, -0.01], { nx: 2, ny: 1, pal: onyx, tag: 'avein' });
  for (let i = 0; i < 4; i++) {
    const x = -0.15 + i * 0.1;
    P('handL', [0.085, 0.07, 0.1], [x, -0.29, -0.05], C.O3);
    L('handL', [0.055, 0.06, 0.02], [x, -0.19, -0.215], 'knuck', C.hot);
    spike('handL', 0.14, 0.06, [x, -0.38, -0.05], [Math.PI, 0, 0]);
  }
  P('handL', [0.1, 0.16, 0.12], [0.22, -0.1, -0.06], C.O2, { plain: 0.6 });
  // ---------- legs: block thighs and shins over molten cores, a spike off the right knee, glowing boots ----------
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    P('thigh' + s, [0.24, 0.42, 0.24], [0, -0.21, 0], C.D, { shape: 'hex', plain: 0.6 });
    seg('thigh' + s, [0.32, 0.38, 0.33], [0, -0.21, 0], { nx: x < 0 ? 2 : 1, ny: 2 });
    crack('thigh' + s, 'z', -0.175, [[-0.1, -0.05], [0.02, -0.15], [-0.04, -0.26], [0.08, -0.34]]);
    P('shin' + s, [0.26, 0.17, 0.13], [0, 0.0, -0.16], C.R3);
    seg('shin' + s, [0.32, 0.38, 0.34], [0, -0.21, 0], { ny: 2, taper: 1.12 });
    P('shin' + s, [0.36, 0.04, 0.38], [0, -0.385, 0], C.G, { plain: 0.5 });
    crack('shin' + s, 'z', -0.185, [[0.08, -0.08], [-0.03, -0.17], [0.04, -0.3]]);
    seg('foot' + s, [0.36, 0.16, 0.52], [0, -0.03, -0.08], { nx: 1, ny: 1 });
    for (const tx of [-0.11, 0, 0.11]) {
      P('foot' + s, [0.1, 0.1, 0.12], [tx, -0.06, -0.39], rust());
      L('foot' + s, [0.07, 0.04, 0.02], [tx, -0.085, -0.455], 'toe', C.hot);
    }
    L('foot' + s, [0.3, 0.02, 0.46], [0, -0.108, -0.08], 'toe');
  }
  spike('shinR', 0.36, 0.14, [0.1, 0.03, -0.3], [-1.25, 0, -0.35]);
  return {
    bones: KRAG_BONES, scale: KRAG_SCALE, parts, tex: () => Gfx.kragTexture(),
    // the mohawk: tongues of flame along the crest, front to back, each a hot core in an orange flame.
    // kragviews.js sizes them by the heat and makes them flicker; they tear up off the head at full heat.
    attach(r) {
      const g = new THREE.Group(), add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const geo = new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0), outer = add('#ff5a1a', 0.85), inner = add('#ffd060', 0.9);
      const tongues = [];
      for (let i = 0; i < 7; i++) {
        const u = i / 6, z = lerp(-0.16, 0.22, u), base = 0.35 + 0.65 * Math.sin(Math.PI * clamp(u * 0.9 + 0.12, 0, 1));
        const t = new THREE.Group(), o = new THREE.Mesh(geo, outer), n = new THREE.Mesh(geo, inner);
        n.scale.set(0.5, 0.65, 0.5);
        t.add(o, n);
        t.position.set(0, 0, z);
        g.add(t);
        tongues.push({ g: t, base, ph: i * 1.7 });
      }
      g.visible = false;
      r.bones.mohawk.add(g);
      r.extras.push(g);
      r.flames = { g, tongues, outer, inner };
    },
  };
}
MODELS.krag = kragModel();

// ---------- poses ----------
// Each frame KragPose.pick reads KRAG and describes a pose: body lean, twist, drop and roll; legs walking,
// planted (IK to foot targets in the body frame, model units, forward is -z), kneeling, sitting or in the air;
// each arm by rotation, along a direction (a punch reaches straight down it) or reaching for a point; where the
// head looks. apply() lays that onto the bones.
const KragPose = {
  _v: null,
  temps() { return this._v || (this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3())); },
  // a world direction from body-frame parts: forward, up, right
  dir(e, fw, up, rt) {
    const f = e.fwd(), r = e.right(), x = f.x * fw + r.x * rt, z = f.z * fw + r.z * rt, l = Math.hypot(x, up, z) || 1;
    return { x: x / l, y: up / l, z: z / l };
  },
  // a world direction swung yaw radians from forward (positive toward its left) and pitched up
  swing(e, yaw, up) {
    const Y = e.yaw + yaw, c = Math.cos(up);
    return { x: fwdX(Y) * c, y: Math.sin(up), z: fwdZ(Y) * c };
  },

  pick(e) {
    const o = {
      lean: 0.12, twist: 0, drop: 0, roll: 0, legs: 'plant', walk: 0, amt: 0, fR: [0.24, 0, -0.16], fL: [-0.24, 0, 0.16], kneel: 0,
      armR: { rot: [0.15, 0.2, 0.5] }, armL: { rot: [0.25, -0.18, 0.4] }, head: 0, headYaw: 0, tremble: 0, tilt: 0,
    };
    if (e.dying && e.ko) return this.koPose(e, o, e.ko);
    if (e.intro) return this.introPose(e, o, e.intro);
    if (e.stunT > 0) return this.sitPose(e, o);
    const a = e.act;
    this.locomotion(e, o);
    if (a) this.actPose(e, o, a);
    return o;
  },
  // walking, in the air, standing
  locomotion(e, o) {
    const v = e.vel, hs = Math.hypot(v.x, v.z), f = e.fwd();
    if (!e.onGround) {
      o.legs = 'air'; o.lean = 0.15;
      o.armR = { rot: [-0.4, 0.5, 0.6] }; o.armL = { rot: [-0.3, -0.5, 0.6] };
      return;
    }
    if (hs > 0.6) {
      // a heavy stomping run: the faster, the deeper the lean and the wider the swing of the arms
      const k = clamp(hs / 7, 0, 1), fv = (v.x * f.x + v.z * f.z) / hs;
      o.legs = 'walk'; o.walk = e.walk; o.amt = clamp(hs / 4, 0.35, 1.15); o.lean = 0.14 + 0.32 * k * Math.max(0, fv);
      const sw = Math.sin(e.walk) * 0.55 * k;
      o.armR = { rot: [0.25 - sw, 0.22, 0.6] }; o.armL = { rot: [0.3 + sw * 0.6, -0.2, 0.5] };
      o.roll = Math.sin(e.walk) * 0.05 * k;
      return;
    }
    // planted wide, hunched, the heavy arm hanging forward, a slow breath through the shoulders
    const br = Math.sin(e.t * 1.8) * 0.025;
    o.legs = 'plant'; o.fR = [0.26, 0, -0.2]; o.fL = [-0.28, 0, 0.18]; o.drop = 0.08 + br; o.lean = 0.18;
    o.armL = { rot: [0.35 + br, -0.12, 0.5] }; o.armR = { rot: [0.2 - br, 0.22, 0.65] };
  },
  // a fist driven along d (world) at u of the way out (0 chambered at the shoulder, 1 at full reach)
  punch(d, u, back) { return { D: back ? { x: -d.x, y: d.y - 0.6, z: -d.z } : d, reach: back ? 0.45 : lerp(0.5, 1.0, u) }; },
  actPose(e, o, a) {
    const S = KRAG_SCALE, f = e.fwd(), rt = e.right();
    const stance = (drop = 0.2, wide = 1) => { o.legs = 'plant'; o.fR = [0.26 * wide, 0, -0.36]; o.fL = [-0.28 * wide, 0, 0.36]; o.drop = drop; };
    switch (a.kind) {
      case 'melee': return this.meleePose(e, o, a);
      case 'guard': {
        // the onyx forearm raised upright before the face, the right fist cocked at the side; white hot and
        // shaking when the arm is charged
        // it snaps up through the blue flash
        const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.rise || 0.01), 0, 1)), hand = e.local(lerp(-0.6, -0.3, k), lerp(1.4, 2.5, k), lerp(0.35, 0.55, k));
        o.armL = { at: hand, pole: [-0.3, -1, -0.5] };
        o.armR = { rot: [-0.3, 0.35, 1.4] };
        stance(0.22); o.lean = 0.22; o.twist = 0.25; o.head = 0.15;
        o.tremble = a.charged ? 0.8 : a.hitT > 0 ? 0.6 : 0;
        if (Math.hypot(e.vel.x, e.vel.z) > 0.8) { o.legs = 'walk'; o.walk = e.walk; o.amt = 0.5; }
        return;
      }
      case 'flinch': {
        // knocked back off the parry: chest thrown open, arms flung up, head back
        const k = clamp(a.t / 0.15, 0, 1);
        stance(0.12); o.fR = [0.24, 0, -0.5]; o.fL = [-0.26, 0, 0.45];
        o.lean = -0.45 * k; o.head = -0.5 * k; o.twist = 0.2;
        o.armR = { rot: [-1.6 * k, 0.8, 0.5] }; o.armL = { rot: [-1.2 * k, -0.9, 0.5] };
        return;
      }
      case 'recover':
        // hauling breath, hunched over
        stance(0.25); o.lean = 0.42; o.head = 0.25;
        o.armL = { rot: [0.5, -0.15, 0.6] }; o.armR = { rot: [0.4, 0.25, 0.7] };
        return;
      case 'flare': {
        // full heat: the chest thrown out, arms flung wide, head back as the mohawk tears up
        const k = easeOutCubic(clamp(a.t / 0.2, 0, 1));
        stance(0.18, 1.1); o.lean = -0.35 * k; o.head = -0.6 * k; o.tremble = 0.8;
        o.armR = { rot: [-0.4, 1.3 * k, 0.9] }; o.armL = { rot: [-0.4, -1.3 * k, 0.9] };
        return;
      }
      case 'punch': return this.punchPose(e, o, a);
      case 'charge': {
        if (a.phase === 'wind') {
          // the left shoulder dropped and turned in, one foot scraping back
          const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind), 0, 1));
          stance(0.35 * k, 1.1); o.fR = [0.3, 0, -0.2]; o.fL = [-0.24, 0, 0.55];
          o.lean = 0.5 * k; o.twist = 0.75 * k; o.head = -0.1;
          o.armL = { D: this.dir(e, 0.4, -0.5, -0.3), reach: 0.8 }; o.armR = { rot: [0.6, 0.4, 1.2] };
          o.tremble = 0.5;
        } else if (a.phase === 'run') {
          // shoulder first, the spiked pauldron leading
          o.legs = 'walk'; o.walk = e.walk; o.amt = 1.25; o.lean = 0.6; o.twist = 0.8; o.head = -0.2;
          o.armL = { D: this.dir(e, 0.5, -0.4, -0.2), reach: 0.75 }; o.armR = { rot: [0.9, 0.4, 1.4] };
        } else {
          stance(0.3, 1.2); o.fR = [0.3, 0, -0.55]; o.lean = 0.35; o.twist = 0.4;
          o.armL = { D: this.dir(e, 0.6, -0.6, -0.1), reach: 0.85 }; o.armR = { rot: [0.4, 0.6, 0.8] };
        }
        return;
      }
      case 'jump': {
        if (a.phase === 'crouch') {
          // sunk deep into the legs, fists drawn back, shaking
          const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind), 0, 1));
          stance(0.55 * k, 1.15); o.lean = 0.45 * k; o.head = -0.2; o.tremble = 0.4 + 0.5 * k;
          o.armR = { rot: [0.9 * k, 0.5, 0.8] }; o.armL = { rot: [0.9 * k, -0.5, 0.7] };
        } else if (a.phase === 'air') {
          // up high, the onyx fist raised to come down with it
          o.legs = 'air'; o.lean = -0.1;
          const down = e.vel.y < 0;
          o.armL = { D: down ? this.dir(e, 0.6, -0.5, -0.1) : this.dir(e, -0.1, 1, -0.3), reach: 0.95 };
          o.armR = { rot: [-1.0, 0.7, 0.4] };
        } else {
          // the landing: a knee down, the onyx fist driven into the street
          o.legs = 'kneel'; o.kneel = 1; o.drop = 0.62 * S; o.lean = 0.55; o.head = -0.1;
          o.armL = { at: e.handPlant(), pole: [-0.6, 0.2, 0.6] }; o.armR = { rot: [0.4, 0.8, 0.7] };
        }
        return;
      }
      case 'stomp': {
        // a foot hauled up high, the arms out for balance, then driven down with all its weight
        const right = a.foot > 0, side = right ? 'fR' : 'fL', x = right ? 0.26 : -0.26;
        if (a.phase === 'wind') {
          const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind), 0, 1));
          o.legs = 'plant'; o.drop = 0.1; o.lean = -0.15 * k; o.head = 0.1;
          o.fR = [0.26, 0, -0.1]; o.fL = [-0.28, 0, 0.12];
          o[side] = [x, lerp(0, 0.85, k), lerp(-0.1, -0.25, k)];
          o.armR = { rot: [-0.3 * k, 1.0 * k + 0.2, 0.9] }; o.armL = { rot: [-0.3 * k, -1.0 * k - 0.2, 0.8] };
          o.roll = (right ? -0.12 : 0.12) * k;
        } else {
          const k = clamp(a.t / 0.08, 0, 1);
          stance(lerp(0.05, 0.4, k), 1.2); o[side] = [x * 1.1, 0, -0.38];
          o.lean = 0.35 * k; o.head = 0.15;
          o.armR = { rot: [0.5, 0.7, 0.8] }; o.armL = { rot: [0.5, -0.7, 0.8] };
          o.tremble = 0.3;
        }
        return;
      }
      case 'swing': {
        const h = a.hook;
        if (a.phase === 'fire' || a.phase === 'orbit' || a.phase === 'reel') {
          // the right arm out along the chain, the body leaning out from the pivot
          const sh = e.local(0.55, 2.2, 0), dx = h.x - sh.x, dy = h.y - sh.y, dz = h.z - sh.z, l = Math.hypot(dx, dy, dz) || 1;
          o.armR = { D: { x: dx / l, y: dy / l, z: dz / l }, reach: 0.98 };
          o.armL = { D: this.dir(e, -0.3, -0.3, -0.8), reach: 0.8 };
          o.twist = -0.35;
          // swung off its feet, leaning out hard against the chain, legs trailing
          if (a.phase === 'orbit') { const sk = clamp(a.lift / KSWING.LIFT, 0, 1); o.legs = 'air'; o.lean = 0.35 + 0.25 * sk; o.roll = -(0.5 + 0.35 * sk) * a.side; o.head = -0.2; }
          else stance(0.2);
        } else if (a.phase === 'fly') {
          // a comet: the onyx fist out ahead, legs trailing
          o.legs = 'dash'; o.lean = 0.75; o.head = -0.3;
          o.armL = { D: a.dir || this.dir(e, 1, 0, 0), reach: 1 }; o.armR = { rot: [0.6, 0.8, 0.5] };
        } else {
          o.legs = 'kneel'; o.kneel = 1; o.drop = 0.62 * S; o.lean = 0.55;
          o.armL = { at: e.handPlant(), pole: [-0.6, 0.2, 0.6] }; o.armR = { rot: [0.4, 0.8, 0.7] };
        }
        return;
      }
    }
  },
  // the brawler's blows: m.pose names which limb throws it and how
  meleePose(e, o, a) {
    const m = a.m, wind = a.phase === 'wind', k = wind ? easeOutCubic(clamp(a.t / Math.max(0.05, a.wind), 0, 1)) : 1;
    const u = wind ? 0 : easeOutCubic(clamp(a.t / Math.max(0.05, m.swing * 0.6), 0, 1));
    const d = a.aim || this.dir(e, 1, 0, 0), f = e.fwd();
    const stance = (drop, fz = -0.42) => { o.legs = 'plant'; o.fR = [0.26, 0, fz]; o.fL = [-0.28, 0, 0.4]; o.drop = drop; };
    o.tremble = wind && m.stopper ? 0.5 : 0;
    switch (m.pose) {
      case 'jabR': case 'crossR':
        stance(0.2); o.lean = 0.2 + 0.2 * u; o.twist = wind ? 0.35 * k : -0.45 * u;
        o.armR = wind ? this.punch(d, 0, true) : this.punch(d, u);
        o.armL = { rot: [-0.2, -0.3, 1.2] };
        return;
      case 'elbowR':
        stance(0.22); o.lean = 0.3; o.twist = wind ? 0.4 * k : -0.6 * u;
        o.armR = { at: e.local(lerp(0.5, 0.0, u), 2.05, lerp(0.1, 0.45, u)), pole: [0.2, 0.2, -1] };
        o.armL = { rot: [-0.2, -0.3, 1.2] };
        return;
      case 'hookL': {
        // the onyx fist swung round in a flat arc from out wide on its left
        stance(0.25); o.lean = 0.25;
        const ang = wind ? lerp(0.6, 1.5, k) : lerp(1.5, -0.4, u);
        o.armL = { D: this.swing(e, ang, -0.05), reach: 0.82 }; o.twist = wind ? 0.6 * k : lerp(0.6, -0.55, u);
        o.armR = { rot: [-0.2, 0.4, 1.3] };
        return;
      }
      case 'hayL':
        // an overhand haymaker: hauled up behind the head, then down through you
        stance(wind ? 0.15 : 0.35, -0.55); o.lean = wind ? -0.2 * k : 0.55 * u; o.twist = wind ? 0.75 * k : -0.4 * u;
        o.armL = wind ? { D: this.dir(e, -0.6, 0.8, -0.4), reach: 0.9 } : { D: { x: d.x * 0.8, y: lerp(0.5, -0.35, u), z: d.z * 0.8 }, reach: 1 };
        o.armR = { rot: [0.2, 0.6, 1.0] };
        return;
      case 'upL':
        // an uppercut out of a crouch
        stance(wind ? 0.45 * k : lerp(0.45, 0.05, u)); o.lean = wind ? 0.45 * k : lerp(0.45, -0.25, u); o.twist = wind ? 0.5 * k : -0.3 * u;
        o.armL = wind ? { D: this.dir(e, -0.3, -0.9, -0.3), reach: 0.75 } : { D: { x: f.x * 0.6, y: lerp(-0.2, 1, u), z: f.z * 0.6 }, reach: 0.9 };
        o.armR = { rot: [-0.3, 0.4, 1.2] };
        return;
      case 'hammer':
        // both fists overhead, then down on you like a hammer
        stance(wind ? 0.1 : lerp(0.1, 0.55, u), -0.5); o.lean = wind ? -0.3 * k : lerp(-0.3, 0.7, u); o.head = wind ? -0.3 : 0.2;
        if (wind) { o.armL = { D: this.dir(e, -0.15, 1, -0.15), reach: 0.95 }; o.armR = { D: this.dir(e, -0.15, 1, 0.15), reach: 0.95 }; }
        else { o.armL = { D: this.dir(e, 0.8, lerp(0.8, -0.8, u), 0.05), reach: 0.95 }; o.armR = { D: this.dir(e, 0.8, lerp(0.8, -0.8, u), -0.05), reach: 0.95 }; }
        return;
      case 'spinL':
        // a spinning backfist: the body turns a full circle (kragboss.js spins its yaw), the onyx arm out wide
        stance(0.25); o.lean = 0.2; o.twist = wind ? -0.7 * k : 0.3;
        o.armL = { D: this.dir(e, wind ? -0.2 : 0.2, 0, -1), reach: 1 }; o.armR = { rot: [0.2, 0.5, 1.2] };
        return;
      case 'kneeR':
        // grabs at you and drives the right knee up
        o.legs = 'plant'; o.fL = [-0.26, 0, 0.25]; o.drop = 0.05; o.lean = wind ? 0.1 : -0.2;
        o.fR = [0.2, lerp(0.2, 0.9, wind ? k * 0.4 : u), lerp(-0.1, -0.55, wind ? 0.2 : u)];
        o.armR = { D: this.dir(e, 1, wind ? 0 : -0.6, 0.15), reach: 0.85 }; o.armL = { D: this.dir(e, 1, wind ? 0 : -0.6, -0.15), reach: 0.85 };
        return;
      case 'kickR':
        // a chambered front kick that drives you off
        o.legs = 'plant'; o.fL = [-0.26, 0, 0.3]; o.drop = 0.05; o.lean = -0.1 - 0.25 * (wind ? k : u);
        o.fR = wind ? [0.22, lerp(0.1, 0.65, k), lerp(-0.1, -0.15, k)] : [0.2, lerp(0.65, 0.95, u), lerp(-0.15, -1.1, u)];
        o.armR = { rot: [-0.2, 0.6, 1.2] }; o.armL = { rot: [-0.1, -0.6, 1.0] };
        return;
      case 'flyKnee':
        // leaps into a knee, both fists pulled down behind it
        o.legs = e.onGround ? 'plant' : 'air'; o.lean = -0.1;
        o.fR = [0.2, wind ? 0.3 * k : 0.95, wind ? -0.1 : -0.5]; o.fL = [-0.24, wind ? 0 : 0.35, 0.3];
        o.armR = { D: this.dir(e, 0.3, -1, 0.3), reach: 0.9 }; o.armL = { D: this.dir(e, 0.3, -1, -0.3), reach: 0.9 };
        if (wind) { o.drop = 0.35 * k; o.lean = 0.3 * k; }
        return;
      case 'shove':
        // the raised onyx forearm driven forward off the guard
        stance(0.2); o.lean = 0.35; o.twist = 0.3 - 0.5 * u;
        o.armL = { at: e.local(-0.3, 2.4, lerp(0.55, 1.0, u)), pole: [-0.3, -1, -0.5] }; o.armR = { rot: [-0.2, 0.4, 1.3] };
        return;
    }
  },
  // the Molten Fist: the onyx arm drawn far back and down, the body coiled and shaking, then driven along the
  // line it locked on; after it, the arm hangs smoking
  punchPose(e, o, a) {
    const S = KRAG_SCALE;
    if (a.phase === 'wind') {
      const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind * 0.6), 0, 1));
      o.legs = 'plant'; o.fR = [0.3, 0, -0.45]; o.fL = [-0.3, 0, 0.5]; o.drop = 0.42 * k;
      o.lean = 0.3 * k; o.twist = 0.95 * k; o.head = -0.1; o.tremble = 0.4 + 0.8 * k;
      o.armL = { D: this.dir(e, -0.85, -0.25, -0.45), reach: 0.95 };
      o.armR = { D: this.dir(e, 0.9, 0.1, 0.2), reach: 0.7 };
    } else if (a.phase === 'lunge' || (a.phase === 'vent' && a.t < 0.25)) {
      const d = a.dirV || this.dir(e, 1, 0, 0);
      o.legs = a.phase === 'lunge' ? 'dash' : 'plant'; o.fR = [0.3, 0, -0.7]; o.fL = [-0.28, 0, 0.6]; o.drop = 0.3;
      o.lean = 0.6; o.twist = -0.6; o.head = -0.2;
      o.armL = { D: { x: d.x, y: -0.05, z: d.z }, reach: 1 }; o.armR = { rot: [0.6, 0.6, 0.8] };
    } else {
      // venting: hunched over the smoking arm, the right hand braced on the knee
      o.legs = 'plant'; o.fR = [0.28, 0, -0.4]; o.fL = [-0.28, 0, 0.35]; o.drop = 0.3;
      o.lean = 0.55; o.head = 0.3; o.tremble = 0.3;
      o.armL = { rot: [0.6, -0.15, 0.3] }; o.armR = { at: e.local(0.35, 1.25, 0.55), pole: [1, 0, 0] };
    }
  },
  // dazed by its own arm going off: sat in the street, slumped, the arm smoking in its lap
  sitPose(e, o) {
    const S = KRAG_SCALE, k = clamp((e.stunMax - e.stunT) / 0.3, 0, 1), up = clamp(e.stunT / 0.45, 0, 1);
    o.legs = 'sit'; o.drop = lerp(0.1, 0.82 * S, k * up); o.lean = lerp(-0.3, 0.45, k) * up; o.head = 0.45 * up; o.tremble = 0.4;
    o.fR = [0.3, 0, lerp(-0.3, -0.85, up)]; o.fL = [-0.32, 0, lerp(0.2, -0.7, up)];
    o.armL = { rot: [0.3, -0.5, 0.2] }; o.armR = { rot: [0.5, 0.45, 0.6] };
    return o;
  },
  introPose(e, o, I) {
    const S = KRAG_SCALE;
    if (I.stage === 'quake' || (I.stage === 'burst' && !I.landed)) {
      // thrown up out of the street onyx fist first, then the fist brought down to land on
      o.legs = 'air';
      if (I.vy > 0) { o.lean = -0.1; o.head = -0.3; o.armL = { D: this.dir(e, 0.15, 1, -0.2), reach: 1 }; o.armR = { rot: [-0.6, 0.9, 0.6] }; }
      else { o.lean = 0.3; o.head = 0.1; o.armL = { D: this.dir(e, 0.5, -0.7, -0.2), reach: 0.95 }; o.armR = { rot: [-1.2, 0.8, 0.4] }; }
    } else if (I.stage === 'impact' || I.stage === 'burst') {
      o.legs = 'kneel'; o.kneel = 1; o.drop = 0.62 * S; o.lean = 0.6; o.head = 0.2;
      o.armL = { at: e.handPlant(), pole: [-0.6, 0.2, 0.6] }; o.armR = { rot: [0.5, 0.9, 0.6] };
    } else if (I.stage === 'rise') {
      const k = easeOutCubic(clamp((I.ct - KINTRO.BURST - 1.85) / 0.7, 0, 1));
      o.legs = 'kneel'; o.kneel = 1 - k; o.drop = lerp(0.62 * S, 0.1, k); o.lean = lerp(0.6, 0.15, k); o.head = lerp(0.3, 0, k);
      o.armL = k < 0.3 ? { at: e.handPlant(), pole: [-0.6, 0.2, 0.6] } : { rot: [0.35, -0.15, 0.5] }; o.armR = { rot: [0.3, 0.5, 0.6] };
    } else if (I.stage === 'roar') {
      o.legs = 'plant'; o.fR = [0.3, 0, -0.3]; o.fL = [-0.3, 0, 0.3]; o.drop = 0.2; o.lean = -0.35; o.head = -0.6; o.tremble = 0.9;
      o.armR = { rot: [-0.5, 1.3, 1.0] }; o.armL = { rot: [-0.5, -1.3, 1.0] };
    } else {
      // the onyx fist driven into the right palm in front of the chest
      const beat = Math.max(0, Math.sin((I.ct - KINTRO.BURST - 3.6) * 9)) * 0.08, hand = e.local(0.0, 1.85 + beat, 0.62);
      o.legs = 'plant'; o.fR = [0.28, 0, -0.3]; o.fL = [-0.3, 0, 0.3]; o.drop = 0.12; o.lean = 0.1; o.head = 0;
      o.armL = { at: hand, pole: [-1, -0.4, 0] }; o.armR = { at: e.local(0.15, 1.85, 0.6), pole: [1, -0.4, 0] };
    }
    return o;
  },
  koPose(e, o, K) {
    const S = KRAG_SCALE;
    switch (K.stage) {
      case 'impact':
        o.legs = e.onGround ? 'plant' : 'air'; o.fR = [0.24, 0, -0.45]; o.fL = [-0.26, 0, 0.35]; o.lean = -0.5; o.head = -0.6;
        o.armR = { rot: [-1.8, 0.6, 0.4] }; o.armL = { rot: [-1.2, -0.8, 0.5] };
        break;
      case 'stagger':
        o.legs = 'plant'; o.fR = [0.22, 0, -0.25]; o.fL = [-0.26, 0, 0.5]; o.lean = -0.15 + Math.sin(e.t * 8) * 0.08; o.drop = 0.18; o.head = 0.3;
        o.armR = { rot: [0.3, 0.3, 0.5] }; o.armL = { rot: [0.5, -0.2, 0.2] }; o.tremble = 0.6;
        break;
      case 'kneel':
        o.legs = 'kneel'; o.kneel = 1; o.drop = 0.62 * S; o.lean = 0.5; o.head = 0.5;
        o.armL = { at: e.handPlant(), pole: [-0.6, 0.2, 0.6] }; o.armR = { rot: [0.9, 0.2, 1.0] };
        break;
      default: {
        // falls forward from the kneel and lies face down (render.js pitches the whole body)
        const u = K.rot;
        o.legs = 'kneel'; o.kneel = 1 - u; o.drop = lerp(0.62 * S, 0, u); o.lean = lerp(0.5, 0, u); o.head = 0.2;
        o.armR = { rot: [lerp(0.9, -2.6, u), 0.3, 0.2] }; o.armL = { rot: [lerp(0.5, -2.4, u), -0.3, 0.2] };
        o.tilt = -1.42 * u * u;
      }
    }
    return o;
  },

  apply(r, e) {
    const [T, P, D, U, F, A, W] = this.temps();
    const o = this.pick(e), B = r.bones, M = r.mesh, S = KRAG_SCALE;
    Rig.reset(r);
    e.tilt = o.tilt || 0;
    const tr = () => (o.tremble ? rand(-0.015, 0.015) * o.tremble : 0);
    // body: drop and roll at the hips, lean shared by spine and chest, twist in the chest; the head keeps level
    B.hips.position.y -= o.drop;
    B.hips.position.x += tr();
    B.hips.rotation.z = -o.roll;
    B.spine.rotation.x = -o.lean * 0.5;
    B.chest.rotation.x = -o.lean * 0.5;
    B.chest.rotation.y = o.twist;
    B.head.rotation.x = clamp(-o.head + o.lean * 0.7, -0.7, 0.9);
    // in first person nobody stands inside KRAG, but the head folds away as AEGIS's does if the camera sits in it
    M.updateMatrixWorld(true);
    const legIK = (side, tgt) => {
      const x = side === 'R' ? 1 : -1;
      T.set(tgt[0] * S, (tgt[1] + KRAG_FOOT) * S, tgt[2] * S);
      M.localToWorld(T);
      P.set(x * 0.3, 1.4, -3);
      M.localToWorld(P);
      Rig.ik(r, 'thigh' + side, 'shin' + side, 'foot' + side, T, P, -1);
      U.set(0, 1, 0); F.set(fwdX(e.yaw), 0, fwdZ(e.yaw));
      Rig.orient(B['foot' + side], U, F);
    };
    if (o.legs === 'walk') {
      const s = Math.sin(o.walk), c = Math.cos(o.walk), a = o.amt;
      B.thighL.rotation.x = s * 0.65 * a; B.thighR.rotation.x = -s * 0.65 * a;
      B.shinL.rotation.x = -Math.max(0, -c) * 1.0 * a - 0.15; B.shinR.rotation.x = -Math.max(0, c) * 1.0 * a - 0.15;
      B.footL.rotation.x = -B.thighL.rotation.x * 0.3; B.footR.rotation.x = -B.thighR.rotation.x * 0.3;
      B.thighL.rotation.z = -0.06; B.thighR.rotation.z = 0.06;
      B.hips.position.y -= Math.abs(c) * 0.08 * a + 0.06;
      // each footfall thumps and leaves a smouldering print
      const step = Math.floor(o.walk / Math.PI);
      if (e._step !== step) { e._step = step; if (a > 0.45 && e.onGround) e.footfall(step % 2 ? 'L' : 'R'); }
    } else if (o.legs === 'plant') {
      legIK('R', o.fR);
      legIK('L', o.fL);
    } else if (o.legs === 'kneel') {
      // right foot planted ahead, left knee down behind
      const k = o.kneel;
      legIK('R', [0.24, 0, lerp(-0.2, -0.45, k)]);
      legIK('L', [-0.24, lerp(0, 0.05, k), lerp(0.2, 0.65, k)]);
      if (k > 0.5) B.footL.rotation.x += 1.0 * k;
    } else if (o.legs === 'sit') {
      // sat on the street, legs out in front, knees up
      legIK('R', o.fR);
      legIK('L', o.fL);
    } else {
      // in the air: knees bent, toes down; trailing behind in a dash or a comet
      const dash = o.legs === 'dash' ? 1 : 0;
      B.thighR.rotation.x = 0.7 - 0.9 * dash; B.shinR.rotation.x = -1.0 - 0.2 * dash;
      B.thighL.rotation.x = 0.25 - 1.1 * dash; B.shinL.rotation.x = -0.9 - 0.4 * dash;
      B.footL.rotation.x = B.footR.rotation.x = 0.4;
      B.thighL.rotation.z = -0.15; B.thighR.rotation.z = 0.15;
      if (o.fR && o.fR[1] > 0.3) legIK('R', o.fR);
    }
    B.head.rotation.y = clamp(o.headYaw - o.twist * 0.6, -0.8, 0.8);
    B.chest.updateMatrixWorld(true);
    // arms
    const arm = (side, spec) => {
      const x = side === 'R' ? 1 : -1;
      if (spec.rot) {
        B['arm' + side].rotation.set(spec.rot[0], 0, spec.rot[1]);
        B['fore' + side].rotation.x = spec.rot[2];
        return;
      }
      Rig.boneWorld(r, 'arm' + side, A);
      if (spec.D) {
        const len = B['fore' + side].position.length() + B['hand' + side].position.length();
        D.set(spec.D.x, spec.D.y, spec.D.z).normalize();
        T.copy(A).addScaledVector(D, (spec.reach || 0.95) * len);
      } else T.set(spec.at.x, spec.at.y, spec.at.z);
      T.x += tr(); T.y += tr();
      const pl = spec.pole || [x * 0.8, -0.4, 0.9];
      P.set(pl[0], pl[1], pl[2]).applyQuaternion(M.quaternion).add(A);
      Rig.ik(r, 'arm' + side, 'fore' + side, 'hand' + side, T, P, 1);
    };
    arm('R', o.armR);
    arm('L', o.armL);
    // its lights, by heat
    const tint = e.tints();
    for (const k in tint) Rig.tint(r, k, tint[k]);
  },
};
Poses.krag = (r, e) => KragPose.apply(r, e);
