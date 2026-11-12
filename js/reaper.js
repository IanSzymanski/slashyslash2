'use strict';
// REAP-R's body, from its concept sheets: a gaunt machine about 2.9 m tall in gunmetal pixel camo, a steel skull
// with burning violet eyes sunk in a hood, a hexagonal core in its chest and violet light in every joint, and a
// tattered violet cloak that hangs from its shoulders to its calves in three strips, each swinging on its own.
// It carries a scythe longer than it is tall: a segmented shaft, a crescent blade with a violet edge, and a jet
// on the back of the head that boosts every swing (reaperviews.js lights its flame).
// The scythe rides the right hand's `weapon` bone; ReaperPose aims it in the world each frame and puts the left
// hand on the shaft. MODELS.reaperScythe is the scythe on its own, for when it's thrown.
// ReaperPose turns its state (reaperboss.js, or reaperplayer.js as the player) into bone rotations, with IK.

const REAPER_COL = {
  M1: '#6c6874', M2: '#4c4856', M3: '#8a8692', D: '#24222c', K: '#121018', B: '#a8a4b0',
  P1: '#4e1c72', P2: '#3a1458', P3: '#6a2a96', P4: '#2a0e40',
  glow: '#b44aff', hot: '#ecc8ff', dim: '#3a1458', off: '#1a1420',
};
const REAPER_SCALE = 1.4;
const REAPER_BONES = [
  ['hips', null, 0, 1.02, 0],
  ['spine', 'hips', 0, 0.16, 0],
  ['chest', 'spine', 0, 0.3, 0],
  ['head', 'chest', 0, 0.3, -0.03],
  ['armL', 'chest', -0.37, 0.2, 0], ['foreL', 'armL', 0, -0.34, 0], ['handL', 'foreL', 0, -0.31, 0],
  ['armR', 'chest', 0.37, 0.2, 0], ['foreR', 'armR', 0, -0.34, 0], ['handR', 'foreR', 0, -0.31, 0],
  ['thighL', 'hips', -0.15, -0.03, 0], ['shinL', 'thighL', 0, -0.46, 0], ['footL', 'shinL', 0, -0.44, 0],
  ['thighR', 'hips', 0.15, -0.03, 0], ['shinR', 'thighR', 0, -0.46, 0], ['footR', 'shinR', 0, -0.44, 0],
  ['weapon', 'handR', 0, -0.05, 0],
  ['cloakLa', 'chest', -0.3, 0.32, 0.25], ['cloakLb', 'cloakLa', 0, -0.56, 0],
  ['cloakMa', 'chest', 0, 0.34, 0.3], ['cloakMb', 'cloakMa', 0, -0.56, 0],
  ['cloakRa', 'chest', 0.3, 0.32, 0.25], ['cloakRb', 'cloakRa', 0, -0.56, 0],
];
// the foot bone sits this far (model units) above the sole
const REAPER_FOOT = 0.09;
// the scythe along its bone's y: the butt, the head, and where the blade's tip ends up (forward of the head, -z)
const SCYTHE = { BUTT: -0.92, HEAD: 1.32, TIP: [0.5, -1.14] };

// The scythe's parts on `bone`: shaft up +y, blade curving forward (-z) and down from the head, the jet behind it.
function reaperScytheParts(bone, parts) {
  const C = REAPER_COL;
  const P = (size, at, color, o = {}) => parts.push(Object.assign({ bone, size, at, color }, o));
  const L = (size, at, tag, color = C.glow, o = {}) => parts.push(Object.assign({ bone, size, at, color, glow: true, plain: true, tag }, o));
  P([0.07, SCYTHE.HEAD - SCYTHE.BUTT, 0.07], [0, (SCYTHE.HEAD + SCYTHE.BUTT) / 2, 0], C.K, { shape: 'hex', plain: 0.5 });
  for (const y of [-0.62, -0.22, 0.42, 0.86]) P([0.115, 0.1, 0.115], [0, y, 0], y > 0 ? C.M2 : C.M1, { shape: 'hex' });
  L([0.02, 0.2, 0.076], [0, -0.42, 0], 'vein');
  // the pommel: a faceted counterweight, a slit of light in it
  P([0.17, 0.2, 0.17], [0, SCYTHE.BUTT - 0.02, 0], C.M2, { shape: 'hex', taper: 0.9 });
  P([0.15, 0.16, 0.15], [0, SCYTHE.BUTT - 0.18, 0], C.M1, { shape: 'hex', taper: 0.25, rot: [Math.PI, 0, 0] });
  L([0.03, 0.1, 0.176], [0, SCYTHE.BUTT - 0.02, 0], 'vein');
  // the head: a block the blade and the jet bolt to, a brace back down to the shaft
  P([0.15, 0.26, 0.34], [0, SCYTHE.HEAD + 0.02, 0.02], C.M2);
  P([0.17, 0.12, 0.2], [0, SCYTHE.HEAD + 0.1, -0.06], C.M3);
  P([0.06, 0.34, 0.07], [0, SCYTHE.HEAD - 0.22, -0.13], C.M1, { rot: [0.5, 0, 0] });
  L([0.156, 0.05, 0.05], [0, SCYTHE.HEAD + 0.02, -0.02], 'vein');
  // the blade: segments along an arc, a dark segmented back and a burning inner edge, tapering to the tip
  const R = 1.16, cy = SCYTHE.HEAD - R + 0.06, N = 8, a0 = 0.1, a1 = 1.38;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N, a = lerp(a0, a1, u), len = (R * (a1 - a0)) / N * 1.12, w = lerp(0.36, 0.06, Math.pow(u, 1.15));
    const at = (r) => [0, cy + r * Math.cos(a), -r * Math.sin(a)];
    P([0.05, w * 0.55, len], at(R + w * 0.18), i % 2 ? C.M2 : C.D, { rot: [-a, 0, 0] });
    P([0.03, w * 0.22, len * 0.6], at(R + w * 0.5), C.M3, { rot: [-a, 0, 0] });
    L([0.022, w * 0.62, len], at(R - w * 0.36), 'blade', C.glow, { rot: [-a, 0, 0] });
    L([0.026, w * 0.2, len], at(R - w * 0.62), 'edge', C.hot, { rot: [-a, 0, 0] });
  }
  // the jet: a banded barrel pointing back off the head, rings of light round it and a bright throat
  P([0.24, 0.46, 0.24], [0, SCYTHE.HEAD + 0.03, 0.4], C.K, { shape: 'hex', rot: [Math.PI / 2, 0, 0], plain: 0.5 });
  for (const z of [0.24, 0.36, 0.48, 0.6]) P([0.27, 0.05, 0.27], [0, SCYTHE.HEAD + 0.03, z], C.M2, { shape: 'hex', rot: [Math.PI / 2, 0, 0] });
  for (const z of [0.3, 0.42, 0.54]) L([0.25, 0.03, 0.25], [0, SCYTHE.HEAD + 0.03, z], 'jet', C.glow, { shape: 'hex', rot: [Math.PI / 2, 0, 0] });
  L([0.17, 0.02, 0.17], [0, SCYTHE.HEAD + 0.03, 0.64], 'jet', C.hot, { shape: 'hex', rot: [Math.PI / 2, 0, 0] });
}

