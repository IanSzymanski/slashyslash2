'use strict';
// Endless run upgrades and wave modifiers.
// Upgrades are sidegrades: each changes how one move works and usually costs something elsewhere.
// One of three is offered after waves 2, 5, 8 and so on; move code checks them with Game.has(id).

const UPGRADES = {
  arc: { name: 'Arc Conductor', tag: 'AC', desc: 'Counter lightning chains to 8 enemies over a wider range, for 40 damage instead of 55.' },
  voltHook: { name: 'Volt Hook', tag: 'VH', desc: 'Tether strikes burst for 30 damage around the target. Strikes no longer refund shield.' },
  emberWake: { name: 'Ember Wake', tag: 'EW', desc: 'Dashing through enemies cuts them for 20. Dash charges refill 0.25s slower.' },
  openGuard: { name: 'Open Guard', tag: 'OG', desc: 'Parry window 60% wider. Parries no longer refund shield.' },
  breaker: { name: 'Breaker', tag: 'BR', desc: 'Finishers (the lunge and the heavy slam) hit 60% harder and launch. Other lights deal 20% less.' },
  aftershock: { name: 'Aftershock', tag: 'AS', desc: 'Plunges send a ground wave each way. The impact itself deals 20% less.' },
  glass: { name: 'Glass Edge', tag: 'GE', desc: 'Deal 35% more damage. Take 25% more.' },
  bloodline: { name: 'Bloodline', tag: 'BL', desc: 'Every kill heals 2. Your shield starts recharging 1s later.' },
};
const UPGRADE_FIRST = 2, UPGRADE_EVERY = 3;

const WAVE_MODIFIERS = {
  elite: { name: 'ELITES', desc: 'SOME ENEMIES ARE GILDED: TOUGHER AND WORTH DOUBLE' },
  glints: { name: 'GLINTS ONLY', desc: 'NO ! MARKERS' },
  lowgrav: { name: 'LOW GRAVITY', desc: 'EVERYONE FLOATS' },
  blackout: { name: 'BLACKOUT', desc: 'THE STREET LIGHTS ARE OUT' },
};

function upgradeOffer(n = 3) {
  const free = Object.keys(UPGRADES).filter((id) => !Game.upgrades.has(id));
  for (let i = free.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [free[i], free[j]] = [free[j], free[i]]; }
  return free.slice(0, n);
}
function upgradeDue(wave) { return wave >= UPGRADE_FIRST && (wave - UPGRADE_FIRST) % UPGRADE_EVERY === 0; }

function makeElite(e) {
  e.elite = true;
  e.maxHp = e.hp = Math.round(e.hp * 1.8);
  e.dmgMul *= 1.3;
  e.def = Object.assign({}, e.def, { score: e.def.score * 2 });
}

// Aftershock and the heavy slam: a friendly wave that runs along the floor and hits each enemy once.
// Still the 2D version; it becomes an expanding ring with the plunge in Phase 2.
class FriendlyWave {
  constructor(x, y, dir, speed, dmg, o = {}) {
    this.x = x; this.y = y; this.dir = dir; this.speed = speed; this.dmg = dmg; this.cause = o.cause || 'plunge';
    this.t = 0; this.dur = 0.6; this.dead = false; this.hit = new Set();
  }
  update(dt) {
    this.t += dt;
    this.x += this.dir * this.speed * dt;
    if (this.t > this.dur || Level.pointSolid(this.x + this.dir * 3, this.y - 4) || !Level.pointSolid(this.x, this.y + 1, this.y)) { this.dead = true; return; }
    if (Math.random() < 0.8) FX.dust(this.x, this.y, 1, { smax: 30, rise: 30, c: '#6a5a5a' });
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || this.hit.has(e)) continue;
      if (Math.abs(e.x - this.x) < 8 + e.w / 2 && e.y > this.y - 8 && e.y < this.y + 4) {
        this.hit.add(e);
        hurtEnemy(e, this.dmg, { kx: this.dir * 140, ky: -220, cause: this.cause, heavyAtk: this.cause === 'heavy', angle: -Math.PI / 2, stagger: 0.5, hitstop: 0.01 });
      }
    }
  }
  drawEmissive(ctx, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY), k = 1 - this.t / this.dur, h = Math.round(4 + k * 6);
    ctx.fillStyle = '#ff3048'; ctx.fillRect(x - 1, y - h, 3, h);
    ctx.fillStyle = '#ffd0d8'; ctx.fillRect(x, y - h + 1, 1, h - 1);
  }
  addLights() { FX.frameLight(this.x, this.y - 5, 24, '#ff3048', 0.8); }
}
