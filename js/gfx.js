'use strict';
// WebGL renderer, procedural textures, the baked level mesh, character materials, the fixed light pool and fog.

// Wall and floor palettes [base, dark, light]; the building ones are the 2D level.js styles.
const TEX_STYLES = {
  brick: ['#4e2c32', '#3e2228', '#62383c'], brick2: ['#56343a', '#432630', '#6c4044'],
  concrete: ['#463c4c', '#382f3e', '#584c5e'], panel: ['#3a3e4e', '#2e3140', '#4c5062'],
  shop: ['#3e3a48', '#302c38', '#524c5c'], shop2: ['#43384a', '#342b3a', '#574a5e'],
  slab: ['#4a4250', '#3a3240', '#5c5464'], roof: ['#2e2832', '#221e26', '#3c3440'],
  asphalt: ['#2a2430', '#1e1a22', '#36303c'], metal: ['#3a3e4e', '#262a36', '#5a6074'],
  car: ['#4a3236', '#30202a', '#6a4a44'], container: ['#5a3428', '#3e2420', '#7a4c38'],
  // the construction site
  hoarding: ['#5a4a38', '#463828', '#6e5c46'], crane: ['#1a1610', '#0e0c08', '#c8a020'], steel: ['#4a2e26', '#36201c', '#62403a'],
  dirt: ['#3e3026', '#2e241c', '#52402e'], bricks: ['#5a2e28', '#3a1e1a', '#6e3a30'], timber: ['#5a4632', '#3e3022', '#705a40'],
  yellow: ['#a8841c', '#7a5e14', '#c8a028'], tread: ['#262428', '#18161a', '#38363a'], cab: ['#2a3038', '#1a1e24', '#5a7088'],
  dumpster: ['#2e4a3a', '#203428', '#3e5e4a'], potty: ['#2a4a7a', '#1e365a', '#3a5e94'],
};
// Facades carry windows: a 256x192 texture covering 8 m x 6 m (4 x 2 windows), some of them lit.
const FACADES = new Set(['brick', 'brick2', 'concrete', 'panel', 'shop', 'shop2']);
const TEX_METRES = (style) => (FACADES.has(style) ? [8, 6] : [2, 2]);

