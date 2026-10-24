'use strict';
// Character controller shared by the player and, later, the rival: run and sprint, skid turns, jump, double
// jump, jump cut, crouch, slide, bullet jump, wall cling and wall kick, dash, vault and ledge mantle. The owner fills an
// intent each tick and handles sound and effects through c.onMove(event, data), so this file runs headless
// in tools/feel-check.js.

// Started from the 2D constants converted at PX = 1/11, then retuned in metres for a third-person feel:
// momentum on the ground (a run that builds to a sprint, turns that carve, skids on reversals), vaults
// instead of tall step-ups, and floatier jumps that reach the same heights.
const MOVE = {
  R: 0.36, H: 1.82, CROUCH_H: 1.18, SLIDE_H: 0.91,
  // a quick start to RUN, then a build to SPRINT over SPRINT_BUILD seconds of running
  RUN: 9.5, SPRINT: 13.8, SPRINT_BUILD: 0.5, ACCEL: 70, AIR_ACCEL: 55, FRICTION: 62, AIR_DRAG: 9, OVER_DRAG: 32.7,
  // turns carve the velocity round: radians a second when slow, falling to TURN at a sprint; a reversal
  // sharper than SKID_ANGLE at speed brakes along the old line first. Above SKID_SLIDE_MIN it's a skid turn:
  // a hand dug into the street until the slide stops, then a push off it at SKID_PUSH of a run
  TURN_SLOW: 22, TURN: 7.5, AIR_TURN: 5.5, SKID_ANGLE: 2.3, SKID_FRICTION: 46, SKID_SLIDE_MIN: 7, SKID_PUSH: 0.8, SKID_MAX: 0.6,
  // gravity eases off near the top of a held jump (below APEX_V m/s) so arcs hang a moment
  GRAV: 70, MAX_FALL: 35, JUMP: 24.2, DJUMP: 22.6, JUMP_CUT: 0.45, COYOTE: 0.1, JUMP_BUF: 0.13, APEX_V: 4.5, APEX_HANG: 0.6,
  CROUCH_SPEED: 5.0, SLIDE_MIN: 8.0, SLIDE_BOOST: 12, SLIDE_FRICTION: 9, SLIDE_TIME: 1.6, SLIDE_END: 6.0,
  DASH_SPEED: 43.6, DASH_TIME: 0.14, DASH_IFRAMES: 0.2, DASH_RECHARGE: 1.0, DASH_CHARGES: 2, DASH_ATTACK_WINDOW: 0.14,
  // grounded bodies walk up lips this tall; running into anything up to VAULT_UP vaults it at speed, hopping
  // VAULT_HOP clear of the top. A ledge up to MANTLE_UP above the feet (a hand over the edge) is climbed from
  // the air as you move into it, and from the ground (CLIMB_UP) after pushing into it for CLIMB_PUSH seconds
  // where it's too high or too slow to vault. A climb takes MANTLE_TIME for a metre, longer for more.
  STEP: 0.45, VAULT_UP: 1.95, VAULT_MIN: 3.5, VAULT_HOP: 0.45, MANTLE_UP: 2.4, CLIMB_UP: 2.65, CLIMB_PUSH: 0.1, MANTLE_TIME: 0.2,
  // pushing into a wall in the air (rising slower than CLING_VY) digs a hand in: held CLING_HOLD seconds,
  // then a slide that builds by CLING_ACCEL to WALL_SLIDE, for as long as a movement key is held. Wall kicks
  // start from a cling.
  CLING_VY: 4, CLING_HOLD: 1.0, CLING_ACCEL: 5, WALL_SLIDE: 6.36, WALL_JUMP_OUT: 16.4, WALL_JUMP_UP: 23.4, WALL_LOCK: 0.13,
  // crouch or slide plus jump launches along the aim, at least this steeply upward
  BULLET: 32, BULLET_MIN_UP: 0.28,
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
    c.mantle = null; c.vault = null; c.landLag = 0; c.sprintK = 0; c.skidding = false; c.skidT = 0; c.skid = null;
    c.wallN = null; c.wallSliding = false; c.wallJumpLock = 0; c.cling = null; c.clingLock = null;
    // set by the owner every tick: speed scale while attacking or parrying, gravity scale, whether jumps,
    // slides and clings are allowed
    c.speedMul = 1; c.gravK = 1; c.canJump = true; c.canSlide = true; c.canCling = true;
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
    c.noDragT = Math.max(0, (c.noDragT || 0) - dt);
    c.skidT = Math.max(0, c.skidT - dt);
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
    if (c.cling && this.moveCling(c, dt, I)) return;
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
        const [nx, nz] = approach2(v.x, v.z, I.mx * hs, I.mz * hs, 10 * dt);
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

    // the sprint builds while you keep running at full pace, holds through turns and jumps, and drains
    // when you stop, crouch, attack or skid
    const ml = Math.hypot(I.mx, I.mz), moving = ml > 0.01 && c.wallJumpLock <= 0;
    hs = this.hspeed(c);
    if (c.onGround && !c.sliding) {
      if (moving && !c.crouching && c.speedMul >= 1 && hs > M.RUN * 0.85) c.sprintK = Math.min(1, c.sprintK + dt / M.SPRINT_BUILD);
      else if (!moving || c.crouching || c.speedMul < 1) c.sprintK = Math.max(0, c.sprintK - dt * 2.5);
    }
    const maxSpd = (c.crouching ? M.CROUCH_SPEED : lerp(M.RUN, M.SPRINT, c.sprintK)) * c.speedMul;
    c.skidding = false;
    if (!c.sliding) {
      if (c.skid && this.moveSkid(c, dt, I, maxSpd)) { /* braking on the hand */ }
      else if (moving) this.steerVel(c, dt, I.mx / ml, I.mz / ml, maxSpd * Math.min(1, ml));
      else if (!c.onGround && c.noDragT > 0) { /* a launch keeps its line until it tops out */ }
      else {
        const fr = c.onGround ? M.FRICTION : M.AIR_DRAG;
        const [nx, nz] = approach2(v.x, v.z, 0, 0, fr * dt);
        v.x = nx; v.z = nz;
      }
    }

    // gravity: it eases off near the top of a held jump, and is a little heavier on the way down when not
    let grav = M.GRAV * c.gravK;
    if (!c.onGround && I.jumpHeld && Math.abs(v.y) < M.APEX_V) grav *= M.APEX_HANG;
    if (v.y < 0 && !I.jumpHeld) grav *= 1.12;
    v.y = Math.max(v.y - grav * dt, -M.MAX_FALL);

    // walls: pushing into a tall one in the air, at or past the top of a jump, clings to it
    const w = c.onGround ? null : this.wallProbe(c, I);
    c.wallN = w; c.wallSliding = false;
    // (a top within reach with room on it is climbed instead)
    if (w && c.canCling && v.y < M.CLING_VY && c.wallJumpLock <= 0 && w.box !== c.clingLock && I.mx * -w.x + I.mz * -w.z > 0.5
      && !(w.top - c.pos.y <= M.MANTLE_UP + 0.1 && this.ledgeSpot(c, w.box, w.x, w.z, M.MANTLE_UP))) { this.startCling(c, w); return; }

    // jumping
    if (c.jumpBuf > 0 && c.canJump && c.landLag <= 0.05) {
      if (c.onGround || c.coyote > 0) {
        if ((c.crouching || c.sliding) && c.onGround && I.aim) this.bulletJump(c, I.aim);
        else this.groundJump(c);
        c.jumpBuf = 0;
      } else if (c.airJumps > 0) { this.doubleJump(c); c.jumpBuf = 0; }
    }
  },
  // A skid turn: braking along the old line on a hand dug into the street; once the slide is spent, a push
  // off the hand sets off along the held direction. Swinging the input back toward the old line carves instead.
  moveSkid(c, dt, I, target) {
    const M = c.M, S = c.skid, v = c.vel, ml = Math.hypot(I.mx, I.mz);
    S.t += dt;
    if (ml > 0.1) { S.ux = I.mx / ml; S.uz = I.mz / ml; }
    if (!c.onGround || (ml > 0.1 && S.dx * S.ux + S.dz * S.uz > 0) || S.t > M.SKID_MAX) { this.endSkid(c, false); return false; }
    const hs = this.hspeed(c), s = approach(hs, 0, M.SKID_FRICTION * dt);
    if (hs > 0.1) { S.dx = v.x / hs; S.dz = v.z / hs; }
    v.x = S.dx * s; v.z = S.dz * s;
    c.skidding = true;
    c.sprintK = Math.max(0, c.sprintK - dt * 4);
    if (s < 1.2) {
      if (ml > 0.1) { const p = Math.min(target, M.RUN * M.SKID_PUSH); v.x = S.ux * p; v.z = S.uz * p; }
      this.endSkid(c, ml > 0.1);
    }
    return true;
  },
  endSkid(c, push) {
    if (!c.skid) return;
    const S = c.skid;
    c.skid = null;
    this.emit(c, 'skidEnd', { push, x: S.ux, z: S.uz });
  },
  // Turns the horizontal velocity toward (ux, uz) and brings its speed to target. From a standstill it just
  // accelerates that way; at speed the heading carves round at a rate that falls as speed rises, and a
  // reversal sharper than SKID_ANGLE brakes along the old line (a skid on the ground) before setting off.
  steerVel(c, dt, ux, uz, target) {
    const M = c.M, v = c.vel, ground = c.onGround, hs = this.hspeed(c), acc = ground ? M.ACCEL : M.AIR_ACCEL;
    if (hs < 0.6) {
      const [nx, nz] = approach2(v.x, v.z, ux * target, uz * target, acc * dt);
      v.x = nx; v.z = nz;
      return;
    }
    const dx = v.x / hs, dz = v.z / hs, ang = Math.atan2(dx * uz - dz * ux, dx * ux + dz * uz);
    if (Math.abs(ang) > M.SKID_ANGLE && (!ground || hs > M.RUN * 0.5)) {
      if (ground && hs > M.SKID_SLIDE_MIN && !c.skid) {
        c.skid = { t: 0, dx, dz, ux, uz, x0: c.pos.x, z0: c.pos.z };
        this.emit(c, 'skidStart', c.skid);
        this.moveSkid(c, dt, { mx: ux, mz: uz }, target);
        return;
      }
      const s = approach(hs, 0, (ground ? M.SKID_FRICTION : M.AIR_ACCEL) * dt);
      v.x = dx * s; v.z = dz * s;
      if (ground) {
        c.skidding = true;
        c.sprintK = Math.max(0, c.sprintK - dt * 4);
        if (c.skidT <= 0) this.emit(c, 'skid', { x: dx, z: dz });
        c.skidT = 0.1;
      }
      return;
    }
    const rate = ground ? lerp(M.TURN_SLOW, M.TURN, clamp(hs / M.SPRINT, 0, 1)) : M.AIR_TURN;
    const turn = clamp(ang, -rate * dt, rate * dt), cs = Math.cos(turn), sn = Math.sin(turn);
    let s = hs;
    if (s < target) s = Math.min(target, s + acc * dt);
    // (a tether launch keeps its speed to the top of its arc)
    else if (s > target && (ground || !(c.noDragT > 0))) s = approach(s, target, (ground ? M.OVER_DRAG * 2 : M.OVER_DRAG * 0.5) * dt);
    v.x = (dx * cs - dz * sn) * s; v.z = (dx * sn + dz * cs) * s;
  },
  // A wall within reach of the body's side, tall enough to cling to (not a car): its outward normal, the box
  // and its top. Walls are box faces, so only the four axis directions need probing; the one pushed into wins.
  wallProbe(c, I) {
    const p = c.pos, top = p.y + 1.2;
    let best = null, bestK = -Infinity;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const b = this.wallAt(c, -dx, -dz);
      // (a slick wall gives no grip: the training course keeps wall kicks to their station)
      if (!b || b.max.y < top || b.slick) continue;
      const k = I ? I.mx * dx + I.mz * dz : 0;
      if (k > bestK) { bestK = k; best = { x: -dx, z: -dz, box: b, top: b.max.y }; }
    }
    return best;
  },
  // the box beside the body on the side facing away from normal (nx, nz)
  wallAt(c, nx, nz) {
    const p = c.pos;
    return World.overlap(p.x - nx * 0.12, p.y + 0.4, p.z - nz * 0.12, c.r, Math.max(0.3, c.h - 0.6));
  },
  wallJump(c) {
    const M = c.M, n = c.wallN;
    c.vel.x = n.x * M.WALL_JUMP_OUT; c.vel.z = n.z * M.WALL_JUMP_OUT; c.vel.y = M.WALL_JUMP_UP;
    c.wallJumpLock = M.WALL_LOCK; c.airJumps = 1; c.jumpCuttable = true; c.wallSliding = false;
    c.cling = null; c.clingLock = null;
    this.emit(c, 'walljump', n);
    c.wallN = null;
  },

  // ---------- wall cling ----------
  startCling(c, w) {
    c.cling = { t: 0, n: { x: w.x, z: w.z }, box: w.box, sliding: false, y0: c.pos.y };
    c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
    c.airJumps = 1; c.jumpCuttable = false;
    this.endSkid(c, false);
    this.emit(c, 'cling', c.cling);
  },
  // Held, then sliding, while any movement key is down: jump kicks off; letting go of the keys, or crouch,
  // drops off at once (not back onto that wall until you land or kick); the wall ending drops you.
  moveCling(c, dt, I) {
    const M = c.M, C = c.cling;
    C.t += dt;
    if (!this.wallAt(c, C.n.x, C.n.z)) { this.dropCling(c); return false; }
    if (c.jumpBuf > 0 && c.canJump) { c.jumpBuf = 0; c.wallN = C.n; this.wallJump(c); return true; }
    if (I.crouchPressed || Math.hypot(I.mx, I.mz) < 0.1) {
      c.clingLock = C.box;
      this.dropCling(c);
      c.vel.x = C.n.x * 1.5; c.vel.z = C.n.z * 1.5;
      return false;
    }
    const v = c.vel;
    if (C.t < M.CLING_HOLD) { v.x = 0; v.y = 0; v.z = 0; }
    else {
      if (!C.sliding) { C.sliding = true; this.emit(c, 'clingSlide', C); }
      v.y = Math.max(v.y - M.CLING_ACCEL * dt, -M.WALL_SLIDE);
      v.x = -C.n.x * 0.5; v.z = -C.n.z * 0.5;
    }
    c.wallN = C.n; c.wallSliding = C.sliding;
    return true;
  },
  dropCling(c) {
    if (!c.cling) return;
    c.cling = null; c.wallSliding = false;
    this.emit(c, 'clingEnd');
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
    this.endSkid(c, false);
    c.sliding = true; c.crouching = false; c.slideT = M.SLIDE_TIME;
    const s = Math.max(hs * 1.2, M.SLIDE_BOOST) / hs;
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
    this.dropCling(c); this.endSkid(c, false);
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
    if (m.path) {
      // a haul along a path of points (out round an edge, up, over), eased through the whole of it
      const P = m.path, u = easeInOutQuad(k) * (P.length - 1), i = Math.min(P.length - 2, Math.floor(u)), f = u - i;
      c.pos.x = lerp(P[i].x, P[i + 1].x, f); c.pos.y = lerp(P[i].y, P[i + 1].y, f); c.pos.z = lerp(P[i].z, P[i + 1].z, f);
      c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
      if (k >= 1) { c.mantle = null; c.onGround = true; c.airJumps = 1; this.emit(c, 'mantleEnd'); }
      return;
    }
    // up first, then over the lip
    c.pos.y = lerp(m.y0, m.y1, easeOutQuad(Math.min(1, k / 0.62)));
    const kh = clamp((k - 0.5) / 0.5, 0, 1);
    c.pos.x = lerp(m.x0, m.x1, kh); c.pos.z = lerp(m.z0, m.z1, kh);
    c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
    if (k >= 1) {
      // step off the top still moving, so a climb flows into the run
      c.vel.x = m.dx * m.spd; c.vel.z = m.dz * m.spd;
      c.mantle = null; c.onGround = true; c.airJumps = 1; this.emit(c, 'mantleEnd');
    }
  },
  // Moving into a wall in the air with its top within reach climbs it, if the top has room. The wall is the
  // one just hit, or the one beside the body that the wall probe found (c.wallN). c.climbBox, while
  // c.climbT lasts, is a ledge the tether is throwing you at: it's climbed whatever the keys say.
  tryMantle(c, I) {
    const M = c.M, col = c.col;
    if (c.onGround) return false;
    let b = col && col.wallBox, nx = col && col.wallX, nz = col && col.wallZ;
    if (!b && c.wallN) { b = c.wallN.box; nx = c.wallN.x; nz = c.wallN.z; }
    if (!b) return false;
    const thrown = c.climbBox === b && c.climbT > 0;
    if (!thrown && I.mx * -nx + I.mz * -nz < 0.5) return false;
    return this.ledge(c, b, nx, nz, M.MANTLE_UP + (thrown ? 0.4 : 0));
  },
  // On the ground, pushing into a ledge that can't be vaulted (too high, or too slow a run) climbs it.
  tryClimb(c, I, dt) {
    const M = c.M, col = c.col, b = col && col.wallBox, ml = Math.hypot(I.mx, I.mz);
    if (!b || ml < 0.3 || (I.mx * -col.wallX + I.mz * -col.wallZ) / ml < 0.6) { c.pushT = 0; return false; }
    c.pushT = (c.pushT || 0) + dt;
    if (c.pushT < M.CLIMB_PUSH) return false;
    if (!this.ledge(c, b, col.wallX, col.wallZ, M.CLIMB_UP, 0.4)) return false;
    c.pushT = 0;
    return true;
  },
  // Climbs onto the top of b from beside it (its outward normal nx, nz): the top must be no more than reach
  // above the feet and at least min, with room to rise where you are and to stand (or crouch) on top.
  ledge(c, b, nx, nz, reach, min = 0.02) {
    const M = c.M, L = this.ledgeSpot(c, b, nx, nz, reach, min);
    if (!L) return false;
    const { x1, y1, z1, h, rise } = L;
    if (h < c.h) c.h = h;
    const dur = M.MANTLE_TIME * clamp(0.55 + rise * 0.45, 0.65, 1.55);
    c.mantle = { t: 0, dur, rise, y0: c.pos.y, y1, x0: c.pos.x, z0: c.pos.z, x1, z1, dx: -nx, dz: -nz, spd: clamp(c.preHs || 0, 3, 8) };
    c.sliding = false; c.crouching = h < M.H; c.dashT = 0; c.climbBox = null;
    this.dropCling(c); this.endSkid(c, false);
    this.emit(c, 'mantle', c.mantle);
    return true;
  },

  // where a climb onto b would put you: the spot on its top and the height there's room for, or null
  ledgeSpot(c, b, nx, nz, reach, min = 0.02) {
    const M = c.M;
    // (a vault-only barrier can't be climbed onto, only vaulted)
    if (b.max.y - c.pos.y > reach || b.vaultOnly) return null;
    const x1 = c.pos.x - nx * (c.r * 2 + 0.1), z1 = c.pos.z - nz * (c.r * 2 + 0.1);
    const top = this.highestTop(x1, z1, c.r, c.pos.y + reach), rise = top - c.pos.y;
    if (rise < min || top < b.max.y - 1e-6) return null;
    const y1 = top + 0.01;
    const h = World.boxFree(x1, y1, z1, c.r, M.H) ? M.H : World.boxFree(x1, y1, z1, c.r, M.CROUCH_H) ? M.CROUCH_H : 0;
    if (!h || !World.boxFree(c.pos.x, c.pos.y + 0.02, c.pos.z, c.r, Math.max(h, y1 - c.pos.y + h - 0.02))) return null;
    return { x1, y1, z1, h, rise };
  },
  // the outward normal of the side of b that (x, z) is beside, or null over its top
  sideOf(b, x, z) {
    const ox = x < b.min.x ? b.min.x - x : x > b.max.x ? x - b.max.x : 0, oz = z < b.min.z ? b.min.z - z : z > b.max.z ? z - b.max.z : 0;
    if (!ox && !oz) return null;
    return ox >= oz ? { x: x < b.min.x ? -1 : 1, z: 0 } : { x: 0, z: z < b.min.z ? -1 : 1 };
  },

  // Hauled onto a top along path (world points), over dur seconds, through whatever is in the way.
  haul(c, path, dur) {
    c.mantle = { t: 0, dur, path, haul: true };
    c.sliding = false; c.crouching = false; c.h = c.M.H;
    this.dropCling(c); this.endSkid(c, false);
    this.emit(c, 'mantle');
  },

  // ---------- vault ----------
  // Running into anything between a step and VAULT_UP high goes over it without breaking stride: up onto
  // its top in place, then on along the run's heading, landing on it or dropping off the far side.
  tryVault(c, I, pvx, pvz) {
    const M = c.M, col = c.col, b = col && col.wallBox, ml = Math.hypot(I.mx, I.mz);
    if (!b || c.dashT > 0 || ml < 0.3) return false;
    const nx = col.wallX, nz = col.wallZ, hs = Math.hypot(pvx, pvz);
    if ((I.mx * -nx + I.mz * -nz) / ml < 0.5 || hs < M.VAULT_MIN) return false;
    // over whatever is highest just past the face, within reach (a car's roof, not the body you ran into)
    const lx = c.pos.x - nx * (c.r * 2 + 0.1), lz = c.pos.z - nz * (c.r * 2 + 0.1);
    const top = this.highestTop(lx, lz, c.r, c.pos.y + M.VAULT_UP), rise = top - c.pos.y;
    if (rise <= M.STEP || rise > M.VAULT_UP) return false;
    const y1 = top + M.VAULT_HOP;
    // room to rise where you stand, and at least a crouch's room on top
    if (!World.boxFree(c.pos.x, c.pos.y + 0.02, c.pos.z, c.r, y1 - c.pos.y + c.h)) return false;
    if (!World.boxFree(lx, y1, lz, c.r, M.CROUCH_H)) return false;
    // a gap too low to stand in is vaulted ducked, and you stay ducked until there's room
    const low = !World.boxFree(lx, y1, lz, c.r, M.H);
    // keep the run's heading, turned at least partly into the obstacle
    let dx = pvx / hs, dz = pvz / hs;
    if (dx * -nx + dz * -nz < 0.4) { dx -= nx; dz -= nz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l; }
    // the free (left) hand plants just past the face, a little to the left of the line
    const px = c.pos.x - nx * (c.r + 0.2) - dz * 0.15, pz = c.pos.z - nz * (c.r + 0.2) + dx * 0.15;
    c.vault = {
      t: 0, dur: clamp(2.2 / hs, 0.2, 0.34), y0: c.pos.y, y1, top, dx, dz, spd: Math.max(hs * 0.95, 4.5),
      plant: { x: px, y: World.groundAt(px, pz, top + 0.01), z: pz },
    };
    c.sliding = false; c.crouching = low;
    if (low) c.h = M.CROUCH_H;
    this.endSkid(c, false);
    this.emit(c, 'vault', c.vault);
    return true;
  },
  // the highest box top at or below maxY anywhere under a body's footprint at (x, z)
  highestTop(x, z, r, maxY) {
    let best = -Infinity;
    for (const b of World.near(x - r, z - r, x + r, z + r)) {
      if (b.max.x <= x - r || b.min.x >= x + r || b.max.z <= z - r || b.min.z >= z + r) continue;
      if (b.max.y <= maxY + 1e-6 && b.max.y > best) best = b.max.y;
    }
    return best;
  },
  // a hop: up past the top by VAULT_HOP over the first 55%, then easing back down to just above it, moving
  // on along the run throughout; at the end gravity takes over (onto the top, or off the far side)
  moveVault(c, dt) {
    const V = c.vault;
    V.t += dt;
    const k = Math.min(1, V.t / V.dur);
    const y = k < 0.55 ? lerp(V.y0, V.y1, easeOutQuad(k / 0.55)) : lerp(V.y1, V.top + 0.03, easeInQuad((k - 0.55) / 0.45));
    if (World.boxFree(c.pos.x, y, c.pos.z, c.r, c.h)) c.pos.y = y;
    const x = c.pos.x + V.dx * V.spd * dt, z = c.pos.z + V.dz * V.spd * dt;
    if (World.boxFree(x, c.pos.y, z, c.r, c.h)) { c.pos.x = x; c.pos.z = z; }
    c.vel.x = V.dx * V.spd; c.vel.z = V.dz * V.spd; c.vel.y = k < 0.55 ? 0 : -2;
    if (k >= 1) {
      c.vault = null;
      c.onGround = World.standing(c);
      if (!c.onGround) c.coyote = c.M.COYOTE;
      if (c.h < c.M.H && this.canStand(c)) c.h = c.M.H;
      this.emit(c, 'vaultEnd');
    }
  },

  // Moves the body and handles landing, coyote time, vaults and mantles. opt.step overrides the step height.
  integrate(c, dt, I, opt = {}) {
    if (c.mantle) { this.moveMantle(c, dt); return c.col || {}; }
    if (c.vault) { this.moveVault(c, dt); return c.col || {}; }
    const wasGround = c.onGround, preVy = c.vel.y, pvx = c.vel.x, pvz = c.vel.z;
    c.preHs = Math.hypot(pvx, pvz);
    const col = World.moveBody(c, dt, { step: opt.step === undefined ? c.M.STEP : opt.step });
    if (col.ground && !wasGround) { c.airJumps = 1; this.emit(c, 'land', { vy: preVy }); }
    if (col.ground) { c.clingLock = null; if (c.cling) this.dropCling(c); }
    if (!col.ground && wasGround && c.vel.y <= 0) c.coyote = c.M.COYOTE;
    c.climbT = Math.max(0, (c.climbT || 0) - dt);
    if (I && opt.mantle !== false && wasGround && col.wall) { if (!this.tryVault(c, I, pvx, pvz)) this.tryClimb(c, I, dt); }
    else {
      c.pushT = 0;
      if (I && opt.mantle !== false && !wasGround && !col.ground && (col.wall || c.wallN)) this.tryMantle(c, I);
    }
    return col;
  },
};