function reaperModel() {
  const C = REAPER_COL, parts = [], R = mulberry32(6660);
  const P = (bone, size, at, color, o = {}) => parts.push(Object.assign({ bone, size, at, color }, o));
  // fullbright lights; tag names the group the pose recolours
  const L = (bone, size, at, tag, color = C.glow, o = {}) => parts.push(Object.assign({ bone, size, at, color, glow: true, plain: true, tag }, o));
  const metal = () => [C.M1, C.M1, C.M2, C.M3][(R() * 4) | 0];
  const cloth = () => [C.P1, C.P1, C.P2, C.P3][(R() * 4) | 0];
  // ---------- hips: pelvis, belt, hanging plates ----------
  P('hips', [0.5, 0.2, 0.34], [0, -0.03, 0], C.D, { plain: 0.6 });
  P('hips', [0.54, 0.07, 0.38], [0, 0.07, 0], C.M2);
  P('hips', [0.16, 0.22, 0.08], [0, -0.1, -0.19], C.M1, { taper: 0.7, rot: [Math.PI, 0, 0] });
  L('hips', [0.06, 0.05, 0.02], [0, 0.07, -0.2], 'vein');
  for (const x of [-1, 1]) {
    P('hips', [0.07, 0.24, 0.26], [x * 0.28, -0.08, 0], metal(), { rot: [0, 0, x * 0.1] });
    P('hips', [0.18, 0.18, 0.06], [x * 0.15, -0.08, 0.18], C.M2, { rot: [0.1, 0, 0] });
  }
  // ---------- abdomen: a dark spine behind ribs of plate, light between them ----------
  P('spine', [0.32, 0.3, 0.26], [0, 0.12, 0], C.K, { plain: 0.6 });
  for (let i = 0; i < 3; i++) {
    P('spine', [0.46 - i * 0.02, 0.06, 0.32], [0, 0.02 + i * 0.1, 0], i % 2 ? C.M1 : C.M2);
    L('spine', [0.26, 0.022, 0.02], [0, 0.07 + i * 0.1, -0.14], 'vein');
  }
  // ---------- chest: faceted plate, the hex core, ribs of light either side, a high collar ----------
  P('chest', [0.7, 0.4, 0.42], [0, 0.13, 0.01], C.M1, { taper: 1.08 });
  for (const x of [-1, 1]) {
    P('chest', [0.3, 0.2, 0.08], [x * 0.18, 0.2, -0.21], C.M3, { rot: [0.06, 0, -x * 0.05] });
    for (let i = 0; i < 3; i++) L('chest', [0.16, 0.022, 0.02], [x * 0.22, -0.02 + i * 0.055, -0.225], 'vein');
    P('chest', [0.12, 0.3, 0.3], [x * 0.33, 0.1, 0.02], C.M2);
  }
  P('chest', [0.26, 0.06, 0], [0, 0.12, -0.232], C.K, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6], plain: 0.6 });
  L('chest', [0.17, 0.07, 0], [0, 0.12, -0.25], 'core', C.glow, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6] });
  L('chest', [0.07, 0.075, 0], [0, 0.12, -0.26], 'core', C.hot, { shape: 'hex', rot: [Math.PI / 2, 0, Math.PI / 6] });
  P('chest', [0.56, 0.3, 0.06], [0, 0.12, 0.21], C.M2);
  P('chest', [0.44, 0.12, 0.3], [0, 0.37, 0.03], C.D, { plain: 0.6 });
  // ---------- head: a steel skull, dark sockets with burning eyes, a jaw of teeth, the hood round it ----------
  P('head', [0.24, 0.24, 0.26], [0, 0.14, -0.02], C.B, { taper: 0.92, plain: 0.5 });
  P('head', [0.18, 0.09, 0.17], [0, 0.0, -0.07], C.B, { taper: 1.15, plain: 0.5 });
  P('head', [0.21, 0.075, 0.03], [0, 0.165, -0.145], C.K, { plain: true });
  P('head', [0.04, 0.06, 0.03], [0, 0.085, -0.15], C.K, { plain: true });
  P('head', [0.15, 0.03, 0.02], [0, 0.02, -0.16], C.K, { plain: true });
  for (const x of [-0.045, 0, 0.045]) P('head', [0.02, 0.035, 0.022], [x, 0.02, -0.161], C.B, { plain: true });
  for (const x of [-1, 1]) L('head', [0.06, 0.042, 0.02], [x * 0.055, 0.165, -0.158], 'eye', C.hot);
  P('head', [0.38, 0.1, 0.44], [0, 0.31, 0.03], C.P1);
  P('head', [0.32, 0.08, 0.16], [0, 0.3, -0.2], C.P3, { rot: [0.3, 0, 0] });
  P('head', [0.38, 0.4, 0.09], [0, 0.13, 0.22], C.P2);
  for (const x of [-1, 1]) P('head', [0.08, 0.36, 0.38], [x * 0.19, 0.14, 0.02], x < 0 ? C.P1 : C.P3);
  P('head', [0.3, 0.14, 0.2], [0, -0.06, 0.16], C.P2);
  // the cowl round the neck and over the shoulders
  P('chest', [0.84, 0.13, 0.5], [0, 0.33, 0.06], C.P1);
  for (const x of [-1, 1]) {
    P('chest', [0.26, 0.2, 0.12], [x * 0.2, 0.26, -0.2], C.P3, { rot: [0.25, 0, x * 0.15] });
    P('chest', [0.14, 0.14, 0.1], [x * 0.3, 0.17, -0.2], C.P2, { rot: [0.2, 0, x * 0.3] });
  }
  // ---------- arms: round pauldrons ringed with light, plated forearms, heavy hands ----------
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    P('arm' + s, [0.34, 0.3, 0.34], [x * 0.05, 0.03, 0], C.M1, { shape: 'hex', rot: [0, 0, Math.PI / 2] });
    P('arm' + s, [0.2, 0.32, 0.2], [x * 0.06, 0.03, 0], C.K, { shape: 'hex', rot: [0, 0, Math.PI / 2], plain: 0.6 });
    L('arm' + s, [0.12, 0.33, 0.12], [x * 0.065, 0.03, 0], 'vein', C.glow, { shape: 'hex', rot: [0, 0, Math.PI / 2] });
    P('arm' + s, [0.2, 0.3, 0.2], [0, -0.18, 0], metal());
    P('fore' + s, [0.17, 0.14, 0.17], [0, 0, 0], C.K, { shape: 'hex', plain: 0.6 });
    P('fore' + s, [0.22, 0.28, 0.24], [0, -0.16, 0], C.M1, { taper: 1.1 });
    P('fore' + s, [0.08, 0.26, 0.26], [x * 0.11, -0.15, 0], C.M3);
    L('fore' + s, [0.026, 0.16, 0.02], [0, -0.16, -0.125], 'vein');
    P('fore' + s, [0.24, 0.035, 0.26], [0, -0.3, 0], C.M2);
    P('hand' + s, [0.16, 0.13, 0.16], [0, -0.05, 0], C.D, { plain: 0.6 });
    P('hand' + s, [0.15, 0.09, 0.11], [0, -0.15, -0.02], C.K, { plain: 0.6 });
    L('hand' + s, [0.1, 0.03, 0.02], [0, -0.08, -0.085], 'vein');
  }
  // ---------- legs: faceted thighs, knee discs ringed with light, greaves, armoured boots ----------
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    P('thigh' + s, [0.26, 0.42, 0.28], [0, -0.22, 0], metal(), { taper: 1.12 });
    P('thigh' + s, [0.2, 0.26, 0.06], [0, -0.2, -0.15], C.M3, { rot: [0.05, 0, 0] });
    P('thigh' + s, [0.07, 0.3, 0.22], [x * 0.14, -0.22, 0], C.M2);
    P('shin' + s, [0.22, 0.3, 0.22], [0, 0, -0.01], C.K, { shape: 'hex', rot: [0, 0, Math.PI / 2], plain: 0.6 });
    L('shin' + s, [0.1, 0.32, 0.1], [0, 0, -0.01], 'vein', C.glow, { shape: 'hex', rot: [0, 0, Math.PI / 2] });
    P('shin' + s, [0.22, 0.4, 0.26], [0, -0.23, 0], C.M2, { taper: 1.14 });
    P('shin' + s, [0.24, 0.3, 0.08], [0, -0.2, -0.15], C.M1, { rot: [-0.04, 0, 0] });
    P('shin' + s, [0.26, 0.04, 0.3], [0, -0.41, 0], C.M3);
    L('shin' + s, [0.07, 0.07, 0.02], [0, -0.36, -0.16], 'vein');
    P('foot' + s, [0.26, 0.14, 0.44], [0, -0.02, -0.07], C.M2);
    P('foot' + s, [0.24, 0.1, 0.16], [0, -0.04, -0.33], C.M1);
    P('foot' + s, [0.2, 0.08, 0.1], [0, 0.07, -0.1], C.M3, { rot: [0.4, 0, 0] });
    L('foot' + s, [0.2, 0.02, 0.36], [0, -0.088, -0.08], 'vein');
  }
  // ---------- the cloak: three strips down the back, each in two lengths, frayed at the hem ----------
  for (const [k, w] of [['L', 0.34], ['M', 0.36], ['R', 0.34]]) {
    P('cloak' + k + 'a', [w, 0.6, 0.05], [0, -0.28, 0], cloth());
    P('cloak' + k + 'a', [w * 0.6, 0.3, 0.055], [k === 'L' ? -0.05 : 0.05, -0.36, 0.01], cloth());
    P('cloak' + k + 'b', [w * 0.94, 0.4, 0.045], [0, -0.2, 0], cloth());
    // tatters: narrower and narrower strips, uneven
    for (let i = 0; i < 4; i++) {
      const tw = w * (0.3 - i * 0.04), tx = (i - 1.5) * w * 0.25 + (R() - 0.5) * 0.04, tl = 0.16 + R() * 0.3;
      P('cloak' + k + 'b', [tw, tl, 0.04], [tx, -0.4 - tl / 2, 0], i % 2 ? C.P4 : cloth());
      if (R() < 0.6) P('cloak' + k + 'b', [tw * 0.5, 0.12, 0.035], [tx + (R() - 0.5) * 0.04, -0.4 - tl - 0.06, 0], C.P4);
    }
  }
  reaperScytheParts('weapon', parts);
  return {
    bones: REAPER_BONES, scale: REAPER_SCALE, parts, tex: () => Gfx.reaperTexture(),
    // the jet's flame off the back of the scythe's head: a hot core in a violet flame (reaperviews.js sizes it)
    attach(r) {
      const add = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const geo = new THREE.ConeGeometry(1, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5), outer = add('#9a3aff', 0.8), inner = add('#f0d8ff', 0.9);
      const g = new THREE.Group(), o = new THREE.Mesh(geo, outer), n = new THREE.Mesh(geo, inner);
      n.scale.set(0.5, 0.5, 0.7);
      g.add(o, n);
      g.position.set(0, (SCYTHE.HEAD + 0.03) * REAPER_SCALE, 0.66 * REAPER_SCALE);
      g.visible = false;
      r.bones.weapon.add(g);
      r.extras.push(g);
      r.jet = { g, outer, inner };
    },
  };
}
MODELS.reaper = reaperModel();
// the scythe alone, spinning about its middle when it's thrown
MODELS.reaperScythe = (() => {
  const parts = [];
  reaperScytheParts('root', parts);
  for (const p of parts) p.at = [p.at[0], p.at[1] - 0.35, p.at[2]];
  return { bones: [['root', null, 0, 0, 0]], scale: REAPER_SCALE, parts, tex: () => Gfx.reaperTexture() };
})();

