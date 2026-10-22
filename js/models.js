'use strict';
// Character and prop models built from parts on the humanoid rig, and their poses. Enemy colours come
// from the 2D sprites; the player follows the concept sheets.

// the scarf's tail: segment length and count
const SCARF_SEG = 0.17, SCARF_N = 6;

const MODELS = {
  // hunched scrap-gang melee rusher with a cleaver; 1.64 m tall (18 px)
  scrapper: {
    bones: HUMANOID, scale: 0.9,
    parts: [
      { bone: 'hips', size: [0.34, 0.18, 0.22], at: [0, -0.02, 0], color: '#3e2a24' },
      { bone: 'spine', size: [0.38, 0.32, 0.26], at: [0, 0.14, 0], color: '#6b4a3a', taper: 1.12 },
      { bone: 'chest', size: [0.46, 0.34, 0.3], at: [0, 0.12, 0.02], color: '#6b4a3a', taper: 1.08 },
      { bone: 'chest', size: [0.12, 0.08, 0.04], at: [-0.08, 0.04, -0.15], color: '#c86a3a', glow: true },
      { bone: 'chest', size: [0.5, 0.08, 0.32], at: [0, 0.3, 0.02], color: '#8e6a52' },
      { bone: 'head', size: [0.24, 0.22, 0.26], at: [0, 0.1, -0.04], color: '#5a3e30' },
      { bone: 'head', size: [0.24, 0.04, 0.26], at: [0, 0.22, -0.04], color: '#8e6a52' },
      { bone: 'head', size: [0.1, 0.06, 0.04], at: [0.05, 0.12, -0.18], color: '#c8ff3a', glow: true, plain: true, tag: 'eye' },
      { bone: 'head', size: [0.04, 0.14, 0.04], at: [-0.06, 0.28, 0.02], color: '#3e2a24' },
      { bone: 'armL', shape: 'hex', size: [0.12, 0.3, 0.12], at: [0, -0.15, 0], color: '#8a8a90' },
      { bone: 'foreL', shape: 'hex', size: [0.1, 0.27, 0.1], at: [0, -0.13, 0], color: '#8a8a90', taper: 0.8 },
      { bone: 'handL', size: [0.1, 0.1, 0.1], at: [0, -0.04, 0], color: '#3e2a24' },
      { bone: 'armR', shape: 'hex', size: [0.12, 0.3, 0.12], at: [0, -0.15, 0], color: '#8a8a90' },
      { bone: 'foreR', shape: 'hex', size: [0.1, 0.27, 0.1], at: [0, -0.13, 0], color: '#8a8a90', taper: 0.8 },
      { bone: 'handR', size: [0.1, 0.1, 0.1], at: [0, -0.04, 0], color: '#3e2a24' },
      // the cleaver points down the forearm at rest; poses swing it
      { bone: 'weapon', size: [0.04, 0.12, 0.04], at: [0, -0.04, 0], color: '#3e2a24' },
      { bone: 'weapon', size: [0.03, 0.5, 0.2], at: [0, -0.33, -0.06], color: '#b8b8c0', tag: 'blade' },
      { bone: 'thighL', shape: 'hex', size: [0.16, 0.43, 0.16], at: [0, -0.21, 0], color: '#4e3628' },
      { bone: 'shinL', shape: 'hex', size: [0.13, 0.42, 0.13], at: [0, -0.21, 0], color: '#4e3628', taper: 1.2 },
      { bone: 'footL', size: [0.13, 0.08, 0.26], at: [0, -0.02, -0.05], color: '#16121a' },
      { bone: 'thighR', shape: 'hex', size: [0.16, 0.43, 0.16], at: [0, -0.21, 0], color: '#8e6a52' },
      { bone: 'shinR', shape: 'hex', size: [0.13, 0.42, 0.13], at: [0, -0.21, 0], color: '#8e6a52', taper: 1.2 },
      { bone: 'footR', size: [0.13, 0.08, 0.26], at: [0, -0.02, -0.05], color: '#16121a' },
    ],
  },
  // scrap-militia rifleman in olive drab with an amber visor; holds its range and lays a laser on you
  gunner: humanoidModel(0.95, {
    body: '#4a5a3a', dark: '#2a2a30', vest: '#3e4a32', limb: '#6a7a52', boot: '#16121a', eye: '#ffaa30',
    extra: [
      { bone: 'chest', size: [0.3, 0.16, 0.06], at: [0, 0.06, -0.16], color: '#2a2a30' },
      { bone: 'chest', size: [0.08, 0.1, 0.05], at: [0.1, 0.0, -0.19], color: '#3e4a32' },
      { bone: 'chest', size: [0.08, 0.1, 0.05], at: [-0.1, 0.0, -0.19], color: '#3e4a32' },
      { bone: 'chest', size: [0.3, 0.3, 0.14], at: [0, 0.08, 0.2], color: '#3e4a32' },
      { bone: 'armL', size: [0.17, 0.1, 0.17], at: [0, 0.02, 0], color: '#3e4a32' },
      { bone: 'armR', size: [0.17, 0.1, 0.17], at: [0, 0.02, 0], color: '#3e4a32' },
      // the rifle runs down the weapon bone from the right hand: stock, receiver and magazine, barrel, muzzle
      { bone: 'weapon', size: [0.07, 0.22, 0.12], at: [0, 0.08, 0.02], color: '#2a2a30' },
      { bone: 'weapon', size: [0.08, 0.42, 0.12], at: [0, -0.22, 0], color: '#3a3a42' },
      { bone: 'weapon', size: [0.06, 0.14, 0.08], at: [0, -0.2, 0.1], color: '#2a2a30' },
      { bone: 'weapon', size: [0.04, 0.32, 0.04], at: [0, -0.58, -0.02], color: '#8a8a90' },
      { bone: 'weapon', size: [0.05, 0.04, 0.05], at: [0, -0.76, -0.02], color: '#ffaa30', glow: true, plain: true, tag: 'muzzle' },
    ],
  }),
  // heavy-set bomber in teal with a gas mask and a backpack of glowing charges; lobs pulse grenades
  grenadier: humanoidModel(1.0, {
    body: '#3a5a5a', dark: '#2a3a3a', vest: '#2a3a3a', limb: '#6a8a7a', boot: '#16121a', eye: '#4af0ff', bulk: 1.15,
    extra: [
      { bone: 'chest', size: [0.38, 0.42, 0.22], at: [0, 0.08, 0.26], color: '#2a3a3a' },
      { bone: 'chest', shape: 'hex', size: [0.1, 0.3, 0.1], at: [-0.11, 0.1, 0.39], color: '#4af0ff', glow: true },
      { bone: 'chest', shape: 'hex', size: [0.1, 0.3, 0.1], at: [0.11, 0.1, 0.39], color: '#4af0ff', glow: true },
      { bone: 'head', size: [0.16, 0.12, 0.1], at: [0, 0.04, -0.17], color: '#2a3a3a' },
      { bone: 'head', shape: 'hex', size: [0.08, 0.08, 0.08], at: [0, 0.0, -0.24], rot: [Math.PI / 2, 0, 0], color: '#6a8a7a' },
      // the throwing gauntlet: a heavy cuff with a charge cell that brightens through the wind-up
      { bone: 'foreR', shape: 'hex', size: [0.17, 0.2, 0.17], at: [0, -0.16, 0], color: '#2a3a3a' },
      { bone: 'handR', size: [0.14, 0.14, 0.14], at: [0, -0.06, 0], color: '#2a3a3a' },
      { bone: 'handR', size: [0.1, 0.1, 0.1], at: [0, -0.13, 0], color: '#4af0ff', glow: true, plain: true, tag: 'orb' },
    ],
  }),
  // riot-shield trooper in steel blue with a gold-banded shield on its left arm (the shield bone rides the chest)
  shielder: humanoidModel(0.95, {
    body: '#3a4250', dark: '#2a3038', vest: '#3a4250', limb: '#6a7a8a', boot: '#16121a', eye: '#ffd040', bulk: 1.08,
    bones: [['shield', 'chest', -0.06, -0.02, -0.44]],
    extra: [
      { bone: 'head', size: [0.29, 0.1, 0.3], at: [0, 0.25, -0.02], color: '#6a7a8a' },
      { bone: 'head', size: [0.05, 0.08, 0.26], at: [0, 0.32, 0.0], color: '#2a3038' },
      { bone: 'chest', size: [0.48, 0.2, 0.3], at: [0, 0.26, 0.02], color: '#6a7a8a' },
      { bone: 'shield', size: [0.66, 1.2, 0.07], at: [0, 0, 0], color: '#2a3038' },
      { bone: 'shield', size: [0.56, 1.08, 0.03], at: [0, 0, -0.045], color: '#4a5464' },
      { bone: 'shield', size: [0.04, 1.1, 0.05], at: [0.31, 0, -0.03], color: '#9aaaba' },
      { bone: 'shield', size: [0.56, 0.1, 0.02], at: [0, -0.1, -0.065], color: '#d8b040' },
      { bone: 'shield', size: [0.24, 0.045, 0.02], at: [0, 0.33, -0.065], color: '#1a2028' },
      { bone: 'shield', size: [0.06, 0.06, 0.02], at: [0, 0.33, -0.07], color: '#ffd040', glow: true, plain: true, tag: 'slit' },
    ],
  }),
  // rooftop marksman in maroon with a hood, a long rifle with a red scope, and a grapple on the left wrist
  sniper: humanoidModel(0.95, {
    body: '#5a2a3a', dark: '#2a1a24', vest: '#3a1a24', limb: '#5a2a3a', boot: '#16121a', eye: '#ff3a52',
    extra: [
      { bone: 'head', size: [0.3, 0.14, 0.32], at: [0, 0.2, 0.01], color: '#3a1a24', taper: 0.8 },
      { bone: 'head', size: [0.3, 0.2, 0.06], at: [0, 0.08, 0.15], color: '#3a1a24' },
      { bone: 'chest', size: [0.44, 0.56, 0.06], at: [0, -0.06, 0.17], color: '#3a1a24' },
      { bone: 'spine', size: [0.38, 0.4, 0.05], at: [0, -0.2, 0.15], color: '#2a1a24', taper: 1.2 },
      { bone: 'foreL', size: [0.12, 0.1, 0.13], at: [0, -0.2, 0], color: '#6a6a76' },
      { bone: 'foreL', size: [0.04, 0.03, 0.06], at: [0, -0.2, -0.08], color: '#ff3a52', glow: true, plain: true },
      // the rifle runs down the weapon bone from the right hand: stock, body, scope, long barrel, muzzle
      { bone: 'weapon', size: [0.07, 0.26, 0.13], at: [0, 0.1, 0.02], color: '#1a1a20' },
      { bone: 'weapon', size: [0.08, 0.5, 0.1], at: [0, -0.25, 0], color: '#1a1a20' },
      { bone: 'weapon', size: [0.05, 0.24, 0.05], at: [0, -0.24, -0.09], color: '#2a2a30' },
      { bone: 'weapon', size: [0.045, 0.02, 0.045], at: [0, -0.37, -0.09], color: '#ff3a52', glow: true, plain: true, tag: 'scope' },
      { bone: 'weapon', size: [0.035, 0.76, 0.035], at: [0, -0.86, -0.02], color: '#6a6a76' },
      { bone: 'weapon', size: [0.05, 0.05, 0.05], at: [0, -1.25, -0.02], color: '#ff3a52', glow: true, plain: true, tag: 'muzzle' },
    ],
  }),
  brute: bruteModel(),
  crawler: crawlerModel(),
  drone: droneModel(),
  // red fuel barrel: slash it to light the fuse, tether it to throw
  barrel: {
    bones: [['root', null, 0, 0, 0]],
    parts: [
      { bone: 'root', shape: 'hex', size: [0.84, 1.27, 0.84], at: [0, 0.635, 0], color: '#a01c1c' },
      { bone: 'root', shape: 'hex', size: [0.88, 0.07, 0.88], at: [0, 0.3, 0], color: '#3a0a0a' },
      { bone: 'root', shape: 'hex', size: [0.88, 0.07, 0.88], at: [0, 0.97, 0], color: '#3a0a0a' },
      { bone: 'root', shape: 'hex', size: [0.7, 0.05, 0.7], at: [0, 1.29, 0], color: '#5a0e0e' },
      { bone: 'root', size: [0.32, 0.3, 0.06], at: [0, 0.64, -0.37], color: '#e8c040', plain: true },
      { bone: 'root', size: [0.12, 0.12, 0.07], at: [0, 0.64, -0.38], color: '#1a1010', plain: true },
    ],
  },
  player: playerModel(),
};

