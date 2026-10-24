'use strict';
// The arena as a list of axis-aligned boxes: collision, raycasts, baked light and navigation, plus the
// Arena points the Director spawns from. Bodies are boxes too (HL1-style hulls). Three arenas: the
// crossroads every mode plays in, the 2D street converted for comparison and testing, and the training hall.

const World = {
  def: null, boxes: [], CELL: 8, cells: null, gx0: 0, gz0: 0, gw: 0, gd: 0, stamp: 0,
  // the Blackout modifier switches the street lamps off; flick scales the flickering lights (render.js sets it)
  blackout: false, flick: { fire: 1, buzz: 1 },
  STEP_SUB: 0.25, EPS: 1e-4,
  // Round colliders, vertical cylinders { x, z, r, y0, y1, on, owner, top }: street lamps, fire barrels,
  // bins and hydrants from the arena (round), and the red barrels, set each tick (dyn). Bodies slide round
  // them; top says whether one can be stood on.
  round: [], dyn: [],

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
    this.round = []; this.dyn = [];
    for (const L of def.lamps || []) this.round.push((L.q = { x: L.x, z: L.z, r: 0.16, y0: L.y0, y1: L.y0 + 5.6, on: true, top: false, lamp: L }));
    for (const q of def.round || []) this.round.push(Object.assign({ on: true, top: true, y1: q.y0 + q.h }, q));
    // perches a sniper can't stand on (inside a wall beside the ledge) are dropped
    if (!def.perchesChecked) { def.perches = def.perches.filter((q) => this.boxFree(q.x, q.y + 0.02, q.z, 0.5, 1.8)); def.perchesChecked = true; }
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
  // of the boxes overlapping a body hull, the highest top (down) or lowest bottom (up) the body came from
  overlapY(x, y, z, r, h, down, fromY) {
    const E = this.EPS;
    let best = null;
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (!(b.max.x > x - r + E && b.min.x < x + r - E && b.max.z > z - r + E && b.min.z < z + r - E && b.max.y > y + E && b.min.y < y + h - E)) continue;
      if (down ? b.max.y <= fromY + E && (!best || b.max.y > best.max.y) : b.min.y >= fromY + h - E && (!best || b.min.y < best.min.y)) best = b;
    }
    return best || this.overlap(x, y, z, r, h);
  },
  boxFree(x, y, z, r, h) { return !this.overlap(x, y, z, r, h) && !this.roundHit(x, y, z, r, h); },
  // the first round collider a body hull at (x, y, z) overlaps (treated as a circle of 0.9 r), skipping skip's own
  roundHit(x, y, z, r, h, skip = null) {
    for (const L of [this.round, this.dyn]) {
      for (const q of L) {
        if (!q.on || q.owner === skip || y >= q.y1 - 0.01 || y + h <= q.y0 + 0.01) continue;
        const R = q.r + r * 0.9, dx = x - q.x, dz = z - q.z;
        if (dx * dx + dz * dz < R * R) return q;
      }
    }
    return null;
  },
  // a round top a body coming down from fromY to y lands on: its middle over the top
  roundLand(b, y, fromY) {
    for (const L of [this.round, this.dyn]) {
      for (const q of L) {
        if (!q.on || !q.top || q.owner === b || fromY < q.y1 - 1e-4 || y > q.y1) continue;
        const R = q.r + b.r * 0.5, dx = b.pos.x - q.x, dz = b.pos.z - q.z;
        if (dx * dx + dz * dz < R * R) return q;
      }
    }
    return null;
  },
  // Pushes a body out of round colliders along the line from the axis, so it slides round a pole instead of
  // stopping on it, and takes away the speed it had into it. Where that would put it in a wall, it goes back.
  pushRound(b, c, x0, z0) {
    const p = b.pos, v = b.vel;
    for (const L of [this.round, this.dyn]) {
      for (const q of L) {
        if (!q.on || q.owner === b || p.y >= q.y1 - 0.01 || p.y + b.h <= q.y0 + 0.01) continue;
        const R = q.r + b.r * 0.9, dx = p.x - q.x, dz = p.z - q.z, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        let ux, uz;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); ux = dx / d; uz = dz / d; }
        else { const l = Math.hypot(x0 - q.x, z0 - q.z); ux = l > 1e-4 ? (x0 - q.x) / l : 1; uz = l > 1e-4 ? (z0 - q.z) / l : 0; }
        const nx = q.x + ux * R, nz = q.z + uz * R;
        if (!this.overlap(nx, p.y, nz, b.r, b.h)) { p.x = nx; p.z = nz; } else { p.x = x0; p.z = z0; }
        const vn = v.x * ux + v.z * uz;
        if (vn < 0) { v.x -= vn * ux; v.z -= vn * uz; }
        c.round = q;
        if (q.owner && q.owner.bump) q.owner.bump(b, -vn, ux, uz);
      }
    }
  },
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
    return !!this.roundLand(b, p.y - 0.05, p.y + 0.05);
  },

  // ---------- body physics: the 2D moveBody on three axes ----------
  // b: { pos, vel, r, h, onGround, col }. opt.step lets a grounded body walk up lips (cars, kerbs).
  moveBody(b, dt, opt = {}) {
    const c = b.col || (b.col = {});
    c.ground = false; c.ceil = false; c.wall = false; c.wallX = 0; c.wallZ = 0; c.wallBox = null; c.landed = null; c.round = null;
    const p = b.pos, v = b.vel, r = b.r, E = this.EPS, x0 = p.x, z0 = p.z;
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
    if (this.round.length || this.dyn.length) this.pushRound(b, c, x0, z0);
    const dy = v.y * dt;
    if (dy !== 0) {
      const steps = Math.max(1, Math.ceil(Math.abs(dy) / this.STEP_SUB)), s = dy / steps;
      for (let i = 0; i < steps; i++) {
        p.y += s;
        let hit = this.overlap(p.x, p.y, p.z, r, b.h);
        if (hit) {
          // a thin slab on the street can be hit together with the street: land on (or bump) the nearer one
          hit = this.overlapY(p.x, p.y, p.z, r, b.h, s < 0, p.y - s);
          if (s < 0) { p.y = hit.max.y; c.ground = true; c.landed = hit; } else { p.y = hit.min.y - b.h - E; c.ceil = true; }
          v.y = 0;
          break;
        }
        const q = s < 0 ? this.roundLand(b, p.y, p.y - s) : null;
        if (q) { p.y = q.y1; c.ground = true; v.y = 0; break; }
      }
    }
    if (!c.ground && v.y <= 0) c.ground = this.standing(b);
    b.onGround = c.ground;
    return c;
  },

  // ---------- light ----------
  // Light reaching a point from the arena's static lights, with shadow rays against the boxes, split by
  // how it varies: out gets the steady lamps plus the ambient and sky light, fire the barrel fires (which
  // flicker), buzz the neon and failing lamps (which drop out now and then). With a normal it's what a
  // surface facing that way receives (the bake); without, an all-round sample for a character standing
  // there. Street lamps give nothing during a Blackout, and the sky dims. Linear RGB.
  lightSplit(x, y, z, nx, ny, nz, out, fire, buzz) {
    const D = this.def, A = D.ambient, K = D.sky, dark = this.blackout;
    const up = nx === undefined ? 0.6 : 0.5 + 0.5 * ny, amb = dark ? 0.6 : 1;
    for (let i = 0; i < 3; i++) { out[i] = (A[i] + K[i] * up) * amb; fire[i] = 0; buzz[i] = 0; }
    const ox = nx === undefined ? x : x + nx * 0.05, oy = ny === undefined ? y : y + ny * 0.05, oz = nz === undefined ? z : z + nz * 0.05;
    for (const L of D.lights) {
      if (L.off || (dark && L.street)) continue;
      const dx = L.x - ox, dy = L.y - oy, dz = L.z - oz, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.range * L.range) continue;
      const d = Math.sqrt(d2) || 1e-3;
      let ndl = 0.65;
      if (nx !== undefined) { ndl = (nx * dx + ny * dy + nz * dz) / d; if (ndl <= 0) continue; }
      if (d > 0.3 && this.raycast({ x: ox, y: oy, z: oz }, { x: dx / d, y: dy / d, z: dz / d }, d - 0.25)) continue;
      const f = 1 - d / L.range, att = (f * f) / (1 + d * d * 0.02);
      const k = L.intensity * ndl * att, to = L.group === 'fire' ? fire : L.group === 'buzz' ? buzz : out;
      to[0] += L.lin[0] * k; to[1] += L.lin[1] * k; to[2] += L.lin[2] * k;
    }
    return out;
  },
  // all of it at once, with the flickering lights at their current strength
  lightAt(x, y, z, nx, ny, nz, out = [0, 0, 0]) {
    const f = this._lf || (this._lf = [0, 0, 0]), b = this._lb || (this._lb = [0, 0, 0]);
    this.lightSplit(x, y, z, nx, ny, nz, out, f, b);
    const F = this.flick.fire, Z = this.flick.buzz;
    for (let i = 0; i < 3; i++) out[i] += f[i] * F + b[i] * Z;
    return out;
  },
};

