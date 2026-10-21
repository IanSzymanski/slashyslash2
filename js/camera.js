'use strict';
// Third-person orbit camera in the Risk of Rain 2 style: behind and above the player, turned directly by the mouse.
// Phase 0 pulls in along a ray. Phase 1 swaps in the sphere sweep, character fading and the aim ray.

const Camera = {
  yaw: 0, pitch: -0.2, curDist: 5,
  pivot: { x: 0, y: 2.3, z: 0 }, pos: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 },
  PIVOT_UP: 0.5, PITCH_MAX: (80 * Math.PI) / 180, RADIUS: 0.25, EASE_OUT: 0.3, SENS: 0.0022,

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
  // light smoothing on the vertical axis only, so jumps don't jerk the view
  follow(p, realDt) {
    this.pivot.x = p.pos.x; this.pivot.z = p.pos.z;
    this.pivot.y = damp(this.pivot.y, p.pos.y + PC.HEIGHT + this.PIVOT_UP, 12, realDt);
  },
  // the title screen's slow orbit around a point
  orbit(c, realTime) {
    this.pivot.x = c.x; this.pivot.y = c.y + PC.HEIGHT + this.PIVOT_UP; this.pivot.z = c.z;
    this.yaw = realTime * 0.12; this.pitch = -0.3;
  },
  update(realDt, distance = S.camera.distance) {
    const cp = Math.cos(this.pitch), d = this.dir;
    d.x = -Math.sin(this.yaw) * cp; d.y = Math.sin(this.pitch); d.z = -Math.cos(this.yaw) * cp;
    // move in to a hit at once, ease back out once the space clears
    const hit = World.raycast(this.pivot, { x: -d.x, y: -d.y, z: -d.z }, distance + this.RADIUS);
    const allowed = hit ? Math.max(0, hit.t - this.RADIUS) : distance;
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
    Sound.setListener(p, d);
  },
};
