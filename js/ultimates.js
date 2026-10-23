'use strict';
// Ultimate abilities: kills fill the meter, and R held for a second when it's full sets one off. Each is a
// self-contained definition registered here (start, update each tick, end), chosen by S.gameplay.ultimate.

const ULTIMATES = {};
function registerUltimate(def) { ULTIMATES[def.id] = def; }
function getUltimate(id) { return ULTIMATES[id] || ULTIMATES.sawblade; }

// The Red Sawblade, from the 2D game: for seven seconds you're a spinning electric saw, 1.5 m across. You
// can't be hurt; you roll fast, jump as often as you like, and grind anything you touch. Attack lunges you
// at the crosshair. The tether is free and reaches anything; held on an enemy, the saw latches on and
// grinds, harder every tenth of a second (bosses throw you off after a moment). Speeds are the 2D pixel
// speeds converted at 11 px to the metre.
const SAW = {
  DUR: 7, R: 0.75, H: 1.5, SPEED: 27, ACC_G: 218, ACC_A: 136, FRIC_G: 82, FRIC_A: 20, DOWN: 2.8,
  LUNGE: 60, LUNGE_T: 0.16, LUNGE_CD: 0.26, JUMP: 24, JUMP_CD: 0.16,
  HIT: 11, HIT_CD: 0.09, BURST_R: 8.6, BURST: 40, BOUNCE: 14.5,
};
const SAW_SPARK = { c0: '#ffffff', c1: '#ff8a9a', c2: '#9a1024' };

