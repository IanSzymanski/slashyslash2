#!/usr/bin/env node
// Runs the character controller headless on the street and prints movement in metres: run speed,
// jump and double-jump apex, dash, slide. Then checks the arena: every raised walkable surface must be
// reachable from the one below it with a double jump plus a mantle, and the clearance rules must hold.
// Last, the nav graph: the street is one piece, enemies can climb the fire escapes, and every surface
// has a way back down. Exits 1 on a failed check. Usage: node tools/feel-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console, Math, JSON, Object, Array, Set, Map, Infinity, Int32Array, Uint8Array, Int8Array, Float32Array });
for (const f of ['js/util.js', 'js/world.js', 'js/controller.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const run = (code) => vm.runInContext(code, ctx);
run('var PC = { HEIGHT: MOVE.H }; World.build(STREET);');

const DT = 1 / 120;
const { Controller, MOVE, STREET } = run('({ Controller, MOVE, STREET })');
// one simulated body; script(t, c) returns the intent for each tick
function simulate(seconds, start, script) {
  const c = {};
  Controller.init(c, start);
  c.onGround = true;
  const trace = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const t = i * DT;
    const I = Object.assign({ mx: 0, mz: 0, jump: false, jumpHeld: false, jumpReleased: false, crouch: false, crouchPressed: false, dash: false, aim: null }, script(t, c));
    Controller.timers(c, DT);
    Controller.buffer(c, I);
    if (I.dash) Controller.tryDash(c, I.mx, I.mz);
    if (c.dashT > 0) Controller.moveDash(c, DT); else if (!c.mantle) Controller.moveNormal(c, DT, I);
    Controller.integrate(c, DT, I);
    trace.push({ t, x: c.pos.x, y: c.pos.y, z: c.pos.z, v: Math.hypot(c.vel.x, c.vel.z), vy: c.vel.y, g: c.onGround, slide: c.sliding, mantle: !!c.mantle, wall: c.wallSliding });
  }
  return trace;
}

const start = { x: 100, y: 0, z: 2 };
const fmt = (n) => n.toFixed(2);
const rows = [];
let failed = false;
const check = (ok, msg) => { if (!ok) { failed = true; console.log('FAIL ' + msg); } };

// run: hold forward (-z is forward at yaw 0; use +x along the street)
let tr = simulate(2, start, (t) => ({ mx: 1 }));
const top = Math.max(...tr.map((s) => s.v));
const t90 = tr.find((s) => s.v >= top * 0.9).t;
rows.push(['Run speed', `${fmt(top)} m/s`, `90% after ${fmt(t90)} s`]);

// single jump, held: apex and air time
tr = simulate(1.5, start, (t) => ({ jump: t < DT, jumpHeld: true }));
const apex1 = Math.max(...tr.map((s) => s.y));
const land1 = tr.find((s, i) => i > 5 && s.g);
rows.push(['Jump apex (held)', `${fmt(apex1)} m`, `air time ${land1 ? fmt(land1.t) : '?'} s`]);
tr = simulate(1.5, start, (t) => ({ jump: t < DT, jumpHeld: t < 0.05, jumpReleased: Math.abs(t - 0.05) < DT / 2 }));
rows.push(['Jump apex (tap)', `${fmt(Math.max(...tr.map((s) => s.y)))} m`, 'released after 0.05 s']);

// double jump at the apex of the first
let apexT = null;
tr = simulate(2, start, (t, c) => {
  if (apexT === null && t > 0.05 && c.vel.y <= 0) apexT = t;
  return { jump: t < DT || (apexT !== null && Math.abs(t - apexT) < DT / 2), jumpHeld: true };
});
const apex2 = Math.max(...tr.map((s) => s.y));
rows.push(['Double jump apex', `${fmt(apex2)} m`, `+${fmt(apex2 - apex1)} m from the second jump`]);

// dash from standing, then coast to a stop
tr = simulate(1, start, (t) => ({ dash: t < DT, mx: t < DT ? 1 : 0, mz: 0 }));
const dashEnd = tr.find((s) => s.t >= 0.14);
rows.push(['Dash', `${fmt(dashEnd.x - start.x)} m in 0.14 s`, `${fmt(tr[tr.length - 1].x - start.x)} m to a stop`]);

// slide from a full run
tr = simulate(3, start, (t) => ({ mx: 1, crouch: t > 1.2 - DT / 2, crouchPressed: Math.abs(t - 1.2) < DT / 2 }));
const s0 = tr.find((s) => s.slide), s1 = tr.slice(tr.indexOf(s0)).find((s) => !s.slide);
rows.push(['Slide', `${fmt(s1.x - s0.x)} m`, `${fmt(s1.t - s0.t)} s`]);

// bullet jump out of a slide, aiming 30 degrees up along the street
let bj = null;
tr = simulate(3, start, (t, c) => {
  const slideAt = 1.2, jumpAt = 1.3;
  if (bj === null && Math.abs(t - jumpAt) < DT / 2) bj = { x: c.pos.x };
  return { mx: 1, crouch: t > slideAt - DT / 2 && t < jumpAt + DT / 2, crouchPressed: Math.abs(t - slideAt) < DT / 2, jump: Math.abs(t - jumpAt) < DT / 2, jumpHeld: t >= jumpAt, aim: { x: 0.866, y: 0.5, z: 0 } };
});
const bjI = tr.findIndex((s) => s.t > 1.3 && !s.g), bjL = tr.slice(bjI).find((s) => s.g);
const bjApex = Math.max(...tr.slice(bjI).map((s) => s.y));
rows.push(['Bullet jump (aim 30 deg up)', `${fmt(bjL.x - bj.x)} m`, `apex ${fmt(bjApex)} m, air ${fmt(bjL.t - 1.3)} s`]);
check(bjL.x - bj.x > 10, 'bullet jump carries less than 10 m');

// wall kick: jump beside a building's front wall, slide down it pushing in, then kick off
const bld = STREET.boxes.find((b) => b.kind === 'building' && b.max.y > 12);
const wz = bld.max.z + MOVE.R + 0.05, wx = (bld.min.x + bld.max.x) / 2;
let kickT = null, slideV = 0;
tr = simulate(2.2, { x: wx, y: 0, z: wz }, (t, c) => {
  if (c.wallSliding) slideV = Math.min(slideV, c.vel.y);
  if (kickT === null && c.wallSliding && t > 0.7) kickT = t;
  return { mz: kickT === null ? -1 : 0, jump: t < DT || (kickT !== null && Math.abs(t - kickT) < DT / 2), jumpHeld: true };
});
const kI = tr.findIndex((s) => kickT !== null && s.t >= kickT);
const kickApex = kI >= 0 ? Math.max(...tr.slice(kI).map((s) => s.y)) - tr[kI].y : 0;
const kickOut = kI >= 0 ? Math.max(...tr.slice(kI).map((s) => s.z)) - wz : 0;
rows.push(['Wall kick', kickT === null ? 'no wall slide' : `+${fmt(kickApex)} m up, ${fmt(kickOut)} m out`, `wall slide at ${fmt(-slideV)} m/s`]);
check(kickT !== null && kickApex > 2.5, 'could not slide down and kick off a wall');

// step-up: walk into a wrecked car and over it (body 0.91 m, roof 1.55 m)
const car = STREET.boxes.find((b) => b.kind === 'car' && b.min.y > 0);
tr = simulate(1.2, { x: car.min.x - 1.6, y: 0, z: (car.min.z + car.max.z) / 2 }, () => ({ mx: 1 }));
const carTop = Math.max(...tr.map((s) => s.y));
rows.push(['Walk over a wrecked car', `top ${fmt(carTop)} m`, carTop >= car.max.y - 0.01 ? 'stepped up' : 'blocked']);
check(carTop >= car.max.y - 0.01, 'could not step onto a wrecked car');

// mantle: the highest climb on the street is the 9.1 m girder; double jump beside it, push in once level with its edge
const girder = STREET.boxes.filter((b) => b.kind === 'girder').sort((a, b) => a.max.y - b.max.y)[0];
let apexM = null;
tr = simulate(1.6, { x: girder.min.x - 0.6, y: 0, z: 0 }, (t, c) => {
  if (apexM === null && t > 0.05 && c.vel.y <= 0) apexM = t;
  return { mx: c.pos.y > girder.min.y - MOVE.H + 0.2 && !(c.onGround && c.pos.y > girder.min.y) ? 1 : 0, jump: t < DT || (apexM !== null && Math.abs(t - apexM) < DT / 2), jumpHeld: true };
});
const endM = tr[tr.length - 1];
rows.push([`Mantle onto the ${fmt(girder.max.y)} m girder`, endM.y >= girder.max.y - 0.01 ? `on top at ${fmt(endM.y)} m` : `fell back to ${fmt(endM.y)} m`, tr.some((s) => s.mantle) ? 'mantled' : 'no mantle']);
check(endM.y >= girder.max.y - 0.01 && tr.some((s) => s.mantle), 'double jump plus mantle could not reach the highest climb');

console.log('Movement (metres)');
for (const r of rows) console.log(`  ${r[0].padEnd(34)}${r[1].padEnd(26)}${r[2]}`);

// ---------- arena: reachability of raised surfaces ----------
const reach = apex2 + MOVE.MANTLE_UP;
const boxes = STREET.boxes;
const walkable = boxes.filter((b) => b.kind !== 'bound' && b.kind !== 'ground');
const floorTop = 0;
console.log(`\nReach: double jump ${fmt(apex2)} m + mantle ${fmt(MOVE.MANTLE_UP)} m = ${fmt(reach)} m`);
const gap = (a, b) => Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x, a.min.z - b.max.z, b.min.z - a.max.z);
let worst = 0;
for (const s of walkable) {
  if (s.kind === 'car') continue;
  // the highest surface below this one, within a jump's horizontal reach (3 m)
  let from = floorTop, fromName = 'street';
  for (const o of walkable) {
    if (o === s || o.max.y >= s.max.y - 0.3 || gap(o, s) > 3) continue;
    if (o.max.y > from) { from = o.max.y; fromName = `${o.kind} at ${fmt(o.max.y)} m`; }
  }
  const dh = s.max.y - from;
  worst = Math.max(worst, dh);
  if (dh > reach) check(false, `${s.kind} top at ${fmt(s.max.y)} m (x ${fmt(s.min.x)}-${fmt(s.max.x)}) is ${fmt(dh)} m above ${fromName}`);
}
console.log(`Highest climb between tiers: ${fmt(worst)} m`);

