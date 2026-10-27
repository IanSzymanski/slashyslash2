'use strict';
// AEGIS-07's body, from its reference sheets: a blocky mech 2.5 m tall in light and mid grey pixel camo with
// blue patches, dark joints and gold fittings. A T-shaped visor and a square chest core glow electric blue,
// as do its knees, shins and boots. Big pauldrons; a beam cannon on the left shoulder; a thruster pack with
// two round jets on its back; and on the right forearm a long housing that is its gun barrel and its blade
// emitter at once. After the enrage its guns go dark and the wiring under its popped limiters glows blue.
// AegisPose turns the rival's state (rival.js) into bone rotations, with IK for the arms and legs.

const AEGIS_COL = {
  W: '#d6d9df', M: '#a3a8b2', D: '#33353e', K: '#1b1c22', G: '#c08a34',
  glow: '#2f6bff', hi: '#9cc4ff', off: '#22262f', wire: '#2a2c36',
};
const AEGIS_SCALE = 1.3;
// the humanoid skeleton with broader shoulders and hips, the thruster pack on its back and the cannon's mount
const AEGIS_BONES = HUMANOID.map(([n, p, x, y, z]) => {
  if (n === 'armL') return [n, p, -0.33, 0.2, 0];
  if (n === 'armR') return [n, p, 0.33, 0.2, 0];
  if (n === 'thighL') return [n, p, -0.14, -0.03, 0];
  if (n === 'thighR') return [n, p, 0.14, -0.03, 0];
  return [n, p, x, y, z];
}).concat([['pack', 'chest', 0, 0.12, 0.25], ['cannon', 'chest', -0.32, 0.46, 0.1]]);
// the energy blade's length in metres, from the emitter
const AEGIS_BLADE = 1.55;

