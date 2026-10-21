'use strict';
// Rigid skinning, as Half-Life 1 models worked: a character is boxes and prisms, each riding exactly
// one bone, merged into one SkinnedMesh so it costs one draw call. Poses set bone rotations each frame,
// with two-bone IK for limbs. The parts are kept separately too, so a death can throw them off as gibs.

// Humanoid skeleton in metres: feet at y = 0, facing -z. [name, parent, x, y, z] relative to the parent.
// Bones start unrotated, so a limb's child sits straight below it.
const HUMANOID = [
  ['hips', null, 0, 0.92, 0],
  ['spine', 'hips', 0, 0.16, 0],
  ['chest', 'spine', 0, 0.3, 0],
  ['head', 'chest', 0, 0.3, 0],
  ['armL', 'chest', -0.25, 0.2, 0], ['foreL', 'armL', 0, -0.3, 0], ['handL', 'foreL', 0, -0.27, 0],
  ['armR', 'chest', 0.25, 0.2, 0], ['foreR', 'armR', 0, -0.3, 0], ['handR', 'foreR', 0, -0.27, 0],
  ['thighL', 'hips', -0.12, -0.03, 0], ['shinL', 'thighL', 0, -0.43, 0], ['footL', 'shinL', 0, -0.42, 0],
  ['thighR', 'hips', 0.12, -0.03, 0], ['shinR', 'thighR', 0, -0.43, 0], ['footR', 'shinR', 0, -0.42, 0],
  ['weapon', 'handR', 0, -0.04, 0],
];

