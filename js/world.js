'use strict';
// The arena as a list of axis-aligned boxes: collision, raycasts, baked light and street navigation,
// plus the Arena points the Director spawns from. Bodies are boxes too (HL1-style hulls).

const World = {
  def: null, boxes: [], CELL: 8, cells: null, gx0: 0, gz0: 0, gw: 0, gd: 0, stamp: 0,
  STEP_SUB: 0.25, EPS: 1e-4,

  build(def) {
    this.def = def;
    this.boxes = def.boxes;
    // uniform grid on the ground plane so queries only test nearby boxes
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const b of this.boxes) { x0 = Math.min(x0, b.min.x); z0 = Math.min(z0, b.min.z); x1 = Math.max(x1, b.max.x); z1 = Math.max(z1, b.max.z); }
    const C = this.CELL;
    this.gx0 = Math.floor(x0 / C); this.gz0 = Math.floor(z0 / C);
    this.gw = Math.floor(x1 / C) - this.gx0 + 1; this.gd = Math.floor(z1 / C) - this.gz0 + 1;
    this.cells = [];
    for (let i = 0; i < this.gw * this.gd; i++) this.cells.push([]);
    for (const b of this.boxes) {
      b._s = 0;
      for (let cz = Math.floor(b.min.z / C); cz <= Math.floor(b.max.z / C); cz++) {
        for (let cx = Math.floor(b.min.x / C); cx <= Math.floor(b.max.x / C); cx++) this.cells[(cz - this.gz0) * this.gw + (cx - this.gx0)].push(b);
      }
    }
    for (const l of def.lights) l.lin = hexLinear(l.color);
    Nav.build();
  },
  // boxes whose footprint overlaps the rectangle, each once
  near(x0, z0, x1, z1) {
    const C = this.CELL, out = [], s = ++this.stamp;
    const ax = clamp(Math.floor(Math.min(x0, x1) / C) - this.gx0, 0, this.gw - 1), bx = clamp(Math.floor(Math.max(x0, x1) / C) - this.gx0, 0, this.gw - 1);
    const az = clamp(Math.floor(Math.min(z0, z1) / C) - this.gz0, 0, this.gd - 1), bz = clamp(Math.floor(Math.max(z0, z1) / C) - this.gz0, 0, this.gd - 1);
    for (let cz = az; cz <= bz; cz++) {
      for (let cx = ax; cx <= bx; cx++) {
        for (const b of this.cells[cz * this.gw + cx]) if (b._s !== s) { b._s = s; out.push(b); }
      }
    }
    return out;
  },
  // pad > 0 sweeps a sphere of that radius (boxes grown by pad, so corners are slightly generous)
  raycast(o, d, maxT, pad = 0) {
    const ex = d.x * maxT, ez = d.z * maxT, p = pad + 0.01;
    return rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, maxT, this.near(o.x - p, o.z - p, o.x + ex + p, o.z + ez + p), pad);
  },
  pointSolid(x, y, z, pad = 0) {
    for (const b of this.near(x - pad, z - pad, x + pad, z + pad)) if (pointInBox(x, y, z, b, pad)) return true;
    return false;
  },
  // first box overlapping a body hull with feet at (x, y, z), half-width r and height h
  overlap(x, y, z, r, h) {
    const E = this.EPS;
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (b.max.x > x - r + E && b.min.x < x + r - E && b.max.z > z - r + E && b.min.z < z + r - E && b.max.y > y + E && b.min.y < y + h - E) return b;
    }
    return null;
  },
  boxFree(x, y, z, r, h) { return !this.overlap(x, y, z, r, h); },
  // top of the highest box under (x, z) at or below fromY
  groundAt(x, z, fromY) {
    let best = -Infinity;
    for (const b of this.near(x, z, x, z)) {
      if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
      if (b.max.y <= fromY + 1e-6 && b.max.y > best) best = b.max.y;
    }
    return best;
  },
  standing(b) {
    const E = this.EPS, p = b.pos, r = b.r;
    for (const s of this.near(p.x - r, p.z - r, p.x + r, p.z + r)) {
      if (Math.abs(s.max.y - p.y) < 0.05 && s.max.x > p.x - r + E && s.min.x < p.x + r - E && s.max.z > p.z - r + E && s.min.z < p.z + r - E) return true;
    }
    return false;
  },

  // ---------- body physics: the 2D moveBody on three axes ----------
  // b: { pos, vel, r, h, onGround, col }. opt.step lets a grounded body walk up lips (cars, kerbs).
  moveBody(b, dt, opt = {}) {
    const c = b.col || (b.col = {});
    c.ground = false; c.ceil = false; c.wall = false; c.wallX = 0; c.wallZ = 0; c.wallBox = null; c.landed = null;
    const p = b.pos, v = b.vel, r = b.r, E = this.EPS;
    for (const ax of ['x', 'z']) {
      const d = v[ax] * dt;
      if (d === 0) continue;
      const steps = Math.max(1, Math.ceil(Math.abs(d) / this.STEP_SUB)), s = d / steps;
      for (let i = 0; i < steps; i++) {
        p[ax] += s;
        let hit = this.overlap(p.x, p.y, p.z, r, b.h);
        if (hit && opt.step && b.onGround && hit.max.y > p.y && hit.max.y - p.y <= opt.step && this.boxFree(p.x, hit.max.y, p.z, r, b.h)) {
          p.y = hit.max.y;
          hit = null;
        }
        if (hit) {
          p[ax] = s > 0 ? hit.min[ax] - r - E : hit.max[ax] + r + E;
          v[ax] = 0;
          c.wall = true; c.wallBox = hit;
          if (ax === 'x') c.wallX = s > 0 ? -1 : 1; else c.wallZ = s > 0 ? -1 : 1;
          break;
        }
      }
    }
    const dy = v.y * dt;
    if (dy !== 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / this.STEP_SUB)), s = dy / steps;
      for (let i = 0; i < steps; i++) {
        p.y += s;
        const hit = this.overlap(p.x, p.y, p.z, r, b.h);
        if (hit) {
          if (s < 0) { p.y = hit.max.y; c.ground = true; c.landed = hit; } else { p.y = hit.min.y - b.h - E; c.ceil = true; }
          v.y = 0;
          break;
        }
      }
    }
    if (!c.ground && v.y <= 0) c.ground = this.standing(b);
    b.onGround = c.ground;
    return c;
  },

  // ---------- light ----------
  // Light reaching a point from the static lamps, neons and fires, with shadow rays against the boxes.
  // With a normal it's what a surface facing that way receives (the bake); without, an all-round
  // sample for a character standing there. Returns linear RGB.
  lightAt(x, y, z, nx, ny, nz, out = [0, 0, 0]) {
    const D = this.def, A = D.ambient, K = D.sky;
    const up = nx === undefined ? 0.6 : 0.5 + 0.5 * ny;
    out[0] = A[0] + K[0] * up; out[1] = A[1] + K[1] * up; out[2] = A[2] + K[2] * up;
    const ox = nx === undefined ? x : x + nx * 0.05, oy = ny === undefined ? y : y + ny * 0.05, oz = nz === undefined ? z : z + nz * 0.05;
    for (const L of D.lights) {
      const dx = L.x - ox, dy = L.y - oy, dz = L.z - oz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.range * L.range) continue;
      const d = Math.sqrt(d2) || 1e-3;
      let ndl = 0.65;
      if (nx !== undefined) { ndl = (nx * dx + ny * dy + nz * dz) / d; if (ndl <= 0) continue; }
      if (d > 0.3 && this.raycast({ x: ox, y: oy, z: oz }, { x: dx / d, y: dy / d, z: dz / d }, d - 0.25)) continue;
      const f = 1 - d / L.range, att = (f * f) / (1 + d * d * 0.02);
      const k = L.intensity * ndl * att;
      out[0] += L.lin[0] * k; out[1] += L.lin[1] * k; out[2] += L.lin[2] * k;
    }
    return out;
  },
};

