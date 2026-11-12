'use strict';
// REAP-R as the player: the Rift's harvester on the shared controller (its model and poses are reaper.js, its
// effects reaperviews.js, its tears rift.js). Everything under Movement still works, on a 2.7 m body. It has
// RONIN's parry stance and shield, and its own everything else:
//   Warp (dash): no dash at all. It folds into a tear and is at once up to 7.5 m along the way it was moving,
//     through whatever stood between (enemies, a car, a pillar; not the arena's walls), untouchable for a moment.
//     Attack right after it for a drawn cut out of the tear. Two charges, as a dash.
//   Scythe (tap attack): two wide sweeps, then a reaping cut most of the way round. Its swings send bolts back.
//   Whirlwind (hold attack): the scythe drawn back while the jet builds (its reach shown on the ground), then
//     let go into a spin that hits everything round it several times, dragging it in, and throws it out with the
//     last. A tap of a hold is one quick turn; a full charge is the big one. A hit breaks the charge.
//   Scythe throw (F): thrown spinning down the aim through everything on the line, into a tear at the end of
//     its flight, out of another off to one side and back to the hand, cutting what's between. Unarmed until
//     it's back.
//   Execution (the counter after a parry): the space in front of you gives, everything in the cone is hauled to
//     your feet, and the charged cut goes through all of it.
//   Rend (passive): everything the scythe cuts has its soul hanging out of it for a few seconds: it takes more
//     from every blow, and killed like that it gives you back some shield.
//   Dread (passive): enemies near you move slower and wind up longer.
//   Harvest (ultimate): a great tear opens where you aim and drags in everything round it; then you step out of
//     it and reap the lot.
// The numbers are first guesses at keeping it level with the others: it trades toughness for reach and tricks.

const REAPER_PMOVE = Object.assign({}, MOVE, {
  R: 0.5, H: 2.7, CROUCH_H: 1.85, SLIDE_H: 1.45, CHEST: 1.95,
  RUN: 9.2, SPRINT: 13.3,
});
// The warp: how far, how long the body takes to unfold, its protection, and Ember Wake's cut along the way
const RP_WARP = { DIST: 7.5, FADE: 0.14, IFRAMES: 0.32, WAKE: 20 };
// Its swings, in the terms of player.js's SWINGS: the sweep, and the reaping cut that ends a string
const RP_SW = {
  L: { dur: 0.3, sweep: 0.1, act0: 0.02, act1: 0.15, span: 3.4, r: 4.9, band: 1.5, dmg: 15, knock: 13, hitstop: 0.04, shake: 0.1, fade: 0.16, tilt: 0.18 },
  L3: { dur: 0.48, sweep: 0.15, act0: 0.05, act1: 0.24, span: 5.6, r: 5.4, band: 1.7, dmg: 34, knock: 30, hitstop: 0.08, shake: 0.3, fade: 0.24, lunge: 13, tilt: 0.1 },
};
// The whirlwind: seconds to a full charge and how long it holds there before it goes by itself; reach, length,
// damage a hit and the last hit's damage, each from a tap to a full charge; seconds between hits; how hard it
// drags things in
const RP_WHIRL = { CHARGE: 1.1, AUTO: 0.5, R0: 4.6, R1: 7.2, DUR0: 0.4, DUR1: 1.25, TICK: 0.17, DMG0: 9, DMG1: 11, END0: 16, END1: 34, PULL: 9 };
// The throw: cooldown, speed and reach out, its radius, damage out and back, the seconds between its tears, the
// speed home, and how far to the side it comes back from
const RP_THROW = { CD: 6, SPEED: 36, RANGE: 22, R: 1.7, DMG: 28, BACK_DMG: 22, GAP: 0.3, BACK: 42, SIDE: 5 };
// rend: seconds a cut soul hangs out, what a blow on it is multiplied by, the shield a kill gives back
const RP_REND = { T: 4, MUL: 1.2, SHIELD: 8 };
// dread: its reach, and what it does to a move speed and a wind-up
const RP_DREAD = { R: 8, SLOW: 0.85, WIND: 1.25 };
// the execution's stretch: how far it reaches (from a tap to a full charge), its half-angle, where they land
const RP_EXEC = { LEN0: 8, LEN1: 14, HALF: 0.6, AT: 3.2 };
// The Harvest: how far off it can open, its reach, how long and how fast it drags, its bite while it does, and
// the reap at the end (reach, damage, the share a boss takes, knock and launch)
const RP_HARVEST = { RANGE: 22, R: 9.5, PULL: 2.2, SPEED: 11, TICK: 0.3, DMG: 6, CUT_R: 8.5, CUT: 150, BOSS: 0.35, KNOCK: 26, LAUNCH: 24 };
const RP_ELEC = { outer: '#a050ff', core: '#ffffff' };

CHARACTERS.reaper = { id: 'reaper', name: 'REAP-R', utility: 'reaperThrow', make: (pos) => new ReaperPlayer(pos) };

registerUtility({
  id: 'reaperThrow',
  name: 'Scythe throw',
  hud: 'THROW',
  desc: 'Throw the scythe down the aim; it goes into a tear, comes out of another and flies back to your hand.',
  cooldown: RP_THROW.CD,
  canUse(p) { return !p.scytheOut && !p.whirl && !p.sheathe && !p.iaido && !p.plunge && !(p.warpT > 0); },
  use(p) { p.throwScythe(); },
});

