'use strict';
// Character controller shared by the player and, later, the rival: run, jump, double jump, jump cut,
// crouch, slide, bullet jump, wall slide and wall kick, dash, step-up and ledge mantle. The owner fills an intent each tick and handles
// sound and effects through c.onMove(event, data), so this file runs headless in tools/feel-check.js.

// The 2D movement constants converted at PX = 1/11 (1 m = 11 px). A starting point: retune in metres.
const MOVE = {
  R: 0.36, H: 1.82, CROUCH_H: 1.18, SLIDE_H: 0.91,
  RUN: 13.8, ACCEL: 136, AIR_ACCEL: 95.5, FRICTION: 154.5, AIR_DRAG: 21.8, OVER_DRAG: 32.7,
  GRAV: 87.3, MAX_FALL: 39.1, JUMP: 27.3, DJUMP: 25.6, JUMP_CUT: 0.45, COYOTE: 0.09, JUMP_BUF: 0.13,
  CROUCH_SPEED: 5.0, SLIDE_MIN: 9.1, SLIDE_BOOST: 23.2, SLIDE_FRICTION: 20.9, SLIDE_TIME: 0.7, SLIDE_END: 5.9,
  DASH_SPEED: 43.6, DASH_TIME: 0.14, DASH_IFRAMES: 0.2, DASH_RECHARGE: 1.0, DASH_CHARGES: 2, DASH_ATTACK_WINDOW: 0.14,
  // grounded bodies walk up lips this tall (car bodies are 0.9 m); ledges up to MANTLE_UP above the feet can be climbed
  STEP: 1.0, MANTLE_UP: 1.45, MANTLE_TIME: 0.17,
  // pushing into a wall while falling slides down it; jumping off any wall kicks away from it
  WALL_SLIDE: 6.36, WALL_JUMP_OUT: 16.4, WALL_JUMP_UP: 26.4, WALL_LOCK: 0.13,
  // crouch or slide plus jump launches along the aim, at least this steeply upward
  BULLET: 34.1, BULLET_MIN_UP: 0.28,
};

