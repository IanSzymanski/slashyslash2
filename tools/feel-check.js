#!/usr/bin/env node
// Runs the character controller headless on the 2D street and prints movement in metres: the run and
// sprint, turns and skids, jumps, dash, slide, vaults and mantles. Then checks each arena from its box
// list: every raised surface reachable from the one below with a double jump plus a mantle, the
// clearance rules (streets, alleys, headroom), and the nav graph (the ground in one piece, a way down
// from every surface, fire escapes and roofs enemies can climb). Exits 1 on a failed check. Usage: node tools/feel-check.js
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
run('World.build(STREET)');
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
    if (c.dashT > 0) Controller.moveDash(c, DT); else if (!c.mantle && !c.vault) Controller.moveNormal(c, DT, I);
    Controller.integrate(c, DT, I);
    trace.push({ t, x: c.pos.x, y: c.pos.y, z: c.pos.z, v: Math.hypot(c.vel.x, c.vel.z), vy: c.vel.y, g: c.onGround, slide: c.sliding, mantle: !!c.mantle, vault: !!c.vault, skid: c.skidding, skidTurn: !!c.skid, wall: c.wallSliding, cling: !!c.cling });
  }
  return trace;
}

const start = { x: 100, y: 0, z: 2 };
const fmt = (n) => n.toFixed(2);
const rows = [];
let failed = false;
const check = (ok, msg) => { if (!ok) { failed = true; console.log('FAIL ' + msg); } };

// run: hold forward along the street. A quick start to the run speed, then the sprint builds.
let tr = simulate(2, start, (t) => ({ mx: 1 }));
const top = Math.max(...tr.map((s) => s.v));
const tRun = tr.find((s) => s.v >= MOVE.RUN * 0.95).t, t90 = tr.find((s) => s.v >= top * 0.9).t;
rows.push(['Run, building to a sprint', `${fmt(MOVE.RUN)} to ${fmt(top)} m/s`, `run in ${fmt(tRun)} s, 90% of the sprint in ${fmt(t90)} s`]);
check(tRun < 0.25 && top >= MOVE.SPRINT - 0.01, 'the run is slow to start or never reaches the sprint');
// a stop from a sprint, a 90 degree turn at a sprint (it carves, keeping speed), and a reversal (it skids)
tr = simulate(3, start, (t) => ({ mx: t < 1.5 ? 1 : 0 }));
const stopI = tr.findIndex((s) => s.t >= 1.5), stopEnd = tr.slice(stopI).find((s) => s.v < 0.05);
rows.push(['Stop from a sprint', `${fmt(stopEnd.x - tr[stopI].x)} m`, `${fmt(stopEnd.t - 1.5)} s`]);
tr = simulate(2.5, { x: start.x, y: 0, z: -5 }, (t) => (t < 1.5 ? { mx: 1 } : { mz: 1 }));
const turnI = tr.findIndex((s) => s.t >= 1.5), turned = tr.slice(turnI).find((s, i, a) => i > 0 && Math.abs(Math.atan2(s.z - a[i - 1].z, s.x - a[i - 1].x) - Math.PI / 2) < 0.05);
const slowest = Math.min(...tr.slice(turnI, turnI + 60).map((s) => s.v));
rows.push(['90 degree turn at a sprint', turned ? `${fmt(turned.t - 1.5)} s to come round` : 'never came round', `slowest ${fmt(slowest)} m/s`]);
check(turned && slowest > MOVE.RUN * 0.9, 'a turn at a sprint loses too much speed');
tr = simulate(2.5, start, (t) => ({ mx: t < 1.5 ? 1 : -1 }));
const skids = tr.filter((s) => s.skid).length * DT, back = tr.slice(turnI).find((s, i, a) => i > 0 && s.x < a[i - 1].x);
const onHand = tr.some((s) => s.skidTurn), backI = back ? tr.indexOf(back) : -1, push = backI >= 0 ? Math.max(...tr.slice(backI, backI + 3).map((s) => s.v)) : 0;
rows.push(['Reversal at a sprint', `${fmt(skids)} s skid${onHand ? ' turn on the hand' : ''}`, back ? `moving back after ${fmt(back.t - 1.5)} s, pushing off at ${fmt(push)} m/s` : 'never came back']);
check(skids > 0.1 && back && onHand && push >= MOVE.RUN * MOVE.SKID_PUSH - 0.01, 'a reversal at a sprint does not skid on the hand and push off');

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