// ---------- clearance rules ----------
const B = STREET.bounds;
const fronts = boxes.filter((b) => b.kind === 'bound' && b.min.z >= 6);
const streetW = Math.min(...fronts.map((b) => b.min.z)) - Math.max(...boxes.filter((b) => b.kind === 'building').map((b) => b.max.z));
console.log(`Street width: ${fmt(streetW)} m (rule: at least 12)`);
check(streetW >= 12, 'street narrower than 12 m');
// walk-under headroom: a platform over the street or another walkable top must leave 5 m
let minHead = Infinity;
for (const s of boxes) {
  if (!s.plat) continue;
  for (const o of walkable.concat(boxes.filter((b) => b.kind === 'ground'))) {
    if (o === s || o.max.y > s.min.y || gap(o, s) > 0) continue;
    const head = s.min.y - o.max.y;
    if (head < 0.05) continue;
    // only count spots you'd walk under: the overlap must be wider than a narrow strip
    const ox = Math.min(s.max.x, o.max.x) - Math.max(s.min.x, o.min.x), oz = Math.min(s.max.z, o.max.z) - Math.max(s.min.z, o.min.z);
    if (ox < 1.5 || oz < 1.5) continue;
    minHead = Math.min(minHead, head);
    if (head < 5) check(false, `${s.kind} at ${fmt(s.min.y)} m leaves ${fmt(head)} m over ${o.kind}`);
  }
}
console.log(`Lowest headroom under a walk-under structure: ${fmt(minHead)} m (rule: at least 5)`);
// alleys: gaps between back-row blocks
const row = boxes.filter((b) => b.kind === 'building' || (b.kind === 'bound' && b.max.x <= B.minX + 0.01) || (b.kind === 'bound' && b.min.x >= B.maxX - 0.01)).sort((a, b) => a.min.x - b.min.x);
let minAlley = Infinity;
for (let i = 1; i < row.length; i++) { const g = row[i].min.x - row[i - 1].max.x; if (g > 0.01) minAlley = Math.min(minAlley, g); }
console.log(`Narrowest alley: ${fmt(minAlley)} m (rule: at least 6)`);
check(minAlley >= 6, 'an alley is narrower than 6 m');

