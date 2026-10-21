'use strict';
// Effects. For now only the screen flash, copied from the 2D fx.js; the 3D effects arrive in Phase 2.

const FX = {
  flashA: 0, flashColor: '#ffffff',

  clear() { this.flashA = 0; },
  n(count) {
    const v = count * S.visuals.particles;
    return Math.floor(v) + (Math.random() < v % 1 ? 1 : 0);
  },
  flash(color = '#ffffff', a = 0.5) {
    if (!S.visuals.flashes) return;
    this.flashColor = color;
    this.flashA = Math.max(this.flashA, a);
  },
  update(dt) { /* particles, rings and trails land here in Phase 2 */ },
};