const Rig = {
  // metres covered by one repeat of the character texture
  TEX_M: 1.2,
  _m: null, _q: null, _q2: null, _v: null,

  // def: { bones, scale, parts: [{ bone, shape: 'box' | 'hex', size: [w, h, d], at: [x, y, z], rot: [rx, ry, rz],
  //   taper, color, glow (fullbright), plain (no texture), tag }], attach(r) for non-skinned extras }.
  // Bones whose parent is null are roots (the scarf chain hangs free of the body).
  build(def, feetUniform) {
    const S = def.scale || 1;
    const bones = {}, list = [], rest = {}, roots = [];
    for (const [name, parent, x, y, z] of def.bones) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x * S, y * S, z * S);
      rest[name] = b.position.clone();
      if (parent) bones[parent].add(b); else roots.push(b);
      bones[name] = b;
      list.push(b);
    }
    for (const b of roots) b.updateMatrixWorld(true);
    const pos = [], nrm = [], col = [], uv = [], glow = [], plain = [], si = [], sw = [], idx = [], parts = [], tags = {};
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
    const R = mulberry32(7);
    for (const p of def.parts) {
      const geo = this.partGeometry(p, S);
      const bi = list.indexOf(bones[p.bone]);
      const local = new THREE.Matrix4().compose(
        new THREE.Vector3(...(p.at || [0, 0, 0])).multiplyScalar(S),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot || [0, 0, 0]))),
        new THREE.Vector3(1, 1, 1));
      m.multiplyMatrices(bones[p.bone].matrixWorld, local);
      q.setFromRotationMatrix(m);
      const gp = geo.attributes.position, gn = geo.attributes.normal, i0 = pos.length / 3;
      c.set(p.color);
      const start = col.length, ou = R(), ov = R();
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i); n.fromBufferAttribute(gn, i);
        // box-mapped texture coordinates in the part's own space, so the pattern rides with it
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        const [a, b] = ax >= ay && ax >= az ? [v.z, v.y] : ay >= az ? [v.x, v.z] : [v.x, v.y];
        uv.push(a / this.TEX_M + ou, b / this.TEX_M + ov);
        v.applyMatrix4(m); n.applyQuaternion(q);
        pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
        glow.push(p.glow ? 1 : 0); plain.push(p.plain ? 1 : 0); si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0);
      }
      const gi = geo.index.array;
      for (let i = 0; i < gi.length; i++) idx.push(i0 + gi[i]);
      if (p.tag) (tags[p.tag] || (tags[p.tag] = [])).push([start, col.length]);
      parts.push({ bone: bones[p.bone], local, geo, color: p.color, glow: !!p.glow });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    g.setAttribute('plain', new THREE.Float32BufferAttribute(plain, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    const feet = feetUniform || { value: new THREE.Color(0.25, 0.22, 0.3) };
    const mat = Gfx.litMaterial({ vertexColors: true, map: Gfx.charTexture(), transparent: true }, 'feet', feet);
    const mesh = new THREE.SkinnedMesh(g, mat);
    for (const b of roots) mesh.add(b);
    mesh.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(list);
    mesh.bind(skeleton);
    mesh.frustumCulled = false;
    const outline = new THREE.SkinnedMesh(g, Gfx.outlineMaterial('#ffd070'));
    outline.bind(skeleton, mesh.bindMatrix);
    outline.frustumCulled = false;
    outline.visible = false;
    mesh.add(outline);
    const r = { mesh, outline, bones, rest, parts, tags, feet, mat, geo: g, scale: S, roots, extras: [] };
    if (def.attach) def.attach(r);
    return r;
  },
  partGeometry(p, S) {
    const [w, h, d] = p.size.map((s) => s * S);
    let geo;
    if (p.shape === 'hex') geo = new THREE.CylinderGeometry((w / 2) * (p.taper || 1), w / 2, h, 6);
    else {
      geo = new THREE.BoxGeometry(w, h, d);
      if (p.taper) {
        const a = geo.attributes.position;
        for (let i = 0; i < a.count; i++) if (a.getY(i) > 0) { a.setX(i, a.getX(i) * p.taper); a.setZ(i, a.getZ(i) * p.taper); }
        geo.computeVertexNormals();
      }
    }
    return geo;
  },
  // back to the bind pose before a pose function sets what it needs
  reset(r) {
    for (const k in r.bones) { const b = r.bones[k]; b.quaternion.identity(); b.position.copy(r.rest[k]); }
  },
  // recolour a tagged group of vertices (an eye that turns white on a wind-up)
  tint(r, tag, hex) {
    const ranges = r.tags[tag];
    if (!ranges || r['_tint_' + tag] === hex) return;
    r['_tint_' + tag] = hex;
    const c = new THREE.Color(hex), a = r.geo.attributes.color;
    for (const [s, e] of ranges) for (let i = s; i < e; i += 3) { a.array[i] = c.r; a.array[i + 1] = c.g; a.array[i + 2] = c.b; }
    a.needsUpdate = true;
  },
  boneWorld(r, name, out) {
    r.bones[name].updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(r.bones[name].matrixWorld);
  },

  // Two-bone IK in world space for a limb whose bones point at their child down -y at rest. The joint
  // bends toward the pole. poleSide is where the pole lies in the upper bone's rest frame: -1 for a knee
  // (bends forward, -z), +1 for an elbow (points back, +z), so a limb never twists from its rest look.
  temps() {
    if (this._m) return;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v = [0, 1, 2, 3, 4, 5, 6].map(() => new THREE.Vector3());
    this.X = new THREE.Vector3(1, 0, 0);
  },
  ik(r, upName, loName, endName, target, pole, poleSide) {
    this.temps();
    const [T, P, d, pd, E, y, z] = this._v;
    const up = r.bones[upName], lo = r.bones[loName], end = r.bones[endName];
    up.parent.updateWorldMatrix(true, false);
    T.copy(target); P.copy(pole);
    up.parent.worldToLocal(T); up.parent.worldToLocal(P);
    const S = up.position, L1 = lo.position.length(), L2 = end.position.length();
    d.subVectors(T, S);
    let dist = d.length();
    const maxd = L1 + L2 - 1e-4;
    if (dist > maxd) { d.multiplyScalar(maxd / dist); dist = maxd; }
    if (dist < 1e-4) { d.set(0, -1e-4, 0); dist = 1e-4; }
    d.divideScalar(dist);
    pd.subVectors(P, S);
    pd.addScaledVector(d, -pd.dot(d));
    if (pd.lengthSq() < 1e-8) pd.set(0, 0, -poleSide); else pd.normalize();
    const a = (dist * dist + L1 * L1 - L2 * L2) / (2 * dist), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    E.copy(S).addScaledVector(d, a).addScaledVector(pd, h);
    // upper bone: -y along the bone, z toward (or away from) the bend side
    y.subVectors(S, E).normalize();
    z.copy(pd).addScaledVector(y, -pd.dot(y)).normalize().multiplyScalar(poleSide);
    const x = d.crossVectors(y, z);
    this._m.makeBasis(x, y, z);
    up.quaternion.setFromRotationMatrix(this._m);
    // lower bone: a hinge about its x axis, toward the target
    T.sub(E).applyQuaternion(this._q.copy(up.quaternion).invert());
    lo.quaternion.setFromAxisAngle(this.X, Math.atan2(-T.z, -T.y));
  },
  // Sets a bone's world orientation from two directions: its +y along dirY, its -z along dirNZ.
  orient(bone, dirY, dirNZ) {
    this.temps();
    const [, , , , , y, z] = this._v;
    y.copy(dirY).normalize();
    z.copy(dirNZ).addScaledVector(y, -dirNZ.dot(y)).normalize().negate();
    const x = this._v[2].crossVectors(y, z);
    this._m.makeBasis(x, y, z);
    const q = this._q.setFromRotationMatrix(this._m);
    bone.parent.updateWorldMatrix(true, false);
    const pq = this._q2.setFromRotationMatrix(bone.parent.matrixWorld).invert();
    bone.quaternion.copy(pq.multiply(q));
  },
  // Sets a bone's world position (it has no scale on its parents).
  place(bone, worldPos) {
    this.temps();
    bone.parent.updateWorldMatrix(true, false);
    bone.position.copy(bone.parent.worldToLocal(this._v[0].copy(worldPos)));
  },
};