// Navigation over every walkable surface: the street, roofs, platforms and car tops, each sampled on a
// 0.5 m grid where a body fits. Nodes link to neighbours a body can walk to (steps up to 1 m), and the
// edges of each surface link to surfaces a jump can reach (up to CLIMB above, or across a gap) or a drop
// lands on. A flow field toward the player (Dijkstra over the reversed links) is recomputed when the
// player changes node. Nodes under the player on lower layers are seeded at a cost, so when the player is
// somewhere nothing can climb to, enemies gather below instead of giving up.
const Nav = {
  CELL: 0.5, R: 0.4, H: 1.5, STEP: 1.0, CLIMB: 6.4, JUMP_R: 3.0, DROP_R: 1.6, MAX_COST: 1200,
  WALK: 0, JUMP: 1, DROP: 2,
  W: 0, D: 0, x0: 0, z0: 0, N: 0, nx: null, ny: null, nz: null, nbox: null, colStart: null, isEdge: null,
  eStart: null, eTo: null, eCost: null, eKind: null, eRise: null, eVx: null, eVz: null, rStart: null, rFrom: null, rCost: null,
  dist: null, heapK: null, heapV: null, target: -1, lastT: -1e9, stats: null,

  build() {
    const D = World.def, B = D.bounds, C = this.CELL;
    this.x0 = B.minX; this.z0 = B.minZ;
    const W = (this.W = Math.ceil((B.maxX - B.minX) / C)), DD = (this.D = Math.ceil((B.maxZ - B.minZ) / C));
    // nodes: column centres on a box top where a body fits above it
    const raw = [], seen = new Map();
    World.boxes.forEach((b, bi) => {
      if (b.noNav) return;
      const y = b.max.y;
      const i0 = Math.max(0, Math.ceil((b.min.x - this.x0) / C - 0.5)), i1 = Math.min(W - 1, Math.floor((b.max.x - this.x0) / C - 0.5));
      const j0 = Math.max(0, Math.ceil((b.min.z - this.z0) / C - 0.5)), j1 = Math.min(DD - 1, Math.floor((b.max.z - this.z0) / C - 0.5));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = this.x0 + (i + 0.5) * C, z = this.z0 + (j + 0.5) * C, col = j * W + i;
          if (!World.boxFree(x, y, z, this.R, this.H)) continue;
          const ys = seen.get(col);
          if (ys && ys.some((v) => Math.abs(v - y) < 0.05)) continue;
          if (ys) ys.push(y); else seen.set(col, [y]);
          raw.push(col, y, bi);
        }
      }
    });
    const order = [];
    for (let k = 0; k < raw.length; k += 3) order.push(k);
    order.sort((a, b) => raw[a] - raw[b] || raw[a + 1] - raw[b + 1]);
    const N = (this.N = order.length);
    const nx = (this.nx = new Float32Array(N)), ny = (this.ny = new Float32Array(N)), nz = (this.nz = new Float32Array(N)), nbox = (this.nbox = new Int32Array(N));
    const ncol = new Int32Array(N), cs = (this.colStart = new Int32Array(W * DD + 1));
    for (let k = 0; k < N; k++) {
      const o = order[k], col = raw[o];
      ncol[k] = col; nx[k] = this.x0 + ((col % W) + 0.5) * C; nz[k] = this.z0 + (((col / W) | 0) + 0.5) * C; ny[k] = raw[o + 1]; nbox[k] = raw[o + 2];
      cs[col + 1]++;
    }
    for (let c = 0; c < W * DD; c++) cs[c + 1] += cs[c];
    const find = (i, j, y, tol) => {
      if (i < 0 || j < 0 || i >= W || j >= DD) return -1;
      const c = j * W + i;
      let best = -1, bd = tol;
      for (let k = cs[c]; k < cs[c + 1]; k++) { const d = Math.abs(ny[k] - y); if (d <= bd) { bd = d; best = k; } }
      return best;
    };

    // walking: the 8 neighbouring columns, within a step; diagonals only where both sides are open.
    // A node missing a straight neighbour is on a surface's edge; out is the way off it.
    let cap = N * 8 + 4096, E = 0;
    let from = new Int32Array(cap), to = new Int32Array(cap), cost = new Int32Array(cap), kind = new Uint8Array(cap), vx = new Float32Array(cap), vz = new Float32Array(cap);
    const link = (a, b, c, k, wx = NaN, wz = NaN) => {
      if (E === cap) {
        cap *= 2;
        const grow = (A) => { const n = new A.constructor(cap); n.set(A); return n; };
        from = grow(from); to = grow(to); cost = grow(cost); kind = grow(kind); vx = grow(vx); vz = grow(vz);
      }
      from[E] = a; to[E] = b; cost[E] = c; kind[E] = k; vx[E] = wx; vz[E] = wz; E++;
    };
    const edge = (this.isEdge = new Uint8Array(N)), outX = new Int8Array(N), outZ = new Int8Array(N);
    const nb = new Int32Array(9);
    for (let a = 0; a < N; a++) {
      const i = ncol[a] % W, j = (ncol[a] / W) | 0, y = ny[a];
      for (let dj = -1, q = 0; dj <= 1; dj++) for (let di = -1; di <= 1; di++, q++) nb[q] = di || dj ? find(i + di, j + dj, y, this.STEP) : -1;
      for (let dj = -1, q = 0; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++, q++) {
          if (!di && !dj) continue;
          const b = nb[q];
          if (b < 0) {
            if (!di || !dj) { edge[a] = 1; outX[a] += di; outZ[a] += dj; }
            continue;
          }
          if (di && dj && (nb[4 + di] < 0 || nb[4 + dj * 3] < 0)) continue;
          link(a, b, (di && dj ? 14 : 10) + Math.max(0, Math.round((ny[b] - y) * 4)), this.WALK);
        }
      }
    }
    // jumps and drops from surface edges: per target surface, the nearest node a body can get to.
    // A jump needs open air above its start (or just off the edge, for a platform stacked overhead).
    let jumps = 0, drops = 0;
    const RJ = Math.ceil(this.JUMP_R / C), g0 = D.groundY, cands = [], tried = new Map();
    for (let a = 0; a < N; a++) {
      const i = ncol[a] % W, j = (ncol[a] / W) | 0;
      // every other edge node is enough: its neighbours reach it in one step
      if (!edge[a] || (i + j) & 1) continue;
      const xa = nx[a], ya = ny[a], za = nz[a];
      cands.length = 0;
      for (let jj = Math.max(0, j - RJ); jj <= Math.min(DD - 1, j + RJ); jj++) {
        for (let ii = Math.max(0, i - RJ); ii <= Math.min(W - 1, i + RJ); ii++) {
          const cc = jj * W + ii;
          for (let b = cs[cc]; b < cs[cc + 1]; b++) {
            if (nbox[b] === nbox[a]) continue;
            const r = ny[b] - ya, hd = Math.hypot(nx[b] - xa, nz[b] - za);
            if (hd > this.JUMP_R) continue;
            if ((r > this.STEP && r <= this.CLIMB && edge[b]) || (Math.abs(r) <= this.STEP && hd >= 0.9 && Math.min(ya, ny[b]) > g0 + 0.5 && edge[b])) cands.push(hd, b, this.JUMP);
            else if (r < -this.STEP && hd <= this.DROP_R && !World.pointSolid(nx[b], ya - 0.05, nz[b])) cands.push(hd, b, this.DROP);
          }
        }
      }
      const idx = [];
      for (let q = 0; q < cands.length; q += 3) idx.push(q);
      idx.sort((p, q) => cands[p] - cands[q]);
      tried.clear();
      let n = 0;
      const ol = Math.hypot(outX[a], outZ[a]), ux = ol ? outX[a] / ol : 0, uz = ol ? outZ[a] / ol : 0;
      for (const q of idx) {
        const hd = cands[q], b = cands[q + 1], cat = cands[q + 2], key = nbox[b] * 3 + cat, t = tried.get(key) || 0;
        if (t < 0 || t >= 3 || n >= 6) continue;
        tried.set(key, t + 1);
        const via = this.linkClear(a, b, cat, ux, uz);
        if (!via) continue;
        tried.set(key, -1); n++;
        const r = ny[b] - ya;
        if (cat === this.JUMP) { link(a, b, 25 + Math.round(Math.max(0, r) * 8 + hd * 5), this.JUMP, via[0], via[1]); jumps++; }
        else { link(a, b, 12 + Math.round(-r * 1.5 + hd * 5), this.DROP); drops++; }
      }
    }
    // forward links by node, and reversed for the search toward the player
    this.eStart = new Int32Array(N + 1); this.rStart = new Int32Array(N + 1);
    for (let e = 0; e < E; e++) { this.eStart[from[e] + 1]++; this.rStart[to[e] + 1]++; }
    for (let k = 0; k < N; k++) { this.eStart[k + 1] += this.eStart[k]; this.rStart[k + 1] += this.rStart[k]; }
    this.eTo = new Int32Array(E); this.eCost = new Int32Array(E); this.eKind = new Uint8Array(E); this.eRise = new Float32Array(E);
    this.eVx = new Float32Array(E); this.eVz = new Float32Array(E);
    this.rFrom = new Int32Array(E); this.rCost = new Int32Array(E);
    const fi = this.eStart.slice(0, N), ri = this.rStart.slice(0, N);
    for (let e = 0; e < E; e++) {
      const f = fi[from[e]]++, r = ri[to[e]]++;
      this.eTo[f] = to[e]; this.eCost[f] = cost[e]; this.eKind[f] = kind[e]; this.eRise[f] = ny[to[e]] - ny[from[e]];
      this.eVx[f] = vx[e]; this.eVz[f] = vz[e];
      this.rFrom[r] = from[e]; this.rCost[r] = cost[e];
    }
    this.dist = new Int32Array(N).fill(-1);
    this.heapK = new Int32Array(N + E + 16); this.heapV = new Int32Array(N + E + 16);
    this.target = -1; this.lastT = -1e9;
    this.stats = { nodes: N, links: E, jumps, drops, surfaces: new Set(nbox).size };
  },
  // A jump needs open air above its start up to the landing height, then a clear way across at that
  // height; if a platform overhead blocks the start, it can step off the edge (ux, uz) first. Returns
  // [via x, via z] (NaN for a straight jump), or null. A drop needs a clear way off the edge and open
  // air down to where it lands.
  linkClear(a, b, cat, ux, uz) {
    const xa = this.nx[a], ya = this.ny[a], za = this.nz[a], xb = this.nx[b], yb = this.ny[b], zb = this.nz[b], r = 0.35;
    const across = (x0, z0, x1, z1, y) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 0.25));
      for (let s = 1; s <= n; s++) if (!World.boxFree(lerp(x0, x1, s / n), y, lerp(z0, z1, s / n), r, 1.5)) return false;
      return true;
    };
    if (cat === this.DROP) return across(xa, za, xb, zb, ya + 0.08) && World.boxFree(xb, yb + 0.05, zb, r, ya - yb + 1.55) ? [NaN, NaN] : null;
    const top = Math.max(ya, yb), rise = top - ya + 1.6;
    if (World.boxFree(xa, ya + 0.05, za, r, rise) && across(xa, za, xb, zb, top + 0.08)) return [NaN, NaN];
    if (!ux && !uz) return null;
    for (const d of [0.8, 1.3]) {
      const wx = xa + ux * d, wz = za + uz * d;
      if (across(xa, za, wx, wz, ya + 0.08) && World.boxFree(wx, ya + 0.05, wz, r, rise) && across(wx, wz, xb, zb, top + 0.08)) return [wx, wz];
    }
    return null;
  },
  // the node in a column nearest height y, within tol
  colFind(c, y, tol) {
    let best = -1, bd = tol;
    for (let k = this.colStart[c]; k < this.colStart[c + 1]; k++) {
      const d = Math.abs(this.ny[k] - y);
      if (d <= bd) { bd = d; best = k; }
    }
    return best;
  },
  // The node a body stands on, searched outward up to two cells (bodies brush walls a node can't).
  // air: the body may be in the air; use the surface under it.
  bodyNode(x, y, z, air) {
    if (air) { const g = World.groundAt(x, z, y + 0.05); if (g === -Infinity) return -1; y = g; }
    const C = this.CELL, i0 = Math.floor((x - this.x0) / C), j0 = Math.floor((z - this.z0) / C);
    let best = -1, bd = Infinity;
    for (let rad = 0; rad <= 2 && best < 0; rad++) {
      for (let j = j0 - rad; j <= j0 + rad; j++) {
        for (let i = i0 - rad; i <= i0 + rad; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rad || i < 0 || j < 0 || i >= this.W || j >= this.D) continue;
          const k = this.colFind(j * this.W + i, y, 0.6);
          if (k < 0) continue;
          const d = (this.nx[k] - x) ** 2 + (this.nz[k] - z) ** 2;
          if (d < bd) { bd = d; best = k; }
        }
      }
    }
    return best;
  },
  // p: the player's position. Throttled to ten solves a second unless the player changes layer.
  update(p, time) {
    const t = this.bodyNode(p.x, p.y, p.z, true);
    if (t < 0 || t === this.target) return;
    if (time - this.lastT < 0.1 && this.target >= 0 && Math.abs(this.ny[t] - this.ny[this.target]) < 0.5) return;
    this.target = t; this.lastT = time;
    this.solve(t);
  },
  // seeds: also start from lower nodes near the player (off for reachability checks)
  solve(t, seeds = true) {
    const dist = this.dist, K = this.heapK, V = this.heapV;
    dist.fill(-1);
    let n = 0;
    const push = (k, v) => {
      let i = n++;
      while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
      K[i] = k; V[i] = v;
    };
    const pop = () => {
      const k = K[--n], v = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= k) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = k; V[i] = v;
    };
    // seeds: the player's node, and lower nodes within 8 m at a cost for the height and distance
    const C = this.CELL, xt = this.nx[t], yt = this.ny[t], zt = this.nz[t], R = Math.ceil(8 / C);
    const it = Math.round((xt - this.x0) / C - 0.5), jt = Math.round((zt - this.z0) / C - 0.5);
    dist[t] = 0; push(0, t);
    for (let j = jt - R; j <= jt + R && seeds; j++) {
      for (let i = it - R; i <= it + R; i++) {
        if (i < 0 || j < 0 || i >= this.W || j >= this.D) continue;
        const c = j * this.W + i;
        for (let k = this.colStart[c]; k < this.colStart[c + 1]; k++) {
          const dy = yt - this.ny[k];
          if (dy <= this.STEP) continue;
          const v = Math.round(10 * (Math.hypot(this.nx[k] - xt, this.nz[k] - zt) * 4 + dy * 6));
          if (dist[k] < 0 || v < dist[k]) { dist[k] = v; push(v, k); }
        }
      }
    }
    while (n > 0) {
      const d = K[0], u = V[0];
      pop();
      if (d > dist[u]) continue;
      // about 60 m of travel; anything further walks straight at the player until it's in range
      if (d > this.MAX_COST) break;
      for (let e = this.rStart[u]; e < this.rStart[u + 1]; e++) {
        const a = this.rFrom[e], v = d + this.rCost[e];
        if (dist[a] < 0 || v < dist[a]) { dist[a] = v; push(v, a); }
      }
    }
  },
  // The best link out of node a toward the player for a body that can jump `climb` metres, or -1 when
  // a is off the field or already where it should be.
  bestLink(a, climb) {
    let best = -1, bv = this.dist[a];
    for (let e = this.eStart[a]; e < this.eStart[a + 1]; e++) {
      const b = this.eTo[e], db = this.dist[b];
      if (db < 0 || db >= this.dist[a] || (this.eKind[e] === this.JUMP && this.eRise[e] > climb)) continue;
      if (db + this.eCost[e] < bv || best < 0) { bv = db + this.eCost[e]; best = e; }
    }
    return best;
  },
  // Where a body should head next: { x, z } a unit direction on the ground, kind (WALK, JUMP or DROP),
  // and to, the link's far node. Walking looks a few nodes ahead so paths don't zigzag between cells.
  steer(body, climb = this.CLIMB) {
    if (!this.dist) return null;
    const a = this.bodyNode(body.pos.x, body.pos.y, body.pos.z, false);
    if (a < 0 || this.dist[a] < 0) return null;
    const e = this.bestLink(a, climb);
    if (e < 0) return null;
    const kind = this.eKind[e];
    let b = this.eTo[e], aim = b;
    if (kind === this.WALK) {
      for (let s = 0; s < 3; s++) {
        const e2 = this.bestLink(aim, climb);
        if (e2 < 0 || this.eKind[e2] !== this.WALK || Math.abs(this.eRise[e2]) > 0.3) break;
        aim = this.eTo[e2];
      }
    }
    const dx = this.nx[aim] - body.pos.x, dz = this.nz[aim] - body.pos.z, l = Math.hypot(dx, dz) || 1;
    const via = kind === this.JUMP && !isNaN(this.eVx[e]) ? { x: this.eVx[e], z: this.eVz[e] } : null;
    return { x: dx / l, z: dz / l, kind, to: { x: this.nx[b], y: this.ny[b], z: this.nz[b] }, via };
  },
};

