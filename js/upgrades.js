'use strict';
// Endless run upgrades and wave modifiers.
// Upgrades are sidegrades: each changes how one move works and usually costs something elsewhere.
// One of three is offered after waves 2, 5, 8 and so on; move code checks them with Game.has(id). only: the one
// character whose move it changes.

const UPGRADES = {
  arc: { name: 'Arc Conductor', tag: 'AC', only: 'ronin', desc: 'Counter lightning chains to 8 enemies over a wider range, for 40 damage instead of 55.' },
  voltHook: { name: 'Volt Hook', tag: 'VH', desc: 'Tether strikes burst for 30 damage around the target. Strikes no longer refund shield.' },
  emberWake: { name: 'Ember Wake', tag: 'EW', desc: 'Dashing through enemies cuts them for 20. Dash charges refill 0.25s slower.' },
  openGuard: { name: 'Open Guard', tag: 'OG', desc: 'Parry window 60% wider. Parries no longer refund shield.' },
  breaker: { name: 'Breaker', tag: 'BR', desc: 'Finishers (the lunge and the heavy slam) hit 60% harder and launch. Other lights deal 20% less.' },
  aftershock: { name: 'Aftershock', tag: 'AS', desc: 'Plunges send a ground ring outward. The impact itself deals 20% less.' },
  glass: { name: 'Glass Edge', tag: 'GE', desc: 'Deal 35% more damage. Take 25% more.' },
  bloodline: { name: 'Bloodline', tag: 'BL', desc: 'Every kill heals 2. Your shield starts recharging 1s later.' },
};
const UPGRADE_FIRST = 2, UPGRADE_EVERY = 3;

const WAVE_MODIFIERS = {
  elite: { name: 'ELITES', desc: 'SOME ENEMIES ARE GILDED: TOUGHER AND WORTH DOUBLE' },
  glints: { name: 'GLINTS ONLY', desc: 'THE THREAT RING SHOWS ONLY GLINTS' },
  lowgrav: { name: 'LOW GRAVITY', desc: 'EVERYONE FLOATS' },
  blackout: { name: 'BLACKOUT', desc: 'THE STREET LIGHTS ARE OUT' },
};

function upgradeOffer(n = 3) {
  const who = Game.player ? Game.player.charId : 'ronin';
  const free = Object.keys(UPGRADES).filter((id) => !Game.upgrades.has(id) && (!UPGRADES[id].only || UPGRADES[id].only === who));
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

// Aftershock and the heavy slam send out a SlamRing (projectiles.js): the 2D ground waves as one expanding ring.
