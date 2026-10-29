'use strict';
// The Foundry, the second region (KRAG's): a forge hall about 72 x 64 m, its iron walls 30 m tall under an
// open roof of trusses. A river of molten iron runs the length of it from the blast furnace's tap on the west
// wall to a drain under the east wall, sunk 1.6 m below the floor and crossed by three grated bridges; whatever
// goes into it is burned and thrown back out (foundry.js). North of the river: two gantry cranes on rails 14 m
// up, each with a ladle of molten metal hanging from it (hit one, or yank it on the tether, and it tips and
// pours), an ore hopper, stacks of ingots and a rolling mill. South of it: two conveyors running opposite ways,
// rows of cooling casting molds, a hydraulic press and a storage rack. Catwalks run 7 m up along the north and
// south walls, and the furnace has its own up its face. Crucibles of slag stand about the floor (red barrels'
// place here): they burst into pools of molten slag. Clearance rules as the crossroads: open lanes at least
// 12 m wide, gaps at least 6 m, 5 m under anything you walk under.
const FOUNDRY = (() => {
  const boxes = [], lights = [], emitters = [], furniture = [], round = [];
  const B = (x0, y0, z0, x1, y1, z1, style, o = {}) => {
    const b = Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, style }, o);
    boxes.push(b);
    return b;
  };
  const glow = (x0, y0, z0, x1, y1, z1, color, o = {}) => emitters.push(Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, color, glow: true }, o));
  const line = (a, b, r, color) => furniture.push({ shape: 'line', a, b, r, color });
  const XE = 36, ZE = 32, TALL = 30, RZ = 3, RIVER_Y = -1.6;
  // the floor either side of the river, the iron lips along its banks, and the walls (going on up unseen)
  B(-XE - 2, -1, -ZE - 2, XE + 2, 0, -RZ - 0.4, 'plate', { kind: 'ground' });
  B(-XE - 2, -1, RZ + 0.4, XE + 2, 0, ZE + 2, 'plate', { kind: 'ground' });
  B(-25, RIVER_Y - 0.6, -RZ - 0.4, XE, 0, -RZ, 'iron', { kind: 'lip' });
  B(-25, RIVER_Y - 0.6, RZ, XE, 0, RZ + 0.4, 'iron', { kind: 'lip' });
  // the river's bed: unseen (foundry.js draws the molten metal over it), off the nav graph
  B(-25, RIVER_Y - 0.6, -RZ, XE, RIVER_Y, RZ, 'iron', { kind: 'lava', noNav: true, hidden: true });
  B(-XE - 2, 0, -ZE - 2, -XE, TALL, ZE + 2, 'ironwall', { kind: 'bound', cell: 2 });
  B(XE, 0, -ZE - 2, XE + 2, TALL, ZE + 2, 'ironwall', { kind: 'bound', cell: 2 });
  B(-XE, 0, -ZE - 2, XE, TALL, -ZE, 'ironwall', { kind: 'bound', cell: 2 });
  B(-XE, 0, ZE, XE, TALL, ZE + 2, 'ironwall', { kind: 'bound', cell: 2 });
  for (const b of boxes.filter((b) => b.kind === 'bound')) B(b.min.x, b.max.y, b.min.z, b.max.x, 120, b.max.z, b.style, { kind: 'bound', hidden: true });

  // ---------- the river and its bridges ----------
  for (const x of [-14, 4, 22]) {
    B(x - 2.5, -0.5, -RZ, x + 2.5, 0, RZ, 'grate', { kind: 'bridge' });
    for (const s of [-1, 1]) {
      line([x + s * 2.4, 1.1, -RZ - 0.2], [x + s * 2.4, 1.1, RZ + 0.2], 0.05, '#c8a020');
      for (const z of [-RZ, 0, RZ]) line([x + s * 2.4, 0, z], [x + s * 2.4, 1.1, z], 0.04, '#8a7018');
    }
  }
  // its glow along the hall, and the drain under the east wall it pours into
  for (let x = -22; x <= 34; x += 8) lights.push({ x, y: 1.2, z: 0, color: '#ff6a1a', intensity: 2.6, range: 13, group: 'fire' });
  glow(XE - 0.1, RIVER_Y - 0.4, -RZ, XE, 0.6, RZ, '#ff7a2a', { fire: true });
  for (const z of [-2, -0.6, 0.8, 2.2]) B(XE - 0.4, RIVER_Y - 0.4, z - 0.15, XE, 0.6, z + 0.15, 'iron', { kind: 'prop' });

  // ---------- the blast furnace on the west wall, the river flowing from its tap ----------
  const FX0 = -25;
  B(-XE, 0, -9, FX0, 20, 9, 'brickfire', { kind: 'building', top: 'iron' });
  B(-33, 20, -4, -28, 28, 4, 'iron', { kind: 'prop' });
  // the tap hole over the river's head, slits glowing in its face, its iron bands
  glow(FX0, 2.2, -1.2, FX0 + 0.08, 4.0, 1.2, '#ffc060', { fire: true });
  for (const [y, z] of [[7.5, -6], [7.5, 6], [12, -3.5], [12, 3.5], [16.5, 0]]) glow(FX0, y, z - 0.5, FX0 + 0.06, y + 0.35, z + 0.5, '#ff7a2a', { fire: true });
  for (const y of [6, 11, 17]) B(FX0, y - 0.25, -9, FX0 + 0.25, y + 0.25, 9, 'iron', { kind: 'prop' });
  lights.push({ x: FX0 + 2, y: 3.2, z: 0, color: '#ff9a3a', intensity: 3.6, range: 20, group: 'fire' });
  lights.push({ x: -30.5, y: 29, z: 0, color: '#ff7a2a', intensity: 2.2, range: 16, group: 'fire' });
  // catwalks up its face either side of the river, 5.4 m apart, to its top
  for (const [z0, z1] of [[-9, -4.4], [4.4, 9]]) for (const y of [5.5, 10.9, 16.3]) B(FX0, y - 0.3, z0, FX0 + 2.4, y, z1, 'grate', { kind: 'catwalk', plat: true });
  // a downcomer pipe and the tuyeres round its hearth
  line([-27, 27, -6.5], [-27, 20, -6.5], 0.8, '#3a2e2a'); line([-27, 20, -6.5], [-27, 9, -11], 0.8, '#3a2e2a');
  for (const z of [-7, -3.5, 3.5, 7]) line([FX0 - 0.1, 5, z], [FX0 + 0.6, 4, z], 0.22, '#4a3a32');

  // ---------- north of the river ----------
  // the catwalk along the north wall, the gantry rails over it and along the river, the rail's columns
  B(FX0, 6.7, -ZE, XE, 7, -29.5, 'grate', { kind: 'catwalk', plat: true });
  B(FX0, 13.4, -ZE, XE, 14, -29.8, 'iron', { kind: 'rail', plat: true });
  B(-22, 13.4, -6.2, XE, 14, -4, 'iron', { kind: 'rail', plat: true });
  for (const x of [-18, -6, 6, 18, 30]) B(x - 0.4, 0, -5.5, x + 0.4, 13.4, -4.7, 'steel', { kind: 'pillar' });
  for (const x of [-20, -8, 4, 16, 28]) line([x, 7.9, -29.4], [x + 12, 7.9, -29.4], 0.04, '#8a7018');
  // two gantry cranes, each with a ladle of molten metal on its hook (foundry.js hangs and tips them)
  const ladles = [];
  for (const [x0, x1, lz] of [[-12, -9, -17], [10, 13, -15]]) {
    B(x0, 13.4, -29.8, x1, 14, -6.2, 'yellow', { kind: 'gantry', plat: true });
    const lx = (x0 + x1) / 2;
    ladles.push({ x: lx, z: lz, y: 3.6, hook: 13.3 });
    // its trolley and hook block, the chains down to the ladle's bail
    B(lx - 1.2, 12.5, lz - 1.2, lx + 1.2, 13.4, lz + 1.2, 'yellow', { kind: 'crane' });
    for (const s of [-1, 1]) line([lx + s * 0.5, 12.5, lz], [lx + s * 1.25, 7.1, lz], 0.07, '#2e2a28');
    glow(lx - 0.15, 14, lz - 0.15, lx + 0.15, 14.3, lz + 0.15, '#ff2030', { blink: true });
  }
  // tether points under the gantries, to zip or be flung up onto them
  const anchors = [];
  for (const x of [-10.5, 11.5]) for (const z of [-26, -9.5]) {
    anchors.push({ x, y: 13.1, z, top: 14, w: 1.5, kind: 'jib' });
    glow(x - 0.12, 13.2, z - 0.12, x + 0.12, 13.4, z + 0.12, '#ffb040');
  }
  // the ore hopper, stacks of ingots stepping up toward the catwalk, the rolling mill and its rollers
  B(-4, 0, -28, 2, 9, -22, 'rust', { kind: 'building', top: 'grate' });
  B(-3.4, 9, -27.4, 1.4, 9.6, -26.6, 'iron', { kind: 'prop' });
  B(-20, 0, -27, -16, 1.6, -23, 'ingot', { kind: 'stack' });
  B(-20, 1.6, -27, -18, 3.2, -24, 'ingot', { kind: 'stack' });
  B(-15.5, 0, -14.5, -13, 1.6, -11.5, 'ingot', { kind: 'stack' });
  B(14, 0, -28, 34, 3.6, -21, 'rust', { kind: 'machine' });
  for (const z of [-26.2, -23]) {
    B(16, 3.6, z - 0.6, 32, 4.8, z + 0.6, 'steel', { kind: 'prop', hidden: true });
    furniture.push({ shape: 'cyl', x: 32, y: 4.2, z, r: 0.6, h: 16, axis: 'x', color: '#6a6268' });
  }
  for (const z of [-26.2, -23]) furniture.push({ shape: 'cyl', x: 14.1, y: 2.2, z, r: 1.5, h: 0.3, axis: 'x', color: '#3a3438' });
  glow(20, 3.62, -22, 28, 3.66, -21.6, '#a8300a');
  // scrap: heaps of offcuts on the north floor
  B(22, 0, -13, 27, 1.2, -9, 'rust', { kind: 'stack' });
  B(23, 1.2, -12, 26, 2.4, -10, 'rust', { kind: 'stack' });

  // ---------- south of the river ----------
  B(FX0, 6.7, 29.5, XE, 7, ZE, 'grate', { kind: 'catwalk', plat: true });
  for (const x of [-20, -8, 4, 16, 28]) line([x, 7.9, 29.4], [x + 12, 7.9, 29.4], 0.04, '#8a7018');
  // two conveyors running opposite ways (foundry.js carries what stands on them and runs their belts)
  const conveyors = [];
  for (const [z0, z1, dir, style] of [[6, 8.4, 1, 'belt'], [14.5, 16.9, -1, 'belt2']]) {
    const box = B(-10, 0, z0, 16, 1.1, z1, 'iron', { kind: 'conveyor', top: style });
    conveyors.push({ box, dir: { x: dir, z: 0 }, speed: 4.5, style });
    for (const x of [-10, 16]) furniture.push({ shape: 'cyl', x, y: 0.75, z: z0, r: 0.38, h: z1 - z0, axis: 'z', color: '#4a4448' });
  }
  // casting molds: rows of iron moulds with metal cooling in them
  for (const z of [7, 10, 13]) for (const x of [20, 24, 28]) {
    B(x, 0, z, x + 3, 0.6, z + 1.8, 'iron', { kind: 'mold' });
    glow(x + 0.3, 0.6, z + 0.3, x + 2.7, 0.62, z + 1.5, '#8a2208');
  }
  lights.push({ x: 25.5, y: 1.2, z: 10.5, color: '#ff5a1a', intensity: 1.8, range: 10, group: 'fire' });
  // the hydraulic press: its bed, four columns, the crosshead over them, the die glowing hot
  B(-24, 0, 20, -14, 3, 29, 'rust', { kind: 'machine' });
  for (const [x, z] of [[-23.2, 20.8], [-14.8, 20.8], [-23.2, 28.2], [-14.8, 28.2]]) B(x - 0.6, 3, z - 0.6, x + 0.6, 11, z + 0.6, 'steel', { kind: 'pillar' });
  B(-24, 11, 20, -14, 12.4, 29, 'yellow', { kind: 'machine', plat: true });
  B(-21, 3, 22.5, -17, 3.5, 26.5, 'iron', { kind: 'prop' });
  glow(-20.4, 3.5, 23.1, -17.6, 3.53, 25.9, '#b8380a');
  lights.push({ x: -19, y: 5, z: 24.5, color: '#ff7a2a', intensity: 1.8, range: 10, group: 'fire' });
  // the storage rack in the south-east corner, stepping up to the catwalk
  B(26, 0, 22, 34, 3.4, 29, 'rust', { kind: 'stack' });
  B(28, 3.4, 24, 34, 6.2, 29, 'rust', { kind: 'stack' });
  B(-31, 0, 12, -27, 1.6, 15.5, 'ingot', { kind: 'stack' });

  // ---------- the hall: great gears on the north wall, the mill's flywheel, pipes, chains, trusses, lamps ----------
  const gear = (x, y, z, r, axis, n) => {
    furniture.push({ shape: 'cyl', x, y, z, r, h: 0.5, axis, color: '#2e2a2e', seg: n * 2 }, { shape: 'cyl', x, y, z, r: r * 0.3, h: 0.7, axis, color: '#4a4448' });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, c = Math.cos(a) * r * 0.85, d = Math.sin(a) * r * 0.85;
      line(axis === 'z' ? [x, y, z + 0.25] : [x - 0.25, y, z], axis === 'z' ? [x + c, y + d, z + 0.25] : [x - 0.25, y + d, z + c], 0.14, '#3a3438');
    }
  };
  gear(4, 18, -31.9, 4, 'z', 12); gear(11.8, 15.6, -31.9, 2.6, 'z', 8); gear(-8, 19, -31.9, 3, 'z', 10);
  gear(34.6, 6.5, -24.5, 3.2, 'x', 10);
  for (const [x, z, y] of [[-16, -6, 15], [2, 8, 17], [16, 20, 14], [-4, -24, 16], [26, -2, 18]]) { line([x, 23, z], [x, y, z], 0.06, '#2e2a2c'); furniture.push({ shape: 'box', x, y: y - 0.5, z, w: 0.5, d: 0.2, h: 0.5, color: '#3a3438' }); }
  // ---------- the hall: pipes along the walls, roof trusses, work lamps ----------
  for (const z of [-31.3, 31.3]) {
    furniture.push({ shape: 'cyl', x: XE, y: 2.2, z, r: 0.5, h: 60, axis: 'x', color: '#4a3a30' });
    furniture.push({ shape: 'cyl', x: XE, y: 3.5, z, r: 0.32, h: 60, axis: 'x', color: '#5a4a3a' });
  }
  for (const x of [-12, 4, 20]) line([x, 0, -31.3], [x, 26, -31.3], 0.35, '#3a3230');
  for (let x = -30; x <= 30; x += 10) { line([x, 26, -ZE], [x, 26, ZE], 0.3, '#2a2428'); line([x, 26, -ZE], [x, 23, 0], 0.15, '#2a2428'); line([x, 26, ZE], [x, 23, 0], 0.15, '#2a2428'); }
  line([-XE, 23, 0], [XE, 23, 0], 0.3, '#2a2428');
  // sodium work lamps high on the long walls and hanging over the floors (they go out in a Blackout)
  const lamp = (x, y, z, hang) => {
    glow(x - 0.5, y - 0.15, z - 0.3, x + 0.5, y, z + 0.3, '#ffd8a0', { lamp: true });
    if (hang) line([x, 23, z], [x, y, z], 0.03, '#2a2428');
    lights.push({ x, y: y - 0.6, z, color: '#ffb860', intensity: 3.0, range: 22, street: true, group: 'lamp' });
  };
  for (const x of [-16, 0, 16, 30]) { lamp(x, 11.5, -31.6); lamp(x, 11.5, 31.6); }
  for (const [x, z] of [[-4, -15], [20, -16], [2, 11], [20, 24], [-14, 16], [-22, -20], [6, -26], [30, -18], [-26, 18], [6, 25], [30, 8]]) lamp(x, 10.5, z, true);

  // crucibles of slag about the floor (foundry.js), and one up on the south catwalk
  const crucibleSpots = [[-16, 0, -18], [6, 0, -18], [24, 0, -6], [-6, 0, 12], [12, 0, 24], [-22, 0, 9], [30, 0, 18], [18, 7, 30.7]]
    .map(([x, y, z]) => ({ x, y, z }));
  // sniper perches: platform and machine edges from 9 m to 16.5 m
  const perches = [];
  for (const b of boxes.filter((b) => (b.plat || b.kind === 'building' || b.kind === 'machine') && b.max.y >= 9 && b.max.y <= 16.5 && b.max.x - b.min.x >= 3.6 && b.max.z - b.min.z >= 2)) {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const [x, z] of [[b.min.x + 0.6, cz], [b.max.x - 0.6, cz], [cx, b.min.z + 0.6], [cx, b.max.z - 0.6]]) perches.push({ x, y: b.max.y, z });
  }
  const ground = [[-20, -14], [-8, -24], [6, -10], [20, -14], [30, -8], [30, -16], [-18, 6], [-6, 26], [8, 27], [20, 20], [32, 6], [-30, 20], [-30, -16], [-10, 22]]
    .map(([x, z]) => ({ x, y: 0, z }));
  const high = [[-20, 7, -30.6], [0, 7, -30.6], [24, 7, -30.6], [-20, 7, 30.6], [0, 7, 30.6], [20, 7, 30.6], [20, 3.6, -24.6], [-19, 3, 21]]
    .map(([x, y, z]) => ({ x, y, z }));
  return {
    name: 'The Foundry', boxes, groundY: 0, emitters, lights, lamps: [], round, furniture, anchors,
    ambient: [0.05, 0.034, 0.03], sky: [0.05, 0.034, 0.03], bg: '#160b08', fog: { near: 30, far: 115 }, weather: 'embers',
    bounds: { minX: -XE, maxX: XE, minZ: -ZE, maxZ: ZE },
    playerStart: { x: 0, y: 0, z: 22, yaw: 0 },
    // where a portal from the crossroads lets you out, and where the one back opens
    arrival: { x: 0, y: 0, z: 22, yaw: 0 }, portalAt: { x: -4, y: 0, z: 24 },
    // where the bosses arrive: the north floor, across the river from you
    bossAt: { x: 2, z: -13 },
    spawn: { ground, high }, perches, barrelSpots: crucibleSpots, crucibles: true,
    // the molten river (foundry.js burns what falls in), its bed's height and the surface drawn over it
    lava: [{ min: { x: FX0, z: -RZ }, max: { x: XE, z: RZ }, y: RIVER_Y, surface: -1.05 }],
    // the furnace's tap pouring into the river's head
    pours: [{ a: [FX0 + 0.1, 3.0, 0], b: [FX0 + 2.6, -1.05, 0], r: 0.45 }],
    conveyors, ladles,
    clearance: {
      streets: [{ min: { x: -22, z: -19.5 }, max: { x: XE, z: -6.5 } }, { min: { x: -12, z: 16.9 }, max: { x: 25, z: 29.4 } }],
      alleys: [{ min: { x: -10, z: 8.4 }, max: { x: 16, z: 14.5 } }, { min: { x: -22.6, z: -20 }, max: { x: -16, z: -9 } }],
    },
    orbit: { dist: 26, pitch: -0.45, lift: 5 },
  };
})();
ARENAS.foundry = FOUNDRY;