function aegisModel() {
  const C = AEGIS_COL, parts = [];
  const P = (bone, size, at, color, o = {}) => parts.push(Object.assign({ bone, size, at, color }, o));
  // fullbright lights; tag names the group rival.js recolours
  const L = (bone, size, at, tag, color = C.glow) => parts.push({ bone, size, at, color, glow: true, plain: true, tag });
  const dk = { plain: 0.75 };
  // hips: pelvis, belt and buckle, hanging plates front and sides
  P('hips', [0.42, 0.2, 0.3], [0, -0.03, 0], C.D, dk);
  P('hips', [0.5, 0.08, 0.33], [0, 0.07, 0], C.M);
  P('hips', [0.12, 0.07, 0.03], [0, 0.07, -0.175], C.G, dk);
  P('hips', [0.14, 0.16, 0.05], [0, -0.1, -0.16], C.M);
  for (const x of [-1, 1]) {
    P('hips', [0.17, 0.22, 0.05], [x * 0.14, -0.08, -0.17], C.W, { rot: [-0.12, 0, 0] });
    P('hips', [0.05, 0.24, 0.22], [x * 0.26, -0.07, 0], C.W, { rot: [0, 0, x * 0.1] });
    P('hips', [0.04, 0.05, 0.05], [x * 0.285, 0.02, -0.06], C.G, dk);
  }
  // abdomen, with the wiring at the waist that shows red once the limiters are off
  P('spine', [0.4, 0.28, 0.27], [0, 0.1, 0], C.D, dk);
  P('spine', [0.3, 0.08, 0.05], [0, 0.04, -0.14], C.M);
  P('spine', [0.34, 0.09, 0.05], [0, 0.14, -0.14], C.W);
  P('spine', [0.08, 0.2, 0.2], [-0.2, 0.1, 0], C.M);
  P('spine', [0.08, 0.2, 0.2], [0.2, 0.1, 0], C.M);
  L('spine', [0.3, 0.03, 0.2], [0, 0.22, 0], 'wire', C.wire);
  // chest: the broad torso, plates, the square core in its frame, collar and back plate
  P('chest', [0.62, 0.44, 0.4], [0, 0.1, 0.02], C.W, { taper: 1.14 });
  P('chest', [0.25, 0.2, 0.06], [-0.14, 0.17, -0.19], C.W);
  P('chest', [0.25, 0.2, 0.06], [0.14, 0.17, -0.19], C.W);
  P('chest', [0.17, 0.15, 0.05], [0, 0.06, -0.2], C.K, dk);
  L('chest', [0.1, 0.09, 0.03], [0, 0.06, -0.226], 'core');
  L('chest', [0.03, 0.09, 0.02], [-0.3, 0.1, -0.165], 'core');
  L('chest', [0.03, 0.09, 0.02], [0.3, 0.1, -0.165], 'core');
  P('chest', [0.38, 0.08, 0.32], [0, 0.34, 0.02], C.D, dk);
  P('chest', [0.52, 0.3, 0.06], [0, 0.14, 0.215], C.M);
  // limiters: gold caps on the chest plates and collar that blow off in the enrage, wiring beneath each
  [[-0.15, 0.22, -0.224], [0.15, 0.22, -0.224], [0, 0.34, -0.15]].forEach(([x, y, z], i) => {
    L('chest', [0.1, 0.02, 0.02], [x, y - 0.05, z], 'wire', C.wire);
    P('chest', [0.1, 0.07, 0.025], [x, y, z - 0.004], C.G, { plain: 0.6, tag: 'lim' + i });
  });
  // head: helmet, dark face plate with the T visor, crest, chin, ear pods with lights
  P('head', [0.27, 0.26, 0.29], [0, 0.12, 0], C.W, { taper: 0.9 });
  P('head', [0.23, 0.13, 0.05], [0, 0.07, -0.145], C.K, dk);
  L('head', [0.2, 0.04, 0.03], [0, 0.125, -0.165], 'visor');
  L('head', [0.045, 0.08, 0.03], [0, 0.075, -0.165], 'visor');
  P('head', [0.05, 0.08, 0.24], [0, 0.27, 0.0], C.M);
  P('head', [0.12, 0.05, 0.07], [0, -0.01, -0.12], C.M);
  for (const x of [-1, 1]) {
    P('head', [0.05, 0.11, 0.13], [x * 0.15, 0.11, 0.02], C.D, dk);
    L('head', [0.015, 0.05, 0.05], [x * 0.178, 0.11, 0.02], 'visor');
  }
  // arms: pauldrons with a light strip, dark upper arms with a camo sleeve, elbows with wiring
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    P('arm' + s, [0.36, 0.28, 0.4], [x * 0.06, 0.05, 0], C.W, { rot: [0, 0, -x * 0.12] });
    P('arm' + s, [0.37, 0.06, 0.41], [x * 0.07, -0.09, 0], C.D, { rot: [0, 0, -x * 0.12], plain: 0.75 });
    L('arm' + s, [0.02, 0.12, 0.18], [x * 0.245, 0.05, -0.02], 'core');
    P('arm' + s, [0.04, 0.04, 0.04], [x * 0.2, -0.02, -0.18], C.G, dk);
    P('arm' + s, [0.15, 0.32, 0.15], [0, -0.17, 0], C.D, { shape: 'hex', plain: 0.75 });
    P('arm' + s, [0.21, 0.17, 0.21], [0, -0.18, 0], C.W);
    P('fore' + s, [0.14, 0.09, 0.14], [0, 0.0, 0], C.K, dk);
    L('fore' + s, [0.16, 0.025, 0.16], [0, 0.045, 0], 'wire', C.wire);
  }
  // left forearm and fist
  P('foreL', [0.2, 0.26, 0.21], [0, -0.14, 0], C.W, { taper: 1.1 });
  P('foreL', [0.21, 0.03, 0.22], [0, -0.04, 0], C.G, dk);
  P('handL', [0.12, 0.11, 0.12], [0, -0.045, 0], C.D, dk);
  P('handL', [0.11, 0.07, 0.1], [0, -0.115, -0.01], C.K, dk);
  // right forearm: the weapon housing over the wrist, gold bands, barrel lights, muzzle ring
  P('foreR', [0.23, 0.4, 0.25], [0, -0.16, 0], C.W);
  P('foreR', [0.24, 0.03, 0.26], [0, -0.03, 0], C.G, dk);
  P('foreR', [0.24, 0.03, 0.26], [0, -0.27, 0], C.G, dk);
  P('foreR', [0.08, 0.3, 0.05], [0, -0.17, -0.13], C.D, dk);
  L('foreR', [0.03, 0.2, 0.03], [0.122, -0.16, -0.05], 'gun');
  L('foreR', [0.03, 0.2, 0.03], [-0.122, -0.16, -0.05], 'gun');
  P('foreR', [0.15, 0.06, 0.15], [0, -0.37, 0], C.K, dk);
  L('foreR', [0.09, 0.02, 0.09], [0, -0.405, 0], 'muzzle');
  P('handR', [0.12, 0.11, 0.12], [0, -0.045, 0], C.D, dk);
  P('handR', [0.11, 0.07, 0.1], [0, -0.115, -0.01], C.K, dk);
  // thruster pack: a dark spine with vents between two pods, each with a round jet facing back and a
  // nozzle underneath
  P('pack', [0.2, 0.44, 0.14], [0, 0, 0.03], C.D, dk);
  P('pack', [0.08, 0.3, 0.03], [0, 0, 0.105], C.K, dk);
  for (const x of [-1, 1]) {
    P('pack', [0.21, 0.4, 0.22], [x * 0.175, 0.02, 0.07], C.W);
    P('pack', [0.22, 0.06, 0.23], [x * 0.175, 0.2, 0.07], C.M);
    L('pack', [0.03, 0.14, 0.02], [x * 0.175, 0.1, 0.186], 'jet');
    P('pack', [0.17, 0.17, 0.03], [x * 0.175, -0.05, 0.19], C.K, dk);
    L('pack', [0.12, 0.12, 0.02], [x * 0.175, -0.05, 0.205], 'jet');
    P('pack', [0.12, 0.08, 0.12], [x * 0.175, -0.22, 0.07], C.D, dk);
    P('pack', [0.23, 0.03, 0.06], [x * 0.175, 0.08, -0.02], C.G, dk);
  }
  // the shoulder cannon, aimed down its bone's -z: mount, barrel, gold bands, top rail, lens in its rim
  P('cannon', [0.14, 0.14, 0.16], [0, -0.08, 0.05], C.D, dk);
  P('cannon', [0.27, 0.27, 0.52], [0, 0.08, -0.06], C.W);
  P('cannon', [0.28, 0.28, 0.035], [0, 0.08, -0.22], C.G, dk);
  P('cannon', [0.28, 0.28, 0.035], [0, 0.08, 0.14], C.G, dk);
  P('cannon', [0.1, 0.07, 0.36], [0, 0.245, -0.03], C.M);
  P('cannon', [0.24, 0.24, 0.035], [0, 0.08, -0.33], C.K, dk);
  L('cannon', [0.16, 0.16, 0.02], [0, 0.08, -0.35], 'lens');
  L('cannon', [0.02, 0.08, 0.2], [-0.142, 0.08, -0.05], 'lens');
  // legs: dark hex thighs under camo plates, knee pads and shins with lights, gold cuffs, heavy boots
  for (const [s, x] of [['L', -1], ['R', 1]]) {
    P('thigh' + s, [0.22, 0.43, 0.22], [0, -0.21, 0], C.D, { shape: 'hex', plain: 0.75 });
    P('thigh' + s, [0.24, 0.32, 0.07], [0, -0.17, -0.12], C.W, { rot: [0.06, 0, 0] });
    P('thigh' + s, [0.06, 0.32, 0.22], [x * 0.13, -0.17, 0], C.W);
    P('thigh' + s, [0.18, 0.2, 0.05], [0, -0.2, 0.11], C.M);
    P('shin' + s, [0.19, 0.15, 0.09], [0, 0.0, -0.12], C.W);
    L('shin' + s, [0.08, 0.06, 0.02], [0, 0.0, -0.172], 'core');
    P('shin' + s, [0.24, 0.4, 0.25], [0, -0.21, 0], C.W, { taper: 1.12 });
    L('shin' + s, [0.04, 0.12, 0.02], [0, -0.24, -0.136], 'core');
    P('shin' + s, [0.17, 0.24, 0.06], [0, -0.16, 0.12], C.M);
    P('shin' + s, [0.23, 0.04, 0.25], [0, -0.38, 0], C.G, dk);
    P('foot' + s, [0.23, 0.12, 0.35], [0, -0.02, -0.05], C.D, dk);
    P('foot' + s, [0.21, 0.08, 0.11], [0, -0.04, -0.2], C.W);
    P('foot' + s, [0.23, 0.05, 0.07], [0, 0.03, 0.1], C.G, dk);
    L('foot' + s, [0.06, 0.03, 0.02], [x * 0.06, -0.04, -0.257], 'core');
  }
  return {
    bones: AEGIS_BONES, scale: AEGIS_SCALE, parts, tex: () => Gfx.camoTexture(),
    // the energy blade, out of the emitter along the weapon bone: a white core in a blue glow and a soft halo.
    // It scales out of the housing when it ignites and back in when it's put away.
    attach(r) {
      const g = new THREE.Group(), Lb = AEGIS_BLADE, add = (color, o) => new THREE.MeshBasicMaterial(Object.assign({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }, o));
      const core = new THREE.MeshBasicMaterial({ color: '#e8f2ff', fog: false }), glow = add(C.glow, { opacity: 0.75 }), halo = add(C.glow, { opacity: 0.22 });
      const box = (w, h, d, m, y0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y0 + h / 2, 0), m); g.add(b); return b; };
      box(0.04, Lb, 0.014, core, 0.06);
      box(0.1, Lb + 0.05, 0.04, glow, 0.04);
      box(0.2, Lb + 0.14, 0.09, halo, 0.0);
      // a tapered tip
      const tip = box(0.06, 0.12, 0.03, glow, Lb + 0.06);
      tip.scale.x = 0.6;
      g.visible = false;
      r.bones.weapon.add(g);
      r.extras.push(g);
      r.blade = g; r.bladeMats = { core, glow, halo };
    },
  };
}
MODELS.aegis = aegisModel();