// wall cling and kick: jump beside a building's front wall pushing in. The hand digs in near the top of the
// jump and holds a second, then the slide builds slowly; a jump 0.8 s into the slide kicks off.
const bld = STREET.boxes.find((b) => b.kind === 'building' && b.max.y > 12);
const wz = bld.max.z + MOVE.R + 0.05, wx = (bld.min.x + bld.max.x) / 2;
let kickT = null, slideV = 0, slideT = null;
tr = simulate(3.4, { x: wx, y: 0, z: wz }, (t, c) => {
  if (c.wallSliding) { slideV = Math.min(slideV, c.vel.y); if (slideT === null) slideT = t; }
  if (kickT === null && slideT !== null && t >= slideT + 0.8) kickT = t;
  return { mz: kickT === null ? -1 : 0, jump: t < DT || (kickT !== null && Math.abs(t - kickT) < DT / 2), jumpHeld: true };
});
const cI = tr.findIndex((s) => s.cling), hold = tr.filter((s) => s.cling && !s.wall);
const holdDrift = hold.length ? Math.max(...hold.map((s) => s.y)) - Math.min(...hold.map((s) => s.y)) : 0;
const kI = tr.findIndex((s) => kickT !== null && s.t >= kickT);
const kickApex = kI >= 0 ? Math.max(...tr.slice(kI).map((s) => s.y)) - tr[kI].y : 0;
const kickOut = kI >= 0 ? Math.max(...tr.slice(kI).map((s) => s.z)) - wz : 0;
rows.push(['Wall cling', cI >= 0 ? `at ${fmt(tr[cI].y)} m, held ${fmt(hold.length * DT)} s` : 'never clung', `slide ${fmt(-slideV)} m/s after 0.8 s`]);
rows.push(['Wall kick', kickT === null ? 'no wall slide' : `+${fmt(kickApex)} m up, ${fmt(kickOut)} m out`, '']);
check(cI >= 0 && Math.abs(hold.length * DT - MOVE.CLING_HOLD) < 0.05 && holdDrift < 0.01, 'a cling does not hold still for CLING_HOLD');
check(slideV < -2 && slideV > -MOVE.WALL_SLIDE, 'the slide after a cling does not build slowly');
check(kickT !== null && kickApex > 2.5, 'could not cling, slide and kick off a wall');
// letting go of the movement keys drops off the wall at once
let clungAt = null, droppedAt = null;
tr = simulate(1.6, { x: wx, y: 0, z: wz }, (t, c) => {
  if (c.cling && clungAt === null) clungAt = t;
  if (clungAt !== null && !c.cling && droppedAt === null) droppedAt = t;
  return { mz: clungAt === null || t < clungAt + 0.3 ? -1 : 0, jump: t < DT, jumpHeld: true };
});
check(clungAt !== null && droppedAt !== null && droppedAt - (clungAt + 0.3) <= DT * 3, 'letting go of the keys does not drop off a wall at once');
rows.push(['Wall cling, keys released', droppedAt !== null ? `off the wall a tick after letting go` : 'still on it', '']);
// without a cling there's no kick: a jump near a wall that isn't pushed into is a double jump
tr = simulate(1.2, { x: wx, y: 0, z: wz }, (t) => ({ mx: 0.2, jump: t < DT || Math.abs(t - 0.45) < DT / 2, jumpHeld: true }));
check(!tr.some((s) => s.cling) && Math.max(...tr.map((s) => s.z)) - wz < 2, 'a jump beside a wall kicks off it without a cling');

// vaults: run at a wrecked car end-on (onto its 1.55 m roof) and side-on (over it), without breaking stride
const car = STREET.boxes.find((b) => b.kind === 'car' && b.min.y > 0);
tr = simulate(1.2, { x: car.min.x - 4, y: 0, z: (car.min.z + car.max.z) / 2 }, () => ({ mx: 1 }));
const carTop = Math.max(...tr.map((s) => s.y)), vI = tr.findIndex((s) => s.vault), vEnd = tr.slice(vI).find((s) => !s.vault);
rows.push(['Vault onto a wrecked car', vI >= 0 ? `top ${fmt(carTop)} m in ${fmt(vEnd.t - tr[vI].t)} s` : 'blocked', vI >= 0 ? `${fmt(tr[vI - 1].v)} to ${fmt(vEnd.v)} m/s` : '']);
check(vI >= 0 && carTop >= car.max.y - 0.01 && vEnd.v > 8, 'running at a wrecked car does not vault onto it at speed');
// the car mid-street, run at from the front side so there's room to land beyond it
const carBody = STREET.boxes.filter((b) => b.kind === 'car' && b.min.y === 0).sort((a, b) => Math.abs(a.min.z - 0.5) - Math.abs(b.min.z - 0.5))[0];
tr = simulate(1.4, { x: (carBody.min.x + carBody.max.x) / 2, y: 0, z: carBody.max.z + 4 }, () => ({ mz: -1 }));
const over = tr.find((s) => s.z < carBody.min.z - 0.5 && s.g);
rows.push(['Vault over a wrecked car side-on', over ? `clear at ${fmt(over.t)} s` : 'blocked', over ? `${fmt(over.v)} m/s after` : '']);
check(over && over.v > 8, 'running at a wrecked car side-on does not vault over it at speed');

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