// REAP-R's scythe in the air, thrown by you: out along the aim through everything, into a tear, out of another
// off to one side, and home.
class ReapThrow {
  constructor(owner, from, dir) {
    this.kind = 'scythe'; this.owner = owner; this.hostile = false;
    this.pos = { x: from.x, y: from.y, z: from.z }; this.dir = { x: dir.x, y: dir.y, z: dir.z };
    this.phase = 'out'; this.t = 0; this.dist = 0; this.spin = 0; this.dead = false; this.hidden = false; this.hit = new Set(); this.back = null; this.life = 0;
  }
  sweep(dmg) {
    const c = this.pos, d = this.dir, O = this.owner;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || this.hit.has(e)) continue;
      const ec = e.center();
      if (Math.hypot(ec.x - c.x, ec.z - c.z) > RP_THROW.R + e.r || Math.abs(ec.y - c.y) > 1.5 + e.h / 2) continue;
      this.hit.add(e);
      hurtEnemy(e, dmg, { kv: { x: d.x * 14, y: 8, z: d.z * 14 }, dir: { x: d.x, y: 0.2, z: d.z }, heavy: true, cause: 'throw', stagger: 0.45, hitstop: 0.03, shake: 0.12 });
      O.rend(e);
      FX.sparks(ec, 10, d, 1.2, 5, 18, REAP_SPARK);
    }
    for (const pr of Game.props) {
      if (pr.dead || this.hit.has(pr) || !pr.center || dist3(pr.center(), c) > RP_THROW.R + (pr.r || 0.5)) continue;
      this.hit.add(pr);
      pr.hit(dmg, { kv: { x: d.x * 16, y: 10, z: d.z * 16 }, heavy: true });
    }
    Props.slash((q) => distXZ(q.pos, c) < RP_THROW.R + q.r && q.pos.y < c.y + 1 && q.pos.y + q.h > c.y - 1, c.y, { x: d.x, z: d.z });
  }
  update(dt) {
    const O = this.owner;
    this.t += dt; this.life += dt; this.spin += dt * 26;
    if (!O || O.dead || O.scytheOut !== this || Game.player !== O) { this.dead = true; return; }
    if (this.phase === 'out') {
      const step = RP_THROW.SPEED * dt;
      let wall = World.raycast(this.pos, this.dir, step + 0.7, 0.3);
      // thrown down at the street it doesn't bury itself: it skims on along it
      if (wall && wall.ny > 0.7 && Math.hypot(this.dir.x, this.dir.z) > 0.2) { const u = flat(this.dir.x, this.dir.z); this.dir = { x: u.x, y: 0, z: u.z }; this.pos.y = Math.max(this.pos.y, wall.y + 0.9); wall = World.raycast(this.pos, this.dir, step + 0.7, 0.3); }
      this.pos.x += this.dir.x * step; this.pos.y += this.dir.y * step; this.pos.z += this.dir.z * step; this.dist += step;
      if (Math.random() < 0.7) FX.sparks(this.pos, 1, null, TAU, 1, 5, Object.assign({ g: 0, life: 0.3 }, REAP_SPARK));
      this.sweep(RP_THROW.DMG);
      if (wall || this.dist >= RP_THROW.RANGE) {
        this.phase = 'gap'; this.t = 0; this.hidden = true; this.hit.clear();
        RiftViews.tear(this.pos, { h: 3.2, w: 1.2, dur: 0.35 });
        Rift.burst(this.pos);
        Sound.play('warp', { pm: 1.4 }, this.pos);
      }
      return;
    }
    if (this.phase === 'gap') {
      if (!this.back) {
        // the way back opens off to one side of where it left, so it cuts a second line home
        const s = chance(0.5) ? 1 : -1, sx = -this.dir.z * s, sz = this.dir.x * s;
        let q = { x: this.pos.x + sx * RP_THROW.SIDE, y: this.pos.y, z: this.pos.z + sz * RP_THROW.SIDE };
        if (World.pointSolid(q.x, q.y, q.z, 0.4)) q = { x: this.pos.x - sx * RP_THROW.SIDE, y: this.pos.y, z: this.pos.z - sz * RP_THROW.SIDE };
        if (World.pointSolid(q.x, q.y, q.z, 0.4)) q = { x: this.pos.x - this.dir.x, y: this.pos.y, z: this.pos.z - this.dir.z };
        this.back = q;
        RiftViews.tear(q, { h: 3.2, w: 1.2, dur: RP_THROW.GAP + 0.35 });
        Sound.play('tearOpen', {}, q);
      }
      if (this.t < RP_THROW.GAP) return;
      this.phase = 'back'; this.t = 0; this.hidden = false;
      this.pos.x = this.back.x; this.pos.y = this.back.y; this.pos.z = this.back.z;
      Rift.burst(this.pos);
      return;
    }
    const h = O.local(0.5, 1.9, 0.4), dx = h.x - this.pos.x, dy = h.y - this.pos.y, dz = h.z - this.pos.z, l = Math.hypot(dx, dy, dz) || 1, step = RP_THROW.BACK * dt;
    this.dir = { x: dx / l, y: dy / l, z: dz / l };
    if (l <= step + 1.2 || this.life > 5) { this.dead = true; O.catchScythe(); return; }
    this.pos.x += this.dir.x * step; this.pos.y += this.dir.y * step; this.pos.z += this.dir.z * step;
    if (Math.random() < 0.7) FX.sparks(this.pos, 1, null, TAU, 1, 5, Object.assign({ g: 0, life: 0.3 }, REAP_SPARK));
    this.sweep(RP_THROW.BACK_DMG);
  }
}