registerUltimate({
  id: 'sawblade',
  name: 'Red Sawblade',
  desc: 'Become a spinning electric saw. Invulnerable, free tether with unlimited range.',
  duration: SAW.DUR,

  start(p) {
    const u = p.ult, c = p.center();
    u.spin = 0; u.hitCD = new Map(); u.lungeCD = 0; u.jumpCD = 0; u.lungeT = 0; u.ghostT = 0;
    Controller.setHeight(p, SAW.H);
    p.sliding = false; p.crouching = false; p.dashMul = 1.25;
    p.vel.x *= 0.5; p.vel.z *= 0.5; p.vel.y = 12; p.onGround = false;
    p.loops.saw = Sound.loop('saw');
    Sound.play('ultActivate');
    Game.slowmo(0.25, 0.35, true);
    Game.shake(0.6);
    Game.hitstop(0.08);
    FX.flash('#ff2040', 0.5);
    FX.ring(c, 0.4, SAW.BURST_R, 0.45, { c: '#ff2a48', flat: false });
    FX.ring({ x: p.pos.x, y: p.pos.y + 0.06, z: p.pos.z }, 0.3, SAW.BURST_R * 0.7, 0.4, { c: '#ffd0d8' });
    FX.elec(c, 3, 12);
    FX.sparks(c, 40, null, TAU, 7, 29, SAW_SPARK);
    FX.light(c, '#ff2a48', 8, 16, 0.5);
    // a burst that throws back everything close
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ec = e.center(), dx = ec.x - c.x, dy = ec.y - c.y, dz = ec.z - c.z, d = Math.hypot(dx, dy, dz) || 1;
      if (d < SAW.BURST_R) hurtEnemy(e, SAW.BURST, { kv: { x: (dx / d) * 27, y: 20, z: (dz / d) * 27 }, dir: { x: dx / d, y: 0.4, z: dz / d }, heavy: true, cause: 'saw', stagger: 0.9 });
    }
  },

  update(p, dt) {
    const u = p.ult;
    if (!Game.cineActive()) u.t += dt;
    u.lungeCD -= dt; u.jumpCD -= dt; u.lungeT -= dt;
    const I = p.intent(), c = p.center();
    if (Input.wasPressed('dash')) p.tryDash(I);
    p.updateTetherInput();
    p.updateTether(dt);
    if (Input.wasPressed('attack') && u.lungeCD <= 0) {
      const a = p.aimDir;
      if (p.tether) p.releaseTether();
      p.vel.x = a.x * SAW.LUNGE; p.vel.y = a.y * SAW.LUNGE; p.vel.z = a.z * SAW.LUNGE; p.onGround = false;
      u.lungeT = SAW.LUNGE_T; u.lungeCD = SAW.LUNGE_CD;
      Sound.play('dash'); Sound.play('swing', { stage: 3 });
      FX.ring(c, 0.3, 1.8, 0.2, { c: '#ff3a52', flat: false });
      FPFX.kick('dash', { dir: a });
    }

    // latched on with the tether: grind the target, harder every tick
    if (this.grinding(p)) {
      const T = p.tether, e = T.target;
      if (!e || e.dead || !Input.isDown('tether')) { p.releaseTether(); }
      else {
        const ec = e.center(), f = { x: fwdX(Camera.yaw), z: fwdZ(Camera.yaw) };
        p.pos.x = ec.x - f.x * (e.r + 0.3); p.pos.z = ec.z - f.z * (e.r + 0.3); p.pos.y = Math.max(e.pos.y, ec.y - SAW.H / 2);
        p.vel.x = p.vel.y = p.vel.z = 0; p.onGround = false;
        T.grindT -= dt;
        if (T.grindT <= 0) {
          T.grindT = 0.1;
          const shielded = e.shielded && e.shielded({ cause: 'saw' });
          if (!shielded) T.grindN++;
          // bosses cap the compounding and throw you off after a moment
          const dmg = Math.min(e.isBoss ? 25 : 150, 5 * Math.pow(1.16, T.grindN));
          T.grindTotal += 0.1;
          if (e.isBoss && T.grindTotal > 1.2) {
            p.releaseTether();
            const ox = p.pos.x - ec.x, oz = p.pos.z - ec.z, ol = Math.hypot(ox, oz) || 1;
            p.vel.x = (ox / ol) * 38; p.vel.z = (oz / ol) * 38; p.vel.y = 18;
            FX.ring(ec, 0.4, 3.6, 0.3, { c: '#4af0ff', flat: false });
            Sound.play('shieldDeflect', {}, ec);
            Game.shake(0.3);
            return;
          }
          hurtEnemy(e, dmg, { cause: 'saw', noKnock: true, stagger: 0.3, hitstop: 0, crit: dmg >= 60, dir: { x: f.x, y: 0.5, z: f.z } });
          Sound.play('sawHit', {}, ec);
          FX.sparks(p.center(), 6 + Math.min(10, T.grindN / 2), null, TAU, 7, 24, SAW_SPARK);
          if (T.grindN > 8) FX.elec(p.center(), 1.4, 2);
          Game.shake(Math.min(0.12, 0.02 + T.grindN * 0.004));
        }
        u.spin += 40 * dt;
        if (p.loops.saw) p.loops.saw.set(64, true);
        if (u.t >= u.dur) this.end(p);
        return;
      }
    }

    // rolling: the keys or the stick push it round at speed; crouch drives it down
    const wasGround = p.onGround, v = p.vel;
    if (p.dashT > 0) Controller.moveDash(p, dt);
    else if (p.rebounding()) p.moveRebound(dt);
    else if (p.zipping()) p.moveZip(dt);
    else if (u.lungeT > 0) v.y -= PC.GRAV * 0.35 * dt;
    else {
      const ml = Math.hypot(I.mx, I.mz), acc = (p.onGround ? SAW.ACC_G : SAW.ACC_A) * dt;
      if (ml > 0.05) {
        const tx = (I.mx / Math.max(1, ml)) * SAW.SPEED, tz = (I.mz / Math.max(1, ml)) * SAW.SPEED, hs = Math.hypot(v.x, v.z);
        // faster than a roll (out of a lunge) and pushing the same way: bleed it off gently; any other way
        // turns it round at full grip
        const along = hs > 0.1 ? (v.x * tx + v.z * tz) / (hs * SAW.SPEED) : 0;
        const [nx, nz] = approach2(v.x, v.z, tx, tz, hs > SAW.SPEED && along > 0.5 ? SAW.FRIC_G * 0.4 * dt : acc);
        v.x = nx; v.z = nz;
      } else {
        const [nx, nz] = approach2(v.x, v.z, 0, 0, (p.onGround ? SAW.FRIC_G : SAW.FRIC_A) * dt);
        v.x = nx; v.z = nz;
      }
      v.y = Math.max(v.y - PC.GRAV * (I.crouch ? SAW.DOWN : 1) * dt, -PC.MAX_FALL * 1.6);
      if (I.jump && u.jumpCD <= 0) {
        v.y = SAW.JUMP; u.jumpCD = SAW.JUMP_CD; p.onGround = false;
        Sound.play('djump');
        FX.ring({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z }, 0.2, 1.3, 0.2, { c: '#ff3a52' });
      }
    }
    const hx = v.x, hz = v.z, vy0 = v.y;
    const col = World.moveBody(p, dt, { step: 1.0 });
    // it bounces off walls it hits hard, throwing sparks
    if (col.wall && Math.hypot(hx, hz) > SAW.BOUNCE && !p.zipping()) {
      v.x = -hx * 0.45; v.z = -hz * 0.45;
      FX.sparks(p.center(), 10, { x: -hx, y: 0.2, z: -hz }, 1.6, 6, 20, SAW_SPARK);
      Game.shake(0.06);
    }
    if (col.ceil && vy0 > 14) v.y = -vy0 * 0.3;
    if (p.zipping() && (col.wall || col.ceil || col.ground) && dist3(p.tether.pos, p.center()) < 2.9) p.arriveZip();
    if (col.ground && !wasGround && vy0 < -24) {
      FX.dust(p.pos, 8, { smax: 7 });
      Sound.play('land', { v: 1 });
      Game.shake(0.08);
    }
    const spd = Math.hypot(v.x, v.y, v.z), hs = Math.hypot(v.x, v.z);
    if (hs > 1.8) p.yaw = yawOf(v.x, v.z);
    u.spin += (hs / SAW.R + 16) * dt;

    // contact: anything the disc touches is ground down, a hit every 0.09 s each
    const cc = p.center();
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const ec = e.center(), dx = ec.x - cc.x, dz = ec.z - cc.z, d = Math.hypot(dx, dz);
      if (d > SAW.R + e.r + 0.1 || Math.abs(ec.y - cc.y) > SAW.R + e.h / 2) continue;
      const next = u.hitCD.get(e) || 0;
      if (Game.time < next) continue;
      u.hitCD.set(e, Game.time + SAW.HIT_CD);
      const ux = d > 1e-3 ? dx / d : fwdX(p.yaw), uz = d > 1e-3 ? dz / d : fwdZ(p.yaw);
      hurtEnemy(e, SAW.HIT, { kv: { x: ux * 14.5 + v.x * 0.3, y: 10, z: uz * 14.5 + v.z * 0.3 }, dir: { x: ux, y: 0.3, z: uz }, cause: 'saw', stagger: 0.3, hitstop: 0.012 });
      Sound.play('sawHit', {}, ec);
      FX.sparks({ x: cc.x + ux * SAW.R, y: cc.y, z: cc.z + uz * SAW.R }, 6, { x: -uz, y: 0.4, z: ux }, 1.2, 7, 24, SAW_SPARK);
    }
    for (const pr of Game.props) if (!pr.dead && pr.hit && pr.center && dist3(pr.center(), cc) < SAW.R + (pr.r || 0.4)) pr.hit(30, { kv: { x: v.x * 0.5, y: 12, z: v.z * 0.5 }, heavy: true });
    Props.slash((q) => distXZ(q.pos, cc) < SAW.R + q.r && cc.y - SAW.R < q.pos.y + q.h && cc.y + SAW.R > q.pos.y, cc.y, { x: v.x || 1, z: v.z });
    for (const b of Game.projectiles) {
      if (!b.dead && b.hostile && !b.rebound && b.pos && dist3(b.pos, cc) < SAW.R + 0.3) { b.dead = true; FX.sparks(b.pos, 6, null, TAU, 3.6, 12.7, SAW_SPARK); }
    }
    // grinding on the ground or a wall throws sparks and leaves scorch marks
    const grinding = (p.onGround || col.wall) && spd > 3.6;
    if (grinding) {
      const at = { x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z };
      FX.sparks(at, 2 + Math.round(spd / 14), { x: -v.x, y: 0.5, z: -v.z }, 0.8, 7, 24, Object.assign({ life: 0.7 }, SAW_SPARK));
      if (Math.random() < 0.15) FX.decal('scorch', at, { r: 0.3, dur: 2 });
    }
    if (p.loops.saw) p.loops.saw.set(spd * 11, grinding);
    u.ghostT -= dt;
    if (u.ghostT <= 0 && spd > 11) { u.ghostT = 0.03; p.makeGhost('#ff2a48', 0.22, 0.5); }
    if (u.t >= u.dur) this.end(p);
  },
  grinding(p) { const T = p.tether; return !!(T && T.phase === 'attached' && T.mode === 'grind'); },

  end(p) {
    Sound.play('ultEnd');
    p.stopLoop('saw');
    p.ult = null; p.dashMul = 1;
    if (p.tether) p.releaseTether();
    if (!Controller.setHeight(p, PC.H)) { p.crouching = true; Controller.setHeight(p, PC.CROUCH_H); }
    p.iframes = 0.7;
    const c = p.center();
    FX.ring(c, 0.3, 2.7, 0.3, { c: '#ff3a52', flat: false });
    FX.elec(c, 1.6, 5);
    FX.sparks(c, 14, null, TAU, 5.5, 18, SAW_SPARK);
  },
});

