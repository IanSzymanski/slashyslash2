'use strict';
// WebGL renderer, procedural textures, the baked level mesh, character materials, the fixed light pool and fog.

// Wall and floor palettes [base, dark, light]; the building ones are the 2D level.js styles.
const TEX_STYLES = {
  brick: ['#4e2c32', '#3e2228', '#62383c'], brick2: ['#56343a', '#432630', '#6c4044'],
  concrete: ['#463c4c', '#382f3e', '#584c5e'], panel: ['#3a3e4e', '#2e3140', '#4c5062'],
  shop: ['#3e3a48', '#302c38', '#524c5c'], shop2: ['#43384a', '#342b3a', '#574a5e'],
  slab: ['#4a4250', '#3a3240', '#5c5464'], roof: ['#2e2832', '#221e26', '#3c3440'],
  asphalt: ['#2a2430', '#1e1a22', '#36303c'], metal: ['#3a3e4e', '#262a36', '#5a6074'],
  car: ['#4a3236', '#30202a', '#6a4a44'],
};
// Facades carry windows: a 256x192 texture covering 8 m x 6 m (4 x 2 windows), some of them lit.
const FACADES = new Set(['brick', 'brick2', 'concrete', 'panel', 'shop', 'shop2']);
const TEX_METRES = (style) => (FACADES.has(style) ? [8, 6] : [2, 2]);