// ledges in the crossroads: walking into a car or a shipping container climbs it, a running jump at a container
// climbs it from the air, and a tall wall is clung to instead
run('World.build(ARENAS.crossroads)');
const climbRow = (name, tr, top) => {
  const i = tr.findIndex((s) => s.mantle), j = i >= 0 ? tr.slice(i).findIndex((s) => !s.mantle) + i : -1, end = i >= 0 ? tr[j] : tr[tr.length - 1];
  const ok = i >= 0 && Math.abs(end.y - top) < 0.05;
  rows.push([name, ok ? `on top at ${fmt(end.y)} m` : `at ${fmt(end.y)} m`, i >= 0 ? `${tr[i - 1].g ? 'from the ground' : 'from the air'}, ${fmt(end.t - tr[i].t)} s` : 'no climb']);
  return ok ? tr[i - 1] : null;
};
tr = simulate(1.6, { x: 20.6, y: 0, z: 2.7 }, () => ({ mx: 0.3 }));
check(climbRow('Walk into a wrecked car', tr, 1.55), 'walking into a wrecked car does not climb onto its roof');
tr = simulate(1.6, { x: 30.6, y: 0, z: -6 }, () => ({ mx: 0.3 }));
const wc = climbRow('Walk into a 2.6 m container', tr, 2.6);
check(wc && wc.g, 'walking into a shipping container does not climb it');
let jumpT = null;
tr = simulate(1.6, { x: 25, y: 0, z: -6 }, (t, c) => { if (jumpT === null && c.pos.x > 30.8) jumpT = t; return { mx: 1, jump: t === jumpT, jumpHeld: jumpT !== null && t < jumpT + 0.4 }; });
const jc = climbRow('Running jump at a container', tr, 2.6);
check(jc && !jc.g, 'a running jump at a shipping container does not climb it from the air');
run('World.build(STREET)');

console.log('Movement (metres)');
for (const r of rows) console.log(`  ${r[0].padEnd(34)}${r[1].padEnd(34)}${r[2]}`);