// A soldier on the humanoid rig: c gives the palette (body, dark, vest, limb, boot, eye), bulk widens the
// torso, and extra adds the type's own kit (weapon parts ride the 'weapon' bone in the right hand).
function humanoidModel(scale, c) {
  const k = c.bulk || 1;
  return {
    bones: c.bones ? HUMANOID.concat(c.bones) : HUMANOID, scale,
    parts: [
      { bone: 'hips', size: [0.32 * k, 0.18, 0.22], at: [0, -0.02, 0], color: c.dark },
      { bone: 'spine', size: [0.34 * k, 0.3, 0.24], at: [0, 0.14, 0], color: c.body, taper: 1.08 },
      { bone: 'chest', size: [0.44 * k, 0.34, 0.28], at: [0, 0.12, 0.01], color: c.vest, taper: 1.06 },
      { bone: 'chest', size: [0.2, 0.08, 0.2], at: [0, 0.32, 0], color: c.dark },
      { bone: 'head', size: [0.24, 0.24, 0.26], at: [0, 0.11, -0.02], color: c.vest },
      { bone: 'head', size: [0.27, 0.06, 0.29], at: [0, 0.22, -0.02], color: c.body },
      { bone: 'head', size: [0.18, 0.05, 0.04], at: [0, 0.12, -0.16], color: c.eye, glow: true, plain: true, tag: 'eye' },
      { bone: 'armL', shape: 'hex', size: [0.12, 0.3, 0.12], at: [0, -0.15, 0], color: c.limb },
      { bone: 'foreL', shape: 'hex', size: [0.1, 0.27, 0.1], at: [0, -0.13, 0], color: c.limb, taper: 0.85 },
      { bone: 'handL', size: [0.09, 0.1, 0.09], at: [0, -0.04, 0], color: c.dark },
      { bone: 'armR', shape: 'hex', size: [0.12, 0.3, 0.12], at: [0, -0.15, 0], color: c.limb },
      { bone: 'foreR', shape: 'hex', size: [0.1, 0.27, 0.1], at: [0, -0.13, 0], color: c.limb, taper: 0.85 },
      { bone: 'handR', size: [0.09, 0.1, 0.09], at: [0, -0.04, 0], color: c.dark },
      { bone: 'thighL', shape: 'hex', size: [0.16, 0.43, 0.16], at: [0, -0.21, 0], color: c.dark },
      { bone: 'shinL', shape: 'hex', size: [0.13, 0.42, 0.13], at: [0, -0.21, 0], color: c.dark, taper: 1.15 },
      { bone: 'footL', size: [0.13, 0.08, 0.26], at: [0, -0.02, -0.05], color: c.boot },
      { bone: 'thighR', shape: 'hex', size: [0.16, 0.43, 0.16], at: [0, -0.21, 0], color: c.dark },
      { bone: 'shinR', shape: 'hex', size: [0.13, 0.42, 0.13], at: [0, -0.21, 0], color: c.dark, taper: 1.15 },
      { bone: 'footR', size: [0.13, 0.08, 0.26], at: [0, -0.02, -0.05], color: c.boot },
    ].concat(c.extra || []),
  };
}

// The brute: a hunched scrap giant 2.8 m tall, wide in the shoulders, with a furnace glowing in its chest
// and fists like engine blocks. Its head sits low between the shoulders (poses lower the head bone).
function bruteModel() {
  const T = '#3c3c48', TOP = '#6e6e7a', DK = '#24242c', LIMB = '#5e5e6a', BACK = '#2a2a32', RUST = '#7a3e28', FIRE = '#ff7a2a';
  const parts = [
    { bone: 'hips', size: [0.44, 0.2, 0.32], at: [0, -0.02, 0], color: DK },
    { bone: 'spine', size: [0.5, 0.32, 0.36], at: [0, 0.14, 0], color: T, taper: 1.3 },
    { bone: 'chest', size: [0.82, 0.42, 0.48], at: [0, 0.14, 0.02], color: T, taper: 1.12 },
    { bone: 'chest', size: [0.88, 0.1, 0.5], at: [0, 0.36, 0.02], color: TOP },
    { bone: 'chest', size: [0.5, 0.36, 0.08], at: [0, 0.1, 0.27], color: DK },
    { bone: 'chest', size: [0.24, 0.2, 0.04], at: [0.1, 0.13, -0.25], color: '#141016' },
    { bone: 'chest', size: [0.12, 0.06, 0.03], at: [-0.22, 0.02, -0.25], color: RUST },
    { bone: 'chest', size: [0.08, 0.04, 0.03], at: [0.3, 0.3, -0.25], color: RUST },
    { bone: 'head', size: [0.26, 0.22, 0.28], at: [0, 0.04, -0.08], color: BACK },
    { bone: 'head', size: [0.26, 0.04, 0.28], at: [0, 0.15, -0.08], color: LIMB },
    { bone: 'head', size: [0.16, 0.035, 0.03], at: [0, -0.03, -0.225], color: '#141016' },
    { bone: 'head', size: [0.045, 0.035, 0.02], at: [-0.06, 0.06, -0.225], color: '#ffb040', glow: true, plain: true, tag: 'eye' },
    { bone: 'head', size: [0.045, 0.035, 0.02], at: [0.06, 0.06, -0.225], color: '#ffb040', glow: true, plain: true, tag: 'eye' },
  ];
  for (const y of [0.07, 0.13, 0.19]) parts.push({ bone: 'chest', size: [0.18, 0.025, 0.02], at: [0.1, y, -0.27], color: FIRE, glow: true, plain: true, tag: 'furnace' });
  for (const [s, x, col] of [['L', -1, BACK], ['R', 1, LIMB]]) {
    parts.push(
      { bone: 'arm' + s, size: [0.32, 0.16, 0.34], at: [x * 0.03, 0.03, 0], rot: [0, 0, -x * 0.2], color: '#8a8a96' },
      { bone: 'arm' + s, shape: 'hex', size: [0.2, 0.3, 0.2], at: [0, -0.15, 0], color: col },
      { bone: 'fore' + s, shape: 'hex', size: [0.18, 0.27, 0.18], at: [0, -0.13, 0], color: col, taper: 1.2 },
      { bone: 'hand' + s, size: [0.27, 0.25, 0.27], at: [0, -0.09, 0], color: x > 0 ? TOP : DK },
      { bone: 'hand' + s, size: [0.28, 0.04, 0.06], at: [0, -0.12, -0.12], color: RUST },
      { bone: 'thigh' + s, shape: 'hex', size: [0.3, 0.43, 0.3], at: [0, -0.21, 0], color: LIMB },
      { bone: 'shin' + s, shape: 'hex', size: [0.26, 0.42, 0.26], at: [0, -0.21, 0], color: BACK, taper: 1.2 },
      { bone: 'shin' + s, size: [0.3, 0.14, 0.3], at: [0, -0.02, 0], color: '#8a8a96' },
      { bone: 'foot' + s, size: [0.3, 0.14, 0.42], at: [0, -0.03, -0.06], color: DK },
    );
  }
  return { bones: HUMANOID, scale: 1.45, parts };
}

