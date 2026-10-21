'use strict';
// Shared constants, math, raster helpers and the 3x5 bitmap font.

const VIEW_W = 480;
const VIEW_H = 270;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
const approach = (v, t, amt) => (v < t ? Math.min(v + amt, t) : Math.max(v - amt, t));
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeInQuad = (t) => t * t;
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w | 0);
  c.height = Math.max(1, h | 0);
  c.ctx = c.getContext('2d');
  c.ctx.imageSmoothingEnabled = false;
  return c;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
// '#rrggbb' to linear-light [r, g, b] in 0..1, the space WebGL lighting adds up in
function hexLinear(hex) {
  return hexToRgb(hex).map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
}
function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${lerp(A[0], B[0], t) | 0},${lerp(A[1], B[1], t) | 0},${lerp(A[2], B[2], t) | 0})`;
}

// ---------- geometry ----------
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function circleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}
function segRect(ax, ay, bx, by, r, x, y, w, h) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (circleRect(ax + (bx - ax) * t, ay + (by - ay) * t, r, x, y, w, h)) return true;
  }
  return false;
}
function sectorRect(cx, cy, r, ang, span, x, y, w, h) {
  if (!circleRect(cx, cy, r, x, y, w, h)) return false;
  if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) return true;
  const pts = [
    x + w / 2, y + h / 2, clamp(cx, x, x + w), clamp(cy, y, y + h),
    x, y, x + w, y, x, y + h, x + w, y + h, x + w / 2, y, x + w / 2, y + h,
  ];
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i], py = pts[i + 1];
    const dx = px - cx, dy = py - cy;
    if (dx * dx + dy * dy > r * r) continue;
    if (Math.abs(angDiff(ang, Math.atan2(dy, dx))) <= span / 2) return true;
  }
  return false;
}
// Slab ray test against a rect list; returns fraction [0..1] of the first hit (1 = clear).
function rayRects(x0, y0, x1, y1, rects) {
  let best = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (const s of rects) {
    let tmin = 0, tmax = best;
    if (Math.abs(dx) < 1e-9) { if (x0 <= s.x || x0 >= s.x + s.w) continue; }
    else {
      let t1 = (s.x - x0) / dx, t2 = (s.x + s.w - x0) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (Math.abs(dy) < 1e-9) { if (y0 <= s.y || y0 >= s.y + s.h) continue; }
    else {
      let t1 = (s.y - y0) / dy, t2 = (s.y + s.h - y0) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best) best = tmin;
  }
  return best;
}

// ---------- pixel raster ----------
function pline(ctx, x0, y0, x1, y1, w = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  const o = (w / 2) | 0;
  let err = dx + dy;
  for (let i = 0; i < 4000; i++) {
    ctx.fillRect(x0 - o, y0 - o, w, w);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function pdisc(ctx, cx, cy, r) {
  cx = Math.round(cx); cy = Math.round(cy);
  if (r < 0.75) { ctx.fillRect(cx, cy, 1, 1); return; }
  const R = Math.ceil(r), r2 = r * r + r * 0.6;
  for (let y = -R; y <= R; y++) {
    const v = r2 - y * y;
    if (v < 0) continue;
    const half = Math.floor(Math.sqrt(v));
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
}
function pring(ctx, cx, cy, r, sy = 1, w = 1) {
  const n = Math.max(12, Math.ceil(r * 6.5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * sy), w, w);
  }
}
function polyline(ctx, pts, w = 1) {
  for (let i = 0; i < pts.length - 2; i += 2) pline(ctx, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], w);
}
// Jagged electric bolt points from a to b.
function boltPoints(x0, y0, x1, y1, jag = 3, segLen = 6) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.ceil(len / segLen));
  const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
  const pts = [x0, y0];
  for (let i = 1; i < n; i++) {
    const t = i / n, o = (Math.random() * 2 - 1) * jag * Math.sin(t * Math.PI) * 1.4;
    pts.push(x0 + (x1 - x0) * t + nx * o, y0 + (y1 - y0) * t + ny * o);
  }
  pts.push(x1, y1);
  return pts;
}
function drawBolt(ctx, x0, y0, x1, y1, outer = '#ff2a44', core = '#ffe8ee', jag = 3, w = 1) {
  const pts = boltPoints(x0, y0, x1, y1, jag);
  ctx.fillStyle = outer; polyline(ctx, pts, w + 1);
  ctx.fillStyle = core; polyline(ctx, pts, w);
  return pts;
}

// ---------- 3x5 bitmap font ----------
const FONT_SRC = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.',
  E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#',
  I: '###|.#.|.#.|.#.|###', J: '..#|..#|..#|#.#|.#.', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###',
  M: '#.#|###|###|#.#|#.#', N: '##.|#.#|#.#|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  Q: '.#.|#.#|#.#|##.|.##', R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.',
  U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.', W: '#.#|#.#|###|###|#.#', X: '#.#|#.#|.#.|#.#|#.#',
  Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.',
  4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.',
  '!': '.#.|.#.|.#.|...|.#.', '?': '##.|..#|.#.|...|.#.', '.': '...|...|...|...|.#.', ',': '...|...|...|.#.|#..',
  ':': '...|.#.|...|.#.|...', '-': '...|...|###|...|...', '+': '...|.#.|###|.#.|...', '/': '..#|..#|.#.|#..|#..',
  '%': '#.#|..#|.#.|#..|#.#', '(': '.#.|#..|#..|#..|.#.', ')': '.#.|..#|..#|..#|.#.', "'": '.#.|.#.|...|...|...',
  '"': '#.#|#.#|...|...|...', '=': '...|###|...|###|...', '<': '..#|.#.|#..|.#.|..#', '>': '#..|.#.|..#|.#.|#..',
  '[': '##.|#..|#..|#..|##.', ']': '.##|..#|..#|..#|.##', '#': '#.#|###|#.#|###|#.#', '*': '...|#.#|.#.|#.#|...',
  ' ': '...|...|...|...|...', '_': '...|...|...|...|###', '·': '...|...|.#.|...|...', '&': '.#.|#.#|.#.|#.#|.##',
};
const FONT = {};
for (const k in FONT_SRC) FONT[k] = FONT_SRC[k].split('|');
const _textCache = new Map();

function textWidth(str, scale = 1) {
  return str.length ? (str.length * 4 - 1) * scale : 0;
}
function _renderText(str, color, scale, outline, shadow) {
  const pad = outline || shadow ? Math.max(1, scale >> 1) : 0;
  const w = textWidth(str, scale) + pad * 2, h = 5 * scale + pad * 2 + (shadow ? scale : 0);
  const c = makeCanvas(w, h), g = c.ctx;
  const plot = (col, ox, oy) => {
    g.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const gl = FONT[str[i].toUpperCase()] || FONT['?'];
      for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
        if (gl[y][x] === '#') g.fillRect(pad + ox + (i * 4 + x) * scale, pad + oy + y * scale, scale, scale);
      }
    }
  };
  if (outline) {
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) plot(outline, ox * pad, oy * pad);
  }
  if (shadow) plot(shadow, 0, scale);
  plot(color, 0, 0);
  return c;
}
function drawText(ctx, str, x, y, opt = {}) {
  str = String(str);
  const scale = opt.scale || 1, color = opt.color || '#ffffff';
  const outline = opt.outline === undefined ? '#0b0910' : opt.outline;
  const shadow = opt.shadow || null;
  const key = str + '|' + color + '|' + scale + '|' + outline + '|' + shadow;
  let c = _textCache.get(key);
  if (!c) {
    if (_textCache.size > 400) _textCache.clear();
    c = _renderText(str, color, scale, outline, shadow);
    _textCache.set(key, c);
  }
  const pad = outline || shadow ? Math.max(1, scale >> 1) : 0;
  let dx = x - pad;
  if (opt.align === 'center') dx = x - textWidth(str, scale) / 2 - pad;
  else if (opt.align === 'right') dx = x - textWidth(str, scale) - pad;
  ctx.drawImage(c, Math.round(dx), Math.round(y - pad));
}

// Cached soft light/glow sprites, keyed by colour.
const _glowCache = new Map();
function glowSprite(color) {
  let c = _glowCache.get(color);
  if (c) return c;
  c = makeCanvas(64, 64);
  const g = c.ctx, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const [r, gg, b] = hexToRgb(color);
  grd.addColorStop(0, rgba(r, gg, b, 1));
  grd.addColorStop(0.25, rgba(r, gg, b, 0.55));
  grd.addColorStop(0.6, rgba(r, gg, b, 0.15));
  grd.addColorStop(1, rgba(r, gg, b, 0));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _glowCache.set(color, c);
  return c;
}

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k in over) {
    if (!(k in base)) continue;
    const b = base[k], v = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b)) deepMerge(b, v);
    else if (typeof v === typeof b || (Array.isArray(b) && Array.isArray(v))) base[k] = v;
  }
  return base;
}
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), obj); }
function setPath(obj, path, val) {
  const ks = path.split('.'), last = ks.pop();
  const o = ks.reduce((a, k) => a[k], obj);
  o[last] = val;
}
function safeStorageGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
function safeStorageSet(key, val) { try { window.localStorage.setItem(key, val); } catch (e) { /* storage blocked */ } }

// ---------- 3D: 1 unit = 1 m, y up, x along the old street, z for depth ----------
// PX converts 2D pixels to metres (the player's 20 px is 1.8 m); GROUND_2D is the 2D street line.
const PX = 1 / 11;
const GROUND_2D = 400;
const to3 = (x, y) => ({ x: x * PX, y: (GROUND_2D - y) * PX });
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dist3 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
const distXZ = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
// Boxes are { min: {x, y, z}, max: {x, y, z} }.
function pointInBox(x, y, z, b, pad = 0) {
  return x > b.min.x - pad && x < b.max.x + pad && y > b.min.y - pad && y < b.max.y + pad && z > b.min.z - pad && z < b.max.z + pad;
}
// Slab ray test against a box list along unit direction d; returns the first hit within maxT, or null.
// pad grows every box, which turns the ray into a sweep of a sphere (or cube) of that radius.
function rayBoxes(ox, oy, oz, dx, dy, dz, maxT, boxes, pad = 0) {
  let best = maxT, hit = null, hitAxis = -1;
  const o = [ox, oy, oz], d = [dx, dy, dz], K = ['x', 'y', 'z'];
  for (const b of boxes) {
    let tmin = 0, tmax = best, axis = -1, miss = false;
    for (let i = 0; i < 3; i++) {
      const lo = b.min[K[i]] - pad, hi = b.max[K[i]] + pad;
      if (Math.abs(d[i]) < 1e-9) { if (o[i] <= lo || o[i] >= hi) { miss = true; break; } continue; }
      let t1 = (lo - o[i]) / d[i], t2 = (hi - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = i; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) { miss = true; break; }
    }
    if (!miss && tmin < best) { best = tmin; hit = b; hitAxis = axis; }
  }
  if (!hit) return null;
  const n = [0, 0, 0];
  if (hitAxis >= 0) n[hitAxis] = d[hitAxis] > 0 ? -1 : 1;
  return { t: best, box: hit, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, nx: n[0], ny: n[1], nz: n[2] };
}
// Yaw 0 faces -z, like the camera; positive yaw turns left.
const fwdX = (yaw) => -Math.sin(yaw);
const fwdZ = (yaw) => -Math.cos(yaw);
const yawOf = (x, z) => Math.atan2(-x, -z);
// Moves (vx, vz) toward (tx, tz) by at most amt; returns [vx, vz].
function approach2(vx, vz, tx, tz, amt) {
  const dx = tx - vx, dz = tz - vz, d = Math.hypot(dx, dz);
  if (d <= amt || d < 1e-9) return [tx, tz];
  return [vx + (dx / d) * amt, vz + (dz / d) * amt];
}
// Distance from point (px, pz) to the segment (ax, az)-(bx, bz) on the ground plane.
function segDistXZ(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
