'use strict';
// Character models built from parts on the humanoid rig, and their poses. Colours come from the 2D
// sprites. The player model isn't here yet: it waits on its design, and gfx.js has a stand-in.

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
      { bone: 'head', size: [0.1, 0.06, 0.04], at: [0.05, 0.12, -0.18], color: '#c8ff3a', glow: true, tag: 'eye' },
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
};

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
    // hunched
    B.spine.rotation.x = 0.32; B.head.rotation.x = -0.25;
    B.armL.rotation.z = -0.15; B.foreL.rotation.x = 0.5;
    // rotations about x add down the arm: their sum is the blade's angle from straight down, forward positive
    let arm = 0.55, fore = 0.7, wpn = -0.6, lean = 0.32;
    if (st === 'windup') {
      const k = easeOutCubic(clamp(e.st / e.tele(0.45), 0, 1));
      arm = lerp(0.55, -2.6, k); fore = lerp(0.7, 0.9, k); wpn = lerp(-0.6, -0.3, k); lean = lerp(0.32, -0.05, k);
      B.chest.rotation.y = lerp(0, 0.4, k);
    } else if (st === 'strike') {
      const k = clamp(e.st / 0.12, 0, 1);
      arm = lerp(-2.6, 1.3, easeOutCubic(k)); fore = 0.2; wpn = -0.1; lean = 0.65;
      B.chest.rotation.y = lerp(0.4, -0.35, k);
    } else if (st === 'recover') {
      arm = 1.0; fore = 0.3; wpn = 0.2; lean = 0.5;
      B.chest.rotation.y = -0.2;
    } else {
      arm += Math.sin(e.walk) * 0.25 * moving;
    }
    if (e.stun > 0) {
      lean = -0.25; arm = 0.2; fore = 0.2;
      B.armL.rotation.z = -0.9; B.armR.rotation.z = 0.9; B.head.rotation.x = 0.3;
    }
    B.spine.rotation.x = lean;
    B.armR.rotation.x = arm; B.foreR.rotation.x = fore; B.weapon.rotation.x = wpn;
    Rig.tint(r, 'eye', e.windingUp() ? '#ffffff' : '#c8ff3a');
    Rig.tint(r, 'blade', st === 'windup' ? '#ffd040' : '#b8b8c0');
  },
};