// The armoured crawler: a low shell 1.4 m long on six legs, a red eye and mandibles at the front, and
// seams between its plates that glow once the armour cracks.
function crawlerModel() {
  const SHELL = '#4a4a56', TOP = '#8a8a96', BELLY = '#2e2e38', LEG = '#2a2a32';
  const bones = [['body', null, 0, 0.4, 0], ['head', 'body', 0, 0.02, -0.7]];
  const parts = [
    { bone: 'body', size: [1.0, 0.36, 1.3], at: [0, 0.05, 0], color: SHELL, taper: 0.8 },
    { bone: 'body', size: [0.9, 0.08, 1.2], at: [0, -0.15, 0], color: BELLY },
    { bone: 'head', size: [0.42, 0.3, 0.36], at: [0, 0, -0.1], color: '#3a3a44' },
    { bone: 'head', size: [0.22, 0.05, 0.03], at: [0, 0.05, -0.29], color: '#ff3a3a', glow: true, plain: true, tag: 'eye' },
    { bone: 'head', size: [0.06, 0.06, 0.24], at: [-0.12, -0.1, -0.34], color: '#6a6a76' },
    { bone: 'head', size: [0.06, 0.06, 0.24], at: [0.12, -0.1, -0.34], color: '#6a6a76' },
  ];
  for (const z of [-0.42, 0, 0.42]) parts.push({ bone: 'body', size: [0.78, 0.08, 0.36], at: [0, 0.25, z], color: TOP, taper: 0.85 });
  for (const z of [-0.21, 0.21]) parts.push({ bone: 'body', size: [0.66, 0.03, 0.05], at: [0, 0.29, z], color: '#24242c', glow: true, plain: true, tag: 'crack' });
  parts.push({ bone: 'body', size: [0.04, 0.03, 0.9], at: [0, 0.3, 0], color: '#24242c', glow: true, plain: true, tag: 'crack' });
  [-0.45, 0, 0.45].forEach((z, i) => {
    for (const [s, x] of [['L', -1], ['R', 1]]) {
      bones.push(['leg' + i + s, 'body', x * 0.42, -0.05, z], ['foot' + i + s, 'leg' + i + s, 0, -0.32, 0]);
      parts.push(
        { bone: 'leg' + i + s, shape: 'hex', size: [0.09, 0.34, 0.09], at: [0, -0.15, 0], color: LEG },
        { bone: 'foot' + i + s, shape: 'hex', size: [0.07, 0.34, 0.07], at: [0, -0.15, 0], color: LEG, taper: 0.5 },
      );
    }
  });
  return { bones, scale: 1, parts };
}

// The drone: a small hull with a lens at the front, rotors on two arms and a thruster underneath.
function droneModel() {
  const bones = [['body', null, 0, 0.42, 0], ['rotL', 'body', -0.55, 0.13, 0], ['rotR', 'body', 0.55, 0.13, 0]];
  const parts = [
    { bone: 'body', size: [0.62, 0.3, 0.5], at: [0, 0, 0], color: '#5a5a66' },
    { bone: 'body', size: [0.5, 0.06, 0.42], at: [0, 0.18, 0], color: '#8a8a96' },
    { bone: 'body', size: [0.5, 0.06, 0.42], at: [0, -0.18, 0], color: '#3a3a44' },
    { bone: 'body', size: [0.2, 0.14, 0.04], at: [0, 0.0, -0.265], color: '#3a3a44' },
    { bone: 'body', size: [0.14, 0.09, 0.03], at: [0, 0.0, -0.285], color: '#ffd040', glow: true, plain: true, tag: 'eye' },
    { bone: 'body', size: [0.16, 0.04, 0.16], at: [0, -0.23, 0.08], color: '#ff9030', glow: true, plain: true, tag: 'jet' },
    { bone: 'body', size: [0.5, 0.05, 0.07], at: [-0.32, 0.07, 0], rot: [0, 0, 0.3], color: '#3a3a44' },
    { bone: 'body', size: [0.5, 0.05, 0.07], at: [0.32, 0.07, 0], rot: [0, 0, -0.3], color: '#3a3a44' },
    { bone: 'body', size: [0.02, 0.22, 0.02], at: [0.16, 0.3, 0.12], color: '#8a8a96' },
  ];
  for (const s of ['L', 'R']) {
    parts.push(
      { bone: 'rot' + s, shape: 'hex', size: [0.1, 0.08, 0.1], at: [0, 0, 0], color: '#3a3a44' },
      { bone: 'rot' + s, size: [0.72, 0.015, 0.07], at: [0, 0.05, 0], color: '#9a9aa6', plain: true },
      { bone: 'rot' + s, size: [0.07, 0.015, 0.72], at: [0, 0.05, 0], color: '#9a9aa6', plain: true },
    );
  }
  return { bones, scale: 1, parts };
}