// What the Director, props and training need from a level, so waves.js never reads level geometry.
const Arena = {
  id: null,
  // Builds an arena's collision, nav graph, light bake and meshes; returns false if it was already loaded.
  load(id) {
    if (this.id === id) return false;
    const def = ARENAS[id];
    World.blackout = false;
    World.build(def);
    if (typeof Gfx !== 'undefined' && Gfx.renderer) Gfx.buildLevel(def);
    this.id = id;
    if (typeof Props !== 'undefined') Props.reset();
    return true;
  },
  // the Blackout modifier: the street lamps go out (a rebake), and back on when the wave ends
  setBlackout(on) {
    on = !!on;
    if (World.blackout === on || !World.def) return;
    World.blackout = on;
    if (typeof Gfx !== 'undefined' && Gfx.renderer) Gfx.rebake();
  },
  bounds() { return World.def.bounds; },
  center() { const b = World.def.bounds; return { x: (b.minX + b.maxX) / 2, y: World.def.groundY, z: (b.minZ + b.maxZ) / 2 }; },
  spawnPoints(kind) { return World.def.spawn[kind] || []; },
  perches() { return World.def.perches; },
  // points the tether can reach a long way to (the crane)
  anchors() { return (World.def && World.def.anchors) || []; },
  barrelSpots() { return World.def.barrelSpots; },
  playerStart() { return World.def.playerStart; },
  // nearest ground-level point to (x, z) (the street or a kerb-high surface like the plaza) where a body of
  // half-width r fits, searched in rings 0.5 m apart
  freeGroundAt(x, z, r) {
    const g = World.def.groundY;
    for (let ring = 0; ring <= 24; ring++) {
      const n = ring ? ring * 8 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, px = x + Math.cos(a) * ring * 0.5, pz = z + Math.sin(a) * ring * 0.5;
        const t = World.groundAt(px, pz, g + 0.5);
        if (t >= g - 0.01 && World.boxFree(px, t, pz, r, PC.HEIGHT)) return { x: px, y: t, z: pz };
      }
    }
    return { x, y: g, z };
  },
  // at ground level: the street or a kerb-high surface
  isGround(x, z) { const g = World.def.groundY, t = World.groundAt(x, z, g + 0.5); return t >= g - 0.01; },
};