// Street navigation: a 0.5 m grid on the street layer and a breadth-first flow field toward the
// player, recomputed only when the player changes cell. Roofs and jump links come in Phase 3.
const Nav = {
  CELL: 0.5, x0: 0, z0: 0, w: 0, d: 0, walk: null, dist: null, queue: null, target: -1,

  build() {
    const D = World.def, B = D.bounds, C = this.CELL;
    this.x0 = B.minX; this.z0 = B.minZ;
    this.w = Math.ceil((B.maxX - B.minX) / C); this.d = Math.ceil((B.maxZ - B.minZ) / C);
    const n = this.w * this.d;
    this.walk = new Uint8Array(n); this.dist = new Int32Array(n).fill(-1); this.queue = new Int32Array(n); this.target = -1;
    for (let j = 0; j < this.d; j++) {
      for (let i = 0; i < this.w; i++) {
        const x = this.x0 + (i + 0.5) * C, z = this.z0 + (j + 0.5) * C;
        this.walk[j * this.w + i] = World.groundAt(x, z, D.groundY + 0.01) === D.groundY && World.boxFree(x, D.groundY, z, 0.4, 1.5) ? 1 : 0;
      }
    }
  },
  cellOf(x, z) {
    const i = Math.floor((x - this.x0) / this.CELL), j = Math.floor((z - this.z0) / this.CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.d) return -1;
    return j * this.w + i;
  },
  // the walkable cell nearest (x, z), searched in growing squares
  nearestWalk(x, z) {
    const i0 = clamp(Math.floor((x - this.x0) / this.CELL), 0, this.w - 1), j0 = clamp(Math.floor((z - this.z0) / this.CELL), 0, this.d - 1);
    for (let rad = 0; rad < 40; rad++) {
      for (let j = j0 - rad; j <= j0 + rad; j++) {
        for (let i = i0 - rad; i <= i0 + rad; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rad || i < 0 || j < 0 || i >= this.w || j >= this.d) continue;
          if (this.walk[j * this.w + i]) return j * this.w + i;
        }
      }
    }
    return -1;
  },
  update(x, z) {
    const t = this.nearestWalk(x, z);
    if (t === this.target || t < 0) return;
    this.target = t;
    const W = this.w, D = this.d, dist = this.dist, q = this.queue, walk = this.walk;
    dist.fill(-1);
    let head = 0, tail = 0;
    dist[t] = 0; q[tail++] = t;
    while (head < tail) {
      const c = q[head++], ci = c % W, cj = (c / W) | 0, nd = dist[c] + 1;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= D) continue;
          const k = j * W + i;
          if (!walk[k] || dist[k] >= 0) continue;
          // no cutting corners past a blocked cell
          if (di && dj && (!walk[cj * W + i] || !walk[j * W + ci])) continue;
          dist[k] = nd; q[tail++] = k;
        }
      }
    }
  },
  // unit direction downhill from (x, z) toward the target, or null off the field
  dir(x, z) {
    const c = this.cellOf(x, z);
    if (c < 0 || this.dist[c] < 0) return null;
    const W = this.w, ci = c % W, cj = (c / W) | 0;
    let best = this.dist[c], bi = ci, bj = cj;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.d) continue;
        const v = this.dist[j * W + i];
        if (v >= 0 && v < best) { best = v; bi = i; bj = j; }
      }
    }
    if (bi === ci && bj === cj) return null;
    const tx = this.x0 + (bi + 0.5) * this.CELL - x, tz = this.z0 + (bj + 0.5) * this.CELL - z, l = Math.hypot(tx, tz) || 1;
    return { x: tx / l, z: tz / l };
  },
};

