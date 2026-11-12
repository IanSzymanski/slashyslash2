'use strict';
// The Rift, the third region (REAP-R's): a ruined cathedral square about 72 x 68 m, torn loose from the world
// under an eclipsed moon. Its layout is nothing like the other two. In the middle a 20 m dais stands as an
// island inside a moat of void 4 m wide (rift.js: whatever falls in is torn at and thrown back out), crossed by
// four bridges; the great arch from the concept art stands across the dais, 16 m up. Round the moat: a nave
// of broken pillars running in from the south, the cathedral's north wall with a gallery 7 m up between two
// spire stumps whose ledges climb their faces, a collapsed chapel and a bell tower's stump. Chunks of masonry
// torn out of the ground hang in the air in two staircases (one up to the arch) and a few on their own.
// Standing tears in pairs lead from the ground up onto the arch and the gallery (rift.js). Clearance rules as
// the other regions: open lanes at least 12 m wide, gaps at least 6 m, 5 m under anything you walk under.
const RIFT = (() => {
  const boxes = [], lights = [], emitters = [], furniture = [], round = [];
  const B = (x0, y0, z0, x1, y1, z1, style, o = {}) => {
    const b = Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, style }, o);
    boxes.push(b);
    return b;
  };
  const glow = (x0, y0, z0, x1, y1, z1, color, o = {}) => emitters.push(Object.assign({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) }, color, glow: true }, o));
  const line = (a, b, r, color) => furniture.push({ shape: 'line', a, b, r, color });
  const XE = 36, ZE = 34, IS = 10, MO = 14, LIP = 0.4, VOID_Y = -3, VIOLET = '#a050ff';

  // ---------- the ground: the square round the moat, the dais inside it, the moat's lips and its bed ----------
  B(-XE - 2, -1, -ZE - 2, XE + 2, 0, -MO - LIP, 'flag', { kind: 'ground' });
  B(-XE - 2, -1, MO + LIP, XE + 2, 0, ZE + 2, 'flag', { kind: 'ground' });
  B(-XE - 2, -1, -MO - LIP, -MO - LIP, 0, MO + LIP, 'flag', { kind: 'ground' });
  B(MO + LIP, -1, -MO - LIP, XE + 2, 0, MO + LIP, 'flag', { kind: 'ground' });
  B(-IS + LIP, -1, -IS + LIP, IS - LIP, 0, IS - LIP, 'relic', { kind: 'ground' });
  // the lips: the dais's edge and the square's, faced down into the void
  for (const [r0, r1] of [[IS - LIP, IS], [MO, MO + LIP]]) {
    B(-r1, VOID_Y - 0.6, -r1, r1, 0, -r0, 'ruin', { kind: 'lip' });
    B(-r1, VOID_Y - 0.6, r0, r1, 0, r1, 'ruin', { kind: 'lip' });
    B(-r1, VOID_Y - 0.6, -r0, -r0, 0, r0, 'ruin', { kind: 'lip' });
    B(r0, VOID_Y - 0.6, -r0, r1, 0, r0, 'ruin', { kind: 'lip' });
  }
  // the moat's four reaches (their beds unseen, off the nav graph; foundry.js draws the void over them)
  const reaches = [[-MO, -MO, MO, -IS], [-MO, IS, MO, MO], [-MO, -IS, -IS, IS], [IS, -IS, MO, IS]];
  for (const [x0, z0, x1, z1] of reaches) B(x0, VOID_Y - 0.6, z0, x1, VOID_Y, z1, 'ruin', { kind: 'lava', noNav: true, hidden: true });
  // four bridges: a broad one from the nave, narrower ones on the other sides
  for (const [x0, z0, x1, z1] of [[-3, IS, 3, MO], [-1.8, -MO, 1.8, -IS], [-MO, -1.8, -IS, 1.8], [IS, -1.8, MO, 1.8]]) B(x0, -0.5, z0, x1, 0, z1, 'flag', { kind: 'bridge' });
  // the void's glow up out of the moat
  for (const [x, z] of [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, -12], [0, 12], [-12, 0], [12, 0]]) lights.push({ x, y: 0.9, z, color: '#8a40e8', intensity: 2.4, range: 12, group: 'fire' });

  // ---------- the walls: what's left of the cathedral close, broken off at different heights ----------
  const wall = (x0, z0, x1, z1, h) => B(x0, 0, z0, x1, h, z1, 'gothic', { kind: 'bound', cell: 2 });
  const hs = [13, 17, 11, 20, 14, 10, 16, 12, 19];
  for (let i = 0; i < 9; i++) {
    const x0 = -XE + i * 8, x1 = x0 + 8;
    wall(x0, -ZE - 2, x1, -ZE, hs[i] + 6);
    wall(x0, ZE, x1, ZE + 2, hs[(i + 4) % 9]);
  }
  for (let i = 0; i < 9; i++) {
    const z0 = -ZE - 2 + i * 8, z1 = Math.min(ZE + 2, z0 + 8);
    wall(-XE - 2, z0, -XE, z1, hs[(i + 2) % 9]);
    wall(XE, z0, XE + 2, z1, hs[(i + 6) % 9]);
  }
  for (const b of boxes.filter((b) => b.kind === 'bound')) B(b.min.x, b.max.y, b.min.z, b.max.x, 120, b.max.z, b.style, { kind: 'bound', hidden: true });
  // lancet windows in the north wall, lit from behind by the rift
  for (const x of [-20, -12, -4, 4, 12, 20]) glow(x - 0.6, 9, -ZE, x + 0.6, 13.5, -ZE + 0.06, '#5a2a9a', { fire: true, own: true });

  // ---------- the great arch across the dais ----------
  for (const s of [-1, 1]) {
    B(s * 6.5, 0, -1.25, s * 9, 14, 1.25, 'gothic', { kind: 'pillar', tetherOnly: true });
    glow(s * 6.44, 4, -0.3, s * 6.5, 11, 0.3, VIOLET, { fire: true, own: true });
  }
  B(-9, 14, -1.25, 9, 16, 1.25, 'gothic', { kind: 'arch', plat: true });
  B(-3, 16, -1.25, 3, 17.5, 1.25, 'gothic', { kind: 'arch' });
  glow(-0.5, 14.6, -1.31, 0.5, 15.6, 1.31, '#e0c8ff');
  lights.push({ x: 0, y: 12.5, z: 0, color: '#9a50ff', intensity: 2.6, range: 18, group: 'fire' });
  const anchors = [{ x: 0, y: 13.7, z: 0, top: 16, w: 1.25, kind: 'jib' }];
  glow(-0.12, 13.8, -0.12, 0.12, 14, 0.12, '#d0a0ff');

  // ---------- the north: the wall's gallery between two spire stumps, ledges up their faces ----------
  B(-25.6, 6.7, -ZE, 25.6, 7, -31.5, 'ruin', { kind: 'catwalk', plat: true });
  for (const x of [-16, 0, 16]) B(x - 0.5, 0, -32.6, x + 0.5, 6.7, -31.6, 'gothic', { kind: 'pillar' });
  B(-XE, 0, -ZE, -28, 22, -26, 'gothic', { kind: 'building', top: 'ruin' });
  for (const y of [5.5, 10.9, 16.3]) B(-28, y - 0.3, -ZE, -25.6, y, -26, 'ruin', { kind: 'catwalk', plat: true });
  B(28, 0, -ZE, XE, 16.5, -26, 'gothic', { kind: 'building', top: 'ruin' });
  for (const y of [5.5, 10.9]) B(25.6, y - 0.3, -ZE, 28, y, -26, 'ruin', { kind: 'catwalk', plat: true });
  for (const [x, h] of [[-32, 22], [32, 16.5]]) { glow(x - 0.5, h - 6, -26, x + 0.5, h - 2, -25.94, '#6a30b0', { fire: true, own: true }); lights.push({ x, y: h - 4, z: -24, color: '#8a40e8', intensity: 2, range: 14, group: 'fire' }); }

  // ---------- the nave: broken pillars in from the south, tombs between them ----------
  const pillar = (x, z, h) => { B(x - 0.7, 0, z - 0.7, x + 0.7, h, z + 0.7, 'gothic', { kind: 'pillar', tetherOnly: true }); B(x - 0.95, 0, z - 0.95, x + 0.95, 0.5, z + 0.95, 'ruin', { kind: 'prop' }); };
  pillar(-8, 18.5, 9); pillar(8, 18.5, 4.5); pillar(-8, 25, 3.2); pillar(8, 25, 11); pillar(-8, 31, 7); pillar(8, 31, 6);
  const tomb = (x, z, along) => { const w = along ? 2.6 : 1.2, d = along ? 1.2 : 2.6; B(x - w / 2, 0, z - d / 2, x + w / 2, 1.0, z + d / 2, 'relic', { kind: 'car' }); };
  tomb(-13, 22, true); tomb(13, 28, true); tomb(-20, 30, false); tomb(22, 18, false);

  // ---------- the east: a collapsed chapel, its roof a step up from its porch ----------
  B(24, 0, 20, XE, 6, 30, 'gothic', { kind: 'building', top: 'ruin' });
  B(20, 0, 22, 24, 2.8, 28, 'ruin', { kind: 'stack' });
  glow(23.94, 1.2, 24.4, 24, 3.6, 25.6, '#5a2a9a', { fire: true, own: true });
  // ---------- the west: a bell tower's stump and the rubble of the rest of it ----------
  B(-XE, 0, 8, -29, 9.5, 15, 'gothic', { kind: 'building', top: 'ruin' });
  B(-29, 0, 9, -25, 4.4, 14, 'ruin', { kind: 'stack' });
  B(-27, 0, 16, -22, 1.4, 19.5, 'ruin', { kind: 'stack' });
  B(-34, 0, -20, -29, 1.6, -15, 'ruin', { kind: 'stack' });
  B(-33, 1.6, -19, -30, 3.0, -16, 'ruin', { kind: 'stack' });
  B(17, 0, -24, 22, 1.4, -19.5, 'ruin', { kind: 'stack' });
  B(-2, 0, -24, 1.5, 1.2, -20.5, 'ruin', { kind: 'stack' });

  // ---------- masonry torn out of the ground, hanging in the air ----------
  // (each lit from under by the rift: a seam of violet in its underside)
  const float = (x0, z0, x1, z1, top, th = 0.6, o = {}) => {
    // (edges just inside the nav grid's lines, so a body dropping off one clears it)
    x0 += 0.15; z0 += 0.15; x1 -= 0.15; z1 -= 0.15;
    B(x0, top - th, z0, x1, top, z1, 'voidrock', Object.assign({ kind: 'float', plat: true, top: 'flag' }, o));
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    // a ragged root of stone under it
    B(cx - (x1 - x0) * 0.3, top - th - 0.9, cz - (z1 - z0) * 0.3, cx + (x1 - x0) * 0.3, top - th, cz + (z1 - z0) * 0.3, 'voidrock', { kind: 'prop' });
    B(cx - (x1 - x0) * 0.14, top - th - 1.9, cz - (z1 - z0) * 0.14, cx + (x1 - x0) * 0.14, top - th - 0.9, cz + (z1 - z0) * 0.14, 'voidrock', { kind: 'prop' });
    glow(cx - 0.3, top - th - 2.0, cz - 0.3, cx + 0.3, top - th - 1.9, cz + 0.3, VIOLET, { fire: true, own: true });
  };
  // a staircase from the south-west up to the arch's west end
  float(-22, 10, -17, 15, 6.2);
  float(-16, 5, -12, 9, 11.2);
  float(-13.5, -1.5, -9.5, 3.5, 14.6);
  // one from the east up toward the north-east spire
  float(18, 2, 23, 7, 6.2);
  float(24, -5.5, 28, 1, 11.2);
  float(27, -12, 31, -7, 15);
  // and a few on their own
  float(6, 19, 11, 23, 6.2);
  float(-30, -8, -25, -3, 6.2);
  float(2, -25, 7, -20.5, 6.2);
  anchors.push({ x: 29, y: 12.3, z: -9.5, top: 15, w: 2, kind: 'jib' });
  // rubble by the lowest of them: a foothold for whatever climbs after you
  B(23.5, 0, 6.5, 25.5, 1.3, 8.5, 'ruin', { kind: 'stack' });
  B(-24.5, 0, -6.5, -22.5, 1.2, -4.5, 'ruin', { kind: 'stack' });

  // ---------- braziers of violet fire, and pale lanterns hung from the ruins (they go out in a Blackout) ----------
  const brazier = (x, z, y = 0) => {
    B(x - 0.35, y, z - 0.35, x + 0.35, y + 1.0, z + 0.35, 'gothic', { kind: 'prop' });
    glow(x - 0.28, y + 1.0, z - 0.28, x + 0.28, y + 1.25, z + 0.28, '#b060ff', { fire: true, own: true });
    lights.push({ x, y: y + 1.8, z, color: '#a050ff', intensity: 2.4, range: 11, group: 'fire' });
  };
  brazier(-5, 16); brazier(5, 16); brazier(-17, -17); brazier(17, -17); brazier(-17, 0.2); brazier(26, 12); brazier(-8.6, -8.6); brazier(8.6, 8.6);
  const lantern = (x, y, z) => {
    glow(x - 0.3, y - 0.5, z - 0.3, x + 0.3, y, z + 0.3, '#e8dcff', { lamp: true });
    line([x, y + 3, z], [x, y, z], 0.03, '#2a2434');
    lights.push({ x, y: y - 0.7, z, color: '#c8b8ff', intensity: 2.8, range: 21, street: true, group: 'lamp' });
  };
  for (const x of [-22, -8, 8, 22]) { lantern(x, 10, -33.2); lantern(x, 9, 33.2); }
  for (const z of [-18, 0, 20]) { lantern(-35.2, 9, z); lantern(35.2, 9, z); }
  lantern(-8, 8.4, 18.5); lantern(8, 10.4, 25); lantern(0, 13.2, 0);

  // ---------- the sky: the eclipsed moon over the north wall, and the spires of the city beyond ----------
  {
    const PX = 3, R = 13.5, cy = 80, z = -118;
    for (let j = -6; j <= 6; j++) {
      let run = null;
      for (let i = -6; i <= 7; i++) {
        const d = Math.hypot(i * PX, j * PX), on = i <= 6 && d > R - PX * 0.75 && d < R + PX * 0.75;
        if (on && run === null) run = i;
        if (!on && run !== null) { glow(-14 + run * PX - PX / 2, cy + j * PX - PX / 2, z, -14 + (i - 1) * PX + PX / 2, cy + j * PX + PX / 2, z + 0.5, j > 2 ? '#f4ecff' : '#b89aff'); run = null; }
      }
    }
    const spire = (x, z0, w, h) => {
      emitters.push({ min: { x: x - w / 2, y: 0, z: z0 - w / 2 }, max: { x: x + w / 2, y: h, z: z0 + w / 2 }, color: '#180e26' });
      emitters.push({ min: { x: x - w / 4, y: h, z: z0 - w / 4 }, max: { x: x + w / 4, y: h + w * 1.6, z: z0 + w / 4 }, color: '#180e26' });
    };
    spire(-30, -60, 9, 46); spire(-8, -70, 7, 60); spire(16, -62, 10, 40); spire(34, -66, 6, 54);
    spire(-58, -20, 9, 38); spire(-62, 22, 7, 50); spire(60, -8, 8, 44); spire(58, 30, 10, 34); spire(-20, 62, 9, 42); spire(24, 60, 7, 52);
  }

  const barrelSpots = [[-18, 0, 20], [16, 0, 22], [22, 0, -8], [-22, 0, -10], [4, 0, -28], [-6, 0, 6], [6, 0, -6], [-20, 6.2, 12.5]]
    .map(([x, y, z]) => ({ x, y, z }));
  // sniper perches: ledge, arch and float edges from 9 m to 16.5 m
  const perches = [];
  for (const b of boxes.filter((b) => (b.plat || b.kind === 'building') && b.max.y >= 9 && b.max.y <= 16.5 && b.max.x - b.min.x >= 2.4 && b.max.z - b.min.z >= 2)) {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
    for (const [x, z] of [[b.min.x + 0.6, cz], [b.max.x - 0.6, cz], [cx, b.min.z + 0.6], [cx, b.max.z - 0.6]]) perches.push({ x, y: b.max.y, z });
  }
  const ground = [[-24, 24], [24, 14], [-20, -22], [10, -24], [30, -18], [-30, 2], [30, 4], [-12, 30], [14, 31], [0, -20], [-22, -4], [20, -4], [0, 6], [-6, -6]]
    .map(([x, z]) => ({ x, y: 0, z }));
  const high = [[-18, 7, -32.6], [6, 7, -32.6], [20, 7, -32.6], [30, 6, 25], [-27, 4.4, 11.5], [-19.5, 6.2, 12.5], [20.5, 6.2, 4.5], [8.5, 6.2, 21]]
    .map(([x, y, z]) => ({ x, y, z }));
  return {
    name: 'The Rift', boxes, groundY: 0, emitters, lights, lamps: [], round, furniture, anchors,
    ambient: [0.05, 0.036, 0.082], sky: [0.05, 0.035, 0.085], bg: '#0b0614', fog: { near: 32, far: 125 }, weather: 'motes',
    bounds: { minX: -XE, maxX: XE, minZ: -ZE, maxZ: ZE },
    playerStart: { x: 0, y: 0, z: 26, yaw: 0 },
    // where a portal lets you out, and where the one onward opens
    arrival: { x: 0, y: 0, z: 26, yaw: 0 }, portalAt: { x: -4, y: 0, z: 28 },
    // where the bosses arrive: on the dais, under the arch
    bossAt: { x: 0, z: 4 },
    spawn: { ground, high }, perches, barrelSpots,
    // the moat of void (foundry.js throws out what falls in; rift.js draws it), its bed's height and the surface drawn over it
    lava: reaches.map(([x0, z0, x1, z1]) => ({ min: { x: x0, z: z0 }, max: { x: x1, z: z1 }, y: VOID_Y, surface: -2.3, void: true })),
    // standing tears, in pairs: step into one and out of the other (rift.js)
    gates: [
      { a: { x: -30, y: 0, z: 26 }, b: { x: 0, y: 17.5, z: 0 } },
      { a: { x: 31, y: 0, z: 12 }, b: { x: 12, y: 7, z: -32.7 } },
    ],
    clearance: {
      streets: [{ min: { x: -6.5, z: MO + LIP }, max: { x: 6.5, z: ZE } }, { min: { x: -IS + LIP, z: -IS + LIP }, max: { x: IS - LIP, z: IS - LIP } }],
      alleys: [{ min: { x: MO + LIP, z: -MO }, max: { x: 24, z: MO } }, { min: { x: -24, z: -MO }, max: { x: -MO - LIP, z: MO } }, { min: { x: -24, z: -30 }, max: { x: 24, z: -MO - LIP } }],
    },
    orbit: { dist: 27, pitch: -0.42, lift: 6 },
  };
})();
ARENAS.rift = RIFT;