// The 2D street converted with to3() (Phase 1): x runs along the street, heights are the 2D heights above
// the street line, and the street gets 14 m of depth (z -7 to 7). Kept for comparison and the move tests. The 2D buildings become solid blocks
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
  // the boundary walls go on up unseen, so a zip from a high roof can't land on top of one and leave the arena
  for (const b of boxes.filter((b) => b.kind === 'bound')) B(b.min.x, b.max.y, b.min.z, b.max.x, 120, b.max.z, b.style, { kind: 'bound', hidden: true });
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

  // sniper perches: ledges high enough to need a tether, low enough to see the street (the 2D rule). A
  // sniper stands at an edge, so its own ledge doesn't block the shot: the middle of each side, 0.6 m in.
  const perches = [];
  for (const b of boxes.filter((b) => b.plat && b.max.y >= H(300) && b.max.y <= H(220) && b.max.x - b.min.x >= X(40))) {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const [x, z] of [[b.min.x + 0.6, cz], [b.max.x - 0.6, cz], [cx, b.min.z + 0.6], [cx, b.max.z - 0.6]]) perches.push({ x, y: b.max.y, z });
  }
  const zs = [-4, 3, -2, 4, 0, -3, 2, -5, 1, 5, -1, 3];
  const ground = [70, 270, 470, 700, 900, 1060, 1250, 1450, 1650, 1850, 2050, 2280].map((x, i) => ({ x: X(x), y: 0, z: zs[i] }));
  const high = [[180, 335, -11], [460, 205, -11], [730, 320, 0], [920, 335, -11], [1220, 175, -11], [1470, 300, -6.5], [1650, 255, -11], [2040, 205, -11], [735, 250, 0], [1490, 225, 0], [1830, 270, 0]]
    .map(([x, y, z]) => ({ x: X(x), y: H(y), z }));
  // the 2D barrel spots: five on the street, one on the overpass, one on a roof
  const barrelSpots = [[240, G, -3], [700, 320, 0], [1020, G, 4], [1480, G, 2], [1990, G, -4], [1250, 175, -11], [2230, G, 3]]
    .map(([x, y, z]) => ({ x: X(x), y: H(y), z }));

  // static lights for the bake, and the glowing shapes that show where they come from; lamps (props.js
  // cuts them down) and fire barrels collide
  const lights = [], emitters = [], lamps = [], round = [];
  for (const x of [330, 760, 1240, 1600, 2010, 2290]) {
    const buzz = x === 1600, light = { x: X(x), y: 5.2, z: -6.2, color: '#ffb060', intensity: 2.4, range: 17, street: true, group: buzz ? 'buzz' : 'lamp' };
    lights.push(light);
    lamps.push({ x: X(x), z: -6.3, y0: 0, buzz, light });
  }
  for (const [x, top, z] of [[140, G, 4.5], [940, G, 5], [1700, G, 4], [1200, 175, -11], [2160, G, 5]]) {
    const y = H(top);
    round.push({ kind: 'fire', x: X(x), z, y0: y, r: 0.36, h: 1.05 });
    emitters.push({ min: { x: X(x) - 0.35, y, z: z - 0.35 }, max: { x: X(x) + 0.35, y: y + 0.9, z: z + 0.35 }, color: '#3a2a26' });
    emitters.push({ min: { x: X(x) - 0.3, y: y + 0.9, z: z - 0.3 }, max: { x: X(x) + 0.3, y: y + 1.05, z: z + 0.3 }, color: '#ffb040', glow: true, fire: true });
    lights.push({ x: X(x), y: y + 1.3, z, color: '#ff7a2a', intensity: 2.2, range: 12, group: 'fire' });
  }
  for (const [x, y, text, color, vertical] of [[527, 222, 'HOTEL', '#ff3ad0', true], [1150, 188, 'RAMEN', '#3af0ff'], [122, 344, '24H', '#ffd03a'], [1600, 266, 'BAR', '#7dff5a'], [872, 344, 'OPEN', '#ff5a5a']]) {
    const w = vertical ? 0.5 : text.length * 0.55, h = vertical ? text.length * 0.6 : 0.6, cy = H(y);
    emitters.push({ min: { x: X(x) - w / 2, y: cy - h / 2, z: BACK }, max: { x: X(x) + w / 2, y: cy + h / 2, z: BACK + 0.12 }, color, glow: true, buzz: true });
    lights.push({ x: X(x), y: cy, z: BACK + 0.8, color, intensity: 1.8, range: 11, group: 'buzz' });
  }
  for (const x of [600, 1500, 2100]) round.push({ kind: 'bin', x: X(x), z: -6.4, y0: 0, r: 0.34, h: 1.0 });
  // clearance rules (feel-check.js): the street, and the alleys between the back-row blocks
  const row = boxes.filter((b) => b.kind === 'building').sort((a, b) => a.min.x - b.min.x);
  const alleys = [];
  for (let i = 1; i < row.length; i++) alleys.push({ min: { x: row[i - 1].max.x, z: -15 }, max: { x: row[i].min.x, z: BACK } });
  return {
    name: 'The 2D Street', boxes, groundY: 0, emitters, lights, lamps, round,
    ambient: [0.022, 0.018, 0.032], sky: [0.05, 0.04, 0.075],
    bounds: { minX: L, maxX: R, minZ: -15, maxZ: FRONT },
    playerStart: { x: X(1200), y: 0, z: 0, yaw: -Math.PI / 2 },
    spawn: { ground, high }, perches, barrelSpots,
    clearance: { streets: [{ min: { x: L, z: BACK }, max: { x: R, z: FRONT } }], alleys },
    orbit: { dist: 9, pitch: -0.3, lift: 0 },
  };
})();