const Gfx = {
  renderer: null, scene: null, camera: null, level: null, fireMats: [],
  // a fixed pool: the light count never changes, so shaders never recompile mid-fight
  POOL: 8, pool: [], used: 0,
  FOV: 62,
  texCache: new Map(),

  init(canvas) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setPixelRatio(1);
    this.renderer = r;
    const s = new THREE.Scene();
    s.background = new THREE.Color('#0b0710');
    s.fog = new THREE.Fog('#0b0710', 28, 95);
    for (let i = 0; i < this.POOL; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 10, 1.2);
      s.add(l);
      this.pool.push(l);
    }
    this.scene = s;
    this.camera = new THREE.PerspectiveCamera(this.FOV, 16 / 9, 0.05, 260);
    this.camera.rotation.order = 'YXZ';
  },
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  },

  // ---------- light pool ----------
  beginFrame() { this.used = 0; },
  light(x, y, z, color, intensity, distance) {
    const l = this.pool[this.used];
    if (!l) return;
    this.used++;
    l.position.set(x, y, z); l.color.set(color); l.intensity = intensity; l.distance = distance;
  },
  endFrame() { for (let i = this.used; i < this.pool.length; i++) this.pool[i].intensity = 0; },
  render() { this.renderer.render(this.scene, this.camera); },

  // ---------- materials ----------
  // The scene has no ambient light. The level gets its light from the bake (a per-vertex 'baked'
  // attribute); characters get the baked light where they stand through uFeet, as Half-Life 1 did.
  // Both still receive the dynamic light pool on top. Parts of one character share one feet uniform.
  // A cool rim on characters keeps dark armour readable against a night street.
  rim: { value: new THREE.Color('#2e3a58') },
  // bullet time drains the colour from lit surfaces; glowing parts and effects stay bright
  desat: { value: 0 },
  litMaterial(opts, mode, feetUniform = null, rim = true) {
    const m = new THREE.MeshLambertMaterial(opts);
    m.defines = mode === 'baked' ? { USE_BAKED: '' } : { USE_FEET: '' };
    if (!rim) m.defines.NO_RIM = '';
    const feet = mode === 'baked' ? null : feetUniform || { value: new THREE.Color(0.25, 0.22, 0.3) };
    m.userData.feet = feet;
    m.onBeforeCompile = (sh) => {
      if (feet) { sh.uniforms.uFeet = feet; sh.uniforms.uRim = this.rim; }
      sh.uniforms.uDesat = this.desat;
      // characters: a 'glow' vertex attribute marks fullbright parts (eyes, cores) and 'plain' parts skip the
      // texture (clean lights); meshes without them read 0
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n#ifdef USE_BAKED\nattribute vec3 baked;\nvarying vec3 vBaked;\n#endif\n#ifdef USE_FEET\nattribute float glow;\nattribute float plain;\nvarying float vGlow;\nvarying float vPlain;\n#endif')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_BAKED\nvBaked = baked;\n#endif\n#ifdef USE_FEET\nvGlow = glow;\nvPlain = plain;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDesat;\n#ifdef USE_BAKED\nvarying vec3 vBaked;\n#endif\n#ifdef USE_FEET\nuniform vec3 uFeet;\nuniform vec3 uRim;\nvarying float vGlow;\nvarying float vPlain;\n#endif')
        .replace('#include <map_fragment>', '#ifdef USE_FEET\n#ifdef USE_MAP\ndiffuseColor *= mix( texture2D( map, vMapUv ), vec4( 1.0 ), vPlain );\n#endif\n#else\n#include <map_fragment>\n#endif')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n#ifdef USE_BAKED\nreflectedLight.indirectDiffuse += vBaked * diffuseColor.rgb;\n#endif\n#ifdef USE_FEET\nreflectedLight.indirectDiffuse += mix( uFeet, vec3( 1.0 ), vGlow ) * diffuseColor.rgb;\n#ifndef NO_RIM\nfloat rim = 1.0 - saturate( dot( normal, normalize( vViewPosition ) ) );\nreflectedLight.indirectDiffuse += uRim * rim * rim * rim * ( 1.0 - vGlow );\n#endif\n#endif')
        .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n#ifdef USE_FEET\nfloat dsk = uDesat * ( 1.0 - vGlow );\n#else\nfloat dsk = uDesat;\n#endif\ngl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( dot( gl_FragColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) ) * vec3( 0.62, 0.68, 0.95 ), dsk );');
    };
    return m;
  },
  // Outlines are the model again, pushed out along its normals and drawn back-faces only, in a flat colour.
  outlineMaterial(color, width = 0.035) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false });
    const u = { value: width };
    m.userData.width = u;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOutline = u;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uOutline;')
        .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n#ifdef USE_SKINNING\ntransformed += normalize( objectNormal ) * uOutline;\n#endif');
    };
    return m;
  },

  // ---------- textures: nearest magnification, a few colours each ----------
  texture(style, emissive = false) {
    const key = style + (emissive ? ':glow' : '');
    let t = this.texCache.get(key);
    if (t) return t;
    const facade = FACADES.has(style);
    const W = facade ? 256 : 64, Ht = facade ? 192 : 64;
    const c = makeCanvas(W, Ht), g = c.ctx;
    const [base, dark, light] = TEX_STYLES[style] || TEX_STYLES.concrete;
    let seed = 7;
    for (const ch of style) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const R = mulberry32(seed);
    const speckle = (n) => { for (let i = 0; i < n; i++) { g.fillStyle = R() < 0.5 ? dark : light; g.fillRect((R() * W) | 0, (R() * Ht) | 0, 1, 1); } };
    g.fillStyle = emissive ? '#000000' : base; g.fillRect(0, 0, W, Ht);
    if (!emissive) {
      if (style.startsWith('brick')) {
        g.fillStyle = dark;
        for (let y = 0; y < Ht; y += 4) {
          g.fillRect(0, y, W, 1);
          for (let x = (y / 4) % 2 ? 4 : 0; x < W; x += 8) g.fillRect(x, y + 1, 1, 3);
        }
        speckle(W);
      } else if (style === 'asphalt' || style === 'roof') {
        speckle(420);
        g.fillStyle = dark;
        let x = (R() * 64) | 0, y = 0;
        while (y < 64) { g.fillRect(x & 63, y, 1, 1); x += R() < 0.5 ? -1 : 1; y += R() < 0.7 ? 1 : 0; }
        if (style === 'roof') { g.fillStyle = light; for (let i = 0; i < 30; i++) g.fillRect((R() * 64) | 0, (R() * 64) | 0, 2, 1); }
      } else if (style === 'metal') {
        speckle(90);
        g.fillStyle = dark;
        g.fillRect(0, 0, 64, 2); g.fillRect(0, 62, 64, 2);
        for (let i = 0; i < 64; i++) { g.fillRect(i, i, 2, 1); g.fillRect(63 - i, i, 2, 1); }
      } else if (style === 'car') {
        speckle(300);
        g.fillStyle = light;
        for (let i = 0; i < 6; i++) g.fillRect((R() * 56) | 0, (R() * 56) | 0, 2 + ((R() * 6) | 0), 1 + ((R() * 3) | 0));
      } else {
        speckle((W * Ht) / 25);
        g.fillStyle = dark;
        for (let y = 31; y < Ht; y += 32) g.fillRect(0, y, W, 1);
        if (style === 'panel') for (let x = 31; x < W; x += 32) g.fillRect(x, 0, 1, Ht);
      }
    }
    // windows: 4 across, 2 up, each 0.8 m x 1.3 m
    if (facade) {
      for (let wy = 0; wy < 2; wy++) {
        for (let wx = 0; wx < 4; wx++) {
          const x = wx * 64 + 19, y = wy * 96 + 22, r = R();
          const lit = r < 0.18, broken = r > 0.18 && r < 0.45, boarded = r > 0.45 && r < 0.6;
          if (emissive) {
            if (lit) { g.fillStyle = '#5a3a20'; g.fillRect(x + 1, y + 1, 24, 40); g.fillStyle = '#a06830'; g.fillRect(x + 2, y + 28, 22, 12); }
            continue;
          }
          g.fillStyle = '#1a1420'; g.fillRect(x - 2, y - 2, 30, 46);
          g.fillStyle = lit ? '#6a4a38' : '#0e0b12'; g.fillRect(x, y, 26, 42);
          if (broken) { g.fillStyle = '#4a5a78'; pline(g, x, y, x + 9, y + 12, 1); pline(g, x + 25, y, x + 16, y + 10, 1); g.fillRect(x, y + 41, 26, 1); }
          else if (boarded) { g.fillStyle = '#5a4030'; g.fillRect(x, y + 8, 26, 6); g.fillRect(x, y + 24, 26, 6); g.fillStyle = '#3a2a20'; g.fillRect(x, y + 11, 26, 1); g.fillRect(x, y + 27, 26, 1); }
          g.fillStyle = light; g.fillRect(x - 2, y + 44, 30, 2);
        }
      }
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.texCache.set(key, t);
    return t;
  },
  // Characters' surface: blocky grey noise multiplied into each part's colour, for the voxel look of the
  // concept art. 64 px covers Rig.TEX_M metres, so a 2x2 block is about 4 cm.
  charTexture() {
    let t = this.texCache.get('char');
    if (t) return t;
    const c = makeCanvas(64, 64), g = c.ctx, R = mulberry32(1337);
    for (let y = 0; y < 64; y += 2) {
      for (let x = 0; x < 64; x += 2) {
        const v = Math.round(255 * (0.72 + R() * 0.28 - (R() < 0.08 ? 0.12 : 0)));
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 2, 2);
      }
    }
    // plate seams
    g.fillStyle = 'rgb(150,150,150)';
    g.fillRect(0, 31, 64, 1); g.fillRect(31, 0, 1, 64);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    this.texCache.set('char', t);
    return t;
  },
  // Ground marks as white masks the material tints: a furrow running down the texture (with a fainter
  // churned rim), cracks out from the middle, or a soft round scorch.
  decalTexture(kind) {
    const key = 'decal:' + kind;
    let t = this.texCache.get(key);
    if (t) return t;
    const N = 64, c = makeCanvas(N, N), g = c.ctx, R = mulberry32(kind.length * 977 + 13);
    if (kind === 'scorch') {
      for (let y = 0; y < N; y += 2) {
        for (let x = 0; x < N; x += 2) {
          const a = clamp(1 - Math.hypot(x - 31, y - 31) / 31 + (R() - 0.5) * 0.3, 0, 1);
          if (a > 0) { g.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(2)})`; g.fillRect(x, y, 2, 2); }
        }
      }
    } else if (kind === 'crack') {
      g.fillStyle = 'rgba(255,255,255,0.95)';
      for (let i = 0; i < 7; i++) {
        let a = (i / 7) * TAU + R() * 0.5, x = 31, y = 31;
        const L = 12 + R() * 16;
        for (let s = 0; s < L; s += 2) { a += (R() - 0.5) * 0.8; x += Math.cos(a) * 2; y += Math.sin(a) * 2; g.fillRect(Math.round(x), Math.round(y), 2, 2); }
      }
      for (let i = 0; i < 14; i++) g.fillRect(Math.round(31 + (R() - 0.5) * 10), Math.round(31 + (R() - 0.5) * 10), 2, 2);
    } else {
      for (let y = 0; y < N; y += 2) {
        const w = 2 * Math.round(3 + R() * 2 + Math.sin((y / N) * Math.PI) * 4), x0 = 32 - w / 2;
        g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(x0, y, w, 2);
        g.fillStyle = 'rgba(150,150,150,0.6)'; g.fillRect(x0 - 2, y, 2, 2); g.fillRect(x0 + w, y, 2, 2);
      }
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    this.texCache.set(key, t);
    return t;
  },
  // A mark's material: lit by the street where it lies, like a character, and glowing hot at first.
  // Gouges and cracks are pale scars of broken surface; a scorch is soot.
  decalMaterial(kind, at) {
    const L = World.def ? World.lightAt(at.x, at.y + 0.3, at.z) : [0.3, 0.26, 0.34];
    const m = this.litMaterial({ map: this.decalTexture(kind), color: kind === 'scorch' ? '#140e0e' : '#9a8c92', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
      'feet', { value: new THREE.Color(L[0], L[1], L[2]) }, false);
    return m;
  },
  // a four-pointed star for glints, white so it can be tinted
  starTexture() {
    let t = this.texCache.get('star');
    if (t) return t;
    // the 2D glint: a long horizontal flare, a shorter vertical one, short diagonals and a hot core
    const c = makeCanvas(64, 64), g = c.ctx;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 14);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 30, 64, 4); g.fillRect(30, 10, 4, 44);
    for (let i = 2; i < 12; i++) { g.fillRect(32 + i, 32 + i, 2, 2); g.fillRect(30 - i, 32 + i, 2, 2); g.fillRect(32 + i, 30 - i, 2, 2); g.fillRect(30 - i, 30 - i, 2, 2); }
    g.fillRect(26, 26, 12, 12);
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    this.texCache.set('star', t);
    return t;
  },

  // ---------- level ----------
  // Every visible face is cut into cells of at most 1 m, and each vertex gets the light baked from
  // World.lightAt with shadow rays. Faces flush against another box, under the street, or on the
  // outside of the boundary are skipped. Faces of one texture share one mesh.
  buildLevel(def) {
    if (this.level) this.scene.remove(this.level);
    this.fireMats = [];
    const group = new THREE.Group();
    const buckets = new Map();
    const bucket = (style) => { if (!buckets.has(style)) buckets.set(style, { pos: [], nrm: [], uv: [], baked: [], idx: [] }); return buckets.get(style); };
    const B = def.bounds, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const light = [0, 0, 0];
    const FACES = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    ];
    for (const b of def.boxes) {
      const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z], ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      for (const F of FACES) {
        const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2, top = F.n[1] > 0;
        if (b.kind === 'ground' && !top) continue;
        if (F.n[1] < 0 && b.min.y <= 0.01) continue;
        const fc = ctr.slice(); fc[ax] = F.n[ax] > 0 ? mx[ax] : mn[ax];
        if (b.kind === 'bound' && !top && F.n[0] * (cx - fc[0]) + F.n[2] * (cz - fc[2]) <= 0) continue;
        if (World.pointSolid(fc[0] + F.n[0] * 0.06, fc[1] + F.n[1] * 0.06, fc[2] + F.n[2] * 0.06)) continue;
        const style = top ? (b.top || b.style) : b.style, [tw, th] = TEX_METRES(style);
        const ua = F.u[0] ? 0 : F.u[1] ? 1 : 2, va = F.v[0] ? 0 : F.v[1] ? 1 : 2;
        const ulen = mx[ua] - mn[ua], vlen = mx[va] - mn[va];
        const nu = Math.max(1, Math.ceil(ulen)), nv = Math.max(1, Math.ceil(vlen));
        const K = bucket(style), i0 = K.pos.length / 3;
        // corner where u and v are smallest along their (signed) axes
        const o = fc.slice();
        o[ua] = F.u[ua] > 0 ? mn[ua] : mx[ua];
        o[va] = F.v[va] > 0 ? mn[va] : mx[va];
        for (let j = 0; j <= nv; j++) {
          for (let i = 0; i <= nu; i++) {
            const p = o.slice();
            p[ua] += F.u[ua] * ulen * (i / nu);
            p[va] += F.v[va] * vlen * (j / nv);
            K.pos.push(p[0], p[1], p[2]);
            K.nrm.push(F.n[0], F.n[1], F.n[2]);
            const wu = p[0] * F.u[0] + p[1] * F.u[1] + p[2] * F.u[2], wv = p[0] * F.v[0] + p[1] * F.v[1] + p[2] * F.v[2];
            K.uv.push(wu / tw, wv / th);
            World.lightAt(p[0], p[1], p[2], F.n[0], F.n[1], F.n[2], light);
            K.baked.push(light[0], light[1], light[2]);
          }
        }
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; i++) {
            const a = i0 + j * (nu + 1) + i, bb = a + 1, c = a + nu + 1, d = c + 1;
            K.idx.push(a, bb, d, a, d, c);
          }
        }
      }
    }
    let verts = 0;
    for (const [style, K] of buckets) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(K.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(K.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(K.uv, 2));
      geo.setAttribute('baked', new THREE.Float32BufferAttribute(K.baked, 3));
      geo.setIndex(K.idx);
      const opts = { map: this.texture(style) };
      if (FACADES.has(style)) Object.assign(opts, { emissiveMap: this.texture(style, true), emissive: new THREE.Color(1, 1, 1) });
      group.add(new THREE.Mesh(geo, this.litMaterial(opts, 'baked')));
      verts += K.pos.length / 3;
    }
    for (const e of def.emitters || []) {
      const m = new THREE.MeshBasicMaterial({ color: e.color, fog: !e.glow });
      if (e.fire) this.fireMats.push(m);
      group.add(new THREE.Mesh(this.boxGeometry([e]), m));
    }
    this.level = group;
    this.levelVerts = verts;
    this.scene.add(group);
  },
  // plain box mesh for small props and emitters
  boxGeometry(boxes) {
    const pos = [], nrm = [], idx = [];
    const face = (corners, n) => {
      const i0 = pos.length / 3;
      for (const c of corners) { pos.push(c[0], c[1], c[2]); nrm.push(n[0], n[1], n[2]); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    for (const b of boxes) {
      const x0 = b.min.x, y0 = b.min.y, z0 = b.min.z, x1 = b.max.x, y1 = b.max.y, z1 = b.max.z;
      face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
      face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
      face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
      face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
      face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    return geo;
  },
};