const Controller = {
  init(c, pos, M = MOVE) {
    c.M = M;
    c.pos = { x: pos.x, y: pos.y, z: pos.z };
    c.prev = { x: pos.x, y: pos.y, z: pos.z };
    c.vel = { x: 0, y: 0, z: 0 };
    c.r = M.R; c.h = M.H; c.onGround = false; c.col = null;
    c.coyote = 0; c.jumpBuf = 0; c.airJumps = 1; c.jumpCuttable = false;
    c.crouching = false; c.sliding = false; c.slideT = 0;
    c.dashT = 0; c.dashVX = 0; c.dashVZ = 0; c.dashEndT = 0; c.dashCharges = M.DASH_CHARGES; c.dashRecharge = 0;
    c.mantle = null; c.landLag = 0;
    c.wallN = null; c.wallSliding = false; c.wallJumpLock = 0;
    // set by the owner every tick: speed scale while attacking or parrying, gravity scale, whether jumps are allowed
    c.speedMul = 1; c.gravK = 1; c.canJump = true; c.canSlide = true;
  },
  emit(c, ev, data) { if (c.onMove) c.onMove(ev, data); },
  hspeed(c) { return Math.hypot(c.vel.x, c.vel.z); },
  canStand(c, h = c.M.H) { return World.boxFree(c.pos.x, c.pos.y, c.pos.z, c.r, h - 0.01); },
  setHeight(c, h) {
    if (h > c.h && !this.canStand(c, h)) return false;
    c.h = h;
    return true;
  },
  timers(c, dt) {
    const M = c.M;
    c.coyote = Math.max(0, c.coyote - dt);
    c.jumpBuf = Math.max(0, c.jumpBuf - dt);
    c.dashEndT = Math.max(0, c.dashEndT - dt);
    c.landLag = Math.max(0, c.landLag - dt);
    c.wallJumpLock = Math.max(0, c.wallJumpLock - dt);
    if (c.dashCharges < M.DASH_CHARGES) {
      c.dashRecharge += dt;
      if (c.dashRecharge >= M.DASH_RECHARGE + (c.dashRechargeExtra || 0)) { c.dashCharges++; c.dashRecharge = 0; }
    }
  },
  // I: { mx, mz } world-space move (length up to 1), jump/jumpReleased (this tick), jumpHeld, crouch (held), crouchPressed,
  // aim (unit direction a bullet jump launches along)
  buffer(c, I) {
    if (I.jump) c.jumpBuf = c.M.JUMP_BUF;
    if (I.jumpReleased && c.vel.y > 0 && c.jumpCuttable) { c.vel.y *= c.M.JUMP_CUT; c.jumpCuttable = false; }
  },

  moveNormal(c, dt, I) {
    const M = c.M, v = c.vel;
    let hs = this.hspeed(c);
    // crouch and slide on the ground
    if (c.onGround) {
      c.airJumps = 1;
      if (I.crouchPressed && hs > M.SLIDE_MIN && !c.sliding && c.canSlide) { this.startSlide(c); hs = this.hspeed(c); }
    }
    if (c.sliding) {
      c.slideT -= dt;
      const k = hs > 0 ? approach(hs, 0, M.SLIDE_FRICTION * dt) / hs : 0;
      v.x *= k; v.z *= k;
      // a little steering, so a slide can follow a curve
      if (I.mx || I.mz) {
        const [nx, nz] = approach2(v.x, v.z, I.mx * hs, I.mz * hs, 6 * dt);
        const l = Math.hypot(nx, nz) || 1, s = this.hspeed(c);
        v.x = (nx / l) * s; v.z = (nz / l) * s;
      }
      const end = !c.onGround || this.hspeed(c) < M.SLIDE_END || c.slideT <= 0 || (!I.crouch && this.canStand(c));
      if (end) {
        c.sliding = false;
        if (I.crouch && c.onGround) { c.crouching = true; this.setHeight(c, M.CROUCH_H); }
        else if (!this.setHeight(c, M.H)) { c.crouching = true; this.setHeight(c, M.CROUCH_H); }
      }
    } else if (c.onGround && I.crouch) {
      if (!c.crouching) { c.crouching = true; this.setHeight(c, M.CROUCH_H); }
    } else if (c.crouching && (!I.crouch || !c.onGround)) {
      if (this.setHeight(c, M.H)) c.crouching = false;
    }

    // horizontal: accelerate toward the intended velocity, keep extra speed only while it points the same way
    const maxSpd = (c.crouching ? M.CROUCH_SPEED : M.RUN) * c.speedMul;
    if (!c.sliding) {
      const accel = c.onGround ? M.ACCEL : M.AIR_ACCEL;
      const ml = Math.hypot(I.mx, I.mz);
      if (ml > 0.01 && c.wallJumpLock <= 0) {
        hs = this.hspeed(c);
        const along = hs > 0 ? (v.x * I.mx + v.z * I.mz) / (hs * ml) : 0;
        let target = maxSpd * Math.min(1, ml);
        if (hs > target && along > 0.5) target = approach(hs, target, (c.onGround ? M.OVER_DRAG * 2 : M.OVER_DRAG * 0.5) * dt);
        const [nx, nz] = approach2(v.x, v.z, (I.mx / ml) * target, (I.mz / ml) * target, accel * dt);
        v.x = nx; v.z = nz;
      } else {
        const fr = c.onGround ? M.FRICTION : M.AIR_DRAG;
        const [nx, nz] = approach2(v.x, v.z, 0, 0, fr * dt);
        v.x = nx; v.z = nz;
      }
    }

    // gravity: a little heavier on the way down when jump isn't held
    let grav = M.GRAV * c.gravK;
    if (v.y < 0 && !I.jumpHeld) grav *= 1.12;
    v.y = Math.max(v.y - grav * dt, -M.MAX_FALL);

    // walls: pushing into one on the way down slows the fall
    c.wallN = c.onGround ? null : this.wallProbe(c, I);
    c.wallSliding = !!c.wallN && v.y < 0 && I.mx * -c.wallN.x + I.mz * -c.wallN.z > 0.5;
    if (c.wallSliding) v.y = Math.max(v.y, -M.WALL_SLIDE);

    // jumping
    if (c.jumpBuf > 0 && c.canJump && c.landLag <= 0.05) {
      if (c.onGround || c.coyote > 0) {
        if ((c.crouching || c.sliding) && c.onGround && I.aim) this.bulletJump(c, I.aim);
        else this.groundJump(c);
        c.jumpBuf = 0;
      } else if (c.wallN) { this.wallJump(c); c.jumpBuf = 0; }
      else if (c.airJumps > 0) { this.doubleJump(c); c.jumpBuf = 0; }
    }
  },
  // The outward normal of a wall within reach of the body's side, tall enough to kick off (not a car).
  // Walls are box faces, so only the four axis directions need probing; the one pushed into wins.
  wallProbe(c, I) {
    const p = c.pos, top = p.y + 1.2;
    let best = null, bestK = -Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const b = World.overlap(p.x + dx * 0.12, p.y + 0.4, p.z + dz * 0.12, c.r, Math.max(0.3, c.h - 0.6));
      if (!b || b.max.y < top) continue;
      const k = I ? I.mx * dx + I.mz * dz : 0;
      if (k > bestK) { bestK = k; best = { x: -dx, z: -dz }; }
    }
    return best;
  },
  wallJump(c) {
    const M = c.M, n = c.wallN;
    c.vel.x = n.x * M.WALL_JUMP_OUT; c.vel.z = n.z * M.WALL_JUMP_OUT; c.vel.y = M.WALL_JUMP_UP;
    c.wallJumpLock = M.WALL_LOCK; c.airJumps = 1; c.jumpCuttable = true; c.wallSliding = false;
    this.emit(c, 'walljump', n);
    c.wallN = null;
  },
  // Along the aim, never flatter than BULLET_MIN_UP upward.
  bulletJump(c, aim) {
    const M = c.M;
    let x = aim.x, y = aim.y, z = aim.z;
    if (y < M.BULLET_MIN_UP) { y = M.BULLET_MIN_UP; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l; }
    c.sliding = false; c.crouching = false;
    if (!this.setHeight(c, M.H)) this.setHeight(c, M.CROUCH_H);
    c.vel.x = x * M.BULLET; c.vel.y = y * M.BULLET; c.vel.z = z * M.BULLET;
    c.onGround = false; c.coyote = 0; c.jumpCuttable = false;
    this.emit(c, 'bulletjump', { x, y, z });
  },
  startSlide(c) {
    const M = c.M, hs = this.hspeed(c) || 1;
    c.sliding = true; c.crouching = false; c.slideT = M.SLIDE_TIME;
    const s = Math.max(hs * 1.15, M.SLIDE_BOOST) / hs;
    c.vel.x *= s; c.vel.z *= s;
    this.setHeight(c, M.SLIDE_H);
    this.emit(c, 'slide');
  },
  groundJump(c) {
    c.vel.y = c.M.JUMP; c.coyote = 0; c.onGround = false; c.jumpCuttable = true;
    if (c.crouching || c.sliding) { c.crouching = false; c.sliding = false; if (!this.setHeight(c, c.M.H)) this.setHeight(c, c.M.CROUCH_H); }
    this.emit(c, 'jump');
  },
  doubleJump(c) {
    c.vel.y = c.M.DJUMP; c.airJumps--; c.jumpCuttable = true;
    this.emit(c, 'djump');
  },

  // ---------- dash: along (dx, dz), level in the air ----------
  tryDash(c, dx, dz) {
    const M = c.M;
    if (c.dashCharges <= 0 || c.dashT > 0) return false;
    const l = Math.hypot(dx, dz) || 1;
    c.mantle = null;
    if (c.sliding || c.crouching) { c.sliding = false; c.crouching = false; if (!this.setHeight(c, M.H)) this.setHeight(c, M.SLIDE_H); }
    c.dashT = M.DASH_TIME; c.dashVX = (dx / l) * M.DASH_SPEED * (c.dashMul || 1); c.dashVZ = (dz / l) * M.DASH_SPEED * (c.dashMul || 1);
    if (c.dashCharges === M.DASH_CHARGES) c.dashRecharge = 0;
    c.dashCharges--;
    this.emit(c, 'dash', { x: dx / l, z: dz / l });
    return true;
  },
  moveDash(c, dt) {
    c.dashT -= dt;
    c.vel.x = c.dashVX; c.vel.z = c.dashVZ; c.vel.y = 0;
    if (c.dashT <= 0) {
      c.dashT = 0;
      c.dashEndT = c.M.DASH_ATTACK_WINDOW;
      c.vel.x *= 0.55; c.vel.z *= 0.55;
      this.emit(c, 'dashEnd');
    }
  },

  // ---------- ledge mantle ----------
  moveMantle(c, dt) {
    const m = c.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    // up first, then over the lip
    c.pos.y = lerp(m.y0, m.y1, easeOutQuad(Math.min(1, k * 1.5)));
    const kh = clamp((k - 0.45) / 0.55, 0, 1);
    c.pos.x = lerp(m.x0, m.x1, kh); c.pos.z = lerp(m.z0, m.z1, kh);
    c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
    if (k >= 1) { c.mantle = null; c.onGround = true; c.airJumps = 1; this.emit(c, 'mantleEnd'); }
  },
  // Pushing into a wall in the air with its top within reach climbs it, if the top has room.
  tryMantle(c, I) {
    const M = c.M, col = c.col, b = col && col.wallBox;
    if (!b || c.onGround || c.vel.y > 6 || c.dashT > 0) return false;
    const nx = col.wallX, nz = col.wallZ;
    if (I.mx * -nx + I.mz * -nz < 0.5) return false;
    const rise = b.max.y - c.pos.y;
    if (rise <= 0.2 || rise > M.MANTLE_UP) return false;
    const x1 = c.pos.x - nx * (c.r * 2 + 0.1), z1 = c.pos.z - nz * (c.r * 2 + 0.1), y1 = b.max.y + 0.01;
    const h = World.boxFree(x1, y1, z1, c.r, M.H) ? M.H : World.boxFree(x1, y1, z1, c.r, M.CROUCH_H) ? M.CROUCH_H : 0;
    if (!h || !World.boxFree(c.pos.x, y1, c.pos.z, c.r, h)) return false;
    if (h < c.h) c.h = h;
    c.mantle = { t: 0, dur: M.MANTLE_TIME, y0: c.pos.y, y1, x0: c.pos.x, z0: c.pos.z, x1, z1 };
    c.sliding = false; c.crouching = h < M.H;
    this.emit(c, 'mantle');
    return true;
  },

  // Moves the body and handles landing, coyote time and mantles. opt.step overrides the step height.
  integrate(c, dt, I, opt = {}) {
    if (c.mantle) { this.moveMantle(c, dt); return c.col || {}; }
    const wasGround = c.onGround, preVy = c.vel.y;
    const col = World.moveBody(c, dt, { step: opt.step === undefined ? c.M.STEP : opt.step });
    if (col.ground && !wasGround) { c.airJumps = 1; this.emit(c, 'land', { vy: preVy }); }
    if (!col.ground && wasGround && c.vel.y <= 0) c.coyote = c.M.COYOTE;
    if (I && opt.mantle !== false && col.wall) this.tryMantle(c, I);
    return col;
  },
};
