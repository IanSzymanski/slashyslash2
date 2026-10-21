'use strict';
// Third-person orbit camera in the Risk of Rain 2 style: behind and above the player, turned directly by the mouse.
// A 0.25 m sphere swept from the pivot keeps it out of walls; the aim ray through the crosshair sets
// where slashes, the tether and returned bolts go.

const Camera = {
  yaw: 0, pitch: -0.2, curDist: 5, fov: 62,
  pivot: { x: 0, y: 2.3, z: 0 }, base: null, pos: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 }, aim: { x: 0, y: 0, z: -60 }, aimEnemy: null,
  PIVOT_UP: 0.5, PITCH_MAX: (80 * Math.PI) / 180, RADIUS: 0.25, EASE_OUT: 0.3, SENS: 0.0022, AIM_FAR: 60,
  // threats more than this far off the view's centre count as unseen (the wind-up fairness rule)
  OFFVIEW: (75 * Math.PI) / 180,

  // mouse deltas in pixels, applied in real time (never slowed by slow motion or frozen by hitstop)
  look(dx, dy) {
    const k = this.SENS * S.camera.sensitivity;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k * (S.camera.invertY ? -1 : 1), -this.PITCH_MAX, this.PITCH_MAX);
  },
  snap(p) {
    this.pivot.x = p.pos.x; this.pivot.y = p.pos.y + PC.HEIGHT + this.PIVOT_UP; this.pivot.z = p.pos.z;
    this.yaw = p.yaw; this.pitch = -0.2; this.curDist = S.camera.distance;
  },
  // Light smoothing on the vertical axis only, so jumps don't jerk the view; rp is the interpolated position.
  // base is the top of the head: the pivot is kept in open space between it and where the smoothing wants it.
  follow(p, realDt) {
    const r = p.rp || p.pos;
    this.pivot.x = r.x; this.pivot.z = r.z;
    this.pivot.y = damp(this.pivot.y, r.y + PC.HEIGHT + this.PIVOT_UP, 12, realDt);
    this.base = { x: r.x, y: r.y + Math.max(0.5, p.h - 0.3), z: r.z };
  },
  // the title screen's slow orbit around a point
  orbit(c, realTime) {
    this.base = null;
    this.pivot.x = c.x; this.pivot.y = c.y + PC.HEIGHT + this.PIVOT_UP; this.pivot.z = c.z;
    this.yaw = realTime * 0.12; this.pitch = -0.3;
  },
  update(realDt, distance = S.camera.distance, fovKick = false) {
    if (this.base) {
      const b = this.base, dy = this.pivot.y - b.y, up = Math.abs(dy);
      if (up > 0.01) {
        const h = World.raycast(b, { x: 0, y: Math.sign(dy), z: 0 }, up, this.RADIUS);
        if (h) this.pivot.y = b.y + Math.sign(dy) * Math.max(0, h.t - 0.02);
      }
    }
    const cp = Math.cos(this.pitch), d = this.dir;
    d.x = -Math.sin(this.yaw) * cp; d.y = Math.sin(this.pitch); d.z = -Math.cos(this.yaw) * cp;
    // move in to a hit at once, ease back out over EASE_OUT once the space clears
    const hit = World.raycast(this.pivot, { x: -d.x, y: -d.y, z: -d.z }, distance, this.RADIUS);
    const allowed = hit ? Math.max(0, hit.t - 0.02) : distance;
    this.curDist = Math.min(approach(this.curDist, distance, (distance / this.EASE_OUT) * realDt), allowed);
    const p = this.pos;
    p.x = this.pivot.x - d.x * this.curDist; p.y = this.pivot.y - d.y * this.curDist; p.z = this.pivot.z - d.z * this.curDist;
    // shake is small rotations, never a jolt of the position, and no roll
    const cam = Game.cam;
    cam.trauma = Math.max(0, cam.trauma - realDt * 1.7);
    const s = cam.trauma * cam.trauma * 0.035 * S.visuals.shake, tt = Game.realTime * 60;
    const sy = s * (Math.sin(tt * 1.7) * 0.6 + Math.sin(tt * 3.1) * 0.4), sp = s * (Math.cos(tt * 2.3) * 0.6 + Math.sin(tt * 2.9) * 0.4);
    const c3 = Gfx.camera;
    c3.position.set(p.x, p.y, p.z);
    c3.rotation.set(this.pitch + sp, this.yaw + sy, 0);
    // a wider view on dashes and drawn slashes sells the speed (a comfort setting)
    this.fov = damp(this.fov, Gfx.FOV + (fovKick && S.camera.fovKick ? 8 : 0), fovKick ? 18 : 6, realDt);
    if (Math.abs(c3.fov - this.fov) > 0.01) { c3.fov = this.fov; c3.updateProjectionMatrix(); }
    Sound.setListener(p, d);
    this.updateAim();
  },
  // The crosshair ray from the camera; anything nearer than the player is ignored.
  updateAim() {
    const d = this.dir, t0 = this.curDist;
    const o = { x: this.pos.x + d.x * t0, y: this.pos.y + d.y * t0, z: this.pos.z + d.z * t0 };
    let best = this.AIM_FAR, target = null;
    const hit = World.raycast(o, d, best);
    if (hit) best = hit.t;
    for (const e of Game.enemies) {
      if (e.dead || e.spawning) continue;
      const b = { min: { x: e.pos.x - e.r, y: e.pos.y, z: e.pos.z - e.r }, max: { x: e.pos.x + e.r, y: e.pos.y + e.h, z: e.pos.z + e.r } };
      const h = rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, best, [b]);
      if (h) { best = h.t; target = e; }
    }
    this.aim = { x: o.x + d.x * best, y: o.y + d.y * best, z: o.z + d.z * best };
    this.aimEnemy = target;
  },
  // true when a point sits more than OFFVIEW from where the camera looks, on the ground plane
  offView(p) {
    const a = yawOf(p.x - this.pos.x, p.z - this.pos.z);
    return Math.abs(angDiff(this.yaw, a)) > this.OFFVIEW;
  },
};