// The cyborg swordsman from the concept sheets: charcoal plate armour with a pixel-noise finish, a red
// right arm, a red visor slit, swept silver fins on the helmet, red running lights on chest, knees,
// shins and boots, a red scarf that frays to black, a gold-banded sheath on the left hip and a curved
// glowing red katana with a wrapped grip.
function playerModel() {
  const A = '#34343a', AD = '#26262b', AL = '#46464e', RED = '#bd1828', REDD = '#7e1020', GOLD = '#c99a3a';
  const LIT = '#ff2a3a', SILVER = '#a4a4ae', GRIP = '#17171b';
  const light = (bone, size, at) => ({ bone, size, at, color: LIT, glow: true, plain: true });
  const parts = [
    // hips: pelvis, belt with a gold buckle and pouches, a plate hanging behind
    { bone: 'hips', size: [0.32, 0.16, 0.22], at: [0, -0.04, 0], color: A },
    { bone: 'hips', size: [0.37, 0.07, 0.25], at: [0, 0.05, 0], color: AD },
    { bone: 'hips', size: [0.08, 0.06, 0.03], at: [0, 0.05, -0.135], color: GOLD },
    { bone: 'hips', size: [0.07, 0.09, 0.07], at: [0.19, 0.0, -0.05], color: AL },
    { bone: 'hips', size: [0.07, 0.09, 0.07], at: [0.19, 0.0, 0.05], color: AD },
    { bone: 'hips', size: [0.3, 0.22, 0.04], at: [0, -0.12, 0.13], rot: [-0.2, 0, 0], color: AD },
    // abdomen with ridges, chest plate, pecs, the red core light, collar and the scarf's wrap at the neck
    { bone: 'spine', size: [0.29, 0.22, 0.2], at: [0, 0.1, 0], color: A, taper: 1.1 },
    { bone: 'spine', size: [0.22, 0.03, 0.03], at: [0, 0.05, -0.1], color: AD },
    { bone: 'spine', size: [0.22, 0.03, 0.03], at: [0, 0.13, -0.105], color: AD },
    { bone: 'chest', size: [0.44, 0.32, 0.27], at: [0, 0.1, 0], color: A, taper: 1.12 },
    { bone: 'chest', size: [0.18, 0.14, 0.05], at: [-0.1, 0.14, -0.145], color: AL },
    { bone: 'chest', size: [0.18, 0.14, 0.05], at: [0.1, 0.14, -0.145], color: AL },
    light('chest', [0.06, 0.035, 0.03], [0, 0.04, -0.145]),
    light('chest', [0.025, 0.05, 0.02], [-0.19, 0.0, -0.12]),
    { bone: 'chest', size: [0.38, 0.28, 0.04], at: [0, 0.1, 0.14], color: AD },
    { bone: 'chest', size: [0.3, 0.06, 0.24], at: [0, 0.27, 0.01], color: AD },
    { bone: 'chest', size: [0.29, 0.11, 0.27], at: [0, 0.31, 0.0], color: '#cc1a2a', tag: 'scarf' },
    // helmet: rounded box, a mask over the lower face, the visor slit, swept fins and ear plates
    { bone: 'head', size: [0.24, 0.27, 0.27], at: [0, 0.11, 0.0], color: A, taper: 0.9 },
    { bone: 'head', size: [0.06, 0.04, 0.22], at: [0, 0.25, 0.02], color: AD },
    { bone: 'head', size: [0.22, 0.13, 0.05], at: [0, 0.04, -0.13], color: AD },
    { bone: 'head', size: [0.19, 0.035, 0.03], at: [0, 0.135, -0.14], color: LIT, glow: true, plain: true, tag: 'visor' },
    { bone: 'head', size: [0.04, 0.1, 0.11], at: [-0.125, 0.09, 0.02], color: AD },
    { bone: 'head', size: [0.04, 0.1, 0.11], at: [0.125, 0.09, 0.02], color: AD },
    { bone: 'head', size: [0.03, 0.035, 0.22], at: [-0.13, 0.19, 0.08], rot: [0.55, -0.15, 0], color: SILVER, taper: 0.4 },
    { bone: 'head', size: [0.03, 0.035, 0.22], at: [0.13, 0.19, 0.08], rot: [0.55, 0.15, 0], color: SILVER, taper: 0.4 },
    { bone: 'head', size: [0.025, 0.03, 0.15], at: [-0.12, 0.24, 0.06], rot: [0.95, -0.1, 0], color: SILVER, taper: 0.4 },
    { bone: 'head', size: [0.025, 0.03, 0.15], at: [0.12, 0.24, 0.06], rot: [0.95, 0.1, 0], color: SILVER, taper: 0.4 },
  ];
  // arms: the right one is red from the shoulder to the fingers
  for (const [side, x, col, dark] of [['L', -1, A, AD], ['R', 1, RED, REDD]]) {
    parts.push(
      { bone: 'arm' + side, size: [0.2, 0.12, 0.23], at: [x * 0.03, 0.03, 0], rot: [0, 0, -x * 0.28], color: col },
      { bone: 'arm' + side, size: [0.15, 0.05, 0.17], at: [x * 0.07, -0.06, 0], rot: [0, 0, -x * 0.4], color: dark },
      { bone: 'arm' + side, shape: 'hex', size: [0.12, 0.3, 0.12], at: [0, -0.15, 0], color: col },
      { bone: 'fore' + side, size: [0.1, 0.07, 0.1], at: [0, 0.0, 0], color: dark },
      { bone: 'fore' + side, size: [0.11, 0.24, 0.12], at: [0, -0.14, 0], color: col, taper: 1.18 },
      { bone: 'hand' + side, size: [0.09, 0.09, 0.1], at: [0, -0.045, 0], color: dark },
      { bone: 'hand' + side, size: [0.085, 0.05, 0.08], at: [0, -0.11, -0.01], color: dark },
    );
  }
  // legs: hex thighs with plates on the front and outside, knee guards and greaves with lights, chunky boots
  for (const [side, x] of [['L', -1], ['R', 1]]) {
    parts.push(
      { bone: 'thigh' + side, shape: 'hex', size: [0.17, 0.43, 0.17], at: [0, -0.21, 0], color: A },
      { bone: 'thigh' + side, size: [0.15, 0.2, 0.04], at: [0, -0.09, -0.095], rot: [0.08, 0, 0], color: AL },
      { bone: 'thigh' + side, size: [0.04, 0.25, 0.17], at: [x * 0.1, -0.1, 0], rot: [0, 0, x * 0.08], color: AD },
      { bone: 'shin' + side, size: [0.13, 0.11, 0.07], at: [0, 0.0, -0.08], color: AD },
      light('shin' + side, [0.03, 0.035, 0.02], [0, -0.005, -0.12]),
      { bone: 'shin' + side, size: [0.14, 0.4, 0.16], at: [0, -0.2, 0], color: A, taper: 1.12 },
      light('shin' + side, [0.025, 0.05, 0.02], [0, -0.22, -0.085]),
      { bone: 'foot' + side, size: [0.15, 0.11, 0.27], at: [0, -0.03, -0.05], color: '#232327' },
      { bone: 'foot' + side, size: [0.14, 0.07, 0.07], at: [0, -0.045, -0.17], color: AD },
      { bone: 'foot' + side, size: [0.155, 0.02, 0.1], at: [0, 0.015, 0.05], color: GOLD },
      light('foot' + side, [0.02, 0.03, 0.03], [x * 0.077, -0.03, 0.06]),
    );
  }
  // katana on the weapon bone: grip through the fist along +y, blade beyond the guard curving toward +z
  // (the spine), its cutting edge on -z
  parts.push(
    { bone: 'weapon', size: [0.038, 0.25, 0.034], at: [0, -0.03, 0], color: GRIP },
    light('weapon', [0.04, 0.025, 0.02], [0, -0.11, 0]),
    light('weapon', [0.04, 0.025, 0.02], [0, -0.04, 0]),
    light('weapon', [0.04, 0.025, 0.02], [0, 0.03, 0]),
    { bone: 'weapon', size: [0.048, 0.03, 0.044], at: [0, 0.085, 0], color: GOLD },
    { bone: 'weapon', size: [0.05, 0.04, 0.046], at: [0, -0.165, 0], color: GOLD },
    light('weapon', [0.03, 0.012, 0.03], [0, -0.19, 0]),
    { bone: 'weapon', size: [0.12, 0.03, 0.13], at: [0, 0.112, 0], color: '#222226' },
    { bone: 'weapon', size: [0.126, 0.018, 0.04], at: [0, 0.112, 0.055], color: GOLD },
    { bone: 'weapon', size: [0.126, 0.018, 0.04], at: [0, 0.112, -0.055], color: GOLD },
    light('weapon', [0.02, 0.034, 0.06], [0, 0.112, 0]),
  );
  let px = 0.13, pz = 0;
  const SEG = 0.215, curve = [];
  for (let i = 0; i < 4; i++) {
    const th = i * 0.055, cy = Math.cos(th), sz = Math.sin(th);
    const cx = px + (cy * SEG) / 2, cz = pz + (sz * SEG) / 2;
    curve.push([th, cx, cz]);
    parts.push(
      { bone: 'weapon', size: [0.012, SEG + 0.012, 0.034], at: [0, cx, cz], rot: [th, 0, 0], color: '#e01a2a', glow: true, taper: i === 3 ? 0.2 : 0, tag: 'blade' },
      { bone: 'weapon', size: [0.015, SEG + 0.012, 0.008], at: [0, cx + 0.017 * sz, cz - 0.017 * cy], rot: [th, 0, 0], color: '#ffa8b2', glow: true, plain: true, taper: i === 3 ? 0.2 : 0, tag: 'edge' },
    );
    px += cy * SEG; pz += sz * SEG;
  }
  // sheath on the left hip, hanging down its bone's -y
  parts.push(
    { bone: 'sheath', shape: 'hex', size: [0.066, 0.92, 0.066], at: [0, -0.46, 0], color: '#2a2a30' },
    { bone: 'sheath', size: [0.085, 0.07, 0.085], at: [0, -0.02, 0], color: GOLD },
    { bone: 'sheath', size: [0.078, 0.04, 0.078], at: [0, -0.46, 0], color: GOLD },
    { bone: 'sheath', size: [0.08, 0.07, 0.08], at: [0, -0.9, 0], color: GOLD },
    light('sheath', [0.02, 0.04, 0.03], [-0.045, -0.07, 0]),
    light('sheath', [0.02, 0.04, 0.03], [-0.043, -0.86, 0]),
  );
  // the scarf's tail: a chain of bones driven by the cloth simulation, fraying to black at the end
  const SC = [['#cc1a2a', 0.2], ['#c41828', 0.19], ['#b81626', 0.17], ['#8a0f1e', 0.15], ['#4a0a12', 0.12], ['#200608', 0.09]];
  SC.forEach(([color, w], i) => {
    parts.push({ bone: 'scarf' + i, size: [w, SCARF_SEG + 0.02, 0.025], at: [0, -SCARF_SEG / 2, 0], color });
    if (i >= 3) parts.push({ bone: 'scarf' + i, size: [0.04, 0.06, 0.022], at: [(i % 2 ? 1 : -1) * w * 0.55, -SCARF_SEG * 0.8, 0], color: '#160406' });
  });
  const bones = HUMANOID.concat([['sheath', 'hips', -0.21, 0.02, -0.04]]);
  for (let i = 0; i < SC.length; i++) bones.push(['scarf' + i, null, -0.06, 1.55 - i * SCARF_SEG, 0.16]);
  return {
    bones, scale: 1, parts,
    // a soft additive halo following the blade's curve, riding the weapon bone
    attach(r) {
      const pos = [], m = new THREE.Matrix4();
      for (const [th, cx, cz] of curve) {
        const g = new THREE.BoxGeometry(0.04, SEG + 0.01, 0.065).toNonIndexed();
        g.applyMatrix4(m.makeRotationX(th).setPosition(0, cx, cz));
        pos.push(...g.attributes.position.array);
        g.dispose();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const halo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ff1a2e', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      r.bones.weapon.add(halo);
      r.extras.push(halo);
    },
  };
}
const Poses = {
  // walk cycle shared by humanoids: legs swing about the hip, knees bend on the back swing, arms counter-swing
  walk(r, phase, amt, air) {
    const B = r.bones, s = Math.sin(phase), c = Math.cos(phase);
    if (air) {
      B.thighL.rotation.x = 0.7; B.shinL.rotation.x = -1.1;
      B.thighR.rotation.x = -0.2; B.shinR.rotation.x = -0.6;
      return;
    }
    B.thighL.rotation.x = s * 0.75 * amt; B.thighR.rotation.x = -s * 0.75 * amt;
    B.shinL.rotation.x = -Math.max(0, -c) * 1.1 * amt - 0.1; B.shinR.rotation.x = -Math.max(0, c) * 1.1 * amt - 0.1;
    B.footL.rotation.x = -B.thighL.rotation.x * 0.3; B.footR.rotation.x = -B.thighR.rotation.x * 0.3;
    B.hips.position.y = r.rest.hips.y - Math.abs(c) * 0.04 * amt;
    B.armL.rotation.x = -s * 0.5 * amt;
  },

  // e: the enemy. The wind-up lifts the cleaver over the shoulder; the strike chops it down in front.
  scrapper(r, e) {
    Rig.reset(r);
    const B = r.bones, st = e.state;
    const moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 4);
    this.walk(r, e.walk, moving, !e.onGround && e.stun <= 0);
    // hunched (a negative x rotation tips the top forward)
    B.spine.rotation.x = -0.32; B.head.rotation.x = 0.25;
    B.armL.rotation.z = -0.15; B.foreL.rotation.x = 0.5;
    // rotations about x add down the arm: their sum is the blade's angle from straight down, forward positive
    let arm = 0.55, fore = 0.7, wpn = -0.6, lean = -0.32;
    if (st === 'windup') {
      const k = easeOutCubic(clamp(e.st / e.tele(0.45), 0, 1));
      arm = lerp(0.55, -2.6, k); fore = lerp(0.7, 0.9, k); wpn = lerp(-0.6, -0.3, k); lean = lerp(-0.32, 0.05, k);
      B.chest.rotation.y = lerp(0, 0.4, k);
    } else if (st === 'strike') {
      const k = clamp(e.st / 0.12, 0, 1);
      arm = lerp(-2.6, 1.3, easeOutCubic(k)); fore = 0.2; wpn = -0.1; lean = -0.65;
      B.chest.rotation.y = lerp(0.4, -0.35, k);
    } else if (st === 'recover') {
      arm = 1.0; fore = 0.3; wpn = 0.2; lean = -0.5;
      B.chest.rotation.y = -0.2;
    } else {
      arm += Math.sin(e.walk) * 0.25 * moving;
    }
    if (e.stun > 0) {
      lean = 0.25; arm = 0.2; fore = 0.2;
      B.armL.rotation.z = -0.9; B.armR.rotation.z = 0.9; B.head.rotation.x = 0.3;
    }
    B.spine.rotation.x = lean;
    B.armR.rotation.x = arm; B.foreR.rotation.x = fore; B.weapon.rotation.x = wpn;
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#c8ff3a');
    Rig.tint(r, 'blade', st === 'windup' ? '#ffd040' : '#b8b8c0');
  },
  // stunned: rocked back, arms out
  stunned(r, e) {
    const B = r.bones;
    B.spine.rotation.x = 0.25; B.head.rotation.x = 0.3;
    B.armL.rotation.z = -0.9; B.armR.rotation.z = 0.9; B.armR.rotation.x = 0.2; B.armL.rotation.x = 0.2;
  },
  // Rifle at low ready while it moves; raised along its aim (pitch from the aim line) while it aims.
  gunner(r, e) {
    Rig.reset(r);
    const B = r.bones, moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 3.5);
    this.walk(r, e.walk, moving, !e.onGround && e.stun <= 0);
    if (e.stun > 0) { this.stunned(r, e); Rig.tint(r, 'eye', '#ffaa30'); return; }
    const aiming = e.state === 'aim' || e.state === 'cool';
    const pitch = aiming ? Math.asin(clamp(e.aimDir.y, -0.9, 0.9)) : -0.5;
    // the right arm holds the stock at the shoulder, the left reaches under the barrel
    B.armR.rotation.x = Math.PI / 2 + pitch - 0.25; B.foreR.rotation.x = 0.25; B.armR.rotation.z = 0.15;
    B.armL.rotation.x = Math.PI / 2 + pitch - 0.1; B.armL.rotation.z = -0.55; B.foreL.rotation.x = 0.35;
    B.chest.rotation.y = 0.12; B.spine.rotation.x = aiming ? -0.05 : -0.12;
    B.head.rotation.x = aiming ? -pitch * 0.5 : 0.1;
    if (e.state === 'cool' && e.st < 0.12) B.armR.rotation.x -= 0.25 * (1 - e.st / 0.12);
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#ffaa30');
    Rig.tint(r, 'muzzle', e.laser() === 2 ? '#ffffff' : '#ffaa30');
  },
  // The gauntlet swings back overhead through the wind-up and its cell brightens; the throw snaps it forward.
  grenadier(r, e) {
    Rig.reset(r);
    const B = r.bones, moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 3.2);
    this.walk(r, e.walk, moving, !e.onGround && e.stun <= 0);
    B.spine.rotation.x = -0.12;
    if (e.stun > 0) { this.stunned(r, e); Rig.tint(r, 'orb', '#4af0ff'); return; }
    let arm = 0.3 + Math.sin(e.walk) * 0.2 * moving, fore = 0.4;
    if (e.state === 'throwWind') {
      const k = easeOutCubic(clamp(e.st / e.tele(1.0), 0, 1));
      arm = lerp(0.3, -2.5, k); fore = lerp(0.4, 1.2, k);
      B.spine.rotation.x = lerp(-0.12, 0.12, k); B.chest.rotation.y = lerp(0, 0.45, k);
      B.armL.rotation.x = lerp(0, 1.2, k);
    } else if (e.state === 'cool') {
      const k = clamp(e.st / 0.15, 0, 1);
      arm = lerp(-2.5, 1.3, easeOutCubic(k)); fore = 0.1; B.spine.rotation.x = -0.35; B.chest.rotation.y = lerp(0.45, -0.3, k);
    }
    B.armR.rotation.x = arm; B.foreR.rotation.x = fore;
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#4af0ff');
    Rig.tint(r, 'orb', e.state === 'throwWind' && ((e.t * 16) | 0) % 2 ? '#ffffff' : '#4af0ff');
  },
  // the shield rides in front of the chest and the left arm reaches it with IK; a bash thrusts it out,
  // a broken guard leaves it hanging low at the side
  shielder(r, e) {
    Rig.reset(r);
    const B = r.bones, S = r.scale, st = e.state, moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 3.5);
    this.walk(r, e.walk, moving, !e.onGround && e.stun <= 0);
    const sh = B.shield, rest = r.rest.shield, broken = e.guardBrokenT > 0;
    let dz = 0, dy = 0;
    B.spine.rotation.x = -0.12;
    if (broken) {
      sh.position.set(rest.x - 0.3 * S, rest.y - 0.62 * S, rest.z + 0.36 * S);
      sh.rotation.set(0.5, 0.4, 0.55);
      B.spine.rotation.x = 0.1;
    } else {
      if (st === 'bashWind') { const k = easeOutCubic(clamp(e.st / e.tele(0.5), 0, 1)); dz = 0.14 * k; dy = -0.06 * k; B.spine.rotation.x = lerp(-0.12, 0.08, k); B.hips.position.y -= 0.08 * k; }
      else if (st === 'bash') { dz = -0.3; B.spine.rotation.x = -0.4; }
      else if (st === 'recover') dz = -0.1;
      sh.position.set(rest.x, rest.y + dy * S, rest.z + dz * S);
    }
    if (e.stun > 0 && !broken) this.stunned(r, e);
    const T = this._t || (this._t = [0, 1, 2].map(() => new THREE.Vector3()));
    r.mesh.updateMatrixWorld();
    sh.updateWorldMatrix(true, false);
    sh.localToWorld(T[0].set(0.04, -0.06, 0.09));
    r.mesh.localToWorld(T[1].set(-0.9, 1.0, 0.5));
    Rig.ik(r, 'armL', 'foreL', 'handL', T[0], T[1], 1);
    B.armR.rotation.x = 0.2 + Math.sin(e.walk) * 0.3 * moving; B.foreR.rotation.x = 0.5; B.armR.rotation.z = 0.12;
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#ffd040');
    Rig.tint(r, 'slit', broken ? (((e.t * 8) | 0) % 2 ? '#ffffff' : '#ff9a3a') : e.windingUp() ? '#ffffff' : '#ffd040');
  },
  // rifle shouldered along its aim while it aims; the left arm thrown up at the grapple line while it zips
  sniper(r, e) {
    Rig.reset(r);
    const B = r.bones, aiming = e.state === 'aim' || e.state === 'cool' || e.state === 'perch';
    this.walk(r, 0, 0, !e.onGround && e.stun <= 0 && e.state !== 'zip');
    if (e.stun > 0) { this.stunned(r, e); Rig.tint(r, 'eye', '#ff3a52'); return; }
    const pitch = aiming ? Math.asin(clamp(e.aimDir.y, -0.9, 0.9)) : -0.6;
    B.armR.rotation.x = Math.PI / 2 + pitch - 0.25; B.foreR.rotation.x = 0.25; B.armR.rotation.z = 0.15;
    B.armL.rotation.x = Math.PI / 2 + pitch - 0.05; B.armL.rotation.z = -0.5; B.foreL.rotation.x = 0.3;
    B.chest.rotation.y = 0.12; B.spine.rotation.x = e.state === 'aim' ? 0.02 : -0.08;
    B.head.rotation.x = -pitch * 0.5;
    if (e.state === 'zip') {
      B.armL.rotation.x = 2.7; B.armL.rotation.z = -0.2; B.foreL.rotation.x = 0;
      B.armR.rotation.x = 0.4; B.thighL.rotation.x = 1.1; B.shinL.rotation.x = -1.6; B.thighR.rotation.x = 0.5; B.shinR.rotation.x = -1.2;
    }
    if (e.state === 'cool' && e.st < 0.15) B.armR.rotation.x -= 0.3 * (1 - e.st / 0.15);
    const lit = e.laser() === 2 ? (((e.t * 30) | 0) % 2 ? '#ffffff' : '#ff3a52') : '#ff3a52';
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#ff3a52');
    Rig.tint(r, 'scope', lit); Rig.tint(r, 'muzzle', lit);
  },
  // Hunched, head sunk. The punch draws the right fist back and drives it out; the slam raises both fists
  // overhead and brings them down. The furnace flares through every wind-up.
  brute(r, e) {
    Rig.reset(r);
    const B = r.bones, st = e.state, moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 2.2);
    this.walk(r, e.walk, moving * 0.8, !e.onGround && e.stun <= 0);
    // head sunk between shoulders set wide of the torso
    B.head.position.y = r.rest.head.y * 0.5;
    B.armL.position.x = r.rest.armL.x * 1.8; B.armR.position.x = r.rest.armR.x * 1.8;
    B.armL.rotation.z = -0.28; B.armR.rotation.z = 0.28;
    let lean = -0.38, aR = 0.15 + Math.sin(e.walk) * 0.3 * moving, fR = 0.45, aL = 0.15 - Math.sin(e.walk) * 0.3 * moving, fL = 0.45, twist = 0;
    if (st === 'punchWind') {
      const k = easeOutCubic(clamp(e.st / e.tele(0.55), 0, 1));
      aR = lerp(0.2, -1.1, k); fR = lerp(0.45, 1.7, k); twist = -0.5 * k; lean = lerp(-0.38, -0.1, k);
    } else if (st === 'punch') {
      const k = easeOutCubic(clamp(e.st / 0.08, 0, 1));
      aR = lerp(-1.1, 1.55, k); fR = lerp(1.7, 0.1, k); twist = lerp(-0.5, 0.45, k); lean = -0.6;
    } else if (st === 'slamWind') {
      const k = easeOutCubic(clamp(e.st / e.tele(0.85), 0, 1));
      aR = aL = lerp(0.2, -2.8, k); fR = fL = lerp(0.45, 0.35, k); lean = lerp(-0.38, 0.15, k);
      B.armL.rotation.z = lerp(-0.28, -0.1, k); B.armR.rotation.z = lerp(0.28, 0.1, k);
    } else if (st === 'slam') {
      const k = easeOutCubic(clamp(e.st / 0.08, 0, 1));
      aR = aL = lerp(-2.8, 1.3, k); fR = fL = 0.2; lean = lerp(0.15, -0.75, k);
      B.hips.position.y -= 0.12 * k;
    } else if (st === 'recover') { aR = aL = 0.9; fR = fL = 0.3; lean = -0.6; }
    B.spine.rotation.x = lean; B.chest.rotation.y = twist; B.head.rotation.x = -lean * 0.7;
    B.armR.rotation.x = aR; B.foreR.rotation.x = fR; B.armL.rotation.x = aL; B.foreL.rotation.x = fL;
    if (e.stun > 0) this.stunned(r, e);
    const hot = e.windingUp();
    Rig.tint(r, 'eye', hot ? '#ffffff' : '#ffb040');
    Rig.tint(r, 'furnace', hot ? (((e.t * 16) | 0) % 2 ? '#ffffff' : '#ffe080') : '#ff7a2a');
  },
  // A tripod gait: front and back legs on one side step with the middle leg on the other. The lunge
  // rears the head up, then throws the body forward with the legs trailing.
  crawler(r, e) {
    Rig.reset(r);
    const B = r.bones, st = e.state, moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 2.5), air = !e.onGround && e.stun <= 0;
    // legs splay out sideways from the shell and bend down at the knee, spider-like
    let pitch = 0, roll = 0, drop = 0, swing = 0.4 * moving, splay = 1.35;
    if (st === 'lungeWind') { const k = easeOutCubic(clamp(e.st / e.tele(0.45), 0, 1)); pitch = 0.35 * k; drop = 0.1 * k; splay = 1.35 + 0.15 * k; swing = 0; }
    else if (st === 'lunge') { pitch = -0.25; swing = 0; splay = 0.9; }
    else if (st === 'recover') { pitch = -0.1; drop = 0.04; }
    if (e.stun > 0) { roll = 0.3 * Math.sin(e.t * 20); splay = 1.5; swing = 0; }
    B.body.rotation.set(pitch, 0, roll);
    B.body.position.y = r.rest.body.y - drop + (e.onGround ? Math.abs(Math.sin(e.walk * 1.5)) * 0.03 : 0);
    for (let i = 0; i < 3; i++) {
      for (const [s, x] of [['L', -1], ['R', 1]]) {
        const grp = (i + (x > 0 ? 1 : 0)) % 2, ph = e.walk * 2 + grp * Math.PI;
        const lift = swing ? Math.max(0, Math.cos(ph)) * 0.35 : 0;
        const leg = B['leg' + i + s], foot = B['foot' + i + s];
        leg.rotation.set(air || st === 'lunge' ? -0.6 : Math.sin(ph) * swing, 0, x * (splay + lift));
        foot.rotation.set(0, 0, -x * (splay - 0.7 + lift * 0.5));
      }
    }
    const cracked = e.crackT > 0;
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#ff3a3a');
    Rig.tint(r, 'crack', cracked ? (((e.t * 10) | 0) % 2 ? '#ffd080' : '#ff7a2a') : '#24242c');
  },
  // Rotors spin; the hull tips toward where it flies and noses down into a dive. The lens blinks red
  // through the wind-up.
  drone(r, e) {
    Rig.reset(r);
    const B = r.bones, v = e.vel, f = e.fwd();
    const fwdV = v.x * f.x + v.z * f.z, sideV = v.x * -f.z + v.z * f.x;
    let pitch = -clamp(fwdV * 0.04, -0.4, 0.4), roll = clamp(sideV * 0.04, -0.4, 0.4);
    if (e.state === 'dive') { const s = Math.hypot(v.x, v.y, v.z) || 1; pitch = Math.asin(clamp(v.y / s, -1, 1)); roll = 0; }
    if (e.state === 'tele') { pitch = 0.25; roll = Math.sin(e.t * 50) * 0.06; }
    if (e.stun > 0) roll = Math.sin(e.t * 25) * 0.5;
    B.body.rotation.set(pitch, 0, roll);
    B.body.position.y = r.rest.body.y + (e.state === 'hover' ? Math.sin(e.t * 6) * 0.05 : 0);
    const spin = Game.realTime * (e.stun > 0 ? 12 : 40);
    B.rotL.rotation.y = spin; B.rotR.rotation.y = -spin;
    const blink = e.state === 'tele' && ((e.st * 16) | 0) % 2;
    Rig.tint(r, 'eye', e.state === 'tele' || e.state === 'dive' ? (blink ? '#ffffff' : '#ff3030') : '#ffd040');
    Rig.tint(r, 'jet', ((e.t * 20) | 0) % 2 ? '#ff9030' : '#ffd080');
  },
};

