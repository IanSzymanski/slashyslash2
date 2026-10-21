'use strict';
// WebGL renderer, procedural textures, level meshes, the fixed light pool and fog.

// Wall and floor palettes [base, dark, light]; the building ones are the 2D level.js styles.
const TEX_STYLES = {
  brick: ['#4e2c32', '#3e2228', '#62383c'], brick2: ['#56343a', '#432630', '#6c4044'],
  concrete: ['#463c4c', '#382f3e', '#584c5e'], panel: ['#3a3e4e', '#2e3140', '#4c5062'],
  shop: ['#3e3a48', '#302c38', '#524c5c'], shop2: ['#43384a', '#342b3a', '#574a5e'],
  asphalt: ['#2a2430', '#1e1a22', '#36303c'], metal: ['#3a3e4e', '#262a36', '#5a6074'],
  car: ['#4a3236', '#30202a', '#6a4a44'],
};

const Gfx = {
  renderer: null, scene: null, camera: null, level: null,
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
    s.fog = new THREE.Fog('#0b0710', 22, 75);
    s.add(new THREE.AmbientLight('#7a6890', 2.4));
    s.add(new THREE.HemisphereLight('#8a6aa8', '#2a2030', 1.8));
    for (let i = 0; i < this.POOL; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 10, 1);
      s.add(l);
      this.pool.push(l);
    }
    this.scene = s;
    this.camera = new THREE.PerspectiveCamera(this.FOV, 16 / 9, 0.05, 250);
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

  // ---------- textures: 64 px (2 m), a few colours each, nearest magnification ----------
  texture(style) {
    let t = this.texCache.get(style);
    if (t) return t;
    const c = makeCanvas(64, 64), g = c.ctx;
    const [base, dark, light] = TEX_STYLES[style] || TEX_STYLES.concrete;
    let seed = 7;
    for (const ch of style) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const R = mulberry32(seed);
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    const speckle = (n) => { for (let i = 0; i < n; i++) { g.fillStyle = R() < 0.5 ? dark : light; g.fillRect((R() * 64) | 0, (R() * 64) | 0, 1, 1); } };
    if (style.startsWith('brick')) {
      g.fillStyle = dark;
      for (let y = 0; y < 64; y += 4) {
        g.fillRect(0, y, 64, 1);
        for (let x = (y / 4) % 2 ? 4 : 0; x < 64; x += 8) g.fillRect(x, y + 1, 1, 3);
      }
      speckle(60);
    } else if (style === 'asphalt') {
      speckle(420);
      g.fillStyle = dark;
      let x = (R() * 64) | 0, y = 0;
      while (y < 64) { g.fillRect(x & 63, y, 1, 1); x += R() < 0.5 ? -1 : 1; y += R() < 0.7 ? 1 : 0; }
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
      speckle(160);
      g.fillStyle = dark;
      g.fillRect(0, 31, 64, 1); g.fillRect(0, 63, 64, 1);
      if (style === 'panel') { g.fillRect(31, 0, 1, 64); g.fillRect(63, 0, 1, 64); }
      if (style.startsWith('shop')) for (let y = 34; y < 64; y += 3) g.fillRect(0, y, 64, 1);
    }
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    this.texCache.set(style, t);
    return t;
  },

  // ---------- level ----------
  // Boxes with the same style merge into one mesh (one draw call each). UVs are in world space,
  // 2 m per texture repeat, so every box tiles at the same texel size.
  boxGeometry(boxes) {
    const pos = [], nrm = [], uv = [], idx = [];
    const face = (corners, n, uvOf) => {
      const i0 = pos.length / 3;
      for (const c of corners) { pos.push(c[0], c[1], c[2]); nrm.push(n[0], n[1], n[2]); const t = uvOf(c); uv.push(t[0] / 2, t[1] / 2); }
      idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    };
    for (const b of boxes) {
      const x0 = b.min.x, y0 = b.min.y, z0 = b.min.z, x1 = b.max.x, y1 = b.max.y, z1 = b.max.z;
      face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], (c) => [-c[2], c[1]]);
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], (c) => [c[2], c[1]]);
      face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], (c) => [c[0], -c[2]]);
      face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], (c) => [c[0], c[2]]);
      face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], (c) => [c[0], c[1]]);
      face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], (c) => [-c[0], c[1]]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  },
  buildLevel(def) {
    if (this.level) this.scene.remove(this.level);
    const group = new THREE.Group();
    const byStyle = new Map();
    for (const b of def.boxes) {
      if (!byStyle.has(b.style)) byStyle.set(b.style, []);
      byStyle.get(b.style).push(b);
    }
    for (const [style, list] of byStyle) {
      group.add(new THREE.Mesh(this.boxGeometry(list), new THREE.MeshLambertMaterial({ map: this.texture(style) })));
    }
    for (const e of def.emitters || []) {
      const m = new THREE.MeshBasicMaterial({ color: e.color, fog: !e.glow });
      group.add(new THREE.Mesh(this.boxGeometry([e]), m));
    }
    this.level = group;
    this.scene.add(group);
  },

  // ---------- characters ----------
  // Phase 0 stand-in: a 1.8 m figure in the 2D palette, so the camera has something to frame.
  standIn() {
    const g = new THREE.Group();
    const part = (w, h, d, x, y, z, color, basic) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }));
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    part(0.16, 0.85, 0.2, -0.12, 0.43, 0, PCOL.dark); part(0.16, 0.85, 0.2, 0.12, 0.43, 0, PCOL.dark);
    part(0.18, 0.1, 0.28, -0.12, 0.05, -0.04, PCOL.boot); part(0.18, 0.1, 0.28, 0.12, 0.05, -0.04, PCOL.boot);
    part(0.46, 0.62, 0.26, 0, 1.17, 0, PCOL.mid);
    part(0.12, 0.6, 0.14, -0.31, 1.15, 0, PCOL.light); part(0.12, 0.6, 0.14, 0.31, 1.15, 0, PCOL.light);
    part(0.26, 0.28, 0.26, 0, 1.64, 0, PCOL.hi);
    part(0.2, 0.06, 0.04, 0, 1.66, -0.14, PCOL.visor, true);
    part(0.06, 0.06, 0.06, 0, 1.2, -0.14, PCOL.core, true);
    part(0.3, 0.1, 0.3, 0, 1.47, 0.02, PCOL.scarf); part(0.1, 0.36, 0.04, 0.08, 1.3, 0.16, PCOL.scarfD);
    const blade = part(0.03, 0.9, 0.06, 0.32, 0.55, -0.2, PCOL.blade);
    blade.rotation.x = -0.35;
    part(0.05, 0.22, 0.05, 0.32, 0.92, -0.08, PCOL.handle);
    return g;
  },
};
