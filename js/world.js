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
