'use strict';
// Rigid skinning, as Half-Life 1 models worked: a character is boxes and prisms, each riding exactly
// one bone, merged into one SkinnedMesh so it costs one draw call. Poses set bone rotations each frame.
// The parts are kept separately too, so a death can throw them off as gibs.

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
  // def: { bones: HUMANOID, scale, parts: [{ bone, shape: 'box' | 'hex', size: [w, h, d], at: [x, y, z],
  //   rot: [rx, ry, rz], taper, color, glow, tag }] }. Returns an instance with mesh, bones and parts.
  build(def, feetUniform) {
    const S = def.scale || 1;
    const bones = {}, list = [], rest = {};
    for (const [name, parent, x, y, z] of def.bones) {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x * S, y * S, z * S);
      rest[name] = b.position.clone();
      if (parent) bones[parent].add(b);
      bones[name] = b;
      list.push(b);
    }
    const root = list[0];
    root.updateMatrixWorld(true);
    const pos = [], nrm = [], col = [], glow = [], si = [], sw = [], idx = [], parts = [], tags = {};
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), n = new THREE.Vector3(), c = new THREE.Color();
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
      const start = col.length;
      for (let i = 0; i < gp.count; i++) {
        v.fromBufferAttribute(gp, i).applyMatrix4(m);
        n.fromBufferAttribute(gn, i).applyQuaternion(q);
        pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
        glow.push(p.glow ? 1 : 0); si.push(bi, 0, 0, 0); sw.push(1, 0, 0, 0);
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
    g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    const feet = feetUniform || { value: new THREE.Color(0.25, 0.22, 0.3) };
    const mat = Gfx.litMaterial({ vertexColors: true, transparent: true }, 'feet', feet);
    const mesh = new THREE.SkinnedMesh(g, mat);
    mesh.add(root);
    mesh.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(list);
    mesh.bind(skeleton);
    mesh.frustumCulled = false;
    const outline = new THREE.SkinnedMesh(g, Gfx.outlineMaterial('#ffd070'));
    outline.bind(skeleton, mesh.bindMatrix);
    outline.frustumCulled = false;
    outline.visible = false;
    mesh.add(outline);
    return { mesh, outline, bones, rest, parts, tags, feet, mat, geo: g, scale: S, root };
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
    // parts hang from their bone: shift so the top of the shape sits at the bone unless 'at' says otherwise
    if (p.hang) geo.translate(0, -h / 2, 0);
    return geo;
  },
  // back to the bind pose before a pose function sets what it needs
  reset(r) {
    for (const k in r.bones) { const b = r.bones[k]; b.rotation.set(0, 0, 0); b.position.copy(r.rest[k]); }
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
};