// ---------- the player: the 2D Player.pose() laid out in 3D ----------
// A 2D pose gives hip height, lean, a whole-body roll, and hand and foot targets in pixels in the side
// plane (x forward, y down). At 11 px per metre that plane is the rig's (forward -z, up +y): limbs spread
// sideways, IK reaches the targets, and swings follow the same 3D arc as their sword trail.
const PlayerPose = {
  _v: null,
  // the 2D pose, with the sword given either as a side-plane angle (swordAng) or a world direction (bladeW)
  pose2D(p) {
    const t = p.animT;
    // reachW: a world point the left hand reaches toward (the tether's anchor); kickW: where the front foot kicks
    const o = { hipY: -10, lean: 0.08, fF: [2.5, -1], fB: [-2.5, -1], hF: null, hB: null, sword: 'hand', swordAng: 2.35, sheathAng: null, rot: 0, tremble: 0, twist: 0, bladeW: null, edgeW: null, reachW: null, kickW: null };
    if (p.dead) {
      const k = clamp(p.deadT / 0.35, 0, 1);
      o.rot = -1.45 * k; o.hipY = -10 + 4 * k; o.fF = [4, -1]; o.fB = [-1, -1]; o.lean = -0.2;
      o.hF = [5, -4]; o.hB = [-4, -2]; o.swordAng = 0.2;
      return o;
    }
    if (p.iaido) {
      o.lean = 0.7; o.hipY = -8; o.fF = [5, -2]; o.fB = [-7, -2];
      o.bladeW = p.iaido.dir; o.hF = 'sword'; o.hB = [-6, -9];
      return o;
    }
    if (p.postPose > 0) {
      const k = p.postPose / 0.32;
      o.lean = 0.55; o.hipY = -6 - (1 - k) * 2; o.fF = [7, -1]; o.fB = [-6, -1];
      o.swordAng = Math.PI - 0.35; o.hF = [-8, -12]; o.hB = [3, -6];
      return o;
    }
    if (p.sheathe) {
      const ch = p.sheathe.empowered ? 1 : 0;
      o.lean = 0.5 + ch * 0.1; o.hipY = -7 + ch; o.fF = [6, -1]; o.fB = [-5, -1];
      if (!p.onGround) { o.fF = [4, -4]; o.fB = [-3, -2]; }
      o.sword = 'sheathed'; o.sheathAng = Math.PI - 0.15; o.hF = [3, -9 + ch]; o.hB = [-2, -8 + ch];
      o.tremble = ch;
      return o;
    }
    if (p.plunge) {
      o.lean = 0.05; o.fF = [3, -6]; o.fB = [-2, -5]; o.hipY = -11;
      o.swordAng = Math.PI / 2; o.hF = [1, -9]; o.hB = [-1, -9];
      return o;
    }
    if (p.attack && p.attack.groundCut) {
      // the blade goes into the street; the street hides the buried part
      const a = p.attack;
      if (a.heavy) {
        if (a.t < a.rip) {
          const k = easeOutCubic(clamp(a.t / 0.05, 0, 1));
          o.lean = 0.2; o.hipY = -4; o.fF = [7, -1]; o.fB = [-4, -1]; o.hB = [3, -6];
          o.hF = [6, -8]; o.swordAng = lerp(-0.8, 1.25, k); o.tremble = k >= 1 ? 1 : 0;
        } else {
          const k = easeOutCubic(clamp((a.t - a.rip) / 0.08, 0, 1));
          o.lean = lerp(0.2, -0.25, k); o.hipY = -9; o.fF = [3, -4]; o.fB = [-3, -2]; o.hB = [-5, -12];
          o.hF = 'sword'; o.swordAng = lerp(1.25, -1.9, k);
        }
        return o;
      }
      const dig = easeOutCubic(clamp(a.t / 0.05, 0, 1)), rip = easeOutCubic(clamp((a.t - 0.27) / 0.07, 0, 1));
      o.lean = -0.4; o.hipY = -4; o.fF = [8, -1]; o.fB = [1, -1]; o.hB = [-6, -1];
      o.hF = [7, -6]; o.swordAng = lerp(-0.5, 0.75, dig) - 1.6 * rip;
      return o;
    }
    if (p.attack) {
      const a = p.attack, big = a.stage === 3 || a.heavy;
      o.hF = 'sword';
      let th;
      if (a.wind && a.t < a.wind) {
        // heavy wind-up: the blade draws back past the start of its arc
        const k = easeOutCubic(a.t / a.wind);
        th = -a.dir * (a.span / 2 + 0.5 * k);
        o.hB = [-4, -8]; o.lean = 0.05; o.tremble = 1;
      } else {
        const u = easeOutCubic(clamp((a.t - (a.wind || 0)) / a.sweep, 0, 1));
        th = a.dir * (u - 0.5) * a.span;
        o.hB = [-3, -6];
        o.lean = a.type === 'slam' ? 0.15 + 0.5 * u : 0.25 + (big ? 0.25 * Math.sin(u * Math.PI) : 0);
      }
      o.bladeW = this.arcDir(a.yaw, a.tilt, th);
      // the edge leads: the arc's tangent in the direction of the sweep
      const e = this.arcDir(a.yaw, a.tilt, th + Math.PI / 2);
      o.edgeW = { x: e.x * a.dir, y: e.y * a.dir, z: e.z * a.dir };
      // the chest turns with a level swing
      o.twist = Math.abs(a.tilt) < 1 ? clamp(-th * 0.35, -0.7, 0.7) : 0;
      if (p.onGround) { o.fF = [5, -1]; o.fB = [-4, -1]; o.hipY = a.heavy ? -8 : -9; } else { o.fF = [3, -4]; o.fB = [-3, -2]; }
      return o;
    }
    if (p.dashT > 0) {
      o.lean = 0.85; o.hipY = -9; o.fF = [-1, -3]; o.fB = [-7, -4]; o.swordAng = Math.PI - 0.2; o.hF = [-7, -10]; o.hB = [-5, -12];
      return o;
    }
    if (p.kickAnim) {
      const K = p.kickAnim, k = K.t / K.dur;
      o.sword = 'sheathed'; o.sheathAng = 2.75; o.hipY = -11;
      if (k < 0.28) {
        // the kick: front foot snaps out along the aim, arms thrown wide for balance
        o.lean = -0.3; o.fB = [-3, -5]; o.hF = [4, -17]; o.hB = [-6, -15];
        const q = p.rp || p.pos;
        o.kickW = { x: q.x + K.dir.x * 0.86, y: q.y + 1.0 + K.dir.y * 0.86, z: q.z + K.dir.z * 0.86 };
      } else {
        // then a tucked backflip off the grenade
        o.rot = -easeOutQuad((k - 0.28) / 0.72) * TAU; o.lean = 0.3; o.fF = [3, -7]; o.fB = [-1, -6]; o.hF = [3, -10]; o.hB = [0, -11];
      }
      return o;
    }
    const P = p.atkPend;
    if (P && !P.dash && P.t > 0.05 && !p.sliding && Input.isDown('attack')) {
      // holding for a heavy: the blade draws back over the shoulder
      const k = clamp((P.t - 0.05) / (PC.HEAVY_HOLD - 0.05), 0, 1);
      o.lean = -0.1 * k; o.hF = [-2 - 3 * k, -15 - 2 * k]; o.hB = [2, -11]; o.swordAng = lerp(2.4, -2.6, easeOutCubic(k)); o.tremble = k >= 1 ? 1 : 0;
      if (p.onGround) { o.fF = [5, -1]; o.fB = [-5, -1]; o.hipY = -9; } else { o.fF = [3, -4]; o.fB = [-3, -2]; }
      return o;
    }
    const T = p.tether;
    if (T && T.phase === 'attached' && T.mode === 'rebound') {
      // reeling in feet first, kick chambered, blade left in its sheath
      o.lean = -0.25; o.fF = [6, -8]; o.fB = [-2, -5]; o.hF = [-4, -15]; o.hB = [-6, -12]; o.sword = 'sheathed'; o.sheathAng = 2.75;
      return o;
    }
    if (T && (T.phase === 'fly' || (T.phase === 'attached' && (T.mode === 'zip' || T.mode === 'tow')))) {
      // the left hand reaches along the line
      o.reachW = T.pos;
      if (T.mode === 'zip') { o.lean = 0.5; o.fF = [-1, -4]; o.fB = [-6, -3]; o.swordAng = Math.PI - 0.3; o.hF = [-5, -9]; }
      else if (!p.onGround) { o.fF = [3, -4]; o.fB = [-3, -2]; }
      return o;
    }
    if (p.utilT > 0) {
      o.lean = -0.25; o.hF = [7, -17]; o.hB = [-7, -16]; o.swordAng = -0.9; o.tremble = 1;
      if (p.onGround) { o.fF = [5, -1]; o.fB = [-5, -1]; } else { o.fF = [3, -4]; o.fB = [-3, -2]; }
      return o;
    }
    if (p.hurtT > 0) {
      o.lean = -0.35; o.hF = [4, -16]; o.hB = [-5, -15]; o.fF = [3, -2]; o.fB = [-3, -1]; o.swordAng = -1;
      return o;
    }
    if (p.sliding) {
      o.cat = 'slide'; o.lean = -0.45; o.hipY = -4; o.fF = [8, -1]; o.fB = [1, -1]; o.hB = [-6, -1]; o.swordAng = -2.4; o.hF = [3, -11];
      return o;
    }
    if (p.vault) {
      // a speed vault: the free hand plants on the top, the legs tuck and sweep over, the blade trails
      const k = clamp(p.vault.t / p.vault.dur, 0, 1);
      o.cat = 'vault'; o.lean = 0.6; o.hipY = -9.5; o.fF = [5, -9 + 3 * k]; o.fB = [1, -8 + 3 * k];
      o.plantW = p.vault.plant; o.hF = [-5, -10]; o.swordAng = Math.PI + 0.3;
      return o;
    }
    if (p.wallSliding) {
      o.lean = -0.1; o.fF = [3, -3]; o.fB = [-3, -1]; o.hB = [-5, -14]; o.hF = [4, -9]; o.swordAng = 2.6;
      return o;
    }
    if (p.mantle) {
      o.cat = 'mantle'; o.lean = 0.5; o.hipY = -9; o.fF = [3, -6]; o.fB = [-2, -3]; o.hF = [5, -17]; o.hB = [5, -17]; o.swordAng = 2.6;
      return o;
    }
    if (!p.onGround) {
      if (p.spinT > 0) {
        const k = 1 - p.spinT / p.spinDur;
        o.rot = k * TAU; o.fF = [3, -7]; o.fB = [-1, -6]; o.hipY = -11; o.hF = [3, -9]; o.hB = [1, -10]; o.swordAng = 2.6; o.lean = 0.3;
        return o;
      }
      // the faster the jump, the more it keeps the sprint's shape: leaning in, legs split, blade trailing
      const k = clamp((Controller.hspeed(p) - 3) / (PC.SPRINT - 3), 0, 1);
      o.cat = 'air';
      if (p.vel.y > 0) {
        o.fF = [3 + 3 * k, -5 - k]; o.fB = [-2 - 4 * k, -2 - 2 * k]; o.lean = 0.12 + 0.3 * k;
        o.hF = [4 - 8 * k, -12 + 2 * k]; o.hB = [-4 + 7 * k, -14 + 3 * k]; o.swordAng = 2.6 + 0.9 * k;
      } else {
        o.fF = [2 + 2 * k, -k]; o.fB = [-3 - 2 * k, -1 - k]; o.lean = 0.05 + 0.25 * k; o.hipY = -10.5;
        o.hF = [5 - 9 * k, -15 + 5 * k]; o.hB = [-5 + 7 * k, -16 + 5 * k]; o.swordAng = 2.2 + 1.2 * k;
      }
      return o;
    }
    if (p.rollT > 0) {
      // a forward roll out of a hard landing at a run, tucked tight
      const k = 1 - p.rollT / p.rollDur;
      o.cat = 'roll'; o.rot = easeInOutQuad(k) * TAU; o.hipY = -7; o.lean = 1.25 * Math.sin(k * Math.PI);
      o.fF = [3, -5]; o.fB = [-1, -4]; o.hF = [2, -8]; o.hB = [3, -9]; o.swordAng = Math.PI - 0.2;
      return o;
    }
    if (p.skidding) {
      // braced against a reversal: leaning back, the lead foot dug in, the free arm out for balance
      o.cat = 'skid'; o.lean = -0.3; o.hipY = -8; o.fF = [7, -1]; o.fB = [0, -1]; o.hF = [-3, -10]; o.hB = [5, -12]; o.swordAng = Math.PI - 0.4;
      return o;
    }
    if (p.crouching) {
      o.cat = 'crouch'; o.hipY = -6; o.fF = [4, -1]; o.fB = [-4, -1]; o.lean = 0.4; o.hF = [5, -7]; o.hB = [-1, -6]; o.swordAng = 2.8;
      return o;
    }
    const sp = Controller.hspeed(p);
    if (sp > 1.4) {
      // From a jog to a full sprint the body pitches well forward (about 45 degrees at full pace), strides
      // lengthen, the back heel kicks up and the front knee drives. The sword arm trails the blade behind,
      // the free arm pumps. Hips sit lowest at mid-stance and rise through each flight.
      const ph = p.runPhase, k = clamp((sp - 3) / (PC.SPRINT - 3), 0, 1);
      o.cat = 'run';
      o.lean = 0.2 + 0.6 * k + p.accF * 0.25;
      o.hipY = -10 + 0.5 * k + (0.4 + 0.8 * k) * Math.abs(Math.cos(ph));
      const A = 3 + 4.5 * k, H = 2.5 + 3 * k, K = 1 + 4.5 * k, fwd = 1 + 1.5 * k;
      const foot = (f) => {
        const sn = Math.sin(f), cs = Math.max(0, Math.cos(f));
        return [sn * A + fwd, -1 - cs * H - cs * Math.max(0, -sn) * K * 2];
      };
      o.fF = foot(ph); o.fB = foot(ph + Math.PI);
      // hands are placed from the shoulder, which the lean carries forward and down
      const sh = [Math.sin(o.lean) * 7, o.hipY - Math.cos(o.lean) * 7];
      o.hF = [sh[0] - 4 - 2 * k, sh[1] + 4 - k + Math.sin(ph) * 0.6];
      o.swordAng = Math.PI + 0.05 + 0.35 * k;
      // elbow bent near a right angle, the hand driving forward and up, then back past the hip
      o.hB = [sh[0] + 0.5 + Math.sin(ph) * (1 + 1.5 * k), sh[1] + 3.5 - Math.max(0, Math.sin(ph)) * 3 * k];
      return o;
    }
    // at rest a while, the blade goes back in its sheath and the left hand rests on it (the concept sheet's stance)
    const br = Math.sin(t * 3) > 0 ? 0 : 1;
    if (p.idleT > 2.5) {
      o.cat = 'rest'; o.hipY = -10 + br * 0.6; o.lean = 0.04; o.fF = [1.5, -1]; o.fB = [-1.5, -1];
      o.sword = 'sheathed'; o.hF = [0.5, -8.5 + br * 0.5]; o.hB = 'hilt';
      return o;
    }
    // idle with breathing
    o.cat = 'idle'; o.hipY = -10 + br * 0.6; o.hF = [5, -8 + br * 0.5]; o.hB = [-2, -8 + br * 0.5]; o.swordAng = 2.45;
    return o;
  },
  // Movement poses (run, idle, air, slide, vault...) fade into each other over 0.12 s instead of snapping;
  // combat poses and flips come in exactly as the 2D game times them.
  crossfade(p, o) {
    const now = Game.realTime, dt = clamp(now - (p._poseT === undefined ? now : p._poseT), 0, 0.1);
    p._poseT = now;
    const prev = p._pose;
    if (!o.cat || o.rot || (prev && prev.rot)) p._fade = null;
    else if (prev && prev.cat && prev.cat !== o.cat) p._fade = { from: prev, t: 0 };
    const F = p._fade;
    if (F) {
      F.t += dt;
      const w = easeOutQuad(clamp(F.t / 0.12, 0, 1)), a = F.from;
      if (w >= 1) p._fade = null;
      for (const k of ['hipY', 'lean', 'swordAng', 'twist']) if (typeof a[k] === 'number' && typeof o[k] === 'number') o[k] = lerp(a[k], o[k], w);
      for (const k of ['fF', 'fB', 'hF', 'hB']) if (Array.isArray(a[k]) && Array.isArray(o[k])) o[k] = [lerp(a[k][0], o[k][0], w), lerp(a[k][1], o[k][1], w)];
    }
    p._pose = { cat: o.cat, rot: o.rot, hipY: o.hipY, lean: o.lean, swordAng: o.swordAng, twist: o.twist, fF: o.fF && o.fF.slice(), fB: o.fB && o.fB.slice(), hF: Array.isArray(o.hF) ? o.hF.slice() : o.hF, hB: Array.isArray(o.hB) ? o.hB.slice() : o.hB };
  },
  // world direction along a swing's arc at angle th: the same plane FX.swoosh draws its trail in
  arcDir(yaw, tilt, th) {
    const fx = fwdX(yaw), fz = fwdZ(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const c = Math.cos(th), s = Math.sin(th);
    return { x: fx * c + rx * ct * s, y: st * s, z: fz * c + rz * ct * s };
  },

  apply(r, p) {
    if (!this._v) this._v = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new THREE.Vector3());
    const [T, P, D, E, U, F, A, W] = this._v;
    const o = this.pose2D(p), B = r.bones, M = r.mesh, X = PX;
    this.crossfade(p, o);
    Rig.reset(r);
    const tr = () => (o.tremble ? rand(-0.012, 0.012) * o.tremble : 0);
    // the body: hip height, a roll about the hips for flips and falls, lean shared by spine and chest
    B.hips.position.y = -(o.hipY + (p.landSquash > 0 ? 1.5 : 0)) * X;
    B.hips.position.x += tr();
    B.hips.rotation.x = -o.rot;
    B.spine.rotation.x = -o.lean * 0.55;
    B.chest.rotation.x = -o.lean * 0.45;
    B.chest.rotation.y = o.twist;
    // the head stays level-ish and looks along the aim
    B.head.rotation.x = clamp(o.lean * 0.8 + p.aimDir.y * 0.5, -0.5, 0.8);
    M.updateMatrixWorld(true);
    // a side-plane point (2D px, x forward, y down) at a sideways offset, rolled with the body, in world space
    const piv = -o.hipY * X;
    const L = (x2, y2, side, out) => {
      let y = -y2 * X - piv, z = -x2 * X;
      if (o.rot) { const c = Math.cos(-o.rot), s = Math.sin(-o.rot); const yy = y * c - z * s; z = y * s + z * c; y = yy; }
      return M.localToWorld(out.set(side, y + piv, z));
    };
    // a side-plane direction (2D angle, y down) leaning a little to the right of the body, in world space
    const Ldir = (a, out) => {
      out.set(0.3, -Math.sin(a + o.rot), -Math.cos(a + o.rot)).normalize();
      return out.applyQuaternion(M.quaternion);
    };
    // sheath: hangs back from the left hip, or swings level behind for the draw
    // the concept art wears it steeper than the 2D sprite's 2.75
    // as the body pitches forward the sheath swings back with the hips, never down into the street
    const sa = o.sheathAng !== null ? o.sheathAng : clamp(2.2 + o.lean * 0.6, 2.0, 2.85);
    U.set(-0.25, -Math.sin(sa + o.rot), -Math.cos(sa + o.rot)).normalize().applyQuaternion(M.quaternion);
    F.set(0, 0, -1).applyQuaternion(M.quaternion);
    Rig.orient(B.sheath, U.negate(), F);
    B.sheath.updateMatrixWorld(true);
    // legs: feet on their targets, knees forward, soles level with the body
    for (const [side, foot, s] of [['R', o.fF, 0.12], ['L', o.fB, -0.12]]) {
      if (side === 'R' && o.kickW) T.set(o.kickW.x, o.kickW.y, o.kickW.z);
      else L(foot[0], foot[1], s, T);
      L(30, -6, s, P);
      Rig.ik(r, 'thigh' + side, 'shin' + side, 'foot' + side, T, P, -1);
      U.set(0, 1, 0).applyAxisAngle(this.X || (this.X = new THREE.Vector3(1, 0, 0)), -o.rot).applyQuaternion(M.quaternion);
      F.set(0, 0, -1).applyAxisAngle(this.X, -o.rot).applyQuaternion(M.quaternion);
      Rig.orient(B['foot' + side], U, F);
    }
    // the blade: a world direction from the swing, or the side-plane angle, or into the sheath
    const sheathed = o.sword === 'sheathed';
    for (const e of r.extras) e.visible = !sheathed;
    if (o.bladeW) D.set(o.bladeW.x, o.bladeW.y, o.bladeW.z).normalize();
    else Ldir(o.swordAng, D);
    // arms: the sword hand reaches along the blade when it leads; elbows go back and out
    B.chest.updateMatrixWorld(true);
    Rig.boneWorld(r, 'armR', A);
    if (o.hF === 'sword') T.copy(A).addScaledVector(D, 0.55);
    else L((o.hF || [4, -8])[0], (o.hF || [4, -8])[1], 0.22, T);
    T.x += tr(); T.y += tr();
    P.set(0.7, -0.35, 0.8).applyQuaternion(M.quaternion).add(A);
    Rig.ik(r, 'armR', 'foreR', 'handR', T, P, 1);
    Rig.boneWorld(r, 'armL', A);
    if (o.hB === 'hilt') T.setFromMatrixPosition(B.sheath.matrixWorld).addScaledVector(F.set(0, 0, -1).applyQuaternion(M.quaternion), 0.05);
    else if (o.plantW) T.set(o.plantW.x, o.plantW.y + 0.03, o.plantW.z);
    else if (o.reachW) T.set(o.reachW.x - A.x, o.reachW.y - A.y, o.reachW.z - A.z).setLength(0.6).add(A);
    else L((o.hB || [-2, -8])[0], (o.hB || [-2, -8])[1], -0.2, T);
    P.set(-0.7, -0.35, 0.8).applyQuaternion(M.quaternion).add(A);
    Rig.ik(r, 'armL', 'foreL', 'handL', T, P, 1);
    if (sheathed) {
      // into the sheath, grip standing out of the mouth
      W.set(0, -1, 0).transformDirection(B.sheath.matrixWorld);
      E.setFromMatrixPosition(B.sheath.matrixWorld).addScaledVector(W, -0.12);
      Rig.place(B.weapon, E);
      Rig.orient(B.weapon, W, F.set(0, 0, -1).transformDirection(B.sheath.matrixWorld));
    } else {
      // edge first along a swing; a carried blade keeps its edge down
      if (o.edgeW) E.set(o.edgeW.x, o.edgeW.y, o.edgeW.z); else E.set(0, -1, 0);
      Rig.orient(B.weapon, D, E);
    }
    // scarf: the cloth simulation's points, the first pinned to the neck wrap
    const sc = p.scarf;
    if (sc) {
      M.updateMatrixWorld(true);
      A.set(-0.06, 0.31, 0.15);
      B.chest.localToWorld(A);
      for (let i = 0; i < SCARF_N; i++) {
        const a = i === 0 ? A : T.set(sc[i].x, sc[i].y, sc[i].z), b = sc[i + 1] || null;
        const bone = B['scarf' + i];
        Rig.place(bone, a);
        if (b) U.set(a.x - b.x, a.y - b.y, a.z - b.z);
        if (U.lengthSq() < 1e-8) U.set(0, 1, 0);
        Rig.orient(bone, U, F.set(0, 0, -1).applyQuaternion(M.quaternion));
      }
    }
  },
};
