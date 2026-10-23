'use strict';
// Character utilities, bound to F: one ability per character on a cooldown. CHARACTERS names which one
// each character uses; a character without one simply has nothing on F. Ported from the 2D utilities.js.

const UTILITIES = {};
function registerUtility(def) { UTILITIES[def.id] = def; }
function getUtility(id) { return UTILITIES[id] || null; }
// aegisplayer.js adds AEGIS-07, whose F switches its weapon mode instead of a cooldown.
const CHARACTERS = { ronin: { id: 'ronin', name: 'RONIN', utility: 'overload', make: (pos) => new Player(pos) } };
// the player for a run, as the character picked on the title screen
function makePlayer(id, pos) { const C = CHARACTERS[id] || CHARACTERS.ronin; return C.make(pos); }

// RONIN: vents the core in a red shock sphere. Everything close is interrupted and thrown back, and hostile
// bolts are burned out of the air. Bosses shrug it off and pulse grenades are untouched, so it never
// replaces the answers a fight asks for; it buys space when you are swarmed.
registerUtility({
  id: 'overload',
  name: 'Overload',
  hud: 'OVERLOAD',
  desc: 'A red shock sphere: interrupts and knocks back everything close, burns bolts out of the air.',
  cooldown: 10,
  radius: 7.3,

  use(p) {
    const R = this.radius, c = p.chest();
    p.utilT = 0.24;
    p.iframes = Math.max(p.iframes, 0.15);
    if (!p.onGround && p.vel.y < 3.6) p.vel.y = 5.5;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.dying) continue;
      const ec = e.center();
      if (dist3(ec, c) > R + Math.max(e.r, e.h / 2)) continue;
      const dx = ec.x - c.x, dz = ec.z - c.z, hl = Math.hypot(dx, dz) || 1, ux = dx / hl, uz = dz / hl;
      FX.bolt(c, ec, 0.2, { jag: 0.55 });
      if (e.isBoss) {
        FX.sparks(ec, 8, { x: -ux, y: 0, z: -uz }, 1.2, 5.5, 16.4, { c0: '#ffffff', c1: '#7af0ff', c2: '#145e6a' });
        continue;
      }
      const kv = { x: ux * 20, y: 14.5, z: uz * 20 };
      // shields and armour stop the damage, but not the interrupt
      if (e.shielded && e.shielded({ cause: 'overload', kv })) e.stagger(1.0, kv);
      else {
        hurtEnemy(e, 10, { kv, dir: { x: ux, y: 0.5, z: uz }, cause: 'overload', stagger: 1.0, hitstop: 0 });
        if (e.heavy && !e.dead) e.stagger(0.8);
      }
      FX.elec(ec, 1.1, 3);
    }
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || b.rebound || dist3(b.pos, c) > R + 0.9) continue;
      b.dead = true;
      FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7);
      FX.bolt(c, b.pos, 0.12, { jag: 0.36 });
    }
    FX.ring({ x: p.pos.x, y: p.pos.y + 0.06, z: p.pos.z }, 0.5, R, 0.32, { c: '#ff2a48' });
    FX.ring(c, 0.5, R, 0.32, { c: '#ff2a48', flat: false });
    FX.ring(c, 0.3, R * 0.6, 0.24, { c: '#ffd0d8', flat: false });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + rand(-0.2, 0.2), up = rand(-0.35, 0.5), L = R * 0.85;
      FX.bolt(c, { x: c.x + Math.cos(a) * L, y: c.y + up * L, z: c.z + Math.sin(a) * L }, 0.16, { jag: 0.45 });
    }
    FX.sparks(c, 30, null, TAU, 7.3, 25.5);
    FX.light(c, '#ff2a48', 6, R * 2, 0.35);
    FX.flash('#ff3048', 0.2);
    Sound.play('overload');
    Game.shake(0.35);
    Game.hitstop(0.05);
  },
});