// The Harvest: a great tear standing over a spot. It drags in everything round it, biting as it does; then
// REAP-R steps out of it and reaps the lot.
class Harvest {
  constructor(owner, pos) {
    this.kind = 'harvest'; this.owner = owner; this.pos = { x: pos.x, y: pos.y, z: pos.z };
    this.t = 0; this.dur = RP_HARVEST.PULL; this.R = RP_HARVEST.R; this.tick = 0.1; this.done = false; this.dead = false;
    const c = this.center();
    RiftViews.tear(c, { h: 7, w: 2.8, dur: this.dur + 0.45 });
    FX.ring({ x: pos.x, y: pos.y + 0.06, z: pos.z }, this.R, 0.6, 0.5, { c: RIFT_COL.main });
    FX.flash('#a050ff', 0.25);
    Sound.play('reapHarvest', {}, c);
    Game.shake(0.3);
  }
  center() { return { x: this.pos.x, y: this.pos.y + 3.2, z: this.pos.z }; }
  inReach(e, R) { return distXZ(e.pos, this.pos) < R + e.r && e.pos.y < this.pos.y + 7 && e.pos.y + e.h > this.pos.y - 2; }
  update(dt) {
    const O = this.owner, c = this.center();
    this.t += dt;
    if (!O || O.dead) { this.dead = true; return; }
    if (this.t < this.dur) {
      const bite = (this.tick -= dt) <= 0;
      if (bite) this.tick = RP_HARVEST.TICK;
      for (let i = 0; i < 3; i++) { const a = rand(0, TAU), r = rand(2, this.R); FX.sparks({ x: this.pos.x + Math.cos(a) * r, y: this.pos.y + rand(0.2, 4), z: this.pos.z + Math.sin(a) * r }, 1, { x: -Math.cos(a), y: 0.15, z: -Math.sin(a) }, 0.2, r * 2, r * 2.6, Object.assign({ g: 0, life: 0.4 }, REAP_SPARK)); }
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || e.dying || !this.inReach(e, this.R * 1.2)) continue;
        if (!e.isBoss) {
          // hauled in: it can't do anything but go
          const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1, v = RP_HARVEST.SPEED * Math.min(1, d / 2.5);
          e.stun = Math.max(e.stun || 0, 0.2);
          e.vel.x = (dx / d) * v; e.vel.z = (dz / d) * v;
          if (e.flying) e.vel.y = clamp((this.pos.y + 1.6 - e.pos.y) * 4, -8, 8);
        }
        if (bite) { hurtEnemy(e, RP_HARVEST.DMG, { cause: 'harvest', noKnock: true, noStagger: true, dir: { x: 0, y: 1, z: 0 } }); O.rend(e); }
      }
      return;
    }
    if (!this.done) {
      this.done = true;
      // it steps out of the tear into the middle of them, if there's room to stand there
      const q = { x: this.pos.x, y: this.pos.y + 0.02, z: this.pos.z };
      if (!O.ult && World.boxFree(q.x, q.y, q.z, O.r, O.h)) {
        RiftViews.tear(O.center(), { h: 3.4, w: 1.2, dur: 0.3 });
        if (O.tether) O.releaseTether();
        O.cancelActions(); O.attack = null; O.attackQueued = null; O.atkPend = null; O.plunge = null; O.iaido = null; O.mantle = null; O.vault = null;
        if (O.sheathe) O.cancelSheathe();
        Controller.dropCling(O);
        Rift.shift(O, q);
        O.vel.x = O.vel.y = O.vel.z = 0;
      }
      O.harvestT = 0.45; O.iframes = Math.max(O.iframes, 0.7);
      const at = O.chest(), g = { x: this.pos.x, y: this.pos.y + 0.06, z: this.pos.z };
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || !this.inReach(e, RP_HARVEST.CUT_R)) continue;
        const u = flat(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
        O.rend(e);
        hurtEnemy(e, RP_HARVEST.CUT * (e.isBoss ? RP_HARVEST.BOSS : 1), { kv: { x: u.x * RP_HARVEST.KNOCK, y: RP_HARVEST.LAUNCH, z: u.z * RP_HARVEST.KNOCK }, dir: { x: u.x, y: 0.6, z: u.z }, heavy: true, cause: 'harvest', stagger: 1, hitstop: 0, crit: true, guardBreak: true });
        FX.sparks(e.center(), 16, { x: u.x, y: 0.6, z: u.z }, 1.2, 8, 26, REAP_SPARK);
      }
      for (const pr of Game.props) if (!pr.dead && pr.center && distXZ(pr.pos, this.pos) < RP_HARVEST.CUT_R) pr.hit(60, { heavy: true, kv: { x: (pr.pos.x - this.pos.x) * 3, y: 16, z: (pr.pos.z - this.pos.z) * 3 } });
      Props.slash((q2) => distXZ(q2.pos, this.pos) < RP_HARVEST.CUT_R, this.pos.y + 1.5, O.fwd());
      FX.swoosh({ x: at.x, y: at.y, z: at.z, oy: 0, yaw: O.yaw, tilt: 0.08, r: RP_HARVEST.CUT_R, span: TAU - 0.05, dir: 1, sweep: 0.22, dur: 0.5, thick: 0.9, pal: 'void', trail: 1, bolts: 4 });
      FX.ring(g, 0.5, RP_HARVEST.CUT_R * 1.3, 0.45, { c: '#e0c0ff' });
      FX.ring(at, 0.4, RP_HARVEST.CUT_R, 0.4, { c: RIFT_COL.main, flat: false });
      FX.sparks(at, 60, null, TAU, 8, 30, REAP_SPARK);
      FX.dust(g, 20, { c: '#2a2034', smax: 10, rise: 1.2 });
      FX.decal('crack', g, { len: 4 });
      FX.light(at, '#c080ff', 12, 24, 0.5);
      FX.flash('#d0a8ff', 0.5);
      Sound.play('iaido', { power: 1, empowered: true }); Sound.play('reapSwing', { heavy: true }); Sound.play('slam');
      FPFX.kick('counter', { scale: 1.3 });
      Game.shake(0.8); Game.hitstop(0.1);
      Game.slowmo(0.25, 0.5, true);
    }
    if (this.t > this.dur + 0.4) { this.dead = true; if (O.harvest === this) O.harvest = null; }
  }
}

class ReaperPlayer extends Player {
  constructor(pos) {
    super(pos, REAPER_PMOVE);
    this.charId = 'reaper'; this.t = 0;
    this.warpT = 0; this.whirl = null; this.scytheOut = null; this.throwT = 0; this.throwDir = null; this.harvestT = 0; this.harvest = null;
  }
  // a cloak instead of a scarf (it's part of the model)
  initScarf() { this.scarf = null; }
  updateScarf() {}
  timerKeys() { return ReaperPlayer.TIMERS; }