// What the Director, props and training need from a level, so waves.js never reads level geometry.
const Arena = {
  bounds() { return World.def.bounds; },
  center() { const b = World.def.bounds; return { x: (b.minX + b.maxX) / 2, y: World.def.groundY, z: (b.minZ + b.maxZ) / 2 }; },
  spawnPoints(kind) { return World.def.spawn[kind] || []; },
  perches() { return World.def.perches; },
  barrelSpots() { return World.def.barrelSpots; },
  playerStart() { return World.def.playerStart; },
  // nearest street-level point to (x, z) where a body of half-width r fits, searched in rings 0.5 m apart
  freeGroundAt(x, z, r) {
    const g = World.def.groundY;
    for (let ring = 0; ring <= 24; ring++) {
      const n = ring ? ring * 8 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, px = x + Math.cos(a) * ring * 0.5, pz = z + Math.sin(a) * ring * 0.5;
        if (World.groundAt(px, pz, g + 0.01) === g && World.boxFree(px, g, pz, r, PC.HEIGHT)) return { x: px, y: g, z: pz };
      }
    }
    return { x, y: g, z };
  },
};

// The 2D street converted with to3(): x runs along the street, heights are the 2D heights above the
// street line, and the street gets 14 m of depth (z -7 to 7). The 2D buildings become solid blocks
// behind the street with walkable roofs; a row of facades too tall to climb closes the front.
const STREET = (() => {
  const G = GROUND_2D, H = (y) => (G - y) * PX, X = (x) => x * PX;
  const boxes = [];
  const B = (x0, y0, z0, x1, y1, z1, style, o = {}) => { const b = Object.assign({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, style }, o); boxes.push(b); return b; };
  const L = X(40), R = X(2360), BACK = -7, FRONT = 7, TALL = 36;
  // street, boundary walls, the wall behind the back row, the front facades
  B(0, -1, -16, X(2400), 0, 11, 'asphalt', { kind: 'ground' });
  B(L - 2, 0, -16, L, TALL, 11, 'concrete', { kind: 'bound' });
  B(R, 0, -16, R + 2, TALL, 11, 'brick', { kind: 'bound' });
  B(L, 0, -17, R, TALL, -15, 'concrete', { kind: 'bound' });
  const fronts = ['brick', 'concrete', 'panel', 'brick2', 'shop', 'concrete', 'panel', 'brick'];
  for (let i = 0; i < fronts.length; i++) {
    const a = L + ((R - L) * i) / fronts.length, b = L + ((R - L) * (i + 1)) / fronts.length;
    B(a, 0, FRONT, b, 32 + (i % 3) * 2, FRONT + 3, fronts[i], { kind: 'bound', top: 'roof' });
  }
  // the 2D buildings: (x, top, w, style)
  for (const [x, top, w, style] of [[110, 335, 140, 'shop'], [380, 205, 160, 'brick'], [860, 335, 120, 'shop2'], [1130, 175, 180, 'panel'], [1580, 255, 140, 'brick2'], [1960, 205, 160, 'concrete']]) {
    B(X(x), 0, -15, X(x + w), H(top), BACK, style, { kind: 'building', top: 'roof' });
  }
  // wrecked cars across the street: body and roof, stepped over
  for (const [cx, z] of [[300, 2], [1400, -4], [1870, 0.5]]) {
    B(X(cx), 0, z, X(cx + 38), H(G - 10), z + 1.8, 'car', { kind: 'car' });
    B(X(cx + 8), H(G - 10), z + 0.15, X(cx + 30), H(G - 17), z + 1.65, 'car', { kind: 'car' });
  }
  // platforms are solid slabs 4 px (0.36 m) thick; mantling gets you onto them
  const T = 4 * PX;
  const P = (x, y, w, kind, z0, z1) => B(X(x), H(y) - T, z0, X(x + w), H(y), z1, kind === 'balcony' || kind === 'sign' ? 'slab' : 'metal', { kind, plat: true });
  for (const [x, y, w] of [[40, 335, 60], [40, 270, 56], [40, 205, 52]]) P(x, y, w, 'fire', -6, -1);
  for (const [x, y, w] of [[2300, 335, 60], [2304, 270, 56], [2308, 205, 52]]) P(x, y, w, 'fire', -6, -1);
  for (const [x, y, w] of [[340, 335, 40], [540, 270, 46], [540, 335, 40], [1090, 215, 40], [1310, 240, 46], [1310, 310, 40], [1540, 325, 40], [1920, 335, 40], [2120, 270, 46]]) P(x, y, w, 'balcony', -8.5, -5.5);
  for (const [x, y, w] of [[255, 270, 60], [690, 250, 90], [1450, 225, 80], [1790, 270, 90], [2190, 300, 70]]) P(x, y, w, 'girder', BACK, FRONT);
  P(620, 320, 220, 'overpass', BACK, FRONT);
  for (const [x, y, w] of [[990, 335, 70], [1040, 270, 60], [1780, 335, 100]]) P(x, y, w, 'scaffold', -7, -4);
  P(1400, 300, 140, 'sign', -7.5, -5.5);

  // sniper perches: ledges high enough to need a tether, low enough to see the street (the 2D rule)
  const perches = boxes.filter((b) => b.plat && b.max.y >= H(300) && b.max.y <= H(220) && b.max.x - b.min.x >= X(40))
    .map((b) => ({ x: (b.min.x + b.max.x) / 2, y: b.max.y, z: (b.min.z + b.max.z) / 2 }));
  const zs = [-4, 3, -2, 4, 0, -3, 2, -5, 1, 5, -1, 3];
  const ground = [70, 270, 470, 700, 900, 1060, 1250, 1450, 1650, 1850, 2050, 2280].map((x, i) => ({ x: X(x), y: 0, z: zs[i] }));
  const high = [[180, 335, -11], [460, 205, -11], [730, 320, 0], [920, 335, -11], [1220, 175, -11], [1470, 300, -6.5], [1650, 255, -11], [2040, 205, -11], [735, 250, 0], [1490, 225, 0], [1830, 270, 0]]
    .map(([x, y, z]) => ({ x: X(x), y: H(y), z }));
  // the 2D barrel spots: five on the street, one on the overpass, one on a roof
  const barrelSpots = [[240, G, -3], [700, 320, 0], [1020, G, 4], [1480, G, 2], [1990, G, -4], [1250, 175, -11], [2230, G, 3]]
    .map(([x, y, z]) => ({ x: X(x), y: H(y), z }));

  // static lights for the bake, and the glowing shapes that show where they come from
  const lights = [], emitters = [];
  for (const x of [330, 760, 1240, 1600, 2010, 2290]) {
    emitters.push({ min: { x: X(x) - 0.1, y: 0, z: -6.4 }, max: { x: X(x) + 0.1, y: 5.6, z: -6.2 }, color: '#26222c' });
    emitters.push({ min: { x: X(x) - 0.45, y: 5.45, z: -6.6 }, max: { x: X(x) + 0.45, y: 5.65, z: -5.6 }, color: '#ffd8a0', glow: true });
    lights.push({ x: X(x), y: 5.2, z: -6.0, color: '#ffb060', intensity: 2.4, range: 17 });
  }
  for (const [x, top, z] of [[140, G, 4.5], [940, G, 5], [1700, G, 4], [1200, 175, -11], [2160, G, 5]]) {
    const y = H(top);
    emitters.push({ min: { x: X(x) - 0.35, y, z: z - 0.35 }, max: { x: X(x) + 0.35, y: y + 0.9, z: z + 0.35 }, color: '#3a2a26' });
    emitters.push({ min: { x: X(x) - 0.3, y: y + 0.9, z: z - 0.3 }, max: { x: X(x) + 0.3, y: y + 1.05, z: z + 0.3 }, color: '#ffb040', glow: true, fire: true });
    lights.push({ x: X(x), y: y + 1.3, z, color: '#ff7a2a', intensity: 2.2, range: 12 });
  }
  for (const [x, y, text, color, vertical] of [[527, 222, 'HOTEL', '#ff3ad0', true], [1150, 188, 'RAMEN', '#3af0ff'], [122, 344, '24H', '#ffd03a'], [1600, 266, 'BAR', '#7dff5a'], [872, 344, 'OPEN', '#ff5a5a']]) {
    const w = vertical ? 0.5 : text.length * 0.55, h = vertical ? text.length * 0.6 : 0.6, cy = H(y);
    emitters.push({ min: { x: X(x) - w / 2, y: cy - h / 2, z: BACK }, max: { x: X(x) + w / 2, y: cy + h / 2, z: BACK + 0.12 }, color, glow: true });
    lights.push({ x: X(x), y: cy, z: BACK + 0.8, color, intensity: 1.8, range: 11 });
  }
  return {
    boxes, groundY: 0, emitters, lights,
    ambient: [0.022, 0.018, 0.032], sky: [0.05, 0.04, 0.075],
    bounds: { minX: L, maxX: R, minZ: -15, maxZ: FRONT },
    playerStart: { x: X(1200), y: 0, z: 0, yaw: -Math.PI / 2 },
    spawn: { ground, high }, perches, barrelSpots,
  };
})();