// ---------- poses ----------
// Each frame ReaperPose.pick reads REAP-R and describes a pose in KRAG's vocabulary (krag.js): body lean, twist,
// drop and roll; legs walking, planted, kneeling, gliding or in the air; each arm by rotation, along a direction
// or reaching for a point; plus the scythe: `scy` gives the way its shaft points (up, butt to head), the way its
// blade faces, and where on the shaft the right hand grips (grip: along it from its middle, toward the head);
// armL { shaft: y } puts the left hand on the shaft the same way. thin squeezes the whole body toward a line as it goes into a tear.
const ReaperPose = {
  _v: null,
  temps() { return this._v || (this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3())); },
  dir(e, fw, up, rt) {
    const f = e.fwd(), r = e.right(), x = f.x * fw + r.x * rt, z = f.z * fw + r.z * rt, l = Math.hypot(x, up, z) || 1;
    return { x: x / l, y: up / l, z: z / l };
  },
  base() {
    return {
      lean: 0.08, twist: 0, drop: 0, roll: 0, legs: 'plant', walk: 0, amt: 0, fR: [0.2, 0, -0.14], fL: [-0.2, 0, 0.14], kneel: 0,
      armR: { rot: [0.1, 0.15, 0.4] }, armL: { rot: [0.15, -0.14, 0.3] }, head: 0, headYaw: 0, tremble: 0, tilt: 0,
      scy: null, armed: true, thin: 1, flare: 0,
    };
  },
  // at rest: the scythe upright at its right side, the butt near the ground, the blade over its head facing forward
  rest(e, o, t) {
    const br = Math.sin(t * 1.6) * 0.02;
    o.legs = 'plant'; o.fR = [0.2, 0, -0.14]; o.fL = [-0.22, 0, 0.14]; o.drop = 0.04 + br; o.lean = 0.1;
    o.armR = { at: e.local(0.62, 1.55 + br, 0.32), pole: [0.9, -0.3, 0.6] };
    o.armL = { rot: [0.12 + br, -0.12, 0.25] };
    o.scy = { up: this.dir(e, 0.04, 1, -0.05), face: this.dir(e, 1, 0, -0.2), grip: 0.15 };
  },
  // ready: the scythe across the body in both hands, head high over the left shoulder
  ready(e, o) {
    o.legs = 'plant'; o.fR = [0.24, 0, -0.3]; o.fL = [-0.26, 0, 0.3]; o.drop = 0.16; o.lean = 0.16; o.twist = -0.2;
    o.armR = { at: e.local(0.45, 1.5, 0.5), pole: [0.9, -0.3, 0.6] };
    o.armL = { shaft: 0.42 };
    o.scy = { up: this.dir(e, 0.15, 1, -0.5), face: this.dir(e, 1, -0.1, 0.3), grip: -0.1 };
  },
  // A swing along an arc: th is where along it the scythe is (radians from the arc's middle), tang the way it's
  // moving. The right hand leads from the hip side, the shaft runs out along the arc's radius, the blade ahead.
  swing(e, o, a, th, reach = 0.6) {
    const d = PlayerPose.arcDir(a.yaw, a.tilt, th, a.pa || 0), d2 = PlayerPose.arcDir(a.yaw, a.tilt, th + 0.25 * (a.dir || 1), a.pa || 0);
    const tg = { x: d2.x - d.x, y: d2.y - d.y, z: d2.z - d.z }, c = e.chest ? e.chest() : e.local(0, 2, 0);
    o.armR = { at: { x: c.x + d.x * reach, y: c.y + d.y * reach - 0.15, z: c.z + d.z * reach }, pole: [0.6, -0.6, 0.6] };
    o.armL = { shaft: -0.1 };
    o.scy = { up: d, face: tg, grip: -0.5 };
    // the body turns with the blade
    o.twist = clamp(-angDiff(e.yaw, yawOf(d.x, d.z)) * 0.55, -0.9, 0.9);
  },

  // ---------- the boss ----------
  pick(e) {
    const o = this.base();
    if (e.dying && e.ko) return this.koPose(e, o, e.ko);
    if (e.intro) return this.introPose(e, o, e.intro);
    const a = e.act, hs = Math.hypot(e.vel.x, e.vel.z);
    o.armed = !e.scytheOut;
    if (e.stunT > 0) {
      // overheated or disarmed: down on a knee, leaning on the scythe if it still has it
      const k = clamp((e.stunMax - e.stunT) / 0.25, 0, 1) * clamp(e.stunT / 0.3, 0, 1);
      o.legs = 'kneel'; o.kneel = k; o.drop = 0.5 * REAPER_SCALE * k; o.lean = 0.45 * k; o.head = 0.4 * k; o.tremble = 0.3;
      if (o.armed) { o.armR = { at: e.local(0.5, 1.5 - 0.3 * k, 0.75), pole: [0.9, -0.3, 0.5] }; o.armL = { shaft: 0.35 }; o.scy = { up: this.dir(e, -0.05, 1, 0), face: this.dir(e, 1, 0, 0), grip: 0.1 }; }
      else { o.armR = { D: this.dir(e, 1, 0.1, 0.2), reach: 0.9 }; o.armL = { rot: [0.5, -0.2, 0.9] }; }
      return o;
    }
    // it glides rather than walks: toes down, the cloak streaming
    if (hs > 0.8 || !e.onGround) { o.legs = 'glide'; o.lean = 0.12 + 0.25 * clamp(hs / 9, 0, 1); o.drop = -0.1; this.ready(e, o); o.legs = 'glide'; }
    else this.rest(e, o, e.t);
    if (!o.armed) { o.armR = { D: this.dir(e, 1, 0.15, 0.25), reach: 0.85 }; o.armL = { rot: [0.3, -0.3, 0.8] }; o.scy = null; }
    if (!a) return o;
    switch (a.kind) {
      case 'melee': this.meleePose(e, o, a); break;
      case 'flinch': {
        const k = clamp(a.t / 0.12, 0, 1);
        o.legs = 'plant'; o.fR = [0.22, 0, -0.45]; o.fL = [-0.24, 0, 0.4]; o.lean = -0.4 * k; o.head = -0.4 * k; o.twist = 0.3;
        o.armR = { at: e.local(0.7, 2.2, -0.2), pole: [0.9, -0.2, 0.4] }; o.armL = { rot: [-0.9 * k, -0.8, 0.5] };
        o.scy = { up: this.dir(e, -0.5, 0.8, 0.4), face: this.dir(e, 0.3, 0, 1), grip: 0.1 };
        break;
      }
      case 'recover': this.ready(e, o); o.lean = 0.3; o.head = 0.15; break;
      case 'warp': {
        // drawn in on itself as the tear takes it, unfolding as it steps out
        const k = a.phase === 'out' ? clamp(a.t / a.outT, 0, 1) : a.phase === 'in' ? 1 - clamp(a.t / a.inT, 0, 1) : 1;
        this.ready(e, o); o.legs = 'glide'; o.thin = 1 - 0.94 * k * k; o.lean = 0.3 * k; o.twist = 1.2 * k;
        break;
      }
      case 'throw': {
        if (a.phase === 'wind') {
          // hauled back over the right shoulder, flat, the jet lit
          const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind), 0, 1));
          o.legs = 'plant'; o.fR = [0.24, 0, 0.3]; o.fL = [-0.26, 0, -0.45]; o.drop = 0.2; o.lean = -0.1 * k; o.twist = 0.8 * k; o.tremble = 0.4;
          o.armR = { at: e.local(0.75, 2.3, -0.5 * k), pole: [0.9, 0.2, 0.5] }; o.armL = { D: this.dir(e, 1, 0.1, -0.2), reach: 0.8 };
          o.scy = { up: this.dir(e, -1, 0.15, 0.5), face: this.dir(e, 0.2, 0, -1), grip: 0.2 };
        } else {
          // the arm thrown out after it, then held open for it to come back to
          const k = clamp(a.t / 0.15, 0, 1);
          o.legs = 'plant'; o.fR = [0.24, 0, -0.55]; o.fL = [-0.26, 0, 0.4]; o.drop = 0.22; o.lean = 0.4 * (a.phase === 'out' && a.t < 0.4 ? 1 : 0.4); o.twist = -0.6 * (1 - 0.5 * k);
          o.armR = { D: this.dir(e, 1, 0.1, 0.1), reach: 0.98 }; o.armL = { rot: [0.4, -0.4, 0.7] };
          o.scy = null;
        }
        break;
      }
      case 'whirl': {
        if (a.phase === 'wind') {
          // coiled low, the scythe drawn right round behind it, shaking as the jet builds
          const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind * 0.6), 0, 1));
          o.legs = 'plant'; o.fR = [0.28, 0, -0.4]; o.fL = [-0.28, 0, 0.45]; o.drop = 0.4 * k; o.lean = 0.3 * k; o.twist = 1.0 * k; o.head = -0.1; o.tremble = 0.4 + 0.8 * k;
          o.armR = { at: e.local(0.75, 1.6, -0.5), pole: [0.9, 0, 0.5] }; o.armL = { shaft: -0.1 };
          o.scy = { up: this.dir(e, -0.9, 0.05, 0.5), face: this.dir(e, 0.4, 0, -1), grip: -0.5 };
        } else if (a.phase === 'spin') {
          // upright, the scythe out flat at full reach; the body turns with it (reaperboss.js spins its yaw)
          o.legs = 'glide'; o.drop = -0.12; o.lean = 0.12; o.flare = 1;
          o.armR = { D: this.dir(e, 0.2, -0.05, 1), reach: 0.98 }; o.armL = { rot: [-0.3, -1.1, 0.6] };
          o.scy = { up: this.dir(e, 0.1, 0.02, 1), face: this.dir(e, 1, 0, 0), grip: -0.6 };
        } else {
          o.legs = 'kneel'; o.kneel = 1; o.drop = 0.5 * REAPER_SCALE; o.lean = 0.5; o.head = 0.45; o.tremble = 0.3;
          o.armR = { at: e.local(0.5, 1.25, 0.75), pole: [0.9, -0.3, 0.5] }; o.armL = { shaft: 0.35 };
          o.scy = { up: this.dir(e, -0.08, 1, 0.05), face: this.dir(e, 1, 0, 0), grip: 0 };
        }
        break;
      }
      case 'reap': {
        // the left hand out at you, closing; then hauled back to its chest as the space between you gives
        const P = Game.player, c = e.chest(), pc = P.chest(), dx = pc.x - c.x, dy = pc.y - c.y, dz = pc.z - c.z, l = Math.hypot(dx, dy, dz) || 1;
        const pull = a.phase === 'pull' ? clamp(a.t / 0.3, 0, 1) : 0;
        o.legs = 'plant'; o.fR = [0.24, 0, 0.25]; o.fL = [-0.26, 0, -0.4]; o.drop = 0.14; o.lean = 0.1 - 0.25 * pull; o.twist = -0.5 + 0.7 * pull; o.tremble = 0.3 + 0.5 * pull;
        o.armL = { D: { x: dx / l, y: dy / l, z: dz / l }, reach: lerp(0.98, 0.45, pull) };
        o.armR = { at: e.local(0.6, 2.0, 0.1), pole: [0.9, 0, 0.5] };
        o.scy = { up: this.dir(e, -0.3, 1, 0.3), face: this.dir(e, 1, 0, -0.2), grip: 0.3 };
        break;
      }
    }
    return o;
  },
  // a scythe blow: drawn back to the start of its arc through the wind-up, then swept through it
  meleePose(e, o, a) {
    const m = a.m, A = a.arc;
    if (!A) return;
    const half = A.span / 2, dir = A.dir || 1;
    o.legs = 'plant'; o.fR = [0.26, 0, -0.42]; o.fL = [-0.26, 0, 0.42]; o.drop = 0.2; o.lean = 0.18;
    if (a.phase === 'wind') {
      const k = easeOutCubic(clamp(a.t / Math.max(0.05, a.wind * 0.7), 0, 1));
      this.swing(e, o, A, -dir * (half + 0.45 * k), lerp(0.45, 0.55, k));
      o.tremble = m.big ? 0.5 * k : 0.15 * k; o.drop = 0.2 + 0.12 * k;
      if (m.over) { o.lean = -0.2 * k; o.drop = 0.12; }
    } else {
      const u = easeOutCubic(clamp(a.t / Math.max(0.05, m.swing * 0.75), 0, 1));
      this.swing(e, o, A, dir * lerp(-half - 0.45, half + 0.25, u), 0.65);
      o.lean = m.over ? lerp(-0.2, 0.6, u) : 0.28; o.drop = m.over ? lerp(0.12, 0.4, u) : 0.24; o.flare = 0.6;
    }
  },
  introPose(e, o, I) {
    if (I.stage === 'step') {
      // stepping out of the tear: gliding forward, the scythe held low, unfolding
      const k = clamp((I.ct - RINTRO.STEP) / 0.5, 0, 1);
      this.ready(e, o); o.legs = 'glide'; o.drop = -0.08; o.lean = 0.3 - 0.2 * k; o.head = 0.3 - 0.3 * k; o.thin = lerp(0.1, 1, clamp((I.ct - RINTRO.STEP) / 0.25, 0, 1));
    } else if (I.stage === 'ignite') {
      // the scythe swung up and planted beside it as the blade catches
      const k = easeOutCubic(clamp((I.ct - RINTRO.IGNITE) / 0.35, 0, 1));
      o.legs = 'plant'; o.fR = [0.24, 0, -0.2]; o.fL = [-0.24, 0, 0.2]; o.drop = 0.06; o.lean = 0.05; o.head = lerp(0.3, -0.1, k);
      o.armR = { at: e.local(0.7, lerp(1.5, 1.75, k), 0.35), pole: [0.9, -0.3, 0.6] }; o.armL = { rot: [0.15, -0.2, 0.3] };
      o.scy = { up: this.dir(e, 0.03, 1, 0.02), face: this.dir(e, 1, 0, -0.3), grip: lerp(-0.1, 0.33, k) };
    } else {
      // the title: the scythe swept out wide to its right and held, the left hand open at its side
      const k = easeOutCubic(clamp((I.ct - RINTRO.TITLE) / 0.4, 0, 1));
      o.legs = 'plant'; o.fR = [0.3, 0, -0.25]; o.fL = [-0.28, 0, 0.25]; o.drop = 0.12; o.lean = 0.02; o.twist = -0.25 * k; o.flare = 0.5;
      o.armR = { D: this.dir(e, 0.25, lerp(0.6, -0.05, k), 1), reach: 0.95 }; o.armL = { rot: [0.1, -0.5 * k, 0.5] };
      o.scy = { up: this.dir(e, 0.15, lerp(1, 0.25, k), lerp(0.1, 1, k)), face: this.dir(e, 1, lerp(0, -0.5, k), 0), grip: lerp(0.33, -0.3, k) };
    }
    return o;
  },
  koPose(e, o, K) {
    const S = REAPER_SCALE;
    o.armed = true;
    switch (K.stage) {
      case 'impact':
        o.legs = e.onGround ? 'plant' : 'air'; o.fR = [0.22, 0, -0.4]; o.fL = [-0.24, 0, 0.35]; o.lean = -0.5; o.head = -0.6;
        o.armR = { at: e.local(0.8, 2.3, -0.3), pole: [0.9, 0, 0.4] }; o.armL = { rot: [-1.2, -0.8, 0.5] };
        o.scy = { up: this.dir(e, -0.6, 0.6, 0.5), face: this.dir(e, 0.2, 0, 1), grip: 0 };
        break;
      case 'stagger':
        o.legs = 'plant'; o.fR = [0.2, 0, -0.25]; o.fL = [-0.24, 0, 0.45]; o.lean = -0.1 + Math.sin(e.t * 8) * 0.08; o.drop = 0.16; o.head = 0.3; o.tremble = 0.6;
        o.armR = { at: e.local(0.55, 1.5, 0.6), pole: [0.9, -0.3, 0.5] }; o.armL = { rot: [0.4, -0.2, 0.3] };
        o.scy = { up: this.dir(e, 0, 1, 0.1), face: this.dir(e, 1, 0, 0), grip: 0.15 };
        break;
      case 'kneel':
        o.legs = 'kneel'; o.kneel = 1; o.drop = 0.5 * S; o.lean = 0.45; o.head = 0.5;
        o.armR = { at: e.local(0.5, 1.25, 0.75), pole: [0.9, -0.3, 0.5] }; o.armL = { shaft: 0.3 };
        o.scy = { up: this.dir(e, -0.06, 1, 0.04), face: this.dir(e, 1, 0, 0), grip: 0 };
        break;
      default: {
        // falls forward off the scythe and lies face down, the scythe beside it (render.js pitches the whole body)
        const u = K.rot;
        o.legs = 'kneel'; o.kneel = 1 - u; o.drop = lerp(0.5 * S, 0, u); o.lean = lerp(0.45, 0, u); o.head = 0.2;
        o.armR = { rot: [lerp(0.6, -2.5, u), 0.4, 0.2] }; o.armL = { rot: [lerp(0.5, -2.4, u), -0.3, 0.2] };
        o.scy = { up: this.dir(e, 1, 0.02 + 0.3 * (1 - u), 0.25), face: this.dir(e, 0, 0, -1), grip: 0.1 };
        o.tilt = -1.42 * u * u;
      }
    }
    return o;
  },

  // ---------- as the player ----------
  pickPlayer(p) {
    const o = this.base(), S = REAPER_SCALE, f = p.fwd(), hs = Math.hypot(p.vel.x, p.vel.z), v = p.vel, air = !p.onGround;
    const sink = Math.max(0, p.M.H - p.h);
    o.armed = !p.scytheOut;
    o.headYaw = clamp(angDiff(p.yaw, p.aimYaw), -0.8, 0.8);
    o.head = clamp(-p.aimDir.y * 0.7, -0.5, 0.5);
    if (p.dead) {
      // down on a knee, hanging off the scythe
      const k = clamp(p.deadT / 0.4, 0, 1);
      o.legs = 'kneel'; o.kneel = k; o.drop = lerp(0.05, 0.5 * S, k); o.lean = 0.45 * k; o.head = 0.5; o.headYaw = 0;
      o.armR = { at: p.local(0.5, 1.25, 0.75), pole: [0.9, -0.3, 0.5] }; o.armL = { shaft: 0.3 };
      o.scy = { up: this.dir(p, -0.06, 1, 0.04), face: this.dir(p, 1, 0, 0), grip: 0 };
      return o;
    }
    if (p.emote) return this.emotePose(p, o, p.emote);
    // --- how it's moving ---
    if (p.warpT > 0) { this.ready(p, o); o.legs = 'glide'; o.thin = 0.08 + 0.92 * clamp(1 - p.warpT / RP_WARP.FADE, 0, 1); o.twist = 1.0 * (1 - o.thin); }
    else if (p.cling) { o.legs = 'air'; o.lean = 0.05; o.armL = { at: p.clingHand(p.cling.n), pole: [-0.6, -0.4, 0.6] }; o.armR = { at: p.local(0.5, 1.6, -0.2), pole: [0.9, 0, 0.5] }; o.scy = { up: this.dir(p, -0.6, 0.6, 0.3), face: this.dir(p, 0, 0, 1), grip: 0 }; }
    else if (p.vault || p.mantle) { o.legs = 'air'; o.lean = 0.4; o.armL = p.vault && p.vault.t / p.vault.dur < 0.8 ? { at: p.vault.plant, pole: [-0.6, -0.4, 0.6] } : { rot: [-2.2, -0.3, 0.4] }; o.armR = { at: p.local(0.55, 1.7, -0.3), pole: [0.9, 0, 0.5] }; o.scy = { up: this.dir(p, -0.8, 0.5, 0.2), face: this.dir(p, 0, -0.3, 1), grip: 0 }; }
    else if (p.skid) {
      o.legs = 'plant'; o.fR = [0.24, 0, -0.4]; o.fL = [-0.2, 0, 0.5]; o.drop = 0.4; o.lean = 0.45;
      o.armL = { at: p.skidHand(), pole: [-0.6, 0.2, 0.6] }; o.armR = { at: p.local(0.6, 1.5, -0.3), pole: [0.9, 0, 0.5] };
      o.scy = { up: this.dir(p, -0.9, 0.35, 0.2), face: this.dir(p, 0, -0.4, 1), grip: 0 };
    } else if (p.sliding) {
      o.legs = 'plant'; o.fR = [0.22, 0, -0.75]; o.fL = [-0.2, 0, 0.05]; o.drop = 0.45; o.lean = -0.4;
      o.armR = { at: p.local(0.6, 1.0, -0.4), pole: [0.9, 0, 0.5] }; o.armL = { rot: [0.8, -0.5, 0.5] };
      o.scy = { up: this.dir(p, -0.95, 0.2, 0.2), face: this.dir(p, 0, -0.5, 1), grip: 0 };
    } else if (air) {
      o.legs = 'air'; o.lean = 0.12 + clamp(hs / 30, 0, 0.3); o.flare = clamp(-v.y / 20, 0, 1);
      o.armR = { at: p.local(0.6, 1.9, -0.25), pole: [0.9, 0, 0.5] }; o.armL = { rot: [-0.3, -0.5, 0.6] };
      o.scy = { up: this.dir(p, -0.7, 0.6, 0.3), face: this.dir(p, 0.2, -0.3, 1), grip: 0 };
    } else if (p.crouching) { this.ready(p, o); o.drop = 0.35; o.lean = 0.4; }
    else if (hs > 0.6) {
      // a long loping run, the scythe carried low behind in the right hand, its blade trailing up
      const k = clamp(hs / p.M.SPRINT, 0, 1), fv = (v.x * f.x + v.z * f.z) / hs;
      o.legs = 'walk'; o.walk = p.runPhase; o.amt = clamp(hs / 7, 0.35, 1.1); o.lean = 0.14 + 0.4 * k * Math.max(0, fv) - 0.1 * Math.max(0, -fv) + p.accF * 0.15;
      const sw = Math.sin(p.runPhase) * 0.5 * k;
      o.armL = { rot: [0.3 + sw, -0.2, 0.6] };
      o.armR = { at: p.local(0.62, 1.25 + 0.04 * Math.sin(p.runPhase * 2), -0.2 - 0.25 * k), pole: [0.9, -0.2, 0.6] };
      o.scy = { up: this.dir(p, -0.9, 0.3 + 0.1 * k, 0.15), face: this.dir(p, 0.1, -0.2, 1), grip: 0 };
      o.roll = Math.sin(p.runPhase) * 0.04 * k;
    } else if (p.idleT > 2.5) this.rest(p, o, p.t);
    else this.ready(p, o);
    if (sink > 0 && o.legs === 'plant') o.drop = Math.max(o.drop, sink * 0.9);
    // --- what it's doing over the top of that ---
    const A = p.attack, s = p.sheathe, T = p.tether, W = p.whirl;
    const airLegs = () => { if (air && o.legs !== 'air') o.legs = 'air'; return o; };
    if ((p.hurtT > 0 || p.dazeT > 0) && !W) {
      const k = p.dazeT > 0 ? 0.8 : 1;
      o.lean = -0.35 * k; o.head = -0.4 * k; o.twist = 0.3;
      o.armR = { at: p.local(0.7, 2.1, -0.2), pole: [0.9, -0.2, 0.4] }; o.armL = { rot: [-0.9, -0.8, 0.5] };
      if (o.armed) o.scy = { up: this.dir(p, -0.5, 0.8, 0.4), face: this.dir(p, 0.3, 0, 1), grip: 0.1 };
      return airLegs();
    }
    if (W) {
      if (W.phase === 'charge') {
        const k = W.k;
        o.legs = air ? 'air' : 'plant'; o.fR = [0.26, 0, -0.38]; o.fL = [-0.26, 0, 0.42]; o.drop = 0.2 + 0.2 * k; o.lean = 0.25; o.twist = 0.5 + 0.5 * k; o.tremble = 0.2 + 0.8 * k;
        o.armR = { at: p.local(0.72, 1.55, -0.45), pole: [0.9, 0, 0.5] }; o.armL = { shaft: -0.1 };
        o.scy = { up: this.dir(p, -0.9, 0.05, 0.5), face: this.dir(p, 0.4, 0, -1), grip: -0.5 };
      } else {
        o.legs = air ? 'air' : 'glide'; o.drop = -0.08; o.lean = 0.1; o.flare = 1; o.headYaw = 0;
        o.armR = { D: this.dir(p, 0.2, -0.05, 1), reach: 0.98 }; o.armL = { rot: [-0.3, -1.1, 0.6] };
        o.scy = { up: this.dir(p, 0.1, 0.02, 1), face: this.dir(p, 1, 0, 0), grip: -0.6 };
      }
      return o;
    }
    if (p.harvestT > 0) {
      // the Harvest: one great sweep all the way round
      const u = clamp(1 - p.harvestT / 0.45, 0, 1), arc = { yaw: p.yaw, tilt: 0.1, pa: 0, dir: 1 };
      o.legs = air ? 'air' : 'plant'; o.fR = [0.28, 0, -0.45]; o.fL = [-0.28, 0, 0.45]; o.drop = 0.26; o.lean = 0.25; o.flare = 1;
      this.swing(p, o, arc, lerp(-2.6, 2.9, easeOutCubic(u)), 0.65);
      return o;
    }
    if (p.throwT > 0 || !o.armed) {
      // the throw's follow-through, then the hand held open for the scythe to come back to
      const k = clamp(p.throwT / 0.25, 0, 1);
      o.lean += 0.3 * k; o.twist = -0.6 * k;
      o.armR = { D: p.throwDir && k > 0 ? p.throwDir : this.dir(p, 1, 0.2, 0.3), reach: 0.75 + 0.23 * k }; o.armL = { rot: [0.4, -0.4, 0.7] };
      o.scy = null;
      return airLegs();
    }
    if (p.iaido || p.postPose > 0) {
      // the drawn cut: through and past, the scythe out behind the swing
      const d = p.iaido ? p.iaido.dir : { x: f.x, y: 0, z: f.z }, arc = { yaw: yawOf(d.x, d.z), tilt: 0.15, pa: 0, dir: p.lastDir || 1 };
      o.legs = air ? 'air' : 'plant'; o.fR = [0.26, 0, -0.6]; o.fL = [-0.26, 0, 0.5]; o.drop = 0.3; o.lean = 0.45; o.flare = 0.8;
      this.swing(p, o, arc, (p.lastDir || 1) * (p.iaido ? 0.2 : 1.5), 0.65);
      return o;
    }
    if (s) {
      if (s.empowered) {
        // a parry taken: the scythe drawn back low, shaking harder as the execution charges
        const k = s.charge || 0;
        o.legs = air ? 'air' : 'plant'; o.fR = [0.28, 0, -0.4]; o.fL = [-0.28, 0, 0.45]; o.drop = 0.22 + 0.14 * k; o.lean = 0.25; o.twist = 0.6 + 0.4 * k; o.tremble = 0.3 + 0.8 * k;
        o.armR = { at: p.local(0.72, 1.6, -0.45), pole: [0.9, 0, 0.5] }; o.armL = { D: this.dir(p, 1, 0.05, -0.15), reach: lerp(0.95, 0.5, k) };
        o.scy = { up: this.dir(p, -0.85, 0.25, 0.5), face: this.dir(p, 0.4, 0, -1), grip: -0.3 };
        return o;
      }
      // the guard: the shaft across the body in both hands, the blade down
      o.legs = air ? 'air' : 'plant'; o.fR = [0.26, 0, -0.3]; o.fL = [-0.26, 0, 0.3]; o.drop = 0.2; o.lean = 0.12; o.twist = 0;
      o.armR = { at: p.local(0.5, 1.75, 0.6), pole: [0.9, -0.4, 0.4] }; o.armL = { shaft: 0.35 };
      o.scy = { up: this.dir(p, 0.05, 0.25, -1), face: this.dir(p, 0.3, -1, 0), grip: -0.35 };
      return o;
    }
    if (A && A.groundCut) {
      // the blade dragged through the street behind it
      o.legs = 'plant'; o.fR = [0.22, 0, -0.75]; o.fL = [-0.2, 0, 0.05]; o.drop = 0.45; o.lean = A.heavy && A.t >= A.rip ? 0.1 : -0.3;
      o.armR = { at: p.local(0.55, A.heavy && A.t >= A.rip ? 2.2 : 0.9, 0.5), pole: [0.9, 0, 0.5] }; o.armL = { shaft: 0.4 };
      o.scy = A.heavy && A.t >= A.rip ? { up: this.dir(p, 0.3, 1, 0), face: this.dir(p, 1, 0.3, 0), grip: 0 } : { up: this.dir(p, 0.8, -0.45, 0.1), face: this.dir(p, 0.3, -1, 0), grip: 0 };
      return o;
    }
    if (A) {
      const wind = A.wind || 0, half = A.span / 2, dir = A.dir || 1;
      if (A.t < wind) {
        const k = easeOutCubic(clamp(A.t / Math.max(0.03, wind), 0, 1));
        this.swing(p, o, A, -dir * (Math.min(half, 1.6) + 0.4 * k), 0.5);
        o.tremble = 0.3 * k;
      } else {
        const u = easeOutCubic(clamp((A.t - wind) / Math.max(0.05, A.sweep * 1.4), 0, 1));
        this.swing(p, o, A, dir * lerp(-Math.min(half, 1.6) - 0.4, Math.min(half, 1.7) + 0.2, u), 0.65);
        o.flare = 0.6;
      }
      if (o.legs !== 'air' && o.legs !== 'walk') { o.legs = 'plant'; o.fR = [0.26, 0, -0.45]; o.fL = [-0.26, 0, 0.42]; o.drop = Math.max(o.drop, 0.22); }
      o.lean = 0.25;
      return airLegs();
    }
    if (p.plunge) {
      // straight down, the scythe overhead with its blade under it
      o.legs = 'air'; o.lean = 0.2; o.flare = 1;
      o.armR = { at: p.local(0.3, 2.9, 0.3), pole: [0.9, 0, 0.5] }; o.armL = { shaft: 0.4 };
      o.scy = { up: this.dir(p, 0.2, -1, 0), face: this.dir(p, 1, -0.2, 0), grip: -0.3 };
      return o;
    }
    const pend = p.atkPend;
    if (pend && !pend.dash && pend.t > 0.05 && Input.isDown('attack')) { o.twist = 0.5; o.tremble = 0.3; }
    if (T && (T.phase === 'fly' || (T.phase === 'attached' && (T.mode === 'zip' || T.mode === 'tow')))) {
      const h = p.hand(), dx = T.pos.x - h.x, dy = T.pos.y - h.y, dz = T.pos.z - h.z, l = Math.hypot(dx, dy, dz) || 1;
      o.armL = { D: { x: dx / l, y: dy / l, z: dz / l }, reach: 0.98 };
      o.twist = 0.3;
      if (T.mode === 'zip') { o.legs = 'air'; o.lean = 0.35; o.flare = 1; }
    }
    return o;
  },
  // the select screen's emotes (showroom.js): looming over its planted scythe, and a slow sweep of it
  emotePose(p, o, E) {
    o.headYaw = 0;
    if (E.kind === 'sweep') {
      const u = clamp(E.t / E.dur, 0, 1), arc = { yaw: p.yaw, tilt: 0.25, pa: 0, dir: 1 };
      o.legs = 'plant'; o.fR = [0.28, 0, -0.35]; o.fL = [-0.28, 0, 0.35]; o.drop = 0.18; o.lean = 0.15; o.flare = 0.5;
      this.swing(p, o, arc, lerp(-1.7, 1.7, easeOutCubic(clamp(u * 1.6 - 0.2, 0, 1))), 0.6);
      return o;
    }
    this.rest(p, o, p.t);
    const k = easeOutCubic(clamp(E.t / 0.5, 0, 1));
    o.lean = 0.1 + 0.2 * k; o.head = 0.35 * k; o.armL = { shaft: 0.2 };
    o.armR = { at: p.local(0.3, 1.8, 0.6), pole: [0.9, -0.3, 0.6] };
    o.scy = { up: this.dir(p, -0.02, 1, 0), face: this.dir(p, 1, 0, 0), grip: 0.37 };
    return o;
  },

  apply(r, e) {
    const [T, P, D, U, F, A, W] = this.temps();
    const o = e.isPlayer ? this.pickPlayer(e) : this.pick(e), B = r.bones, M = r.mesh, S = REAPER_SCALE;
    Rig.reset(r);
    if (!e.isPlayer) e.tilt = o.tilt || 0;
    // going into a tear it's drawn thin about its own axis
    M.scale.set(o.thin, 1 + (1 - o.thin) * 0.12, o.thin);
    B.head.scale.setScalar(e.isPlayer && Camera.fp && e === Game.player && Game.state === 'playing' ? 0.001 : 1);
    B.weapon.scale.setScalar(o.armed ? 1 : 0.001);
    const tr = () => (o.tremble ? rand(-0.012, 0.012) * o.tremble : 0);
    B.hips.position.y -= o.drop;
    B.hips.position.x += tr();
    B.hips.rotation.z = -o.roll;
    B.spine.rotation.x = -o.lean * 0.5;
    B.chest.rotation.x = -o.lean * 0.5;
    B.chest.rotation.y = o.twist;
    B.head.rotation.x = clamp(-o.head + o.lean * 0.7, -0.7, 0.9);
    B.head.rotation.y = clamp(o.headYaw - o.twist * 0.6, -0.8, 0.8);
    M.updateMatrixWorld(true);
    const legIK = (side, tgt) => {
      const x = side === 'R' ? 1 : -1;
      T.set(tgt[0] * S, (tgt[1] + REAPER_FOOT) * S, tgt[2] * S);
      M.localToWorld(T);
      P.set(x * 0.3, 1.4, -3);
      M.localToWorld(P);
      Rig.ik(r, 'thigh' + side, 'shin' + side, 'foot' + side, T, P, -1);
      U.set(0, 1, 0); F.set(fwdX(e.yaw), 0, fwdZ(e.yaw));
      Rig.orient(B['foot' + side], U, F);
    };
    if (o.legs === 'walk') {
      const s = Math.sin(o.walk), c = Math.cos(o.walk), a = o.amt;
      B.thighL.rotation.x = s * 0.7 * a; B.thighR.rotation.x = -s * 0.7 * a;
      B.shinL.rotation.x = -Math.max(0, -c) * 1.1 * a - 0.15; B.shinR.rotation.x = -Math.max(0, c) * 1.1 * a - 0.15;
      B.footL.rotation.x = -B.thighL.rotation.x * 0.3; B.footR.rotation.x = -B.thighR.rotation.x * 0.3;
      B.hips.position.y -= Math.abs(c) * 0.06 * a + 0.05;
    } else if (o.legs === 'plant') {
      legIK('R', o.fR);
      legIK('L', o.fL);
    } else if (o.legs === 'kneel') {
      const k = o.kneel;
      legIK('R', [0.22, 0, lerp(-0.18, -0.42, k)]);
      legIK('L', [-0.22, lerp(0, 0.05, k), lerp(0.18, 0.62, k)]);
      if (k > 0.5) B.footL.rotation.x += 1.0 * k;
    } else if (o.legs === 'glide') {
      // hanging just off the ground, one leg a little ahead of the other, toes down
      const b = Math.sin((e.t || 0) * 2.2) * 0.04;
      B.thighR.rotation.x = 0.22 + b; B.shinR.rotation.x = -0.35; B.thighL.rotation.x = -0.08 - b; B.shinL.rotation.x = -0.5;
      B.footL.rotation.x = B.footR.rotation.x = 0.55;
    } else {
      B.thighR.rotation.x = 0.65; B.shinR.rotation.x = -1.0;
      B.thighL.rotation.x = 0.2; B.shinL.rotation.x = -0.85;
      B.footL.rotation.x = B.footR.rotation.x = 0.4;
      B.thighL.rotation.z = -0.12; B.thighR.rotation.z = 0.12;
    }
    // the cloak: each strip hangs straight whatever the body leans, trails with its speed, flares in a spin or a
    // fall, and never quite stops moving
    const hs = Math.hypot(e.vel.x, e.vel.z), f = e.fwd(), fv = hs > 0.1 ? (e.vel.x * f.x + e.vel.z * f.z) : 0, t = Game.time;
    const trail = clamp(fv / 12, -0.3, 1) * 0.7 + (o.flare || 0) * 0.75 + (e.onGround ? 0 : clamp(-e.vel.y / 25, -0.2, 0.6));
    ['L', 'M', 'R'].forEach((k, i) => {
      const a = B['cloak' + k + 'a'], b = B['cloak' + k + 'b'], w = Math.sin(t * 2.6 + i * 1.9), w2 = Math.sin(t * 4.1 + i * 2.7);
      a.rotation.x = o.lean * 0.9 - 0.1 - trail * 0.75 - w * 0.035;
      a.rotation.z = (i - 1) * (0.07 + 0.25 * (o.flare || 0)) + w2 * 0.025 - o.roll;
      b.rotation.x = -0.06 - trail * 0.45 - w2 * 0.07 - w * 0.03;
      b.rotation.z = (i - 1) * 0.06 * (o.flare || 0) + w * 0.03;
    });
    B.chest.updateMatrixWorld(true);
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
    // the scythe, aimed in the world from the right hand; then the left hand finds the shaft
    const sc = o.scy;
    if (sc && o.armed) {
      Rig.boneWorld(r, 'handR', A);
      U.set(sc.up.x, sc.up.y, sc.up.z).normalize(); F.set(sc.face.x, sc.face.y, sc.face.z);
      W.copy(A).addScaledVector(U, -(sc.grip || 0) * S);
      Rig.place(B.weapon, W);
      Rig.orient(B.weapon, U, F);
    }
    if (o.armL.shaft !== undefined && sc && o.armed) {
      B.weapon.updateWorldMatrix(true, false);
      W.set(0, o.armL.shaft * S, 0);
      B.weapon.localToWorld(W);
      arm('L', { at: { x: W.x, y: W.y, z: W.z }, pole: [-0.8, -0.5, 0.5] });
    } else arm('L', o.armL.shaft !== undefined ? { rot: [0.3, -0.3, 0.7] } : o.armL);
    const tint = e.tints();
    for (const k in tint) Rig.tint(r, k, tint[k]);
  },
};
Poses.reaper = (r, e) => ReaperPose.apply(r, e);
