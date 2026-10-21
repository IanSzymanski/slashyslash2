'use strict';
// Stand-in until Phase 1 brings the controller, rig and combat: a still figure the camera orbits.
// It has the members core.js touches, so core.js can stay a near copy of the 2D main.js.

const PC = { HEIGHT: 1.8, RADIUS: 0.35, MAX_HP: 100, MAX_SHIELD: 100 };
const PCOL = {
  dark: '#363c50', mid: '#6b7591', light: '#a3adc4', hi: '#e2e8f2', boot: '#171a24',
  visor: '#ff2a48', core: '#ff3a50', scarf: '#ff2a44', scarfD: '#9a1228',
  blade: '#eef1fa', edge: '#ff4a64', handle: '#3a0a12', tsuba: '#d8b048', sheath: '#5a0c1a', sheathD: '#8e1426',
};

class Player {
  constructor(pos) {
    this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.yaw = 0;
    this.hp = PC.MAX_HP; this.shield = PC.MAX_SHIELD; this.dead = false;
    this.ultCharge = 0; this.ult = null; this.sheathe = false; this.tether = null; this.loops = {};
  }
  update(dt) { /* the controller arrives in Phase 1 */ }
  heal(n) { this.hp = Math.min(PC.MAX_HP, this.hp + n); }
  zipping() { return false; }
  stopLoop(k) { if (this.loops[k]) { this.loops[k].stop(); this.loops[k] = null; } }
  stopAllLoops() { for (const k in this.loops) this.stopLoop(k); }
}