  // ---------- where its parts are ----------
  fwd() { return { x: fwdX(this.yaw), z: fwdZ(this.yaw) }; }
  right() { return { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) }; }
  // a point in its body frame: x to its right, y up from its feet (scaled down while crouched), f forward
  local(x, y, f) {
    const F = this.fwd(), R = this.right(), k = Math.min(1, this.h / this.M.H);
    return { x: this.pos.x + R.x * x + F.x * f, y: this.pos.y + y * k, z: this.pos.z + R.z * x + F.z * f };
  }
  // a point in a bone's frame on the posed model, while the model is drawn as this body; null otherwise
  boneAt(name, x, y, z) {
    const R = typeof Render !== 'undefined' && Render.rigs && Render.rigs.reaper;
    if (!R || Render.playerRig !== R || Game.player !== this || !R.mesh.visible) return null;
    const v = this._bv || (this._bv = new THREE.Vector3()), S = R.scale || 1;
    R.bones[name].updateWorldMatrix(true, false);
    v.set(x * S, y * S, z * S).applyMatrix4(R.bones[name].matrixWorld);
    if (Math.abs(v.x - this.pos.x) > 6 || Math.abs(v.z - this.pos.z) > 6 || Math.abs(v.y - this.pos.y) > 6) return null;
    return { x: v.x, y: v.y, z: v.z };
  }
  head() { return this.boneAt('head', 0, 0.14, -0.1) || this.local(0, 2.5, 0.15); }
  // the tether leaves the free (left) hand
  hand() {
    const c = this.chest(), Y = this.yaw;
    return { x: c.x - Math.cos(Y) * 0.5 + fwdX(Y) * 0.35, y: c.y - 0.1, z: c.z + Math.sin(Y) * 0.5 + fwdZ(Y) * 0.35 };
  }
  // a point u of the way along the blade's edge, from the posed model when there is one
  bladeAt(u = 0.6) { return (this.scytheOut ? null : this.boneAt('weapon', 0, lerp(SCYTHE.HEAD, SCYTHE.TIP[0], u), lerp(-0.2, SCYTHE.TIP[1], u))) || this.local(0.4, 2.4, 0.9); }
  jetPos() { return (this.scytheOut ? null : this.boneAt('weapon', 0, SCYTHE.HEAD, 0.7)) || this.local(0.5, 2.6, -0.3); }

  // ---------- update ----------
  update(dt) {
    this.t += dt;
    // the scythe went with whatever cleared the air (a portal, the practice panel)
    if (this.scytheOut && (this.scytheOut.dead || !Game.projectiles.includes(this.scytheOut))) this.scytheOut = null;
    if (this.harvest && this.harvest.dead) this.harvest = null;
    super.update(dt);
    if (!this.dead) this.dread();
  }
  updateCombat(dt, I) {
    super.updateCombat(dt, I);
    this.updateWhirl(dt);
  }
  moveMods(dt, I) {
    super.moveMods(dt, I);
    const W = this.whirl;
    if (W) {
      this.speedMul *= W.phase === 'charge' ? 0.5 : 0.8;
      this.canSlide = false; this.canCling = false;
      if (W.phase === 'spin' && !this.onGround) this.gravK *= 0.45;
    }
    if (this.harvestT > 0) this.speedMul *= 0.2;
  }
  canMantle(reeled) { return super.canMantle(reeled) && !this.whirl; }
  chargeBlocked() { return super.chargeBlocked() || !!this.whirl; }
  // the whirlwind turns the body with the blade
  updateFacing(dt) {
    const W = this.whirl;
    if (W && W.phase === 'spin') { this.yaw += 17 * dt; this.aimHold = PC.FACE_AIM; return; }
    if (W && !Camera.fp) { this.yaw += angDiff(this.yaw, this.aimYaw) * Math.min(1, dt * 12); this.aimHold = PC.FACE_AIM; return; }
    super.updateFacing(dt);
  }
  updateGhosts(dt) {
    const W = this.whirl;
    if (this.bulletT > 0 || (W && W.phase === 'spin') || (this.plunge && this.plunge.t > 0.05)) {
      this.ghostT -= dt;
      if (this.ghostT <= 0) { this.ghostT = 0.04; this.makeGhost(RIFT_COL.main, 0.22, 0.45); }
    }
  }
  moveEvent(ev, d) {
    if (ev === 'djump') {
      // no flip: the jet kicks it up again
      const p = this.pos;
      Sound.play('djump');
      FX.ring({ x: p.x, y: p.y + 0.05, z: p.z }, 0.3, 1.8, 0.25, { c: RIFT_COL.main });
      FX.sparks({ x: p.x, y: p.y + 0.1, z: p.z }, 12, { x: 0, y: -1, z: 0 }, 1.1, 5, 14, REAP_SPARK);
      FX.light(p, RIFT_COL.main, 3, 5, 0.2);
      FPFX.kick('jump');
      return;
    }
    if (ev === 'land') this.spinT = 0;
    super.moveEvent(ev, d);
    if (ev === 'bulletjump') this.spinT = 0;
  }

  // ---------- the warp ----------
  // Where a warp along (ux, uz) comes out: the furthest spot up to DIST away where the body fits, through
  // whatever is between, but not through the arena's own walls. On the ground it comes out on the ground there
  // when that's within a step or so; in the air, level with where it left.
  warpSpot(ux, uz) {
    const p = this.pos, B = Arena.bounds(), m = this.r + 0.15;
    let max = RP_WARP.DIST;
    for (const y of [0.4, this.h * 0.6]) {
      let o = 0;
      // walk the line: an arena wall stops it, anything else it passes
      for (let n = 0; n < 6 && o < max; n++) {
        const h = World.raycast({ x: p.x + ux * o, y: p.y + y, z: p.z + uz * o }, { x: ux, y: 0, z: uz }, max - o, 0.05);
        if (!h) break;
        if (h.box && (h.box.kind === 'bound' || h.box.kind === 'wall')) { max = Math.max(0, o + h.t - this.r - 0.1); break; }
        o += h.t + 0.3;
      }
    }
    for (let s = max; s >= 1; s -= 0.5) {
      const x = p.x + ux * s, z = p.z + uz * s;
      if (x < B.minX + m || x > B.maxX - m || z < B.minZ + m || z > B.maxZ - m) continue;
      const g = World.groundAt(x, z, p.y + 1.3);
      const ys = this.onGround && g > -Infinity && Math.abs(g - p.y) <= 1.3 ? [g, p.y] : [p.y];
      for (const y of ys) if (World.boxFree(x, y + 0.02, z, this.r, this.h)) return { x, y: y + 0.02, z };
    }
    return null;
  }
  tryDash(I) {
    if (this.dashCharges <= 0 || this.warpT > 0 || this.iaido || this.harvestT > 0) return;
    let dx = I.mx, dz = I.mz;
    if (Math.hypot(dx, dz) < 0.1) { dx = fwdX(Camera.yaw); dz = fwdZ(Camera.yaw); }
    const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, M = this.M;
    if (this.sheathe) this.cancelSheathe();
    if (this.tether) this.releaseTether();
    this.cancelWhirl();
    this.attack = null; this.attackQueued = null; this.postPose = 0; this.landLag = 0; this.plunge = null; this.kickAnim = null; this.mantle = null;
    if (this.sliding || this.crouching) { this.sliding = false; this.crouching = false; if (!Controller.setHeight(this, M.H)) Controller.setHeight(this, M.SLIDE_H); }
    Controller.dropCling(this); Controller.endSkid(this, false);
    // a charge, as a dash spends one
    if (this.dashCharges === M.DASH_CHARGES) this.dashRecharge = 0;
    this.dashCharges--;
    const from = this.center(), a = { x: this.pos.x, y: this.pos.y, z: this.pos.z }, q = this.warpSpot(ux, uz);
    RiftViews.tear(from, { h: 3.4, w: 1.2, dur: 0.3 });
    Rift.burst(from, 0.7);
    if (q) Rift.shift(this, q);
    const to = this.center();
    RiftViews.tear(to, { h: 3.4, w: 1.2, dur: 0.32 });
    Rift.burst(to, 0.9);
    // Ember Wake: the warp cuts what it passed through
    if (q && Game.has('emberWake')) {
      for (const e of Game.enemies) {
        if (e.dead || e.spawning || segDistXZ(e.pos.x, e.pos.z, a.x, a.z, q.x, q.z) > e.r + 1 || Math.abs(e.pos.y - a.y) > 2.5) continue;
        hurtEnemy(e, RP_WARP.WAKE, { kv: { x: ux * 7.3, y: 5.5, z: uz * 7.3 }, dir: { x: ux, y: 0.2, z: uz }, cause: 'dash', stagger: 0.3, hitstop: 0.02 });
        this.rend(e);
      }
    }
    // it comes out moving the way it went
    const v = Math.max(M.RUN, Controller.hspeed(this));
    this.vel.x = ux * v; this.vel.z = uz * v; this.vel.y = Math.max(this.vel.y, 0);
    this.warpT = RP_WARP.FADE; this.dashEndT = M.DASH_ATTACK_WINDOW + RP_WARP.FADE;
    this.iframes = Math.max(this.iframes, RP_WARP.IFRAMES);
    this.yaw = yawOf(ux, uz);
    Sound.play('warp');
    Game.shake(0.06);
    FPFX.kick('dash', { dir: { x: ux, z: uz } });
  }
  // out of the tear into a drawn cut, in its own light
  startIaido(cfg, power = 1) {
    super.startIaido(cfg, power);
    const I = this.iaido;
    if (I && !cfg.empowered) { FX.slashLine(I.s, { x: I.s.x + I.dir.x * I.len, y: I.s.y + I.dir.y * I.len, z: I.s.z + I.dir.z * I.len }, { w: cfg.lineW * 1.3, dur: 0.3, pal: 'void' }); Sound.play('reapSwing', { heavy: !!cfg.heavy }); }
  }
  iaidoMark(e) { super.iaidoMark(e); this.rend(e); }

  // ---------- the scythe ----------
  onAttackPressed() {
    if (this.scytheOut) { Sound.play('denied'); this.utilFlash = 0.35; return; }
    if (this.whirl || this.harvestT > 0) return;
    super.onAttackPressed();
  }
  resolveAttack(kind, dash) {
    if (this.sheathe || this.iaido || this.ultHold > 0 || this.plunge || this.dead || this.scytheOut) return;
    if (dash || this.dashT > 0 || this.dashEndT > 0) { this.dashAttack(kind); return; }
    const slide = this.sliding && this.onGround && !this.stringLive();
    if (kind === 'H' && !slide) {
      // a hold is the whirlwind; it waits out a reaping cut already under way
      if (this.attack && this.committed()) { this.attackQueued = 'H'; return; }
      this.startWhirl();
      return;
    }
    if (this.attack || this.attackCD > 0) { this.attackQueued = kind; return; }
    if (slide) { this.startGroundCut(kind); return; }
    this.startString(kind, false);
  }
  // sweep, sweep, then the reaping cut; a held attack anywhere in it is the whirlwind
  startString(kind, chained) {
    if (kind === 'H') { this.attack = null; this.attackQueued = null; this.startWhirl(); return; }
    const cont = (chained || this.comboTimer > 0) && this.strN > 0 && this.strN < 3;
    const n = cont ? this.strN + 1 : 1;
    this.startSwing(n >= 3 ? 'L3' : 'L', cont);
    this.strN = n; this.strLights = n;
    if (this.attack.finisher) { this.strN = 0; this.strLights = 0; }
  }
  stringLive() { return this.comboTimer > 0 && this.strN > 0 && this.strN < 3; }
  startSwing(type, cont) {
    const d = RP_SW[type] || RP_SW.L;
    const target = this.assistTarget(d.r);
    const yaw = target ? yawOf(target.pos.x - this.pos.x, target.pos.z - this.pos.z) : this.aimYaw;
    this.yaw = yaw;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    const dir = cont ? -this.lastDir : 1;
    this.lastDir = dir;
    const pa = this.swingPitch(target);
    this.attack = Object.assign({ type, heavy: false, finisher: type === 'L3', stage: type === 'L3' ? 3 : 1, wind: 0, t: 0, yaw, dir, pa, pitch: Math.sin(pa), target, hit: new Set(), swept: false }, d, { tilt: -d.tilt * dir });
    this.attackQueued = null; this.postPose = 0;
    this.beginSweep(this.attack);
  }
  // the blade starts moving: a violet arc behind it, the jet driving it round
  beginSweep(a) {
    a.swept = true;
    const big = a.finisher, fx = fwdX(a.yaw), fz = fwdZ(a.yaw), c = this.chest();
    FX.swoosh({ follow: this, oy: this.chestH(), yaw: a.yaw, tilt: a.tilt, pitch: a.pa || 0, r: a.r * 0.94, span: a.span, dir: a.dir, sweep: a.sweep, dur: a.sweep + a.fade, thick: big ? 0.6 : 0.42, pal: 'void', trail: big ? 1 : 0.9, bolts: big ? 3 : 1 });
    Sound.play('reapSwing', { heavy: big });
    FPFX.kick(big ? 'finisher' : 'attack', { side: a.dir || 1 });
    FX.sparks(this.jetPos(), big ? 10 : 5, null, TAU, 3, 10, REAP_SPARK);
    // with an assisted target, close the gap to it rather than overshoot
    const gap = a.target ? distXZ(a.target.pos, this.pos) - a.target.r - this.r - a.r * 0.5 : Infinity;
    const close = gap === Infinity ? Infinity : Math.sqrt(300 * Math.max(0, gap));
    if (a.lunge) {
      const L = Math.min(a.lunge, close);
      this.vel.x = this.vel.x * 0.3 + fx * L; this.vel.z = this.vel.z * 0.3 + fz * L;
      if (!this.onGround) this.vel.y = Math.max(this.vel.y, a.pitch * a.lunge * 0.6);
      Game.shake(0.08);
    } else if (close < Infinity && close > 3.6) {
      const L = Math.min(12, close);
      this.vel.x = fx * L; this.vel.z = fz * L;
    } else if (this.onGround) { this.vel.x += fx * 3; this.vel.z += fz * 3; }
    if (!this.onGround && this.vel.y < 0) this.vel.y *= 0.4;
    FX.light({ x: c.x + fx * a.r * 0.6, y: c.y, z: c.z + fz * a.r * 0.6 }, RIFT_COL.main, 3.5, a.r * 1.7, a.sweep + a.fade);
  }
  // each cut leaves its soul hanging out of what it hit
  swingHit(a, e) {
    this.rend(e);
    const c = e.center();
    FX.sparks(c, a.finisher ? 12 : 6, { x: fwdX(a.yaw), y: 0.3, z: fwdZ(a.yaw) }, 1.2, 5, 16, REAP_SPARK);
    if (a.finisher) FX.ring(c, 0.2, 2.2, 0.18, { c: RIFT_COL.main, flat: false });
  }
  startPlunge() { if (this.scytheOut || this.whirl) return; super.startPlunge(); }
  tryStance() {
    if (this.scytheOut) { Sound.play('denied'); this.parryFlash = 0.35; return; }
    this.cancelWhirl();
    super.tryStance();
  }

  // ---------- rend and dread ----------
  rend(e) { if (e && e.isEnemy && !e.dead) e.rent = Game.time + RP_REND.T; }
  // a kill with its soul out gives a little shield back
  onKill(e) {
    if (!(e.rent > Game.time) || this.dead) return;
    const c = e.center(), pc = this.chest();
    FX.slashLine(c, pc, { w: 0.08, dur: 0.3, pal: 'void' });
    FX.sparks(pc, 8, { x: 0, y: 1, z: 0 }, TAU, 2, 7, Object.assign({ g: -2, life: 0.6 }, REAP_SPARK));
    if (this.shieldOffT <= 0) this.shield = Math.min(PC.MAX_SHIELD, this.shield + RP_REND.SHIELD);
  }
  // what's near it is afraid: slower, and slower to strike. Rent souls trail off what they're torn from.
  dread() {
    const until = Game.time + 0.25;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      if (!e.isBoss && dist3(e.pos, this.pos) < RP_DREAD.R) e.dread = until;
      if (e.rent > Game.time && Math.random() < 0.25) FX.sparks({ x: e.pos.x + rand(-0.2, 0.2), y: e.pos.y + e.h * rand(0.5, 1), z: e.pos.z + rand(-0.2, 0.2) }, 1, { x: 0, y: 1, z: 0 }, 0.4, 0.8, 2.4, Object.assign({ g: -2, life: 0.7 }, REAP_SPARK));
    }
  }

  // ---------- the whirlwind ----------
  cancelWhirl() { if (this.whirl) { this.whirl = null; this.stopLoop('whirl'); } }
  startWhirl() {
    if (this.whirl || this.scytheOut) return;
    this.attack = null; this.attackQueued = null; this.postPose = 0;
    if (this.sliding) { this.sliding = false; if (!Controller.setHeight(this, this.M.H)) { this.crouching = true; Controller.setHeight(this, this.M.CROUCH_H); } }
    this.whirl = { phase: 'charge', t: 0, k: 0, full: false };
    this.stopLoop('whirl');
    this.loops.whirl = Sound.loop('charge');
    if (this.loops.whirl) this.loops.whirl.set(0.1);
    Sound.play('heavyDraw');
  }
  updateWhirl(dt) {
    const W = this.whirl;
    if (!W) return;
    W.t += dt;
    if (W.phase === 'charge') {
      W.k = clamp(W.t / RP_WHIRL.CHARGE, 0, 1);
      if (this.loops.whirl) this.loops.whirl.set(0.1 + 0.85 * W.k);
      // the jet builds: light drawn in to the blade
      const j = this.jetPos();
      if (Math.random() < 0.3 + 0.6 * W.k) { const u = coneDir(null, TAU), r = lerp(1.2, 2.4, W.k); FX.sparks({ x: j.x + u.x * r, y: j.y + u.y * r * 0.7, z: j.z + u.z * r }, 1, { x: -u.x, y: -u.y * 0.7, z: -u.z }, 0.05, r * 2.6, r * 3, Object.assign({ g: 0, life: 0.35 }, REAP_SPARK)); }
      if (!W.full && W.k >= 1) {
        W.full = true;
        Sound.play('counterTier', { tier: 3, full: true });
        FX.ring(this.chest(), 0.3, 2.6, 0.25, { c: '#ffffff', flat: false });
        FX.light(j, '#e0c0ff', 5, 8, 0.25);
        FPFX.kick('parry', { scale: 0.5 });
        if (Touch.on()) Touch.buzz(20);
      }
      if (!Input.isDown('attack') || W.t > RP_WHIRL.CHARGE + RP_WHIRL.AUTO) this.releaseWhirl(W);
      return;
    }
    if ((W.sw -= dt) <= 0) {
      W.sw = 0.19;
      FX.swoosh({ follow: this, oy: this.chestH(), yaw: this.yaw, tilt: 0.04, r: W.R * 0.96, span: TAU - 0.05, dir: 1, sweep: 0.18, dur: 0.3, thick: 0.6, pal: 'void', trail: 0.95, bolts: 1 });
      if (this.onGround) FX.dust(this.pos, 2, { c: '#2a2034', smax: 6, rise: 0.6 });
    }
    const last = W.t >= W.dur;
    if ((W.tick -= dt) <= 0 || last) { W.tick = RP_WHIRL.TICK; this.whirlHit(W, last); }
    if (last) {
      this.whirl = null;
      this.attackCD = 0.16; this.comboTimer = 0; this.strN = 0; this.strLights = 0; this.postPose = 0.14;
    }
  }
  releaseWhirl(W) {
    this.stopLoop('whirl');
    const k = W.k;
    W.phase = 'spin'; W.t = 0; W.dur = lerp(RP_WHIRL.DUR0, RP_WHIRL.DUR1, k); W.R = lerp(RP_WHIRL.R0, RP_WHIRL.R1, k); W.tick = 0; W.sw = 0;
    Sound.play('reapWhirl', { dur: W.dur });
    Sound.play('heavySwing');
    FPFX.kick('heavy', { side: 1 });
    Game.shake(0.12 + 0.2 * k);
    if (!this.onGround) this.vel.y = Math.max(this.vel.y, 5);
  }
  // one pass of the blade round you: it drags what it cuts inward and round; the last throws it all out
  whirlHit(W, last) {
    const p = this.pos, c = this.chest(), R = W.R, k = W.k;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || distXZ(e.pos, p) > R + e.r || e.pos.y > p.y + this.h + 1.4 || e.pos.y + e.h < p.y - 1.2) continue;
      const u = flat(e.pos.x - p.x, e.pos.z - p.z);
      if (last) hurtEnemy(e, lerp(RP_WHIRL.END0, RP_WHIRL.END1, k), { kv: { x: u.x * 28, y: 16 + 10 * k, z: u.z * 28 }, dir: { x: u.x, y: 0.4, z: u.z }, heavy: true, cause: 'heavy', heavyAtk: true, stagger: 0.7, hitstop: 0.06, shake: 0.3, guardBreak: true });
      else hurtEnemy(e, lerp(RP_WHIRL.DMG0, RP_WHIRL.DMG1, k), { kv: { x: -u.z * 8 - u.x * RP_WHIRL.PULL, y: 3, z: u.x * 8 - u.z * RP_WHIRL.PULL }, dir: { x: -u.z, y: 0.2, z: u.x }, cause: 'whirl', stagger: 0.3, hitstop: 0.012 });
      this.rend(e);
      FX.sparks(e.center(), last ? 12 : 5, { x: -u.z, y: 0.3, z: u.x }, 1.2, 5, 16, REAP_SPARK);
    }
    for (const pr of Game.props) {
      if (pr.dead || !pr.center || distXZ(pr.pos, p) > R + (pr.r || 0.5) || Math.abs(pr.pos.y - p.y) > 3) continue;
      const u = flat(pr.pos.x - p.x, pr.pos.z - p.z);
      pr.hit(last ? 30 : 10, { kv: { x: u.x * 16, y: 9, z: u.z * 16 }, heavy: last });
    }
    Props.slash((q) => distXZ(q.pos, p) < R + q.r && q.pos.y < c.y + 1.2 && q.pos.y + q.h > c.y - 1.2, c.y, this.fwd());
    for (const b of Game.projectiles) {
      if (b.dead || !b.hostile || b.parryOnly || !(b.reflect || b.onSlash) || dist3(b.pos, c) > R) continue;
      if (b.onSlash) b.onSlash(this); else { b.reflect(Camera.aim, 1.5, 22); Sound.play('reflect', {}, b.pos); }
    }
    if (last) {
      const g = { x: p.x, y: p.y + 0.06, z: p.z };
      FX.ring(g, 0.5, R * 1.2, 0.35, { c: RIFT_COL.main });
      FX.light(c, RIFT_COL.main, 5, R * 1.6, 0.25);
      Game.shake(0.15 + 0.25 * k);
    }
  }

  // ---------- F: the throw ----------
  throwScythe() {
    const from = this.local(0.5, 2.1, 0.9), A = this.aim, dir = unit(A.x - from.x, A.y - from.y, A.z - from.z);
    this.cancelWhirl();
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    this.scytheOut = new ReapThrow(this, from, dir);
    Game.projectiles.push(this.scytheOut);
    this.throwT = 0.3; this.throwDir = dir;
    this.yaw = this.aimYaw; this.aimHold = PC.FACE_AIM;
    FX.sparks(from, 14, dir, 0.8, 5, 18, REAP_SPARK);
    FX.ring(from, 0.3, 2.2, 0.2, { c: RIFT_COL.main, flat: false });
    Sound.play('reapThrow');
    FPFX.kick('heavy', { side: 1 });
    Game.shake(0.12);
  }
  catchScythe() {
    this.scytheOut = null;
    const h = this.local(0.5, 1.9, 0.4);
    FX.sparks(h, 10, null, TAU, 3, 10, REAP_SPARK);
    FX.light(h, RIFT_COL.main, 4, 6, 0.2);
    Sound.play('reapCatch');
    FPFX.kick('parry', { scale: 0.3 });
  }

  // ---------- the execution: the counter after a parry ----------
  releaseCounter(s) {
    const pw = s.charge || 0, yaw = this.aimYaw, f = { x: fwdX(yaw), z: fwdZ(yaw) }, len = lerp(RP_EXEC.LEN0, RP_EXEC.LEN1, pw);
    let n = 0;
    // the space in front of you gives: what's in the cone is hauled to your feet
    for (const e of Game.enemies) {
      if (e.dead || e.spawning || e.isBoss) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, along = dx * f.x + dz * f.z;
      if (along < RP_EXEC.AT || along > len || Math.abs(e.pos.y - this.pos.y) > 6 || Math.abs(angDiff(yaw, yawOf(dx, dz))) > RP_EXEC.HALF) continue;
      const side = rand(-1.3, 1.3), d = RP_EXEC.AT + rand(-0.4, 1.4), x = this.pos.x + f.x * d - f.z * side, z = this.pos.z + f.z * d + f.x * side;
      const g = World.groundAt(x, z, this.pos.y + 1.5), y = e.flying ? this.pos.y + 1.4 : g > -Infinity && Math.abs(g - this.pos.y) < 2 ? g + 0.02 : this.pos.y + 0.02;
      if (!World.boxFree(x, y, z, e.r, e.h)) continue;
      const from = e.center();
      Rift.shift(e, { x, y, z });
      e.vel.x = e.vel.y = e.vel.z = 0;
      e.stagger(0.5);
      this.rend(e);
      FX.slashLine(from, e.center(), { w: 0.22, dur: 0.3, pal: 'void' });
      n++;
    }
    if (n) { Sound.play('reapPull'); FX.flash('#a050ff', 0.2); }
    this.startIaido(ReaperPlayer.COUNTER, pw);
  }

  // ---------- Q: the Harvest ----------
  // where it opens: the ground under the crosshair, as far off as it reaches
  harvestSpot() {
    const A = this.aim, p = this.pos, dx = A.x - p.x, dz = A.z - p.z, d = Math.hypot(dx, dz) || 1, k = Math.min(1, RP_HARVEST.RANGE / d);
    const B = Arena.bounds(), x = clamp(p.x + dx * k, B.minX + 2, B.maxX - 2), z = clamp(p.z + dz * k, B.minZ + 2, B.maxZ - 2);
    let y = World.groundAt(x, z, (k < 1 ? p.y : A.y) + 1.5);
    if (y === -Infinity) y = p.y;
    return { x, y, z };
  }
  activateUlt() {
    this.attack = null; this.attackQueued = null; this.atkPend = null;
    this.cancelWhirl();
    if (this.charging) this.cancelCharge();
    this.ultCharge = 0; this.ultReadyPlayed = false;
    this.harvest = new Harvest(this, this.harvestSpot());
    Game.hazards.push(this.harvest);
    Game.stats.ults++;
  }

  // ---------- damage, cutscenes, pauses ----------
  takeHit(h) {
    const W = this.whirl, res = super.takeHit(h);
    // a hit breaks the whirlwind's charge; once it's spinning it carries on
    if (res === 'hit' && W && W.phase === 'charge' && this.whirl === W) this.cancelWhirl();
    return res;
  }
  die() { this.cancelWhirl(); super.die(); }
  cancelActions() { this.cancelWhirl(); }
  onPause() { super.onPause(); this.stopLoop('whirl'); }
  onResume() {
    super.onResume();
    if (this.whirl && this.whirl.phase === 'charge') { this.loops.whirl = Sound.loop('charge'); if (this.loops.whirl) this.loops.whirl.set(0.1 + 0.85 * this.whirl.k); }
  }

  // ---------- the model's lights (ReaperPose reads these) ----------
  tints() {
    const P = this._tint || (this._tint = {}), C = REAPER_COL, fl = ((this.t * 18) | 0) % 2, W = this.whirl, s = this.sheathe;
    const full = (W && W.phase === 'charge' && W.k >= 1) || (s && s.empowered && s.charge >= 1);
    if (this.dead) { for (const t of ['eye', 'core', 'vein', 'blade', 'edge', 'jet']) P[t] = C.off; return P; }
    P.eye = full && fl ? '#ffffff' : C.hot; P.core = C.glow; P.vein = C.glow;
    P.blade = s && s.empowered ? (full && fl ? '#ffffff' : '#ffd070') : full && fl ? '#ffffff' : C.glow;
    P.edge = C.hot; P.jet = C.glow;
    return P;
  }
}
ReaperPlayer.TIMERS = Player.TIMERS.concat(['warpT', 'throwT', 'harvestT']);
// the execution's cut: RONIN's counter, shorter and much wider, through what the stretch brought in
ReaperPlayer.COUNTER = Object.assign({}, IAIDO.counter, { len: 9, path: 3.4, arcR: 9 });
// the camera sits this much further back, so the body doesn't fill the view
ReaperPlayer.prototype.camScale = 1.3;
ReaperPlayer.prototype.fxCol = {
  main: RIFT_COL.main, ring: '#c080ff', hot: '#ecc8ff', ghost: RIFT_COL.main, elec: RP_ELEC, spark: REAP_SPARK, stance: 'sheathe', lower: 'unsheathe',
  tether: { line: '#8a40e8', core: '#f0e0ff', ghost: RIFT_COL.main, light: RIFT_COL.main, elec: RP_ELEC, spark: REAP_SPARK, pal: 'void' },
};