// ---------- poses ----------
// Each frame AegisPose.pick reads the rival and describes a pose: body lean, twist and drop; legs walking,
// planted (IK to foot targets in the body frame), tucked in the air or hanging under the jets; each arm
// along a direction (a blade or gun arm reaches straight down it), by rotation, or reaching for a point;
// where the head and the cannon look; and how far out the blade is. apply() lays that onto the bones.
const AegisPose = {
  _v: null,
  temps() { return this._v || (this._v = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(() => new THREE.Vector3())); },

  // the swing's blade direction at sweep fraction u (or drawn back past its start in a wind-up, k 0..1)
  swingDir(a, u, windK) {
    const th = windK !== undefined ? -a.dir * (a.span / 2 + 0.45 * windK) : a.dir * (u - 0.5) * a.span;
    return PlayerPose.arcDir(a.yaw, a.tilt, th, a.pa || 0);
  },
  swingEdge(a, u) {
    const e = PlayerPose.arcDir(a.yaw, a.tilt, a.dir * (u - 0.5) * a.span + Math.PI / 2, a.pa || 0);
    return { x: e.x * a.dir, y: e.y * a.dir, z: e.z * a.dir };
  },

  pick(e) {
    const S = AEGIS_SCALE, t = e.t;
    // defaults: standing, arms low, the blade hand loose at the side
    const o = {
      lean: 0, twist: 0, drop: 0, roll: 0, legs: 'stand', walk: 0, amt: 0, fF: null, fB: null, kneel: 0,
      armR: { rot: [0.15, 0.12, 0.35] }, armL: { rot: [0.1, -0.12, 0.3] }, head: 0, headYaw: 0, cannon: null, blade: e.bladeOut, tremble: 0, tilt: 0,
    };
    const K = e.ko;
    if (e.dying && K) return this.koPose(e, o, K);
    if (e.intro) return this.introPose(e, o, e.intro);
    const a = e.act;
    if (a && a.kind === 'enrage') return this.enragePose(e, o, a);
    if (e.stunT > 0) {
      // slumped over its knees, arms hanging, head down
      o.legs = 'plant'; o.fF = [0.16, 0, -0.35]; o.fB = [-0.2, 0, 0.32]; o.drop = 0.42 * S; o.lean = 0.75; o.head = 0.5;
      o.armR = { rot: [0.5, 0.25, 0.4] }; o.armL = { rot: [0.45, -0.25, 0.5] };
      o.tremble = 0.5;
      return o;
    }
    if (e.flinchT > 0) {
      o.legs = 'plant'; o.fF = [0.18, 0, -0.45]; o.fB = [-0.18, 0, 0.4]; o.drop = 0.12; o.lean = -0.35; o.head = -0.3;
      o.armR = { rot: [-0.6, 0.6, 0.3] }; o.armL = { rot: [-0.5, -0.6, 0.3] };
      return o;
    }
    const move = this.locomotion(e, o);
    if (a) {
      const done = this.actPose(e, o, a);
      if (done) return o;
    }
    if (e.attack) this.swingPose(e, o, e.attack);
    return move;
  },
  // walking, running, hovering, in the air and dashing
  locomotion(e, o) {
    const S = AEGIS_SCALE, v = e.vel, hs = Math.hypot(v.x, v.z), f = e.fwd();
    if (e.dashing()) {
      // a thruster dash: pitched into it, banked toward a sideways one, legs trailing
      const D = e.dash, fv = (D.vx * f.x + D.vz * f.z) / (Math.hypot(D.vx, D.vz) || 1), sv = (D.vx * -f.z + D.vz * f.x) / (Math.hypot(D.vx, D.vz) || 1);
      o.legs = 'dash'; o.lean = 0.25 + 0.35 * Math.max(0, fv) - 0.3 * Math.max(0, -fv); o.roll = clamp(sv, -1, 1) * 0.45; o.drop = 0.1 * S;
      o.armR = { rot: [-0.5 * fv + 0.3, 0.35, 0.4] }; o.armL = { rot: [-0.4 * fv + 0.3, -0.45, 0.5] };
      return o;
    }
    if (e.hovering()) {
      o.legs = 'hover'; o.lean = clamp((v.x * f.x + v.z * f.z) * 0.04, -0.3, 0.3);
      o.armR = { rot: [0.2, 0.35, 0.3] }; o.armL = { rot: [0.2, -0.35, 0.3] };
      return o;
    }
    if (!e.onGround) {
      o.legs = 'air'; o.lean = 0.1;
      o.armR = { rot: [-0.2, 0.45, 0.4] }; o.armL = { rot: [-0.2, -0.45, 0.4] };
      return o;
    }
    if (hs > 0.6) {
      // a heavy run: the faster, the deeper the lean and the longer the stride
      const k = clamp(hs / 8, 0, 1), fv = (v.x * f.x + v.z * f.z) / hs;
      o.legs = 'walk'; o.walk = e.walk; o.amt = clamp(hs / 4, 0.3, 1.1); o.lean = 0.08 + 0.3 * k * Math.max(0, fv) - 0.1 * Math.max(0, -fv);
      const sw = Math.sin(e.walk) * 0.5 * k;
      o.armR = { rot: [0.25 - sw, 0.15, 0.45] }; o.armL = { rot: [0.25 + sw, -0.15, 0.45] };
      return o;
    }
    // planted, feet apart, a slow breath through the shoulders
    const br = Math.sin(e.t * 2.2) * 0.02;
    o.legs = 'plant'; o.fF = [0.2, 0, -0.18]; o.fB = [-0.22, 0, 0.18]; o.drop = 0.06 + br; o.lean = 0.06;
    return o;
  },
  // a swing in progress (e.attack): the blade arm reaches along the arc; the body leans and turns into it
  swingPose(e, o, a) {
    const u = easeOutCubic(clamp(a.t / a.sweep, 0, 1));
    const D = this.swingDir(a, u), E = this.swingEdge(a, u);
    o.armR = { D, E, reach: 0.95 };
    o.blade = 1;
    o.lean = Math.max(o.lean, 0.2 + (a.tilt > 1 ? 0.25 * u : 0)) - (a.rising ? 0.3 * u : 0);
    o.twist = Math.abs(a.tilt) < 1 ? clamp(-a.dir * (u - 0.5) * a.span * 0.3, -0.6, 0.6) : 0;
    if (a.spin) o.twist = 0;
    if (o.legs === 'stand' || o.legs === 'plant') { o.legs = 'plant'; o.fF = [0.22, 0, -0.5]; o.fB = [-0.24, 0, 0.42]; o.drop = 0.22; }
    o.armL = { rot: [0.3, -0.7, 0.6] };
  },
  // poses for the act it is running; true when the pose is complete
  actPose(e, o, a) {
    const S = AEGIS_SCALE;
    switch (a.kind) {
      case 'melee': {
        if (a.phase !== 'wind') return false;
        const m = a.m, k = easeOutCubic(clamp(a.t / Math.max(0.05, e.tele(m.wind)), 0, 1)), A = e.attack || e.windArc;
        if (!A) return false;
        if (m.thrust) {
          // drawn back at the hip, point forward
          const f = e.fwd();
          o.armR = { D: { x: f.x * 0.6 + 0.1, y: -0.2, z: f.z * 0.6 }, reach: 0.45 }; o.lean = 0.35 * k; o.twist = 0.5 * k;
        } else if (m.spin) {
          o.armR = { D: this.swingDir(A, 0, k), reach: 0.9 }; o.twist = -0.8 * k * A.dir;
        } else o.armR = { D: this.swingDir(A, 0, k), reach: m.zone || m.close ? 0.8 : 0.9 };
        o.blade = 1;
        o.legs = 'plant'; o.fF = [0.22, 0, -0.42]; o.fB = [-0.24, 0, 0.45]; o.drop = (m.quake ? 0.3 : 0.18) * k;
        o.lean = m.thrust ? o.lean : m.down ? -0.15 * k : 0.15 * k;
        o.armL = { rot: [0.5 * k, -0.6, 0.5] };
        o.tremble = m.close ? 0.6 : 0;
        return true;
      }
      case 'guard': {
        // the blade up across the body, the free hand braced behind it
        const f = e.fwd(), r = { x: -f.z, z: f.x };
        o.armR = { D: { x: f.x * 0.45 - r.x * 0.55, y: 0.7, z: f.z * 0.45 - r.z * 0.55 }, reach: 0.55 };
        o.armL = { rot: [1.1, -0.2, 1.2] };
        o.legs = 'plant'; o.fF = [0.22, 0, -0.38]; o.fB = [-0.24, 0, 0.42]; o.drop = 0.2; o.lean = 0.12; o.blade = 1;
        return true;
      }
      case 'gun': {
        // the forearm housing points at you; the body turns the right shoulder in
        o.armR = { D: a.aimDir || e.aimDir, reach: 0.98 }; o.twist = -0.35; o.blade = 0;
        o.armL = { rot: [0.35, -0.3, 0.5] };
        if (o.legs === 'stand' || o.legs === 'plant') { o.legs = 'plant'; o.fF = [0.24, 0, -0.32]; o.fB = [-0.24, 0, 0.36]; o.drop = 0.1; }
        return true;
      }
      case 'beam': {
        // hanging under the jets with the left shoulder turned in so the cannon leads
        o.cannon = a.dir || e.aimDir; o.twist = 0.45; o.lean = 0.05;
        o.armR = { rot: [0.25, 0.55, 0.4] }; o.armL = { rot: [0.6, -0.25, 0.7] };
        if (a.phase !== 'rise') o.legs = 'hover';
        return true;
      }
      case 'strike': {
        // the shoulder cannon brought round onto where the next probe goes, the free arm braced
        const q = a.plan[Math.min(a.shots, a.plan.length - 1)], c = e.lensPos();
        if (q) { const dx = q.x - c.x, dz = q.z - c.z, dh = Math.hypot(dx, dz) || 1; o.cannon = { x: dx / dh, y: 0.55, z: dz / dh }; }
        o.twist = 0.45; o.armL = { rot: [0.6, -0.25, 0.7] };
        if (o.legs === 'stand' || o.legs === 'plant' || o.legs === 'walk') { o.legs = 'plant'; o.fF = [0.24, 0, -0.32]; o.fB = [-0.24, 0, 0.38]; o.drop = 0.14; }
        return true;
      }
      case 'grenade': {
        // the charge held up in the left hand, then thrown
        const thrown = a.thrown;
        o.armL = thrown ? { rot: [-1.3, -0.15, 0.2] } : { rot: [-2.6, -0.25, 0.5] };
        o.armR = { rot: [0.3, 0.35, 0.5] }; o.lean = thrown ? 0.3 : -0.12; o.twist = thrown ? -0.3 : 0.35;
        o.legs = 'plant'; o.fF = [0.22, 0, -0.36]; o.fB = [-0.24, 0, 0.4]; o.drop = 0.1;
        return true;
      }
      case 'dive': {
        if (a.phase === 'crouch') {
          // charging: sunk low and shaking, the blade drawn back down by its side
          const k = clamp(a.t / Math.max(0.05, e.tele(DIVE.CHARGE)), 0, 1);
          o.legs = 'plant'; o.fF = [0.26, 0, -0.32]; o.fB = [-0.28, 0, 0.38]; o.drop = (0.4 + 0.2 * k) * S; o.lean = 0.45 + 0.1 * k; o.tremble = 0.4 + 0.8 * k;
          o.armR = { D: { x: 0, y: -0.6, z: 0 }, reach: 0.6, back: true }; o.armL = { rot: [0.6, -0.4, 0.8] }; o.blade = 1;
        } else if (a.phase === 'dive') {
          // pitched along the dive, the blade driven ahead of it
          const d = a.dir || { x: 0, y: -1, z: 0 };
          o.legs = 'air'; o.lean = 0.9; o.armR = { D: d, reach: 0.98 }; o.armL = { rot: [-0.3, -0.7, 0.4] }; o.blade = 1;
        } else {
          // rising and hanging: the blade raised overhead, legs tucked under the jets
          o.legs = a.phase === 'hang' ? 'hover' : 'air'; o.lean = -0.1;
          const f = e.fwd();
          o.armR = { D: { x: f.x * 0.25, y: 1, z: f.z * 0.25 }, reach: 0.95 }; o.armL = { rot: [-0.4, -0.8, 0.6] }; o.blade = 1;
        }
        return true;
      }
      case 'zip': {
        // the left arm out along the line, the body hanging off it, legs trailing
        if (a.phase === 'drop') return false;
        const h = a.hook, sh = e.local(-0.43, 2.05, 0), dx = h.x - sh.x, dy = h.y - sh.y, dz = h.z - sh.z, l = Math.hypot(dx, dy, dz) || 1;
        o.armL = { D: { x: dx / l, y: dy / l, z: dz / l }, reach: 0.98 };
        o.armR = { rot: [0.4, 0.5, 0.6] };
        if (a.phase === 'reel') { o.legs = 'air'; o.lean = 0.3; }
        else if (o.legs === 'stand' || o.legs === 'plant') { o.legs = 'plant'; o.fF = [0.22, 0, -0.3]; o.fB = [-0.24, 0, 0.36]; o.drop = 0.12; }
        o.twist = 0.3;
        return true;
      }
      case 'chain': {
        // between the legs of a dash chain: a low set, blade back, ready to go again
        if (e.dashing()) return false;
        if (a.pause) {
          const f = e.fwd();
          o.legs = 'plant'; o.fF = [0.26, 0, -0.38]; o.fB = [-0.26, 0, 0.42]; o.drop = 0.3 * S * clamp(a.pt / 0.1, 0, 1); o.lean = 0.35;
          o.armR = e.bladeOut ? { D: { x: -f.x * 0.7 + f.z * 0.3, y: -0.35, z: -f.z * 0.7 - f.x * 0.3 }, reach: 0.85 } : o.armR;
          return true;
        }
        return false;
      }
      case 'recover':
        o.lean = Math.max(o.lean, 0.3); o.drop = Math.max(o.drop, 0.12);
        if (o.legs === 'stand' || o.legs === 'plant') { o.legs = 'plant'; o.fF = [0.22, 0, -0.45]; o.fB = [-0.24, 0, 0.4]; }
        if (e.bladeOut > 0.5) { const f = e.fwd(); o.armR = { D: { x: f.x * 0.6 + f.z * 0.4, y: -0.6, z: f.z * 0.6 - f.x * 0.4 }, reach: 0.95 }; }
        return true;
    }
    return false;
  },
  enragePose(e, o, a) {
    const S = AEGIS_SCALE;
    o.blade = 0;
    if (a.stage === 'brace') {
      o.legs = 'plant'; o.fF = [0.26, 0, -0.35]; o.fB = [-0.26, 0, 0.38]; o.drop = 0.4 * S; o.lean = 0.5; o.head = 0.4;
      o.armR = { rot: [0.9, 0.6, 1.2] }; o.armL = { rot: [0.9, -0.6, 1.2] };
    } else if (a.stage === 'charge') {
      o.legs = 'hover'; o.lean = -0.1; o.head = -0.2; o.tremble = 1;
      o.armR = { rot: [0.3, 0.9, 1.1] }; o.armL = { rot: [0.3, -0.9, 1.1] };
    } else if (a.stage === 'roar') {
      // flung open: chest out, arms wide and up, head thrown back
      o.legs = 'hover'; o.lean = -0.45; o.head = -0.5; o.tremble = 1;
      o.armR = { rot: [-0.6, 1.5, 0.2] }; o.armL = { rot: [-0.6, -1.5, 0.2] };
    } else {
      // a three-point landing: one knee down, a fist on the street
      o.legs = 'kneel'; o.kneel = 1; o.drop = 0.75 * S; o.lean = 0.5; o.head = -0.1;
      o.armL = { reach: e.handPlant(), }; o.armR = { rot: [0.5, 0.9, 0.6] };
    }
    return o;
  },
  introPose(e, o, I) {
    const S = AEGIS_SCALE, f = e.fwd(), down = { x: f.x * 0.25, y: -1, z: f.z * 0.25 };
    o.blade = I.stage === 'gather' || I.stage === 'erupt' ? 0 : 1;
    if (I.stage === 'rise') {
      // stands out of the kneel, drawing the blade up out of the street
      const k = easeOutCubic(clamp((I.ct - 2.6) / 0.45, 0, 1));
      o.legs = 'kneel'; o.kneel = 1 - k; o.drop = lerp(0.75 * S, 0.08, k); o.lean = lerp(0.45, 0.06, k);
      o.armR = { D: { x: lerp(down.x, f.x * 0.5 + f.z * 0.5, k), y: lerp(-1, -0.5, k), z: lerp(down.z, f.z * 0.5 - f.x * 0.5, k) }, reach: lerp(0.6, 0.95, k) };
      o.armL = { rot: [lerp(1.0, 0.2, k), -0.2, lerp(1.2, 0.3, k)] };
    } else if (I.stage === 'title') {
      // the blade swept out to its side, the cannon raised, chin up
      o.legs = 'plant'; o.fF = [0.24, 0, -0.32]; o.fB = [-0.24, 0, 0.36]; o.drop = 0.12; o.lean = -0.05; o.head = -0.15;
      o.armR = { D: { x: f.z * 0.9 + f.x * 0.3, y: -0.25, z: -f.x * 0.9 + f.z * 0.3 }, reach: 0.98 };
      o.armL = { rot: [0.2, -0.5, 0.4] };
      o.cannon = { x: f.x, y: 0.35, z: f.z };
      o.tremble = I.ct < 3.6 ? 0.5 : 0;
    } else {
      // kneeling inside the beam, the blade planted point down in the street, the left hand on the knee
      o.legs = 'kneel'; o.kneel = 1; o.drop = 0.75 * S; o.lean = 0.45; o.head = 0.35;
      o.armR = { D: down, reach: 0.6 }; o.armL = { rot: [1.0, -0.2, 1.2] };
    }
    return o;
  },
  koPose(e, o, K) {
    const S = AEGIS_SCALE, f = e.fwd(), down = { x: f.x * 0.3, y: -1, z: f.z * 0.3 };
    o.blade = K.stage === 'down' || K.stage === 'collapse' ? 0 : 1;
    switch (K.stage) {
      case 'impact':
        o.legs = e.onGround ? 'plant' : 'air'; o.fF = [0.2, 0, -0.45]; o.fB = [-0.22, 0, 0.35]; o.lean = -0.55; o.head = -0.5;
        o.armR = { rot: [-2.2, 0.5, 0.3] }; o.armL = { rot: [-1.6, -0.7, 0.5] };
        break;
      case 'stagger':
        o.legs = 'plant'; o.fF = [0.18, 0, -0.25]; o.fB = [-0.22, 0, 0.5]; o.lean = -0.2 + Math.sin(e.t * 9) * 0.08; o.drop = 0.15; o.head = 0.2;
        o.armR = { rot: [0.3, 0.3, 0.5] }; o.armL = { rot: [0.2, -0.3, 0.5] }; o.tremble = 0.6;
        break;
      case 'kneel':
        o.legs = 'kneel'; o.kneel = 1; o.drop = 0.75 * S; o.lean = 0.45; o.head = 0.5;
        o.armR = { D: down, reach: 0.6 }; o.armL = { rot: [1.0, -0.2, 1.2] };
        break;
      default: {
        // falls forward from the kneel and lies face down (render.js pitches the whole body)
        const u = K.rot;
        o.legs = 'kneel'; o.kneel = 1 - u; o.drop = lerp(0.75 * S, 0, u); o.lean = lerp(0.45, 0, u); o.head = 0.2;
        o.armR = { rot: [lerp(0.4, -2.6, u), 0.3, 0.2] }; o.armL = { rot: [lerp(1.0, -2.4, u), -0.3, 0.2] };
        o.tilt = -1.48 * u * u;
      }
    }
    return o;
  },

  // ---------- AEGIS as the player (aegisplayer.js) ----------
  // The same pose description, read from the player's state: its moves on the shared controller, the gun
  // arm along the aim, the cannon along the beam or the strike's arc, the block and the burst.
  pickPlayer(p) {
    const S = AEGIS_SCALE, f = p.fwd(), v = p.vel, hs = Math.hypot(v.x, v.z);
    const o = {
      lean: 0, twist: 0, drop: 0, roll: 0, legs: 'stand', walk: 0, amt: 0, fF: null, fB: null, kneel: 0,
      armR: { rot: [0.15, 0.12, 0.35] }, armL: { rot: [0.1, -0.12, 0.3] }, head: 0, headYaw: 0, cannon: null, blade: p.bladeOut, tremble: 0,
    };
    // crouched or sliding, the body sinks into the shorter hull
    const sink = Math.max(0, p.M.H - p.h);
    const plant = (fF, fB, drop) => { o.legs = 'plant'; o.fF = fF; o.fB = fB; o.drop = Math.max(drop, sink * 0.9); };
    const stance = (k = 1) => { if (p.onGround) plant([0.22, 0, -0.42], [-0.24, 0, 0.42], 0.16 * k); else o.legs = p.hovering() ? 'hover' : 'air'; };
    o.headYaw = clamp(angDiff(p.yaw, p.aimYaw), -0.8, 0.8);
    o.head = clamp(-p.aimDir.y * 0.6, -0.5, 0.5);
    if (p.dead) {
      // down on one knee, slumped over it
      const k = clamp(p.deadT / 0.4, 0, 1);
      o.legs = 'kneel'; o.kneel = k; o.drop = lerp(0.1, 0.75 * S, k); o.lean = 0.7 * k; o.head = 0.6;
      o.armR = { rot: [0.5, 0.25, 0.4] }; o.armL = { rot: [0.45, -0.25, 0.5] }; o.blade = 0; o.headYaw = 0;
      return o;
    }
    this.playerMove(p, o, f, hs, sink, plant);
    // what its arms are doing over the top of the movement
    const B = p.beamAct, A = p.attack, s = p.sheathe, T = p.tether;
    if (p.kickAnim) {
      // the kick off the grenade: a boot along the kick, then the jets carry it back
      const k = p.kickAnim.t / p.kickAnim.dur, d = p.kickAnim.dir;
      o.legs = 'plant'; o.fF = [0.15, clamp(1.0 + d.y, 0.3, 1.6), -0.8]; o.fB = [-0.2, 0.2, 0.3]; o.lean = -0.3 + 0.4 * k;
      o.armR = { rot: [-0.8, 0.9, 0.3] }; o.armL = { rot: [-0.8, -0.9, 0.3] };
      return o;
    }
    if ((p.hurtT > 0 || p.dazeT > 0) && !p.ultAim) {
      o.lean = -0.35 + (p.dazeT > 0 ? Math.sin(p.t * 5) * 0.12 : 0); o.head = -0.3; o.armR = { rot: [-0.6, 0.6, 0.3] }; o.armL = { rot: [-0.5, -0.6, 0.3] };
      if (p.onGround) plant([0.18, 0, -0.45], [-0.18, 0, 0.4], 0.12);
      return o;
    }
    if (B) {
      // the cannon along the beam, the left shoulder turned in, braced or hanging on the jets
      o.cannon = B.dir; o.twist = 0.45; o.lean = 0.05; o.head = clamp(-B.dir.y * 0.5, -0.4, 0.4); o.headYaw = 0.3;
      o.armR = { rot: [0.25, 0.55, 0.4] }; o.armL = { rot: [0.6, -0.25, 0.7] };
      if (p.onGround) plant([0.24, 0, -0.34], [-0.26, 0, 0.4], 0.14); else o.legs = 'hover';
      o.tremble = B.phase === 'fire' ? 0.35 : 0;
      return o;
    }
    if (p.ultAim || p.ultCharging > 0 || p.probeT > 0) {
      // the cannon raised along the arc (or recoiling off the shot), the free arm braced
      const P = p.ultAim && p.ultAim.plan;
      if (P) { const vl = Math.hypot(P.v.x, P.v.y, P.v.z) || 1; o.cannon = { x: P.v.x / vl, y: P.v.y / vl, z: P.v.z / vl }; }
      else o.cannon = { x: f.x, y: p.probeT > 0 ? 0.9 : 0.6, z: f.z };
      o.twist = 0.4; o.lean = p.probeT > 0 ? -0.2 : 0.05; o.headYaw = 0.25;
      o.armL = { rot: [0.9, -0.3, 1.2] }; o.armR = { rot: [0.35, 0.45, 0.6] };
      if (p.onGround) plant([0.26, 0, -0.32], [-0.28, 0, 0.42], 0.22); else o.legs = 'hover';
      o.tremble = p.ultCharging > 0 ? 0.6 : 0;
      return o;
    }
    if (p.burstT > 0) {
      // the blade driven forward to the full reach of the arm, the body lunging behind it
      const d = p.burstDir || { x: f.x, y: 0, z: f.z };
      o.armR = { D: d, reach: 1 }; o.blade = 1; o.lean = 0.45; o.twist = -0.4;
      o.armL = { rot: [0.6, -0.8, 0.5] };
      if (p.onGround) plant([0.24, 0, -0.62], [-0.26, 0, 0.5], 0.3);
      return o;
    }
    if (s) {
      if (s.empowered) {
        // a block taken: the arm drawn right back, blade levelled forward, shaking as the burst builds
        const k = p.burstCharge(s), r = p.right();
        o.armR = { D: { x: -f.x * 0.75 + r.x * 0.35, y: -0.1, z: -f.z * 0.75 + r.z * 0.35 }, reach: lerp(0.75, 0.55, k) };
        o.twist = 0.5 + 0.2 * k; o.lean = 0.15; o.tremble = 0.4 + 0.8 * k;
        o.armL = { rot: [-0.6, -0.4, 0.5] };
      } else {
        // the right arm raised across the body, the blade up to take the blow
        const r = p.right();
        o.armR = { D: { x: f.x * 0.45 - r.x * 0.55, y: 0.7, z: f.z * 0.45 - r.z * 0.55 }, reach: 0.55 };
        o.armL = { rot: [1.1, -0.2, 1.2] }; o.lean = 0.12; o.twist = -0.15;
      }
      o.blade = 1;
      stance();
      return o;
    }
    if (A && A.groundCut) {
      // the scythe: low across the slide, the blade swept along the street
      const u = easeOutCubic(clamp(A.t / A.sweep, 0, 1));
      o.armR = { D: this.swingDir(A, u), E: this.swingEdge(A, u), reach: 0.95 }; o.blade = 1; o.lean = 0.2;
      plant([0.22, 0, -0.7], [-0.2, 0, 0.1], 0.5);
      return o;
    }
    if (A) {
      o.blade = 1;
      if (A.wind && A.t < A.wind) {
        // drawn back past the start of the arc, shaking with the effort
        const k = easeOutCubic(A.t / A.wind);
        o.armR = { D: this.swingDir(A, 0, k), reach: A.thrust ? 0.5 : 0.9 }; o.lean = A.heavy ? -0.15 * k : 0.1; o.tremble = A.heavy ? 0.8 : 0.3;
        if (A.thrust) o.twist = 0.5 * k;
      } else {
        const u = easeOutCubic(clamp((A.t - (A.wind || 0)) / A.sweep, 0, 1));
        o.armR = { D: this.swingDir(A, u), E: this.swingEdge(A, u), reach: A.thrust ? 1 : 0.95 };
        o.lean = A.thrust ? 0.45 : 0.25 + (A.tilt > 1 ? 0.3 * u : 0);
        o.twist = A.thrust ? -0.4 : Math.abs(A.tilt) < 1 ? clamp(-A.dir * (u - 0.5) * A.span * 0.3, -0.6, 0.6) : 0;
      }
      o.armL = { rot: [0.3, -0.7, 0.6] };
      if (p.onGround) plant([0.22, 0, A.thrust || A.boost ? -0.6 : -0.5], [-0.24, 0, 0.42], A.heavy ? 0.3 : 0.22);
      return o;
    }
    if (p.plunge) {
      // driving down on the jets, the blade under it
      o.legs = 'air'; o.lean = 0.35; o.armR = { D: { x: f.x * 0.2, y: -1, z: f.z * 0.2 }, reach: 0.95 }; o.blade = 1; o.armL = { rot: [-0.4, -0.8, 0.4] };
      return o;
    }
    const pend = p.atkPend;
    if (pend && !pend.dash && pend.t > 0.05 && Input.isDown('attack')) {
      // holding for the cleave (or the plunge in the air): the blade hauled up over the shoulder
      const k = clamp((pend.t - 0.05) / 0.12, 0, 1);
      o.armR = { D: { x: -f.x * 0.4 * k, y: lerp(-0.3, 1, k), z: -f.z * 0.4 * k }, reach: 0.85 }; o.blade = 1; o.lean = -0.1 * k; o.tremble = k >= 1 ? 0.7 : 0;
      return o;
    }
    if (T && (T.phase === 'fly' || (T.phase === 'attached' && (T.mode === 'zip' || T.mode === 'tow')))) {
      // the left arm out along the line
      const h = p.hand(), dx = T.pos.x - h.x, dy = T.pos.y - h.y, dz = T.pos.z - h.z, l = Math.hypot(dx, dy, dz) || 1;
      o.armL = { D: { x: dx / l, y: dy / l, z: dz / l }, reach: 0.98 };
      if (T.mode === 'zip') { o.legs = 'air'; o.lean = 0.3; }
      o.twist = 0.3;
    }
    if (p.swap) {
      // the forearm brought up in front of the visor while the housing reconfigures
      const k = clamp(p.swap.t / AP.SWITCH, 0, 1), r = p.right();
      o.armR = { D: { x: f.x * 0.8 - r.x * 0.4, y: 0.25, z: f.z * 0.8 - r.z * 0.4 }, reach: 0.55 }; o.tremble = 0.2 + 0.4 * k;
      o.blade = ((p.t * (8 + 24 * k)) | 0) % 2 ? Math.max(o.blade, 0.4 * k) : o.blade * 0.5;
    } else if (p.utilT > 0) {
      // the mode set: the arm thrown out to the side
      const r = p.right();
      o.armR = { D: { x: r.x * 0.8 + f.x * 0.4, y: -0.2, z: r.z * 0.8 + f.z * 0.4 }, reach: 0.98 };
    } else if (p.mode === 'gun' && (p.gun.firing || p.aimHold > 0)) {
      // the forearm housing along the aim, the right shoulder turned in
      o.armR = { D: p.aimDir, reach: 0.98 }; o.twist = -0.3; o.blade = 0;
      o.armL = { rot: [0.35, -0.3, 0.5] };
      o.tremble = p.gun.firing ? 0.25 : 0;
    }
    return o;
  },
  // the legs and body for how the player is moving
  playerMove(p, o, f, hs, sink, plant) {
    const S = AEGIS_SCALE, v = p.vel;
    if (p.dashT > 0) {
      const l = Math.hypot(p.dashVX, p.dashVZ) || 1, fv = (p.dashVX * f.x + p.dashVZ * f.z) / l, sv = (p.dashVX * -f.z + p.dashVZ * f.x) / l;
      o.legs = 'dash'; o.lean = 0.25 + 0.35 * Math.max(0, fv) - 0.3 * Math.max(0, -fv); o.roll = clamp(sv, -1, 1) * 0.45; o.drop = 0.1 * S;
      o.armR = { rot: [-0.5 * fv + 0.3, 0.35, 0.4] }; o.armL = { rot: [-0.4 * fv + 0.3, -0.45, 0.5] };
      return;
    }
    if (p.cling) {
      // side on to the wall, the left hand driven into it, legs hanging
      o.legs = 'hover'; o.armL = { reach: p.clingHand(p.cling.n) }; o.lean = 0.05;
      return;
    }
    if (p.vault) {
      o.legs = 'air'; o.lean = 0.35;
      if (p.vault.t / p.vault.dur < 0.8) o.armL = { reach: p.vault.plant };
      return;
    }
    if (p.mantle) {
      o.legs = 'air'; o.lean = 0.5; o.armR = { rot: [-2.4, 0.3, 0.4] }; o.armL = { rot: [-2.4, -0.3, 0.4] };
      return;
    }
    if (p.skid) {
      // dropped low, the left hand dug into the street
      plant([0.24, 0, -0.35], [-0.2, 0, 0.55], 0.45); o.lean = 0.5; o.armL = { reach: p.skidHand() };
      return;
    }
    if (p.sliding) {
      // leaning back on the slide, the leading leg out in front
      plant([0.22, 0, -0.75], [-0.2, 0, 0.05], 0.5); o.lean = -0.5;
      o.armR = { rot: [0.6, 0.4, 0.4] }; o.armL = { rot: [0.9, -0.5, 0.5] };
      return;
    }
    if (p.hovering()) {
      o.legs = 'hover'; o.lean = clamp((v.x * f.x + v.z * f.z) * 0.04, -0.3, 0.3);
      o.armR = { rot: [0.2, 0.35, 0.3] }; o.armL = { rot: [0.2, -0.35, 0.3] };
      return;
    }
    if (!p.onGround) {
      o.legs = 'air'; o.lean = 0.1 + clamp(hs / 30, 0, 0.3);
      o.armR = { rot: [-0.2, 0.45, 0.4] }; o.armL = { rot: [-0.2, -0.45, 0.4] };
      return;
    }
    if (p.crouching) {
      plant([0.24, 0, -0.3], [-0.24, 0, 0.32], 0.3); o.lean = 0.35;
      return;
    }
    if (hs > 0.6) {
      // a heavy run: the faster, the deeper the lean and the longer the stride
      const k = clamp(hs / 9, 0, 1), fv = (v.x * f.x + v.z * f.z) / hs;
      o.legs = 'walk'; o.walk = p.runPhase; o.amt = clamp(hs / 4, 0.3, 1.1); o.lean = 0.08 + 0.35 * k * Math.max(0, fv) - 0.1 * Math.max(0, -fv) + p.accF * 0.15;
      const sw = Math.sin(p.runPhase) * 0.5 * k;
      o.armR = { rot: [0.25 - sw, 0.15, 0.45] }; o.armL = { rot: [0.25 + sw, -0.15, 0.45] };
      return;
    }
    // planted, feet apart, a slow breath through the shoulders
    const br = Math.sin(p.t * 2.2) * 0.02;
    plant([0.2, 0, -0.18], [-0.22, 0, 0.18], 0.06 + br); o.lean = 0.06;
  },

  apply(r, e) {
    const [T, P, D, E, U, F, A, X, Y] = this.temps();
    const o = e.isPlayer ? this.pickPlayer(e) : this.pick(e), B = r.bones, M = r.mesh, S = AEGIS_SCALE;
    Rig.reset(r);
    if (!e.isPlayer) e.tilt = o.tilt || 0;
    const tr = () => (o.tremble ? rand(-0.012, 0.012) * o.tremble : 0);
    // body: drop and bank at the hips, lean shared by spine and chest, twist in the chest
    B.hips.position.y -= o.drop;
    B.hips.position.x += tr();
    B.hips.rotation.z = -o.roll;
    B.spine.rotation.x = -o.lean * 0.5;
    B.chest.rotation.x = -o.lean * 0.5;
    B.chest.rotation.y = o.twist;
    B.head.rotation.x = clamp(o.head + o.lean * 0.6, -0.6, 0.9);
    // in first person the head and the shoulder cannon would sit on the lens: folded away
    const fp = Camera.fp && e === Game.player;
    B.head.scale.setScalar(fp ? 0.001 : 1);
    B.cannon.scale.setScalar(fp ? 0.001 : 1);
    M.updateMatrixWorld(true);
    // legs
    const legIK = (side, tgt) => {
      const x = side === 'R' ? 1 : -1;
      T.set(tgt[0] * S + x * 0.02, tgt[1], tgt[2] * S);
      M.localToWorld(T);
      P.set(x * 0.25, 1.2, -3);
      M.localToWorld(P);
      Rig.ik(r, 'thigh' + side, 'shin' + side, 'foot' + side, T, P, -1);
      U.set(0, 1, 0); F.set(fwdX(e.yaw), 0, fwdZ(e.yaw));
      Rig.orient(B['foot' + side], U, F);
    };
    if (o.legs === 'walk') {
      const s = Math.sin(o.walk), c = Math.cos(o.walk), a = o.amt;
      B.thighL.rotation.x = s * 0.7 * a; B.thighR.rotation.x = -s * 0.7 * a;
      B.shinL.rotation.x = -Math.max(0, -c) * 1.1 * a - 0.12; B.shinR.rotation.x = -Math.max(0, c) * 1.1 * a - 0.12;
      B.footL.rotation.x = -B.thighL.rotation.x * 0.3; B.footR.rotation.x = -B.thighR.rotation.x * 0.3;
      B.hips.position.y -= Math.abs(c) * 0.07 * a + 0.04;
      // each footfall thumps
      const step = Math.floor(o.walk / Math.PI);
      if (e._step !== step) { e._step = step; if (a > 0.5 && e.onGround) e.footfall(); }
    } else if (o.legs === 'plant') {
      legIK('R', o.fF || [0.2, 0, -0.2]);
      legIK('L', o.fB || [-0.2, 0, 0.2]);
    } else if (o.legs === 'kneel') {
      // right foot planted ahead, left knee down behind
      const k = o.kneel;
      legIK('R', [0.2, 0, lerp(-0.2, -0.42, k)]);
      legIK('L', [-0.2, lerp(0, 0.05, k), lerp(0.2, 0.62, k)]);
      if (k > 0.5) B.footL.rotation.x += 1.0 * k;
    } else if (o.legs === 'hover' || o.legs === 'air' || o.legs === 'dash') {
      // hanging under the jets: knees bent a little, toes down; tucked higher in a jump; trailing in a dash
      const tuck = o.legs === 'air' ? 1 : 0, dash = o.legs === 'dash' ? 1 : 0;
      B.thighR.rotation.x = 0.35 + 0.5 * tuck - 0.5 * dash; B.shinR.rotation.x = -0.55 - 0.6 * tuck - 0.3 * dash;
      B.thighL.rotation.x = 0.05 + 0.2 * tuck - 0.8 * dash; B.shinL.rotation.x = -0.35 - 0.8 * tuck - 0.5 * dash;
      B.footL.rotation.x = B.footR.rotation.x = 0.5;
      const sway = Math.sin(e.t * 3) * 0.04;
      B.thighL.rotation.z = -0.08 + sway; B.thighR.rotation.z = 0.08 + sway;
    }
    // head turns toward you a little past the chest
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
        D.set(spec.D.x, spec.D.y, spec.D.z).normalize();
        T.copy(A).addScaledVector(D, (spec.reach || 0.95) * 0.57 * S);
      } else if (spec.reach) T.set(spec.reach.x, spec.reach.y, spec.reach.z);
      T.x += tr(); T.y += tr();
      // elbows out and back
      P.set(x * 0.8, -0.4, 0.9).applyQuaternion(M.quaternion).add(A);
      Rig.ik(r, 'arm' + side, 'fore' + side, 'hand' + side, T, P, 1);
    };
    arm('R', o.armR);
    arm('L', o.armL);
    // the weapon bone runs down the right forearm, or along a swing's direction
    B.foreR.updateMatrixWorld(true);
    if (o.armR.D) {
      D.set(o.armR.D.x, o.armR.D.y, o.armR.D.z).normalize();
      if (o.armR.E) E.set(o.armR.E.x, o.armR.E.y, o.armR.E.z); else E.set(0, -1, 0).addScaledVector(D, 0.01);
    } else {
      D.set(0, -1, 0).transformDirection(B.foreR.matrixWorld);
      E.set(0, 0, -1).transformDirection(B.foreR.matrixWorld);
    }
    Rig.orient(B.weapon, D, E);
    if (r.blade) {
      const k = clamp(o.blade || 0, 0, 1);
      r.blade.visible = k > 0.02;
      r.blade.scale.set(1, Math.max(0.02, k), 1);
    }
    // the cannon: along its aim, or resting forward and a little up
    B.chest.updateMatrixWorld(true);
    if (o.cannon) D.set(o.cannon.x, o.cannon.y, o.cannon.z).normalize();
    else D.set(0, 0.2, -1).applyQuaternion(B.chest.getWorldQuaternion(r._q || (r._q = new THREE.Quaternion()))).normalize();
    U.set(0, 1, 0);
    if (Math.abs(D.y) > 0.95) U.set(0, 0, 1);
    Rig.orient(B.cannon, U, D);
    // its lights, by phase
    const tint = e.tints();
    for (const k in tint) Rig.tint(r, k, tint[k]);
  },
};
Poses.aegis = (r, e) => AegisPose.apply(r, e);