// The crossroads (Phase 4), about 70 x 70 m: four streets meet at a plaza raised a kerb's height. A block of
// four buildings fills each corner, split by 6 m alleys, with walkable roofs from 6 to 18 m and clutter on
// top. An overpass crosses the east street, girders cross the other three and one alley, and fire escapes
// climb every building taller than an enemy's jump. Container barricades close the street ends against a
// ring of facades too tall to climb. Clearance rules: streets 18 m wide, 5 m under anything you walk
// under, alleys 6 m, no way into a building.
const CROSSROADS = (() => {
  const boxes = [], lights = [], emitters = [], lamps = [], round = [];
  const B = (x0, y0, z0, x1, y1, z1, style, o = {}) => {
    const b = Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, style }, o);
    boxes.push(b);
    return b;
  };
  const E = 35, TALL = 26, R = mulberry32(2026);
  B(-E - 2, -1, -E - 2, E + 2, 0, E + 2, 'asphalt', { kind: 'ground' });
  B(-E - 2, 0, -E - 2, -E, TALL, E + 2, 'concrete', { kind: 'bound', top: 'roof', cell: 2 });
  B(E, 0, -E - 2, E + 2, TALL, E + 2, 'brick', { kind: 'bound', top: 'roof', cell: 2 });
  B(-E, 0, -E - 2, E, TALL, -E, 'panel', { kind: 'bound', top: 'roof', cell: 2 });
  B(-E, 0, E, E, TALL, E + 2, 'brick2', { kind: 'bound', top: 'roof', cell: 2 });
  for (const b of boxes.filter((b) => b.kind === 'bound')) B(b.min.x, b.max.y, b.min.z, b.max.x, 120, b.max.z, b.style, { kind: 'bound', hidden: true });
  B(-10, 0, -10, 10, 0.15, 10, 'slab', { kind: 'plaza' });

  // Each corner block, in |x| |z| from the centre: A on the plaza, B along the east-west street, C along
  // the north-south street, D at the back. Alleys run between them at |x| 20-26 and |z| 20-26.
  const FOOT = { A: [10, 20, 10, 20], B: [26, 35, 9, 20], C: [9, 20, 26, 35], D: [26, 35, 26, 35] };
  // fire escapes: which face (axis and whether it faces toward or away from the centre) and where along it
  const FIRE = { A: ['z', -1, 14, 17], B: ['x', -1, 12, 15], C: ['z', -1, 12, 15], D: ['x', -1, 29, 32] };
  // the south-east block is a construction site instead (below)
  const QUADS = [
    { sx: 1, sz: 1, site: true },
    { sx: -1, sz: 1, h: { A: 7, B: 9, C: 9, D: 14 }, st: { A: 'shop2', B: 'concrete', C: 'brick2', D: 'panel' } },
    { sx: -1, sz: -1, h: { A: 6, B: 9, C: 12, D: 18 }, st: { A: 'shop', B: 'panel', C: 'brick', D: 'brick2' } },
    { sx: 1, sz: -1, h: { A: 7, B: 7, C: 12, D: 15 }, st: { A: 'shop2', B: 'brick2', C: 'concrete', D: 'brick' } },
  ];
  const roofs = [];
  for (const q of QUADS) {
    if (q.site) continue;
    for (const k of ['A', 'B', 'C', 'D']) {
      const [a0, a1, b0, b1] = FOOT[k], h = q.h[k];
      const b = B(q.sx * a0, 0, q.sz * b0, q.sx * a1, h, q.sz * b1, q.st[k], { kind: 'building', top: 'roof' });
      roofs.push(b);
      // clutter on the roof: an air unit, and a water tank on the tall ones
      const cx = (b.min.x + b.max.x) / 2 + (R() - 0.5) * 3, cz = (b.min.z + b.max.z) / 2 + (R() - 0.5) * 3;
      B(cx - 0.7, h, cz - 0.5, cx + 0.7, h + 1.0, cz + 0.5, 'metal', { kind: 'prop' });
      if (h >= 12) { const tx = b.min.x + 1.6, tz = b.max.z - 1.6; B(tx - 1.1, h, tz - 1.1, tx + 1.1, h + 2.4, tz + 1.1, 'metal', { kind: 'prop' }); }
      // fire escapes: platforms 5.4 m apart from 5.5 m up (5 m of headroom between them), until the roof
      // is within an enemy's jump of the top one
      if (h > 6.4) {
        const [ax, , f0, f1] = FIRE[k], tiers = [5.5];
        while (h - tiers[tiers.length - 1] > 6) tiers.push(tiers[tiers.length - 1] + 5.4);
        for (const y of tiers) {
          if (ax === 'x') {
            // the face nearer the centre (dir -1), the platform sticking out 1.6 m from it
            const fx = q.sx > 0 ? b.min.x : b.max.x, out = -q.sx;
            B(fx, y - 0.3, q.sz * f0, fx + out * 1.6, y, q.sz * f1, 'metal', { kind: 'fire', plat: true });
          } else {
            const fz = q.sz > 0 ? b.min.z : b.max.z, out = -q.sz;
            B(q.sx * f0, y - 0.3, fz, q.sx * f1, y, fz + out * 1.6, 'metal', { kind: 'fire', plat: true });
          }
        }
      }
    }
  }
  // the overpass over the east street, level with the 7 m roof on its south side; girders across the others
  B(27, 6.4, -9, 33, 7, 9, 'slab', { kind: 'overpass', plat: true });
  B(-9, 11.6, -31.5, 9, 12, -29, 'metal', { kind: 'girder', plat: true });
  B(-9, 8.6, 29, 9, 9, 31.5, 'metal', { kind: 'girder', plat: true });
  B(-31.5, 8.6, -9, -29, 9, 9, 'metal', { kind: 'girder', plat: true });
  B(20, 6.6, -19, 26, 7, -16.5, 'metal', { kind: 'girder', plat: true });

  // ---------- the construction site, x 9-35, z 9-35 ----------
  // Plywood hoarding along both streets with three gates; a tower crane by the plaza corner whose jib runs out
  // over the east street (tether to it: def.anchors); a three-storey steel frame in the south-west of the
  // block; scaffolding carrying the overpass on into the site and a stack of materials stepping down from it;
  // an excavator, a dirt pile, beams, pipes, bricks, a mixer, site offices, port-a-potties and floodlights.
  const site = (x0, y0, z0, x1, y1, z1, style, o = {}) => B(x0, y0, z0, x1, y1, z1, style, Object.assign({ kind: 'site' }, o));
  const furniture = [];
  for (const [a0, a1] of [[9.3, 16], [21, 27], [33, 35]]) site(a0, 0, 9.3, a1, 2.4, 9.5, 'hoarding', { kind: 'fence' });
  for (const [a0, a1] of [[9.5, 16], [21, 35]]) site(9.3, 0, a0, 9.5, 2.4, a1, 'hoarding', { kind: 'fence' });
  // the tower crane: footing, mast, turntable, cab, the jib north over the street, counter-jib and weights
  const CX = 12.5, CZ = 12.5, JY = 25;
  site(10.8, 0, 10.8, 14.2, 0.5, 14.2, 'slab');
  site(CX - 0.9, 0.5, CZ - 0.9, CX + 0.9, 24, CZ + 0.9, 'crane', { kind: 'crane' });
  site(CX - 1.5, 24, CZ - 1.5, CX + 1.5, JY, CZ + 1.5, 'yellow', { kind: 'crane' });
  site(CX + 1.5, 24, CZ - 0.9, CX + 3.1, 26.2, CZ + 1.1, 'cab', { kind: 'crane' });
  site(CX - 0.3, JY, CZ - 0.3, CX + 0.3, 31, CZ + 0.3, 'crane', { kind: 'crane' });
  site(CX - 0.7, JY, -16, CX + 0.7, JY + 1.2, CZ - 1.5, 'crane', { kind: 'crane', plat: true });
  site(CX - 0.8, JY, CZ + 1.5, CX + 0.8, JY + 1, 22, 'crane', { kind: 'crane', plat: true });
  site(CX - 1.1, 22.6, 19.4, CX + 1.1, JY, 22, 'slab', { kind: 'crane' });
  // the trolley out over the street, its hook, and a bundle of beams hanging from it
  const HZ = -2;
  site(CX - 0.6, JY - 0.5, HZ - 0.6, CX + 0.6, JY, HZ + 0.6, 'yellow', { kind: 'crane' });
  site(CX - 0.4, 11.4, HZ - 0.4, CX + 0.4, 12.4, HZ + 0.4, 'yellow', { kind: 'crane' });
  site(CX - 2, 10.2, HZ - 0.6, CX + 2, 10.8, HZ + 0.6, 'steel', { kind: 'crane', plat: true });
  // pendant lines from the apex to both ends, the hoist rope, the load's slings
  furniture.push({ shape: 'line', a: [CX, 31, CZ], b: [CX, JY + 1.2, -15.5], r: 0.05, color: '#8a8478' }, { shape: 'line', a: [CX, 31, CZ], b: [CX, JY + 1, 21.5], r: 0.05, color: '#8a8478' });
  furniture.push({ shape: 'line', a: [CX, JY - 0.5, HZ], b: [CX, 12.4, HZ], r: 0.03, color: '#6a645c' });
  for (const sx of [-1.4, 1.4]) furniture.push({ shape: 'line', a: [CX, 11.4, HZ], b: [CX + sx, 10.8, HZ], r: 0.03, color: '#6a645c' });
  // the steel frame: columns, floors at 5.4, 10.8 and 16.2 m (5.1 m clear under each), bare beams where the
  // second floor isn't poured yet, rebar out of the top columns
  for (const x of [10, 15, 20]) for (const z of [26.2, 30.5, 34.6]) site(x - 0.2, 0, z - 0.2, x + 0.2, x === 20 ? 10.8 : x === 15 ? 12.2 : 17.6, z + 0.2, 'steel', { kind: 'frame' });
  site(9.8, 5.1, 29.5, 20.2, 5.4, 34.8, 'slab', { kind: 'frame', plat: true });
  site(9.8, 5.1, 26, 16, 5.4, 29.5, 'slab', { kind: 'frame', plat: true });
  site(9.8, 10.5, 26, 15.6, 10.8, 34.8, 'slab', { kind: 'frame', plat: true });
  site(9.8, 15.9, 30.2, 13.2, 16.2, 34.8, 'slab', { kind: 'frame', plat: true });
  for (const [x0, z0, x1, z1] of [[15.6, 26, 20.2, 26.3], [15.6, 34.5, 20.2, 34.8], [19.9, 26.3, 20.2, 34.5]]) site(x0, 10.5, z0, x1, 10.8, z1, 'steel', { kind: 'frame' });
  for (const z of [30.6, 34.4]) for (const x of [10.1, 12.9]) furniture.push({ shape: 'line', a: [x, 16.2, z], b: [x + 0.1, 17.6, z], r: 0.025, color: '#7a4a30' });
  // scaffolding carrying the overpass into the site, and a stack of timber and blocks stepping down from it
  site(27, 6.7, 9, 33, 7, 12.4, 'metal', { kind: 'scaffold', plat: true });
  for (const [x, z] of [[27.1, 9.7], [32.9, 9.7], [27.1, 12.3], [32.9, 12.3]]) round.push({ kind: 'pole', x, z, y0: 0, r: 0.06, h: 6.7 });
  site(27, 0, 12.4, 33, 3.6, 15.6, 'timber', { kind: 'stack' });
  // the excavator: tracks, body, cab, the boom reaching out to its bucket
  site(16.5, 0, 13.6, 21, 0.9, 16.4, 'tread', { kind: 'machine' });
  site(17, 0.9, 13.8, 20.4, 2.2, 16.2, 'yellow', { kind: 'machine' });
  site(17.1, 2.2, 14, 18.7, 3.5, 15.6, 'cab', { kind: 'machine' });
  site(23.6, 0, 14.4, 24.8, 1.2, 15.6, 'yellow', { kind: 'machine' });
  furniture.push({ shape: 'line', a: [20.2, 2, 15], b: [22.9, 4.4, 15], r: 0.26, color: '#c8a020' }, { shape: 'line', a: [22.9, 4.4, 15], b: [24.2, 1.2, 15], r: 0.2, color: '#c8a020' });
  // a dirt pile in three steps, beams, pipes, pallets of bricks
  site(22, 0, 16.8, 28, 0.8, 21.8, 'dirt', { kind: 'pile' });
  site(23, 0.8, 17.8, 27, 1.6, 20.8, 'dirt', { kind: 'pile' });
  site(24, 1.6, 18.8, 26, 2.4, 19.8, 'dirt', { kind: 'pile' });
  site(13, 0, 20.6, 19.5, 0.9, 21.8, 'steel', { kind: 'prop' });
  site(13.5, 0.9, 20.8, 19, 1.3, 21.6, 'steel', { kind: 'prop' });
  site(13, 0, 23.4, 19, 0.75, 24.6, 'metal', { kind: 'prop', hidden: true });
  for (const z of [23.7, 24.3]) furniture.push({ shape: 'cyl', x: 13, y: 0.3, z, r: 0.3, h: 6, axis: 'x', color: '#5a5e68' });
  furniture.push({ shape: 'cyl', x: 13, y: 0.75 - 0.3 + 0.3, z: 24, r: 0.25, h: 6, axis: 'x', color: '#4a4e58' });
  for (const [x0, z0, y0] of [[22.5, 10.4, 0], [23.8, 10.4, 0], [25.1, 10.4, 0], [23.1, 10.4, 1]]) site(x0, y0, z0, x0 + 1.2, y0 + 1, z0 + 1.2, 'bricks', { kind: 'prop' });
  // a mixer, a generator, a dumpster, two port-a-potties, the site offices stacked by the back wall
  round.push({ kind: 'mixer', x: 21.4, z: 11.8, y0: 0, r: 0.8, h: 1.8 });
  furniture.push({ shape: 'line', a: [20.9, 0.95, 11.8], b: [22, 1.75, 11.8], r: 0.6, color: '#d06a20' }, { shape: 'box', x: 21.4, y: 0, z: 11.8, w: 1.2, d: 1.0, h: 0.75, color: '#5a5048' });
  site(33, 0, 11.6, 34.6, 1.3, 13.2, 'yellow', { kind: 'prop' });
  site(29.6, 0, 17, 32.6, 1.5, 18.8, 'dumpster', { kind: 'prop' });
  for (const z0 of [22, 23.5]) site(33.4, 0, z0, 34.7, 2.4, z0 + 1.3, 'potty', { kind: 'prop' });
  site(25.5, 0, 32.4, 31.5, 2.6, 34.9, 'container', { kind: 'container' });
  site(26, 2.6, 32.4, 32, 5.2, 34.9, 'container', { kind: 'container' });
  // traffic cones at the gates, out in the street
  for (const [x, z] of [[8.6, 16.4], [8.6, 20.6], [16.4, 8.6], [20.6, 8.6], [27.4, 8.6], [32.6, 8.6]]) round.push({ kind: 'cone', x, z, y0: 0, r: 0.18, h: 0.6 });
  // floodlight towers: cold white light over the site
  for (const [x, z] of [[20.6, 10.2], [33.8, 29.5]]) {
    round.push({ kind: 'pole', x, z, y0: 0, r: 0.12, h: 8.4 });
    emitters.push({ min: { x: x - 0.6, y: 8.2, z: z - 0.25 }, max: { x: x + 0.6, y: 8.8, z: z + 0.25 }, color: '#e8f0ff', glow: true, lamp: true });
    lights.push({ x, y: 7.8, z, color: '#c8d8ff', intensity: 3.4, range: 25, street: true, group: 'lamp' });
  }
  // red warning lights on the crane's apex and jib tip
  for (const [x, y, z] of [[CX, 31.2, CZ], [CX, JY + 1.4, -15.8]]) emitters.push({ min: { x: x - 0.15, y: y - 0.15, z: z - 0.15 }, max: { x: x + 0.15, y: y + 0.15, z: z + 0.15 }, color: '#ff2030', glow: true, blink: true });
  // tether points: under the jib, its tip, and the hook; small amber lights mark them
  const anchors = [];
  for (const z of [6, 0, -6, -12, -15.6]) anchors.push({ x: CX, y: JY - 0.35, z, top: JY + 1.2, w: 0.7, kind: 'jib' });
  // the load on the hook: a big target, landing on the beams beside the hook
  anchors.push({ x: CX, y: 10.5, z: HZ, top: 10.8, w: 2, ar: 2.2, landDx: 1.3, kind: 'hook' });
  for (const A of anchors) if (A.kind === 'jib') emitters.push({ min: { x: A.x - 0.12, y: JY - 0.12, z: A.z - 0.12 }, max: { x: A.x + 0.12, y: JY, z: A.z + 0.12 }, color: '#ffb040', glow: true });

  // wrecked cars, vaulted over at a run: body and roof
  const car = (x, z, alongX, y0 = 0) => {
    const [x1, z1] = alongX ? [x + 3.45, z + 1.8] : [x + 1.8, z + 3.45];
    B(x, y0, z, x1, y0 + 0.91, z1, 'car', { kind: 'car' });
    if (alongX) B(x + 0.73, y0 + 0.91, z + 0.15, x1 - 0.73, y0 + 1.55, z1 - 0.15, 'car', { kind: 'car' });
    else B(x + 0.15, y0 + 0.91, z + 0.73, x1 - 0.15, y0 + 1.55, z1 - 0.73, 'car', { kind: 'car' });
  };
  car(12, -6, true); car(-24, 3, true); car(3, -24, false); car(-5, 14, false); car(-7.5, -6.5, true, 0.15); car(22, 1, false);
  // container barricades closing each street's end, one stacked in the middle
  const cont = (x0, y0, z0, x1, z1) => B(x0, y0, z0, x1, y0 + 2.6, z1, 'container', { kind: 'container' });
  for (const s of [1, -1]) {
    const zf = s * E, zb = s * (E - 2.5);
    cont(-9, 0, zf, -3, zb); cont(-2.6, 0, zf, 3.4, zb); cont(3.8, 0, zf, 9, zb); cont(-2.6, 2.6, zf, 3.4, zb);
    const xf = s * E, xb = s * (E - 2.5);
    cont(xf, 0, -9, xb, -3); cont(xf, 0, -2.6, xb, 3.4); cont(xf, 0, 3.8, xb, 9); cont(xf, 2.6, -2.6, xb, 3.4);
  }

  // street lamps: the plaza's corners and staggered down each street; two of them failing. props.js cuts them.
  const lamp = (x, z, y0 = 0, buzz = false) => {
    const light = { x, y: y0 + 5.2, z, color: '#ffb060', intensity: 2.4, range: 17, street: true, group: buzz ? 'buzz' : 'lamp' };
    lights.push(light);
    lamps.push({ x, z, y0, buzz, light });
  };
  for (const [x, z] of [[8.6, 8.6], [-8.6, 8.6], [-8.6, -8.6], [8.6, -8.6]]) lamp(x, z, 0.15);
  for (const [x, z, b] of [[15, -8.2], [29, 8.2, true], [-15, 8.2], [-29, -8.2], [8.2, 15], [-8.2, 29], [-8.2, -15, true], [8.2, -29]]) lamp(x, z, 0, !!b);
  // barrel fires in the alley crossings and by two barricades
  for (const [x, z] of [[23, 23], [-23, 23], [-23, -23], [23, -23], [6, -30.5], [-30.5, 6]]) {
    round.push({ kind: 'fire', x, z, y0: 0, r: 0.36, h: 1.05 });
    emitters.push({ min: { x: x - 0.35, y: 0, z: z - 0.35 }, max: { x: x + 0.35, y: 0.9, z: z + 0.35 }, color: '#3a2a26' });
    emitters.push({ min: { x: x - 0.3, y: 0.9, z: z - 0.3 }, max: { x: x + 0.3, y: 1.05, z: z + 0.3 }, color: '#ffb040', glow: true, fire: true });
    lights.push({ x, y: 1.3, z, color: '#ff7a2a', intensity: 2.2, range: 12, group: 'fire' });
  }
  // street furniture at the kerbs: bins and hydrants, round colliders drawn by gfx.js
  for (const [x, z] of [[8.3, 18.5], [-8.3, -18.5], [18.5, -8.3], [-18.5, 8.3], [-8.3, 21.5], [21.5, 8.3]]) round.push({ kind: 'bin', x, z, y0: 0, r: 0.34, h: 1.0 });
  for (const [x, z] of [[8.4, -12], [-8.4, 12], [-12, -8.4], [12, 8.4]]) round.push({ kind: 'hydrant', x, z, y0: 0, r: 0.17, h: 0.78 });
  // neon signs on faces toward the plaza and streets: (x, y, z, normal axis, normal sign, text, colour, vertical)
  for (const [x, y, z, ax, sg, text, color, vert] of [
    [9.3, 1.7, 12.6, 'x', -1, 'KEEP OUT', '#ffb03a'], [-30, 5.5, 9, 'z', -1, 'RAMEN', '#3af0ff'], [9, 5, -30, 'x', -1, 'BAR', '#7dff5a'],
    [-15, 3.6, -10, 'z', 1, 'OPEN', '#ff5a5a'], [15, 3.6, -10, 'z', 1, '24H', '#ffd03a'], [-10, 4.2, 15, 'x', 1, 'NOODLE', '#ff9a3a', true],
    [-9, 6, -30, 'x', 1, 'PAWN', '#5a8aff'],
  ]) {
    // a thin glowing panel standing 0.12 m off the face
    const w = vert ? 0.5 : text.length * 0.55, h = vert ? text.length * 0.6 : 0.6;
    const [x0, x1] = ax === 'x' ? [x, x + sg * 0.12] : [x - w / 2, x + w / 2], [z0, z1] = ax === 'z' ? [z, z + sg * 0.12] : [z - w / 2, z + w / 2];
    emitters.push({ min: { x: Math.min(x0, x1), y: y - h / 2, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y + h / 2, z: Math.max(z0, z1) }, color, glow: true, buzz: true });
    lights.push({ x: x + (ax === 'x' ? sg * 0.8 : 0), y, z: z + (ax === 'z' ? sg * 0.8 : 0), color, intensity: 1.8, range: 11, group: 'buzz' });
  }

  // sniper perches: roof and platform edges from 9 m to 16.5 m, the middle of each side, 0.6 m in
  const perches = [];
  for (const b of boxes.filter((b) => (b.plat || b.kind === 'building') && b.max.y >= 9 && b.max.y <= 16.5 && b.max.x - b.min.x >= 3.6 && b.max.z - b.min.z >= 2)) {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const [x, z] of [[b.min.x + 0.6, cz], [b.max.x - 0.6, cz], [cx, b.min.z + 0.6], [cx, b.max.z - 0.6]]) perches.push({ x, y: b.max.y, z });
  }
  const ground = [[5, -29], [-5, -29], [5, 29], [-5, 29], [29, -5], [28.5, 7], [-29, 5], [-29, -5], [23, 32], [-23, 32], [23, -32], [-23, -32], [32, 23], [-32, 23], [32, -23], [-32, -23]]
    .map(([x, z]) => ({ x, y: 0, z }));
  const high = roofs.filter((b) => b.max.y <= 12).map((b) => ({ x: b.min.x + 2, y: b.max.y, z: b.min.z + 2 })).concat([{ x: 12, y: 5.4, z: 33 }, { x: 11, y: 10.8, z: 33 }]);
  const barrelSpots = [[6.5, 0.15, -6.5], [-6.5, 0.15, 6.5], [16, 0, -3], [-16, 0, 3], [3, 0, 22], [-3, 0, -22], [12, 5.4, 32], [30, 7, -4]]
    .map(([x, y, z]) => ({ x, y, z }));
  return {
    name: 'The Crossroads', boxes, groundY: 0, emitters, lights, lamps, round, furniture, anchors,
    ambient: [0.022, 0.018, 0.032], sky: [0.05, 0.04, 0.075],
    bounds: { minX: -E, maxX: E, minZ: -E, maxZ: E },
    playerStart: { x: 0, y: 0.15, z: 6, yaw: 0 },
    spawn: { ground, high }, perches, barrelSpots,
    clearance: {
      streets: [{ min: { x: -E, z: -9 }, max: { x: E, z: 9 } }, { min: { x: -9, z: -E }, max: { x: 9, z: E } }],
      alleys: [1, -1].flatMap((s) => [
        { min: { x: s > 0 ? 20 : -26, z: 9 }, max: { x: s > 0 ? 26 : -20, z: E } }, { min: { x: s > 0 ? 20 : -26, z: -E }, max: { x: s > 0 ? 26 : -20, z: -9 } },
        { min: { x: 9, z: s > 0 ? 20 : -26 }, max: { x: E, z: s > 0 ? 26 : -20 } }, { min: { x: -E, z: s > 0 ? 20 : -26 }, max: { x: -9, z: s > 0 ? 26 : -20 } },
      ]),
    },
    orbit: { dist: 24, pitch: -0.55, lift: 6 },
  };
})();