const Gfx = {
  renderer: null, scene: null, camera: null, level: null, fireMats: [], lampMats: [], buzzMats: [], blinkMats: [], baked: [],
  // how bright the flickering lights are this frame (render.js sets them), shared by every level material
  uFire: { value: 1 }, uBuzz: { value: 1 },
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
  // in first person, character surfaces closer to the lens than this are cut away (dithered over the next
  // 50%), so your own shoulders and arms, or an enemy in your face, never fill the view from inside
  nearCut: { value: 0 },
  litMaterial(opts, mode, feetUniform = null, rim = true) {
    const m = new THREE.MeshLambertMaterial(opts);
    m.defines = mode === 'baked' ? { USE_BAKED: '' } : { USE_FEET: '' };
    if (!rim) m.defines.NO_RIM = '';
    const feet = mode === 'baked' ? null : feetUniform || { value: new THREE.Color(0.25, 0.22, 0.3) };
    m.userData.feet = feet;
    m.onBeforeCompile = (sh) => {
      if (feet) { sh.uniforms.uFeet = feet; sh.uniforms.uRim = this.rim; sh.uniforms.uNearCut = this.nearCut; }
      else { sh.uniforms.uFire = this.uFire; sh.uniforms.uBuzz = this.uBuzz; }
      sh.uniforms.uDesat = this.desat;
      // characters: a 'glow' vertex attribute marks fullbright parts (eyes, cores) and 'plain' parts skip the
      // texture (clean lights); meshes without them read 0
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n#ifdef USE_BAKED\nattribute vec3 baked;\nattribute vec3 bakedFire;\nattribute vec3 bakedBuzz;\nuniform float uFire;\nuniform float uBuzz;\nvarying vec3 vBaked;\n#endif\n#ifdef USE_FEET\nattribute float glow;\nattribute float plain;\nvarying float vGlow;\nvarying float vPlain;\n#endif')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_BAKED\nvBaked = baked + bakedFire * uFire + bakedBuzz * uBuzz;\n#endif\n#ifdef USE_FEET\nvGlow = glow;\nvPlain = plain;\n#endif');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uDesat;\n#ifdef USE_BAKED\nvarying vec3 vBaked;\n#endif\n#ifdef USE_FEET\nuniform vec3 uFeet;\nuniform vec3 uRim;\nuniform float uNearCut;\nvarying float vGlow;\nvarying float vPlain;\n#endif')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n#ifdef USE_FEET\nif ( uNearCut > 0.0 ) {\n  float nd = length( vViewPosition );\n  float nk = ( nd - uNearCut ) / ( uNearCut * 0.5 );\n  if ( nk < fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) ) discard;\n}\n#endif')
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
      } else if (style === 'container') {
        // corrugated steel: vertical ribs, a rust-streaked band, the door's locking bars
        speckle(260);
        g.fillStyle = dark;
        for (let x = 0; x < 64; x += 4) g.fillRect(x, 0, 1, 64);
        g.fillStyle = light;
        for (let x = 2; x < 64; x += 4) g.fillRect(x, 0, 1, 64);
        g.fillStyle = '#2a1a16'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3);
        g.fillStyle = '#8a5a3a';
        for (let i = 0; i < 10; i++) g.fillRect((R() * 64) | 0, 3, 1, 4 + ((R() * 14) | 0));
      } else if (style === 'hoarding') {
        // plywood sheets 1.2 m wide with a dark seam, peeling posters, a hazard band at the foot
        speckle(500);
        g.fillStyle = dark;
        for (let x = 0; x < 64; x += 38) g.fillRect(x, 0, 1, 64);
        for (let i = 0; i < 3; i++) {
          const px = (R() * 50) | 0, py = 8 + ((R() * 30) | 0);
          g.fillStyle = ['#6a3a4a', '#3a4a6a', '#6a5a3a', '#4a2a2a'][(R() * 4) | 0]; g.fillRect(px, py, 10, 14);
          g.fillStyle = light; g.fillRect(px + 2, py + 3, 6, 1); g.fillRect(px + 2, py + 6, 4, 1);
        }
        for (let x = 0; x < 64; x += 8) { g.fillStyle = '#c8a020'; g.fillRect(x, 58, 4, 6); g.fillStyle = '#18140c'; g.fillRect(x + 4, 58, 4, 6); }
      } else if (style === 'crane') {
        // a lattice: yellow chords round the edge and crossed braces, dark between
        g.fillStyle = light;
        g.fillRect(0, 0, 64, 4); g.fillRect(0, 60, 64, 4); g.fillRect(0, 0, 4, 64); g.fillRect(60, 0, 4, 64); g.fillRect(0, 30, 64, 3);
        for (let i = 0; i < 64; i++) { g.fillRect(i, i, 3, 2); g.fillRect(62 - i, i, 3, 2); }
      } else if (style === 'steel') {
        // rust-red primer on I-beams: a flange line top and bottom, streaks
        speckle(260);
        g.fillStyle = dark; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3); g.fillRect(0, 31, 64, 2);
        g.fillStyle = '#7a4a30';
        for (let i = 0; i < 12; i++) g.fillRect((R() * 64) | 0, (R() * 50) | 0, 1, 4 + ((R() * 10) | 0));
      } else if (style === 'dirt') {
        speckle(1400);
        g.fillStyle = '#5a4a38';
        for (let i = 0; i < 60; i++) g.fillRect((R() * 64) | 0, (R() * 64) | 0, 2, 2);
      } else if (style === 'bricks') {
        // stacked bricks banded on a pallet
        g.fillStyle = dark;
        for (let y = 0; y < 52; y += 6) { g.fillRect(0, y, 64, 1); for (let x = (y / 6) % 2 ? 8 : 0; x < 64; x += 16) g.fillRect(x, y + 1, 1, 5); }
        speckle(300);
        g.fillStyle = '#5a4632'; g.fillRect(0, 52, 64, 12); g.fillStyle = '#2a2016'; for (let x = 4; x < 64; x += 14) g.fillRect(x, 56, 8, 6);
        g.fillStyle = '#c8c0b0'; g.fillRect(20, 0, 2, 52); g.fillRect(44, 0, 2, 52);
      } else if (style === 'timber') {
        // sawn timber and blocks: planks with end grain
        for (let y = 0; y < 64; y += 8) { g.fillStyle = y % 16 ? base : light; g.fillRect(0, y, 64, 7); g.fillStyle = dark; g.fillRect(0, y + 7, 64, 1); }
        speckle(240);
      } else if (style === 'yellow' || style === 'dumpster' || style === 'potty') {
        // painted plant and boxes: panel lines, scuffs, a hazard stripe on the machines
        speckle(220);
        g.fillStyle = dark; g.fillRect(0, 0, 64, 2); g.fillRect(0, 31, 64, 1); g.fillRect(31, 0, 1, 64);
        if (style === 'yellow') for (let x = -64; x < 64; x += 10) { g.fillStyle = '#18140c'; for (let i = 0; i < 6; i++) g.fillRect(x + i + 50, 56 + i, 5, 1); }
        if (style === 'potty') { g.fillStyle = light; g.fillRect(8, 8, 14, 6); }
      } else if (style === 'tread') {
        speckle(200);
        g.fillStyle = dark; for (let x = 0; x < 64; x += 6) g.fillRect(x, 0, 2, 64);
      } else if (style === 'cab') {
        // a cab: a dark frame round glazing that catches the sky
        g.fillStyle = '#c8a020'; g.fillRect(0, 0, 64, 64);
        g.fillStyle = '#1a2230'; g.fillRect(6, 6, 52, 34);
        g.fillStyle = light; g.fillRect(10, 10, 14, 3); g.fillRect(10, 14, 6, 2);
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
  // AEGIS-07's finish from its reference sheets: pixel camo of white, light and mid grey with blue patches and
  // a few dark flecks, in 2x2 blocks, multiplied into each part's colour (white parts show it at full strength).
  camoTexture() {
    let t = this.texCache.get('camo');
    if (t) return t;
    const N = 64, B = 2, M = N / B, c = makeCanvas(N, N), g = c.ctx, R = mulberry32(4207);
    const grid = new Uint8Array(M * M);
    // random-walk blobs of each colour, laid over each other
    const blob = (kind, count, len) => {
      for (let i = 0; i < count; i++) {
        let x = (R() * M) | 0, y = (R() * M) | 0;
        const L = len * (0.5 + R());
        for (let s = 0; s < L; s++) {
          for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) grid[((y + dy) % M) * M + ((x + dx) % M)] = kind;
          if (R() < 0.5) x = (x + (R() < 0.5 ? M - 1 : 1)) % M; else y = (y + (R() < 0.5 ? M - 1 : 1)) % M;
        }
      }
    };
    blob(1, 30, 9); blob(2, 22, 7); blob(3, 10, 5); blob(4, 5, 4); blob(5, 18, 2);
    const COLS = [[164, 168, 177], [134, 139, 150], [100, 105, 118], [74, 96, 146], [52, 74, 132], [58, 61, 73]];
    for (let y = 0; y < M; y++) {
      for (let x = 0; x < M; x++) {
        const [r, gg, b] = COLS[grid[y * M + x]], k = 0.94 + R() * 0.08;
        g.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, gg * k) | 0},${Math.min(255, b * k) | 0})`;
        g.fillRect(x * B, y * B, B, B);
      }
    }
    // plate seams
    g.fillStyle = 'rgb(84,88,99)';
    g.fillRect(0, 31, N, 1); g.fillRect(31, 0, 1, N);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    this.texCache.set('camo', t);
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
  // Every visible face is cut into cells of at most 1 m (b.cell for tall plain walls), and each vertex gets
  // the light baked from World.lightSplit with shadow rays, in three channels: steady, fire and buzz, so
  // flicker shows on the world. Cells inside another box (under the plaza, behind a building) and faces on
  // the outside of the boundary are skipped. Faces of one texture share one mesh.
  buildLevel(def) {
    if (this.level) {
      this.scene.remove(this.level);
      this.level.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    this.fireMats = []; this.lampMats = []; this.buzzMats = []; this.blinkMats = []; this.baked = []; this._rebakeQ = [];
    const group = new THREE.Group();
    const buckets = new Map();
    const bucket = (style) => { if (!buckets.has(style)) buckets.set(style, { pos: [], nrm: [], uv: [], baked: [], fire: [], buzz: [], idx: [] }); return buckets.get(style); };
    const B = def.bounds, cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2;
    const L0 = [0, 0, 0], L1 = [0, 0, 0], L2 = [0, 0, 0];
    const FACES = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    ];
    for (const b of def.boxes) {
      if (b.hidden) continue;
      const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z], ctr = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      for (const F of FACES) {
        const ax = F.n[0] ? 0 : F.n[1] ? 1 : 2, top = F.n[1] > 0;
        if (b.kind === 'ground' && !top) continue;
        if (F.n[1] < 0 && b.min.y <= 0.01) continue;
        const fc = ctr.slice(); fc[ax] = F.n[ax] > 0 ? mx[ax] : mn[ax];
        if (b.kind === 'bound' && !top && F.n[0] * (cx - fc[0]) + F.n[2] * (cz - fc[2]) <= 0) continue;
        const style = top ? (b.top || b.style) : b.style, [tw, th] = TEX_METRES(style);
        const ua = F.u[0] ? 0 : F.u[1] ? 1 : 2, va = F.v[0] ? 0 : F.v[1] ? 1 : 2;
        const ulen = mx[ua] - mn[ua], vlen = mx[va] - mn[va], cs = b.cell || 1;
        const nu = Math.max(1, Math.ceil(ulen / cs)), nv = Math.max(1, Math.ceil(vlen / cs));
        // corner where u and v are smallest along their (signed) axes
        const o = fc.slice();
        o[ua] = F.u[ua] > 0 ? mn[ua] : mx[ua];
        o[va] = F.v[va] > 0 ? mn[va] : mx[va];
        const at = (fi, fj, lift, out) => {
          for (let k = 0; k < 3; k++) out[k] = o[k] + F.u[k] * ulen * fi + F.v[k] * vlen * fj + F.n[k] * lift;
          return out;
        };
        // cells showing: their middle just off the face isn't inside another box
        const keep = new Uint8Array(nu * nv), P = [0, 0, 0];
        let any = false;
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; i++) {
            at((i + 0.5) / nu, (j + 0.5) / nv, 0.06, P);
            if (!World.pointSolid(P[0], P[1], P[2])) { keep[j * nu + i] = 1; any = true; }
          }
        }
        if (!any) continue;
        const K = bucket(style), vid = new Int32Array((nu + 1) * (nv + 1)).fill(-1);
        const vert = (i, j) => {
          const q = j * (nu + 1) + i;
          if (vid[q] >= 0) return vid[q];
          const p = at(i / nu, j / nv, 0, [0, 0, 0]);
          vid[q] = K.pos.length / 3;
          K.pos.push(p[0], p[1], p[2]);
          K.nrm.push(F.n[0], F.n[1], F.n[2]);
          K.uv.push((p[0] * F.u[0] + p[1] * F.u[1] + p[2] * F.u[2]) / tw, (p[0] * F.v[0] + p[1] * F.v[1] + p[2] * F.v[2]) / th);
          World.lightSplit(p[0], p[1], p[2], F.n[0], F.n[1], F.n[2], L0, L1, L2);
          K.baked.push(L0[0], L0[1], L0[2]); K.fire.push(L1[0], L1[1], L1[2]); K.buzz.push(L2[0], L2[1], L2[2]);
          return vid[q];
        };
        for (let j = 0; j < nv; j++) {
          for (let i = 0; i < nu; i++) {
            if (!keep[j * nu + i]) continue;
            const a = vert(i, j), bb = vert(i + 1, j), c = vert(i, j + 1), d = vert(i + 1, j + 1);
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
      geo.setAttribute('bakedFire', new THREE.Float32BufferAttribute(K.fire, 3));
      geo.setAttribute('bakedBuzz', new THREE.Float32BufferAttribute(K.buzz, 3));
      geo.setIndex(K.idx);
      const opts = { map: this.texture(style) };
      if (FACADES.has(style)) Object.assign(opts, { emissiveMap: this.texture(style, true), emissive: new THREE.Color(1, 1, 1) });
      group.add(new THREE.Mesh(geo, this.litMaterial(opts, 'baked')));
      this.baked.push(geo);
      verts += K.pos.length / 3;
    }
    for (const e of def.emitters || []) {
      const m = new THREE.MeshBasicMaterial({ color: e.color, fog: !e.glow });
      m.userData.base = new THREE.Color(e.color);
      if (e.fire) this.fireMats.push(m);
      if (e.lamp) this.lampMats.push(m);
      if (e.buzz) this.buzzMats.push(m);
      if (e.blink) this.blinkMats.push(m);
      group.add(new THREE.Mesh(this.boxGeometry([e]), m));
    }
    // street lamps: a pole and a glowing head each, so props.js can take one down
    const poleMat = new THREE.MeshBasicMaterial({ color: '#26222c' });
    for (const L of def.lamps || []) {
      const hm = new THREE.MeshBasicMaterial({ color: '#ffd8a0', fog: false });
      hm.userData.base = new THREE.Color('#ffd8a0');
      this.lampMats.push(hm);
      if (L.buzz) this.buzzMats.push(hm);
      const pole = new THREE.Mesh(this.boxGeometry([{ min: { x: L.x - 0.1, y: L.y0, z: L.z - 0.1 }, max: { x: L.x + 0.1, y: L.y0 + 5.6, z: L.z + 0.1 } }]), poleMat);
      const head = new THREE.Mesh(this.boxGeometry([{ min: { x: L.x - 0.45, y: L.y0 + 5.45, z: L.z - 0.45 }, max: { x: L.x + 0.45, y: L.y0 + 5.65, z: L.z + 0.45 } }]), hm);
      group.add(pole, head);
      L.gfx = { pole, head, stump: null, top: null };
    }
    const furn = this.furnitureMesh(def);
    if (furn) { group.add(furn); this.baked.push(furn.geometry); }
    this.level = group;
    this.levelVerts = verts;
    this.scene.add(group);
    this.syncLamps();
  },
  // Round street furniture (bins, hydrants, cones, drums) and any other non-box shapes in def.furniture, merged
  // into one mesh with the light baked into its vertices like the level. Shapes: { shape: 'cyl' | 'cone' |
  // 'box', x, y, z (base centre), r, h, w, d, color, rot (about y), axis: 'x' | 'z' to lie a cylinder down }.
  furnitureMesh(def) {
    const list = (def.furniture || []).slice();
    for (const q of def.round || []) {
      if (q.kind === 'bin') list.push({ shape: 'cyl', x: q.x, y: q.y0, z: q.z, r: q.r, h: q.h, color: '#2e4a3a' }, { shape: 'cyl', x: q.x, y: q.y0 + q.h - 0.06, z: q.z, r: q.r + 0.04, h: 0.08, color: '#24382c' });
      else if (q.kind === 'hydrant') list.push({ shape: 'cyl', x: q.x, y: q.y0, z: q.z, r: q.r, h: q.h - 0.15, color: '#a02a24' }, { shape: 'cone', x: q.x, y: q.y0 + q.h - 0.15, z: q.z, r: q.r, h: 0.15, color: '#b8342c' }, { shape: 'cyl', x: q.x, y: q.y0 + q.h * 0.55, z: q.z, r: 0.07, h: q.r * 2 + 0.16, color: '#c8a040', axis: 'x' });
      else if (q.kind === 'cone') list.push({ shape: 'cone', x: q.x, y: q.y0 + 0.04, z: q.z, r: q.r, h: q.h - 0.04, color: '#e05a1a' }, { shape: 'box', x: q.x, y: q.y0, z: q.z, w: q.r * 2.4, d: q.r * 2.4, h: 0.04, color: '#3a2a26' }, { shape: 'cyl', x: q.x, y: q.y0 + q.h * 0.5, z: q.z, r: q.r * 0.55, h: 0.08, color: '#e8e0d0' });
      else if (q.kind === 'drum') list.push({ shape: 'cyl', x: q.x, y: q.y0, z: q.z, r: q.r, h: q.h, color: q.color || '#3a5a7a' });
      else if (q.kind === 'pole') list.push({ shape: 'cyl', x: q.x, y: q.y0, z: q.z, r: q.r, h: q.h, color: '#5a5e68', seg: 6 });
    }
    if (!list.length) return null;
    const pos = [], nrm = [], col = [], baked = [], fire = [], buzz = [], idx = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const f of list) {
      let geo;
      if (f.shape === 'line') {
        // a cable or a boom: a thin cylinder from a to b
        const dx = f.b[0] - f.a[0], dy = f.b[1] - f.a[1], dz = f.b[2] - f.a[2], len = Math.hypot(dx, dy, dz);
        geo = new THREE.CylinderGeometry(f.r, f.r, len, f.r > 0.1 ? 8 : 4);
        geo.applyQuaternion(q.setFromUnitVectors(n.set(0, 1, 0), v.set(dx / len, dy / len, dz / len)));
        geo.translate((f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2, (f.a[2] + f.b[2]) / 2);
        if (geo.index) geo = geo.toNonIndexed();
        this.furnPush(geo, f.color, pos, nrm, col, baked, fire, buzz, idx);
        continue;
      }
      if (f.shape === 'box') geo = new THREE.BoxGeometry(f.w, f.h, f.d).translate(0, f.h / 2, 0);
      else if (f.shape === 'cone') geo = new THREE.ConeGeometry(f.r, f.h, 8).translate(0, f.h / 2, 0);
      else geo = new THREE.CylinderGeometry(f.r2 === undefined ? f.r : f.r2, f.r, f.h, f.seg || 10).translate(0, f.h / 2, 0);
      if (f.axis === 'x') geo.rotateZ(Math.PI / 2).translate(0, 0, 0);
      else if (f.axis === 'z') geo.rotateX(Math.PI / 2);
      e.set(0, f.rot || 0, 0);
      m.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e), n.set(1, 1, 1));
      geo.applyMatrix4(m);
      if (geo.index) geo = geo.toNonIndexed();
      this.furnPush(geo, f.color, pos, nrm, col, baked, fire, buzz, idx);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('baked', new THREE.Float32BufferAttribute(baked, 3));
    g.setAttribute('bakedFire', new THREE.Float32BufferAttribute(fire, 3));
    g.setAttribute('bakedBuzz', new THREE.Float32BufferAttribute(buzz, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, this.litMaterial({ vertexColors: true }, 'baked'));
  },

  // one shape's vertices into the furniture arrays, lit by the bake (a little off the surface)
  furnPush(geo, color, pos, nrm, col, baked, fire, buzz, idx) {
    const P = geo.attributes.position, N = geo.attributes.normal, i0 = pos.length / 3, c = this._fc || (this._fc = new THREE.Color());
    const L0 = [0, 0, 0], L1 = [0, 0, 0], L2 = [0, 0, 0];
    c.set(color);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
      pos.push(x, y, z); nrm.push(nx, ny, nz); col.push(c.r, c.g, c.b);
      World.lightSplit(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03, nx, ny, nz, L0, L1, L2);
      baked.push(L0[0], L0[1], L0[2]); fire.push(L1[0], L1[1], L1[2]); buzz.push(L2[0], L2[1], L2[2]);
      idx.push(i0 + i);
    }
    geo.dispose();
  },

  // ---------- lamps coming down (props.js) ----------
  // Hides the lamp, leaves a stump to the cut, and returns its top built about the cut so it can topple.
  breakLamp(L, cy) {
    const G = L.gfx;
    if (!G) return null;
    G.pole.visible = false; G.head.visible = false;
    G.stump = new THREE.Mesh(this.boxGeometry([{ min: { x: L.x - 0.1, y: L.y0, z: L.z - 0.1 }, max: { x: L.x + 0.1, y: cy, z: L.z + 0.1 } }]), G.pole.material);
    this.level.add(G.stump);
    const top = new THREE.Group(), len = L.y0 + 5.65 - cy;
    top.add(new THREE.Mesh(this.boxGeometry([{ min: { x: -0.1, y: 0, z: -0.1 }, max: { x: 0.1, y: len - 0.05, z: 0.1 } }]), G.pole.material));
    const dead = this.deadHead || (this.deadHead = new THREE.MeshBasicMaterial({ color: '#4a4038' }));
    top.add(new THREE.Mesh(this.boxGeometry([{ min: { x: -0.45, y: len - 0.2, z: -0.45 }, max: { x: 0.45, y: len, z: 0.45 } }]), dead));
    top.position.set(L.x, cy, L.z);
    this.level.add(top);
    G.top = top;
    return top;
  },
  poseLampTop(F) {
    const ax = this._lampAxis || (this._lampAxis = new THREE.Vector3());
    F.mesh.quaternion.setFromAxisAngle(ax.set(F.dz, 0, -F.dx), F.ang);
  },
  // the top breaks up where it lands: the pole in three lengths, the head in halves
  smashLampTop(F) {
    const G = F.L.gfx, seg = F.len / 3, pieces = [];
    this.poseLampTop(F);
    for (let i = 0; i < 3; i++) pieces.push({ size: [0.2, seg * 0.9, 0.2], at: [0, seg * (i + 0.5), 0], color: '#26222c' });
    pieces.push({ size: [0.44, 0.2, 0.9], at: [-0.23, F.len - 0.1, 0], color: '#4a4038' }, { size: [0.44, 0.2, 0.9], at: [0.23, F.len - 0.1, 0], color: '#4a4038' });
    FX.shatter(F.mesh, pieces, { x: F.dx * 3, y: 4, z: F.dz * 3 });
    this.level.remove(F.mesh);
    F.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (G) G.top = null;
  },
  // every lamp whole again
  resetLamps() {
    for (const L of (World.def && World.def.lamps) || []) {
      const G = L.gfx;
      if (!G) continue;
      G.pole.visible = true; G.head.visible = true;
      for (const k of ['stump', 'top']) {
        if (!G[k]) continue;
        this.level.remove(G[k]);
        G[k].traverse((o) => { if (o.geometry) o.geometry.dispose(); });
        G[k] = null;
      }
    }
  },
  // All three channels again for the vertices within r of a point (a lamp gone out), a slice per frame so
  // the cut doesn't hitch; processRebake runs the queue.
  rebakeAround(x, y, z, r) {
    const q = this._rebakeQ || (this._rebakeQ = []), r2 = r * r;
    for (const geo of this.baked) {
      const P = geo.attributes.position, idx = [];
      for (let i = 0; i < P.count; i++) {
        const dx = P.getX(i) - x, dy = P.getY(i) - y, dz = P.getZ(i) - z;
        if (dx * dx + dy * dy + dz * dz < r2) idx.push(i);
      }
      if (idx.length) q.push({ geo, idx, k: 0 });
    }
  },
  processRebake(budget = 1200) {
    const q = this._rebakeQ;
    if (!q || !q.length) return;
    const L0 = [0, 0, 0], L1 = [0, 0, 0], L2 = [0, 0, 0];
    while (q.length && budget > 0) {
      const J = q[0], g = J.geo, P = g.attributes.position, N = g.attributes.normal, A = g.attributes.baked, F = g.attributes.bakedFire, Z = g.attributes.bakedBuzz;
      const furn = !!g.attributes.color, end = Math.min(J.idx.length, J.k + budget);
      for (; J.k < end; J.k++) {
        const i = J.idx[J.k], nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), o = furn ? 0.03 : 0;
        World.lightSplit(P.getX(i) + nx * o, P.getY(i) + ny * o, P.getZ(i) + nz * o, nx, ny, nz, L0, L1, L2);
        A.setXYZ(i, L0[0], L0[1], L0[2]); F.setXYZ(i, L1[0], L1[1], L1[2]); Z.setXYZ(i, L2[0], L2[1], L2[2]);
        budget--;
      }
      A.needsUpdate = true; F.needsUpdate = true; Z.needsUpdate = true;
      if (J.k >= J.idx.length) q.shift();
    }
  },
  // everything, at once (a new run with lamps down)
  rebakeAll() {
    this._rebakeQ = [];
    this.rebakeAround(0, 0, 0, 1e6);
    this.processRebake(Infinity);
  },
  // The steady channel again, for the Blackout: the meshes stay, only their light changes.
  rebake() {
    const L0 = [0, 0, 0], L1 = [0, 0, 0], L2 = [0, 0, 0];
    for (const geo of this.baked) {
      const P = geo.attributes.position, N = geo.attributes.normal, A = geo.attributes.baked, o = geo.attributes.color ? 0.03 : 0;
      for (let i = 0; i < P.count; i++) {
        const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
        World.lightSplit(P.getX(i) + nx * o, P.getY(i) + ny * o, P.getZ(i) + nz * o, nx, ny, nz, L0, L1, L2);
        A.setXYZ(i, L0[0], L0[1], L0[2]);
      }
      A.needsUpdate = true;
    }
    this.syncLamps();
  },
  // lamp heads go dark in a Blackout; the fog closes in a little
  syncLamps() {
    for (const m of this.lampMats) m.color.copy(World.blackout ? new THREE.Color('#2a2426') : m.userData.base);
    this.scene.fog.far = World.blackout ? 75 : 95;
  },
  // Flicker for this frame: fires waver continuously; neon and failing lamps hold steady and now and then
  // stutter out for a moment. Applied to the baked light, the glowing shapes and characters' light.
  flicker(t, realDt) {
    const f = 0.84 + 0.12 * Math.sin(t * 17.3) * Math.sin(t * 5.1) + 0.04 * Math.sin(t * 41);
    const B = this._buzz || (this._buzz = { t: 0, k: 1, next: 2 });
    B.next -= realDt;
    if (B.t > 0) { B.t -= realDt; B.k = ((t * 28) | 0) % 3 ? 0.18 : 0.75; if (B.t <= 0) B.k = 1; }
    else if (B.next <= 0) { B.t = rand(0.08, 0.3); B.next = rand(1.5, 5); }
    World.flick.fire = f; World.flick.buzz = B.k;
    this.uFire.value = f; this.uBuzz.value = B.k;
    for (const m of this.fireMats) m.color.setRGB(1, 0.55 + 0.25 * Math.sin(t * 17) * Math.sin(t * 5.3), 0.2);
    for (const m of this.buzzMats) {
      if (World.blackout && this.lampMats.includes(m)) continue;
      m.color.copy(m.userData.base).multiplyScalar(0.25 + 0.75 * B.k);
    }
    // aircraft warning lights: a slow on and off
    const on = (t * 0.8) % 1 < 0.5 ? 1 : 0.08;
    for (const m of this.blinkMats) m.color.copy(m.userData.base).multiplyScalar(on);
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