// ---------- arenas: reach, clearance rules and navigation, from each arena's box list ----------
const reach = apex2 + MOVE.MANTLE_UP;
console.log(`\nReach: double jump ${fmt(apex2)} m + mantle ${fmt(MOVE.MANTLE_UP)} m = ${fmt(reach)} m`);
const gap = (a, b) => Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x, a.min.z - b.max.z, b.min.z - a.max.z);
for (const id of run('Object.keys(ARENAS)')) {
  const def = run(`ARENAS.${id}`);
  run(`World.build(ARENAS.${id})`);
  console.log(`\n${def.name} (${id}): ${def.boxes.length} boxes`);
  const boxes = def.boxes.filter((b) => !b.hidden);
  // every raised surface can be reached from the highest surface below it within a jump's sideways reach (3 m)
  const walkable = boxes.filter((b) => b.kind !== 'bound' && b.kind !== 'ground' && b.kind !== 'wall' && b.kind !== 'ceiling');
  let worst = 0;
  for (const s of walkable) {
    // cars and props are climbed over, not onto; the crane is reached by tether, and the training course's
    // tops along the course (wall kicks, the tether); pillar and beam tops aren't floors
    if (s.kind === 'car' || s.kind === 'prop' || s.kind === 'crane' || s.tetherOnly || s.viaCourse || Math.min(s.max.x - s.min.x, s.max.z - s.min.z) < 0.8) continue;
    let from = def.groundY, fromName = 'the ground';
    for (const o of walkable) {
      if (o === s || o.max.y >= s.max.y - 0.3 || gap(o, s) > 3) continue;
      if (o.max.y > from) { from = o.max.y; fromName = `${o.kind} at ${fmt(o.max.y)} m`; }
    }
    const dh = s.max.y - from;
    worst = Math.max(worst, dh);
    if (dh > reach) check(false, `${id}: ${s.kind} top at ${fmt(s.max.y)} m (x ${fmt(s.min.x)}-${fmt(s.max.x)}, z ${fmt(s.min.z)}-${fmt(s.max.z)}) is ${fmt(dh)} m above ${fromName}`);
  }
  console.log(`  Highest climb between tiers: ${fmt(worst)} m`);
  // streets and alleys: wide enough, and no building or boundary standing in them
  const solid = boxes.filter((b) => b.kind === 'building' || b.kind === 'bound' || b.kind === 'wall');
  const lane = (list, rule, what) => {
    let min = Infinity;
    for (const r of list) {
      const w = Math.min(r.max.x - r.min.x, r.max.z - r.min.z);
      min = Math.min(min, w);
      const hit = solid.find((b) => b.min.x < r.max.x - 1e-6 && b.max.x > r.min.x + 1e-6 && b.min.z < r.max.z - 1e-6 && b.max.z > r.min.z + 1e-6);
      if (hit) check(false, `${id}: a ${hit.kind} stands in a ${what} (x ${fmt(r.min.x)}-${fmt(r.max.x)}, z ${fmt(r.min.z)}-${fmt(r.max.z)})`);
    }
    console.log(`  Narrowest ${what}: ${fmt(min)} m (rule: at least ${rule})`);
    check(min >= rule, `${id}: a ${what} is narrower than ${rule} m`);
  };
  lane(def.clearance.streets, 12, 'street');
  lane(def.clearance.alleys, 6, 'alley');
  // walk-under headroom: a platform over a walkable top must leave 5 m
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
      if (head < 5) check(false, `${id}: ${s.kind} at ${fmt(s.min.y)} m leaves ${fmt(head)} m over ${o.kind}`);
    }
  }
  console.log(`  Lowest headroom under a walk-under structure: ${fmt(minHead)} m (rule: at least 5)`);
  // a fast fall onto a thin slab lying on another box (the plaza deck) lands on the slab, not inside it
  const thin = walkable.filter((b) => b.max.y - b.min.y < 0.5 && boxes.some((o) => o !== b && Math.abs(o.max.y - b.min.y) < 1e-6));
  const sunk = run(`(() => { let bad = 0; for (const t of ${JSON.stringify(thin.map((b) => [(b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, b.max.y]))}) for (let i = 0; i < 60; i++) {
    const b = { pos: { x: t[0], y: t[2] + 0.4 + i * 0.011, z: t[1] }, vel: { x: 0, y: 0, z: 0 }, r: 0.4, h: 1.8 };
    for (let f = 0; f < 60; f++) { if (!b.onGround || f < 2) b.vel.y = -2 - i * 0.5; World.moveBody(b, 1 / 60); }
    if (Math.abs(b.pos.y - t[2]) > 1e-6) bad++;
  } return bad; })()`);
  if (thin.length) { check(sunk === 0, `${id}: ${sunk} fast landings on a thin slab sank into it`); console.log(`  Fast landings on thin slabs: ${thin.length * 60 - sunk} of ${thin.length * 60} land on top`); }
  // navigation: the ground in one piece, a way down from everywhere, the fire escapes climbable
  const nav = run('Nav.stats');
  const nr = run(`(() => {
    const cap = Nav.MAX_COST; Nav.MAX_COST = 1e9;
    const st = World.def.playerStart, start = Nav.bodyNode(st.x, st.y, st.z, true);
    const surf = new Map();
    for (let k = 0; k < Nav.N; k++) if (!surf.has(Nav.nbox[k])) surf.set(Nav.nbox[k], k);
    Nav.solve(start, false);
    let cut = 0;
    const stuck = [];
    for (let k = 0; k < Nav.N; k++) if (World.boxes[Nav.nbox[k]].kind === 'ground' && Nav.dist[k] < 0) cut++;
    for (const [b, k] of surf) if (Nav.dist[k] < 0) stuck.push(World.boxes[b].kind + ' at ' + World.boxes[b].max.y.toFixed(1));
    const up = [];
    for (const [b, k] of surf) {
      const box = World.boxes[b];
      if (box.max.y < 2 || box.kind === 'car') continue;
      Nav.solve(k, false);
      up.push({ kind: box.kind, y: box.max.y, ok: Nav.dist[start] >= 0 });
    }
    Nav.MAX_COST = cap;
    return { cut, stuck, up };
  })()`);
  const climbable = nr.up.filter((u) => u.ok);
  console.log(`  Nav graph: ${nav.nodes} nodes on ${nav.surfaces} surfaces, ${nav.jumps} jump links, ${nav.drops} drop links`);
  console.log(`  Ground nodes cut off: ${nr.cut}; raised surfaces an enemy can climb to: ${climbable.length} of ${nr.up.length}, highest ${fmt(Math.max(...climbable.map((u) => u.y)))} m`);
  check(nr.cut === 0, `${id}: ${nr.cut} ground nodes can't reach the player's start`);
  check(nr.stuck.length === 0, `${id}: no way down from: ${nr.stuck.join(', ')}`);
  check(nr.up.filter((u) => u.kind === 'fire').every((u) => u.ok), `${id}: enemies cannot climb every fire escape tier`);
  if (id === 'crossroads') check(nr.up.filter((u) => u.kind === 'building' || u.kind === 'frame').every((u) => u.ok), `${id}: some roof or frame floor can't be reached by a climbing enemy`);
  const notUp = nr.up.filter((u) => !u.ok).map((u) => `${u.kind} ${fmt(u.y)}`);
  if (notUp.length) console.log(`  Not climbable by enemies (tether or jump only): ${notUp.join(', ')}`);
}

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