// The saw on screen: a toothed disc turned to face the camera, as the 2D sprite is, spinning the way it rolls
// across the view, with spokes, a dark hub and a red glow, crackling with lightning; and a ring of dots round
// the crosshair counting down its time.
const SawView = {
  g: null,
  sync() {
    const P = Game.player, u = P && P.ult;
    if (!u) { if (this.g) this.g.visible = false; return; }
    if (!this.g) this.build();
    const g = this.g, q = P.rp || P.pos, c = { x: q.x, y: q.y + SAW.R, z: q.z };
    g.visible = true;
    g.position.set(c.x, c.y, c.z);
    // faces the camera, leaning a little into the way it's going
    const rx = Math.cos(Camera.yaw), rz = -Math.sin(Camera.yaw), side = P.vel.x * rx + P.vel.z * rz;
    g.rotation.set(0, Camera.yaw, clamp(-side * 0.012, -0.35, 0.35));
    this.wheel.rotation.z = -u.spin * (side < -0.5 ? -1 : 1);
    this.glow.material.opacity = 0.3 + 0.12 * Math.sin(Game.realTime * 30);
    if (Math.random() < 0.6) {
      const a = rand(0, TAU), r = rand(1, 1.6), f = (k) => ({ x: c.x + Math.cos(a) * k * rx, y: c.y + Math.sin(a) * k, z: c.z + Math.cos(a) * k * rz });
      FX.bolt(f(0.65), f(r), 0.06, { jag: 0.2, w: 0.04 });
    }
  },
  build() {
    if (this.g) return;
    const mat = (c, o) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o));
    const g = new THREE.Group(), wheel = new THREE.Group();
    // the disc's axle points at the camera (z), so it spins about z
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(SAW.R * 0.78, SAW.R * 0.78, 0.14, 28).rotateX(Math.PI / 2), mat('#b8142a'));
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(SAW.R * 0.82, SAW.R * 0.82, 0.1, 28).rotateX(Math.PI / 2), mat('#6a0a1a'));
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.22, 12).rotateX(Math.PI / 2), mat('#262a38'));
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.24), mat('#ff2a48'));
    eye.position.set(0.04, 0.06, 0);
    wheel.add(rim, disc, hub, eye);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU, tooth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), mat(i % 2 ? '#9a1024' : '#ff4a64'));
      tooth.position.set(Math.cos(a) * SAW.R * 0.88, Math.sin(a) * SAW.R * 0.88, 0);
      tooth.rotation.z = a + 0.5;
      wheel.add(tooth);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU, spoke = new THREE.Mesh(new THREE.BoxGeometry(SAW.R * 0.5, 0.06, 0.18), mat('#ff4a64'));
      spoke.position.set(Math.cos(a) * SAW.R * 0.38, Math.sin(a) * SAW.R * 0.38, 0);
      spoke.rotation.z = a;
      wheel.add(spoke);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(SAW.R * 1.2, 16, 12), mat('#ff2a48', { transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    g.add(glow, wheel);
    Gfx.scene.add(g);
    this.g = g; this.wheel = wheel; this.glow = glow;
  },
  // the time left, round the crosshair
  drawHud(ctx, p, t) {
    const u = p.ult, left = 1 - u.t / u.dur, cx = VIEW_W / 2, cy = VIEW_H / 2, n = 32;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU, x = Math.round(cx + Math.cos(a) * 14), y = Math.round(cy + Math.sin(a) * 14);
      ctx.fillStyle = '#0b0910'; ctx.fillRect(x - 1, y - 1, 3, 3);
      ctx.fillStyle = i / n < left ? (left < 0.2 && ((t * 10) | 0) % 2 ? '#ffffff' : '#ff3a52') : '#3a0a14';
      ctx.fillRect(x, y, 1, 1);
    }
  },
};
