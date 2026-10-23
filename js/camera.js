'use strict';
// Third-person orbit camera in the Risk of Rain 2 style: behind and above the player, turned directly by the mouse.
// A 0.25 m sphere swept from the pivot keeps it out of walls; the aim ray through the crosshair sets
// where slashes, the tether and returned bolts go. The scroll wheel zooms it; all the way in is first person,
// from the eyes, with the body turned to the view.

const Camera = {
  yaw: 0, pitch: -0.2, curDist: 5, fov: 62,
  pivot: { x: 0, y: 2.3, z: 0 }, base: null, pos: { x: 0, y: 0, z: 0 }, dir: { x: 0, y: 0, z: -1 }, aim: { x: 0, y: 0, z: -60 }, aimEnemy: null,
  PIVOT_UP: 0.5, PITCH_MAX: (80 * Math.PI) / 180, RADIUS: 0.25, EASE_OUT: 0.3, SENS: 0.0022, AIM_FAR: 60, TRAIL: 26,
  // threats more than this far off the view's centre count as unseen (the wind-up fairness rule)
  OFFVIEW: (75 * Math.PI) / 180,
  // fp: first person (camera distance 0); ZOOM_MIN: closer than this in third person snaps to first person
  fp: false, ZOOM_MIN: 1.2, ZOOM_MAX: 9, cineView: null,

  // the wheel, in notches: in toward first person, out to ZOOM_MAX; saved as the distance setting
  zoom(notches) {
    if (!notches) return;
    let d = S.camera.distance;
    if (d <= 0) { if (notches > 0) d = this.ZOOM_MIN + 0.3; }
    else {
      d = clamp(d + notches * 0.6, 0, this.ZOOM_MAX);
      if (d < this.ZOOM_MIN) d = 0;
    }
    if (d !== S.camera.distance) { S.camera.distance = d; saveSettings(); }
  },

  // mouse deltas in pixels, applied in real time (never slowed by slow motion or frozen by hitstop)
  look(dx, dy) {
    const k = this.SENS * S.camera.sensitivity;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k * (S.camera.invertY ? -1 : 1), -this.PITCH_MAX, this.PITCH_MAX);
  },
  // the pivot rides this far over the feet: the character's standing height (AEGIS stands taller)
  standH(p) { return p && p.M ? p.M.H : PC.HEIGHT; },
  snap(p) {
    this.pivot.x = p.pos.x; this.pivot.y = p.pos.y + this.standH(p) + this.PIVOT_UP; this.pivot.z = p.pos.z;
    this.yaw = p.yaw; this.pitch = -0.2; this.curDist = S.camera.distance;
  },
  // Smoothing on the vertical axis, so jumps don't jerk the view, and a slight trail on the horizontal, so
  // speed reads (about half a metre behind at a sprint, more in a dash). rp is the interpolated position.
  // base is the top of the head: the pivot is kept in open space between it and where the smoothing wants it.
  follow(p, realDt) {
    const r = p.rp || p.pos;
    this.fp = S.camera.distance <= 0;
    if (this.fp) {
      // the model's eyes (render.js keeps their offset from the body as the pose moves the head), easing back
      // over the chest looking down so the body is in view below; what's at the lens is cut away (Gfx.nearCut)
      const e = p.eyeOff, ahead = 0.05 - 0.07 * Math.max(0, -Math.sin(this.pitch));
      this.pivot.x = r.x + (e ? e.x : 0) + fwdX(this.yaw) * ahead; this.pivot.z = r.z + (e ? e.z : 0) + fwdZ(this.yaw) * ahead;
      this.pivot.y = damp(this.pivot.y, r.y + (e ? e.y : p.h - 0.16), 30, realDt);
      this.base = null;
      return;
    }
    this.pivot.x = damp(this.pivot.x, r.x, this.TRAIL, realDt); this.pivot.z = damp(this.pivot.z, r.z, this.TRAIL, realDt);
    if (Math.hypot(this.pivot.x - r.x, this.pivot.z - r.z) > 3) { this.pivot.x = r.x; this.pivot.z = r.z; }
    this.pivot.y = damp(this.pivot.y, r.y + this.standH(p) + this.PIVOT_UP, 12, realDt);
    this.base = { x: r.x, y: r.y + Math.max(0.5, p.h - 0.3), z: r.z };
  },
  // A cutscene's shot: its owner sets Game.cine.shot = { look, yaw, pitch, dist, ease } and the view eases
  // toward it. Returns the distance to pass to update().
  cine(C, realDt) {
    const s = C.shot;
    if (!this.cineView) this.cineView = { yaw: this.yaw, pitch: this.pitch, dist: Math.max(1.5, this.curDist), look: { x: this.pivot.x, y: this.pivot.y, z: this.pivot.z } };
    const V = this.cineView, k = 1 - Math.exp(-realDt * (s.ease || 3));
    V.yaw += angDiff(V.yaw, s.yaw) * k; V.pitch = lerp(V.pitch, s.pitch, k); V.dist = lerp(V.dist, s.dist, k);
    // the focus eases toward the shot's, but never into anything solid (from under the overpass to the rival
    // on top of it, say): blocked, it cuts straight to the shot's focus, or waits where it is
    const L = V.look, nx = lerp(L.x, s.look.x, k), ny = lerp(L.y, s.look.y, k), nz = lerp(L.z, s.look.z, k);
    if (!World.pointSolid(nx, ny, nz, this.RADIUS)) { L.x = nx; L.y = ny; L.z = nz; }
    else if (!World.pointSolid(s.look.x, s.look.y, s.look.z, this.RADIUS)) { L.x = s.look.x; L.y = s.look.y; L.z = s.look.z; }
    this.yaw = V.yaw; this.pitch = V.pitch;
    this.pivot.x = V.look.x; this.pivot.y = V.look.y; this.pivot.z = V.look.z;
    this.base = null; this.fp = false;
    return V.dist;
  },
  // back to the player after a cutscene, turned to face what it showed
  endCine(p, focus) {
    this.cineView = null;
    if (p && focus && focus.pos && !focus.dead) { this.yaw = yawOf(focus.pos.x - p.pos.x, focus.pos.z - p.pos.z); this.pitch = -0.12; }
    if (p) { this.pivot.x = p.pos.x; this.pivot.y = p.pos.y + this.standH(p) + this.PIVOT_UP; this.pivot.z = p.pos.z; }
  },
  // the title screen's slow orbit around a point, looking down at pitch, the pivot lifted by lift
  orbit(c, realTime, pitch = -0.3, lift = 0) {
    this.base = null;
    this.pivot.x = c.x; this.pivot.y = c.y + PC.HEIGHT + this.PIVOT_UP + lift; this.pivot.z = c.z;
    this.yaw = realTime * 0.06; this.pitch = pitch;
  },
  // fovKick: degrees to widen the view by (dashes, drawn slashes, a sprint); true means a dash's 8
  update(realDt, distance = S.camera.distance, fovKick = 0) {
    if (this.base) {
      // sweep from the head to where the smoothing put the pivot, and stop short of anything between
      const b = this.base, dx = this.pivot.x - b.x, dy = this.pivot.y - b.y, dz = this.pivot.z - b.z, L = Math.hypot(dx, dy, dz);
      if (L > 0.01) {
        const h = World.raycast(b, { x: dx / L, y: dy / L, z: dz / L }, L, this.RADIUS);
        if (h) { const k = Math.max(0, h.t - 0.02) / L; this.pivot.x = b.x + dx * k; this.pivot.y = b.y + dy * k; this.pivot.z = b.z + dz * k; }
      }
    }
    // first person's punches and vignettes step here, just before the view uses them
    FPFX.update(realDt);
    const cp = Math.cos(this.pitch), d = this.dir;
    d.x = -Math.sin(this.yaw) * cp; d.y = Math.sin(this.pitch); d.z = -Math.cos(this.yaw) * cp;
    if (this.fp && Game.state === 'playing') this.curDist = 0;
    else {
      // move in to a hit at once, ease back out over EASE_OUT once the space clears
      const hit = World.raycast(this.pivot, { x: -d.x, y: -d.y, z: -d.z }, distance, this.RADIUS);
      const allowed = hit ? Math.max(0, hit.t - 0.02) : distance;
      this.curDist = Math.min(approach(this.curDist, distance, (Math.max(distance, 2) / this.EASE_OUT) * realDt), allowed);
    }
    const p = this.pos;
    p.x = this.pivot.x - d.x * this.curDist; p.y = this.pivot.y - d.y * this.curDist; p.z = this.pivot.z - d.z * this.curDist;
    // shake is small rotations, never a jolt of the position, and no roll
    const cam = Game.cam;
    cam.trauma = Math.max(0, cam.trauma - realDt * 1.7);
    const s = cam.trauma * cam.trauma * 0.035 * S.visuals.shake, tt = Game.realTime * 60;
    const sy = s * (Math.sin(tt * 1.7) * 0.6 + Math.sin(tt * 3.1) * 0.4), sp = s * (Math.cos(tt * 2.3) * 0.6 + Math.sin(tt * 2.9) * 0.4);
    const c3 = Gfx.camera;
    c3.position.set(p.x, p.y, p.z);
    // first person runs a little wider, with bigger kicks, and punches and rolls on its own springs (fpfx.js)
    const fp = this.fp && Game.state === 'playing' && !Game.cineActive();
    c3.rotation.set(this.pitch + sp, this.yaw + sy, fp ? FPFX.roll : 0);
    // a wider view on dashes, drawn slashes and at a sprint sells the speed (a comfort setting)
    const kick = (fovKick === true ? 8 : +fovKick || 0) * (fp ? 1.4 : 1);
    this.fov = damp(this.fov, Gfx.FOV + (fp ? FPFX.BASE_FOV : 0) + (S.camera.fovKick ? kick : 0), kick > 6 ? 18 : 6, realDt);
    const fov = this.fov + (fp ? FPFX.fov : 0);
    if (Math.abs(c3.fov - fov) > 0.01) { c3.fov = fov; c3.updateProjectionMatrix(); }
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