// The training facility (Training mode): a bright, enclosed hall for the guided tutorial and practice. Four
// rooms in a line, south to north, each closed off by a wall to the ceiling with one way through:
//   1. the movement course: a mark on the floor, a block to climb (2.5 m), one to jump onto (5.5 m) and a
//      tower only a double jump from that block reaches (13 m); a doorway with a red laser grid across it
//      that only a dash gets through;
//   2. a run-up to a slot under the next wall, too low for anything but a slide;
//   3. a 14 m ledge against the far wall that only the tether reaches, with a doorway at its top;
//   4. the practice hall: a balcony under that doorway, a platform only a tether fling reaches, the dummy
//      on a mat in front of a dark wall (so its flashes read), and room for whatever the panel spawns.
// Enemies only ever go in the hall: the course rooms are left out of the nav graph (noNav).
const TRAINING = (() => {
  const boxes = [], lights = [], emitters = [], furniture = [];
  const B = (x0, y0, z0, x1, y1, z1, style, o = {}) => {
    const b = Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, style }, o);
    boxes.push(b);
    return b;
  };
  // partitions; slick ones give no grip, so wall kicks stay at their station. The course rooms are left out
  // of the nav graph, and their surfaces are reached along the course (feel-check skips them).
  const wall = (x0, y0, z0, x1, y1, z1, style = 'wall', o = {}) => B(x0, y0, z0, x1, y1, z1, style, Object.assign({ kind: 'wall', cell: 2, noNav: true }, o));
  const slick = { slick: true };
  const course = (o = {}) => Object.assign({ kind: 'course', noNav: true, viaCourse: true }, o);
  // 1. the movement hall (x -12..20, z 6..74, 36 m tall): the course winds up round it
  // 2. the tether room (x -15..15, z -50..4, 30 m): a zip up to the football field
  // 3. the combat hall (x -15..15, z -94..-52, 24 m): the dummy, and practice afterwards
  B(-14, -1, 4, 22, 0, 76, 'tile', { kind: 'ground', cell: 2, noNav: true });
  B(-17, -1, -52, 17, 0, 4, 'tile', { kind: 'ground', cell: 2, noNav: true });
  B(-17, -1, -96, 17, 0, -52, 'tile', { kind: 'ground', cell: 2 });
  B(-14, 36, 4, 22, 37, 76, 'ceiling', { kind: 'ceiling', cell: 4, noNav: true });
  B(-17, 30, -52, 17, 31, 4, 'ceiling', { kind: 'ceiling', cell: 4, noNav: true });
  B(-17, 24, -96, 17, 25, -52, 'ceiling', { kind: 'ceiling', cell: 4, noNav: true });
  wall(-14, 0, 6, -12, 36, 74, 'wall', slick); wall(20, 0, 6, 22, 36, 74, 'wall', slick);
  wall(-14, 0, 74, -3, 36, 76, 'wall', slick); wall(3, 0, 74, 22, 36, 76, 'wall', slick);
  // the wall-kick face, in the kick station's colour
  wall(-3, 0, 74, 3, 36, 76, 'block3');
  // between the movement hall and the tether room: the opening the long jump goes through (x -7..7, from
  // 11.5 m, out of reach of the floor below)
  const OPEN = { x0: -7, x1: 7, z0: 4, z1: 6, y0: 11.5, y1: 30 };
  wall(-17, 0, 4, OPEN.x0, 36, 6, 'wall', slick); wall(OPEN.x1, 0, 4, 22, 36, 6, 'wall', slick);
  wall(OPEN.x0, 0, 4, OPEN.x1, OPEN.y0 - 0.5, 6, 'wall', slick); wall(OPEN.x0, OPEN.y0 - 0.5, 4, OPEN.x1, OPEN.y0, 6, 'stripe', slick);
  wall(OPEN.x0, OPEN.y1, 4, OPEN.x1, 36, 6, 'wall', slick);
  wall(-17, 0, -52, -15, 31, 4, 'wall', slick); wall(15, 0, -52, 17, 31, 4, 'wall', slick);
  // the door from the football field to the combat hall's balcony (x -2..2, 15 to 18.5 m)
  const DOOR = { x0: -2, x1: 2, z: -51, y0: 15, y1: 18.5 };
  wall(-17, 0, -52, DOOR.x0, 31, -50); wall(DOOR.x1, 0, -52, 17, 31, -50);
  wall(DOOR.x0, 0, -52, DOOR.x1, DOOR.y0, -50); wall(DOOR.x0, DOOR.y1, -52, DOOR.x1, DOOR.y1 + 0.5, -50, 'stripe'); wall(DOOR.x0, DOOR.y1 + 0.5, -52, DOOR.x1, 31, -50);
  // the shutter: an unseen box (training.js draws it) that rises into the wall when the door opens
  DOOR.box = wall(DOOR.x0, DOOR.y0, -50.3, DOOR.x1, DOOR.y1, -50, 'stripe', { hidden: true });
  wall(-17, 0, -96, -15, 24, -52); wall(15, 0, -96, 17, 24, -52);
  wall(-17, 0, -96, 17, 24, -94, 'wallDark');

  // ---------- the movement hall ----------
  // floor: climb a 2.5 m block, jump to a 5.5 m one, double jump to the 13 m tower in the corner
  B(6, 0, 20, 12, 2.5, 24, 'block', course());
  B(13, 0, 28, 19, 5.5, 33, 'block2', course());
  B(16, 0, 36, 20, 13, 42, 'block3', course());
  // the walkway at 13 m on from the tower, down the east wall and along the south one, hazard-striped edges
  B(16, 12, 42, 20, 13, 74, 'stripe', course({ top: 'tile' }));
  B(-3, 12, 70, 16, 13, 74, 'stripe', course({ top: 'tile' }));
  // slide: a wall across it with a 1.05 m gap under it (too low to walk or crouch through)
  const SLIDE = { x0: 16, x1: 20, z0: 48, z1: 49, y0: 13, y1: 14.05 };
  wall(14, 12, SLIDE.z0, 16, 36, SLIDE.z1);
  wall(16, SLIDE.y1, SLIDE.z0, 20, SLIDE.y1 + 0.55, SLIDE.z1, 'stripe'); wall(16, SLIDE.y1 + 0.55, SLIDE.z0, 20, 36, SLIDE.z1);
  // vault: a 1 m barrier under a wall, with a 1.72 m slot between: solid below so no slide gets under it,
  // too low to jump through standing, and it can't be climbed onto; only a vault takes you through
  const VAULT = { x0: 16, x1: 20, z0: 64, z1: 64.6, y0: 13, top: 14, y1: 15.72 };
  B(16, VAULT.y0, VAULT.z0, 20, VAULT.top, VAULT.z1, 'stripe', course({ vaultOnly: true }));
  wall(14, 12, VAULT.z0, 16, 36, VAULT.z1);
  wall(16, VAULT.y1, VAULT.z0, 20, VAULT.y1 + 0.5, VAULT.z1, 'stripe'); wall(16, VAULT.y1 + 0.5, VAULT.z0, 20, 36, VAULT.z1);
  // dash: a doorway of red lasers (z 70.5..73.5, up to 16.5 m) in a wall across the south walkway at x 10
  const GATE = { axis: 'x', at: 10, a0: 70.5, a1: 73.5, y0: 13, y1: 16.5 };
  wall(9.5, 12, 68, 10.5, 36, 70.5); wall(9.5, 13, GATE.a1, 10.5, 36, 74);
  wall(9.5, GATE.y1, GATE.a0, 10.5, GATE.y1 + 0.5, GATE.a1, 'stripe'); wall(9.5, GATE.y1 + 0.5, GATE.a0, 10.5, 36, GATE.a1);
  for (let i = 0; i < 6; i++) {
    const y = GATE.y0 + 0.3 + i * 0.58;
    emitters.push({ min: { x: GATE.at - 0.025, y: y - 0.025, z: GATE.a0 }, max: { x: GATE.at + 0.025, y: y + 0.025, z: GATE.a1 }, color: '#ff2a3a', glow: true, buzz: true });
  }
  for (const z of [GATE.a0, GATE.a1]) emitters.push({ min: { x: GATE.at - 0.1, y: GATE.y0, z: z - 0.06 }, max: { x: GATE.at + 0.1, y: GATE.y1, z: z + 0.06 }, color: '#3a1018' });
  lights.push({ x: GATE.at + 1.2, y: GATE.y0 + 1.8, z: 72, color: '#ff3048', intensity: 1.2, range: 6, group: 'buzz' }, { x: GATE.at - 1.2, y: GATE.y0 + 1.8, z: 72, color: '#ff3048', intensity: 1.2, range: 6, group: 'buzz' });
  // wall kick: the walkway ends in a pocket between the purple south wall and the purple pier under the
  // high deck (11.5 m up: past a double jump and a climb); a kick off one wall to the other gets you up
  wall(-4, 0, 70, -3, 36, 74);
  B(-3, 0, 66, 3, 24.5, 70, 'block3', course());
  // the high deck: a run-up north to its edge, then the long jump across the hall and through the opening
  const DECK = { x0: -3, x1: 3, z0: 48, z1: 70, y: 24.5 };
  B(DECK.x0, 22.5, DECK.z0, DECK.x1, DECK.y, 66, 'stripe', course({ top: 'tile' }));
  wall(-1, 0, 51, 1, 22.5, 53, 'wall', slick); wall(-1, 0, 58, 1, 22.5, 60, 'wall', slick);

  // ---------- the tether room ----------
  // the football field: a 15 m block (zip up its face) with turf on top, the machine on a plinth at the
  // north-east, the goal posts over the door to the combat hall
  const FIELD = { x0: -15, x1: 15, z0: -50, z1: -24, y: 15 };
  B(FIELD.x0, 0, FIELD.z0, FIELD.x1, FIELD.y, FIELD.z1, 'block2', course({ top: 'turf' }));
  B(9, FIELD.y, -46, 13, FIELD.y + 1, -42, 'wallDark', course());
  const MACHINE = { x: 11, y: FIELD.y + 1, z: -44 };
  const GOAL = { x0: -3, x1: 3, z: -49.4, y0: 19, y1: 30 };
  for (const x of [GOAL.x0, GOAL.x1]) furniture.push({ shape: 'line', a: [x, GOAL.y0, GOAL.z], b: [x, GOAL.y0 + 8, GOAL.z], r: 0.1, color: '#f0c020' });
  furniture.push({ shape: 'line', a: [GOAL.x0, GOAL.y0, GOAL.z], b: [GOAL.x1, GOAL.y0, GOAL.z], r: 0.1, color: '#f0c020' });
  for (const x of [-1.4, 1.4]) furniture.push({ shape: 'line', a: [x, GOAL.y0, GOAL.z], b: [x, GOAL.y0 + 0.3, -50], r: 0.05, color: '#a8841c' });
  // yard lines and worn patches on the turf
  for (let z = -28; z >= -46; z -= 4) furniture.push({ shape: 'box', x: 0, y: FIELD.y, z, w: 29.6, d: 0.16, h: 0.02, color: '#e8ece4' });
  for (const [x, z, w, d] of [[-6, -30.5, 2.2, 1.4], [4, -38, 1.6, 2.4], [-10, -43, 2.6, 1.2], [7.5, -27, 1.2, 1.2]]) furniture.push({ shape: 'box', x, y: FIELD.y, z, w, d, h: 0.025, color: '#6a5a3a' });

  // ---------- the combat hall ----------
  B(-4, 14.6, -56, 4, 15, -52, 'block2', { kind: 'balcony', tetherOnly: true });
  const HALL = { x0: -15, x1: 15, z0: -94, z1: -52 };

  // light: panels in each ceiling with a light under each, lower lights round the movement hall's floor and
  // walkways, and a warm spot on the dummy's mat
  const panels = (y, z0, z1, xs, dz, lightY, range) => {
    for (let z = z0; z > z1; z -= dz) {
      for (const x of xs) {
        emitters.push({ min: { x: x - 2, y: y - 0.12, z: z - 0.7 }, max: { x: x + 2, y, z: z + 0.7 }, color: '#f4f8ff', glow: true, lamp: true });
        lights.push({ x, y: lightY, z, color: '#eaf0ff', intensity: 1.2, range, group: 'lamp' });
      }
    }
  };
  panels(36, 68, 6, [-4, 12], 12, 32, 30);
  panels(30, -2, -50, [-7.5, 7.5], 12, 27, 26);
  panels(24, -56, -94, [-7.5, 7.5], 10, 22.4, 20);
  for (const z of [14, 30, 46, 62]) lights.push({ x: -6, y: 8, z, color: '#eaf0ff', intensity: 0.8, range: 18, group: 'lamp' }, { x: 12, y: 8, z, color: '#eaf0ff', intensity: 0.8, range: 18, group: 'lamp' });
  for (const z of [46, 60, 72]) lights.push({ x: 14, y: 17, z, color: '#fff4e0', intensity: 0.7, range: 12, group: 'lamp' });
  lights.push({ x: 3, y: 17, z: 72, color: '#fff4e0', intensity: 0.7, range: 12, group: 'lamp' }, { x: 0, y: 28, z: 58, color: '#fff4e0', intensity: 0.8, range: 14, group: 'lamp' });
  lights.push({ x: 0, y: 6, z: -76, color: '#ffe0b0', intensity: 1.4, range: 12, group: 'lamp' });
  furniture.push({ shape: 'box', x: 0, y: 0, z: -80, w: 6, d: 6, h: 0.02, color: '#34446a' });
  const perches = [{ x: 0, y: 15, z: -53.6 }, { x: -2.6, y: 15, z: -54.4 }, { x: 2.6, y: 15, z: -54.4 }];
  return {
    name: 'The Training Hall', boxes, groundY: 0, emitters, lights, lamps: [], round: [], indoor: true, furniture,
    ambient: [0.3, 0.31, 0.34], sky: [0.16, 0.16, 0.17], bg: '#c4cad6', fog: { near: 80, far: 220 },
    bounds: { minX: -15, maxX: 20, minZ: HALL.z0, maxZ: 74 },
    // practice starts in the combat hall facing the dummy; the tutorial at the movement hall's north end
    playerStart: { x: 0, y: 0, z: -60, yaw: 0 },
    tutorialStart: { x: 6, y: 0, z: 10, yaw: Math.PI },
    // the course, for the tutorial (training.js)
    course: { OPEN, DOOR, SLIDE, VAULT, GATE, DECK, FIELD, MACHINE, GOAL, HALL, DUMMY: { x: 0, z: -80, yaw: Math.PI } },
    spawn: { ground: [{ x: -10, y: 0, z: -86 }, { x: 10, y: 0, z: -86 }, { x: -10, y: 0, z: -62 }, { x: 10, y: 0, z: -62 }], high: perches.slice() },
    perches, barrelSpots: [], perchesChecked: true,
    clearance: { streets: [{ min: { x: HALL.x0, z: HALL.z0 }, max: { x: HALL.x1, z: -57 } }], alleys: [{ min: { x: -15, z: -24 }, max: { x: 15, z: 4 } }] },
    orbit: { dist: 14, pitch: -0.3, lift: 3 },
  };
})();
const ARENAS = { crossroads: CROSSROADS, street: STREET, training: TRAINING };