// ---------- navigation: where enemies can follow you ----------
const nav = run('Nav.stats');
console.log(`\nNav graph: ${nav.nodes} nodes on ${nav.surfaces} surfaces, ${nav.jumps} jump links, ${nav.drops} drop links`);
const nr = run(`(() => {
  const cap = Nav.MAX_COST; Nav.MAX_COST = 1e9;
  const street = Nav.bodyNode(STREET.playerStart.x, 0, STREET.playerStart.z, true);
  const surf = new Map();
  for (let k = 0; k < Nav.N; k++) if (!surf.has(Nav.nbox[k])) surf.set(Nav.nbox[k], k);
  // every street node reaches the middle of the street, and every surface has a way down to it
  Nav.solve(street, false);
  let cut = 0, stuck = [];
  for (let k = 0; k < Nav.N; k++) if (World.boxes[Nav.nbox[k]].kind === 'ground' && Nav.dist[k] < 0) cut++;
  for (const [b, k] of surf) if (Nav.dist[k] < 0) stuck.push(World.boxes[b].kind + ' at ' + World.boxes[b].max.y.toFixed(1));
  // which raised surfaces an enemy on the street can climb to
  const up = [];
  for (const [b, k] of surf) {
    const box = World.boxes[b];
    if (box.kind === 'ground' || box.kind === 'car') continue;
    Nav.solve(k, false);
    up.push({ kind: box.kind, y: box.max.y, ok: Nav.dist[street] >= 0 });
  }
  Nav.MAX_COST = cap;
  return { cut, stuck, up };
})()`);
const climbable = nr.up.filter((u) => u.ok);
console.log(`Street nodes cut off from the rest: ${nr.cut}`);
console.log(`Raised surfaces an enemy can climb to: ${climbable.length} of ${nr.up.length} (jumps up to ${run('Nav.CLIMB')} m)`);
console.log(`  climbable: ${[...new Set(climbable.map((u) => u.kind))].join(', ')}; highest ${fmt(Math.max(...climbable.map((u) => u.y)))} m`);
check(nr.cut === 0, `${nr.cut} street nodes can't reach the middle of the street`);
check(nr.stuck.length === 0, `no way down from: ${nr.stuck.join(', ')}`);
check(nr.up.filter((u) => u.kind === 'fire').every((u) => u.ok), 'enemies cannot climb every fire escape tier');

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
