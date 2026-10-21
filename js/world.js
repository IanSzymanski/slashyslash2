'use strict';
// The arena as a list of axis-aligned boxes: collision queries, plus the Arena points the Director spawns from.

const World = {
  def: null, boxes: [],

  build(def) { this.def = def; this.boxes = def.boxes; },
  raycast(o, d, maxT) { return rayBoxes(o.x, o.y, o.z, d.x, d.y, d.z, maxT, this.boxes); },
  pointSolid(x, y, z, pad = 0) {
    for (const b of this.boxes) if (pointInBox(x, y, z, b, pad)) return true;
    return false;
  },
  // top of the highest box under (x, z) at or below fromY
  groundAt(x, z, fromY) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
      if (b.max.y <= fromY + 1e-6 && b.max.y > best) best = b.max.y;
    }
    return best;
  },
  // an upright cylinder of radius r and height h standing at (x, y, z) touches no box
  cylinderFree(x, y, z, r, h) {
    for (const b of this.boxes) {
      if (b.max.y <= y + 0.01 || b.min.y >= y + h) continue;
      const nx = clamp(x, b.min.x, b.max.x), nz = clamp(z, b.min.z, b.max.z);
      if ((x - nx) * (x - nx) + (z - nz) * (z - nz) < r * r) return false;
    }
    return true;
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
  // nearest street-level point to (x, z) where a body of radius r fits, searched in rings 0.5 m apart
  freeGroundAt(x, z, r) {
    const g = World.def.groundY;
    for (let ring = 0; ring <= 24; ring++) {
      const n = ring ? ring * 8 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, px = x + Math.cos(a) * ring * 0.5, pz = z + Math.sin(a) * ring * 0.5;
        if (World.groundAt(px, pz, g + 0.01) === g && World.cylinderFree(px, g, pz, r, PC.HEIGHT)) return { x: px, y: g, z: pz };
      }
    }
    return { x, y: g, z };
  },
};

// Phase 0 test room: a 32 m walled yard with the pieces Phase 1 has to handle (a roof tier at jump-apex
// height, a wrecked car to step over, a girder with 5 m headroom). The 2D street replaces it in Phase 1.
const TEST_ROOM = (() => {
  const B = (x0, y0, z0, x1, y1, z1, style) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 }, style });
  const boxes = [
    B(-16, -1, -16, 16, 0, 16, 'asphalt'),
    B(-17, 0, -17, 17, 6, -16, 'brick'), B(-17, 0, 16, 17, 6, 17, 'concrete'),
    B(-17, 0, -16, -16, 6, 16, 'panel'), B(16, 0, -16, 17, 6, 16, 'shop'),
    // pillars stay outside the 7 m maximum camera orbit around the centre
    B(-9.6, 0, -9.6, -8.4, 6, -8.4, 'concrete'), B(8.4, 0, -9.6, 9.6, 6, -8.4, 'concrete'),
    B(-9.6, 0, 8.4, -8.4, 6, 9.6, 'concrete'), B(8.4, 0, 8.4, 9.6, 6, 9.6, 'concrete'),
    B(-16, 0, -16, -10, 4.3, -11, 'brick2'),
    B(10.5, 0, -2, 12.3, 0.9, 1.5, 'car'), B(10.7, 0.9, -1.2, 12.1, 1.5, 0.8, 'car'),
    B(-16, 5, 11, 16, 5.4, 12, 'metal'),
  ];
  const ring = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.4; ring.push({ x: Math.cos(a) * 12, y: 0, z: Math.sin(a) * 12 }); }
  return {
    boxes, groundY: 0,
    bounds: { minX: -16, maxX: 16, minZ: -16, maxZ: 16 },
    playerStart: { x: 0, y: 0, z: 0 },
    spawn: { ground: ring, high: [{ x: -13, y: 4.3, z: -13.5 }] },
    perches: [{ x: -13, y: 4.3, z: -13.5 }],
    barrelSpots: [],
    // glowing shapes with no collision: a street lamp and neon tubes
    emitters: [
      { min: { x: -13.1, y: 0, z: 13.1 }, max: { x: -12.9, y: 4.4, z: 12.9 }, color: '#26222c' },
      { min: { x: -13.4, y: 4.4, z: 13.4 }, max: { x: -12.6, y: 4.6, z: 12.6 }, color: '#ffd8a0', glow: true },
      { min: { x: 15.85, y: 2.6, z: -7 }, max: { x: 16, y: 2.75, z: -3 }, color: '#ff3ad0', glow: true },
      { min: { x: 4, y: 3.4, z: -16 }, max: { x: 8, y: 3.55, z: -15.85 }, color: '#3af0ff', glow: true },
    ],
    lights: [
      { x: -13, y: 4.2, z: 13, color: '#ffb060', intensity: 70, distance: 24, flick: true },
      { x: 15.2, y: 2.7, z: -5, color: '#ff3ad0', intensity: 40, distance: 16 },
      { x: 6, y: 3.5, z: -15.2, color: '#3af0ff', intensity: 40, distance: 16 },
    ],
  };
})();
