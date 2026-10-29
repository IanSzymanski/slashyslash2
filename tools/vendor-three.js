#!/usr/bin/env node
// Bundles the pinned Three.js into vendor/three.js as a classic-script global THREE, so the game runs from file://.
// Only the names in USED are exported; add one here and rerun when the game needs a new class.
// Usage: npm install && node tools/vendor-three.js
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const USED = [
  // core
  'WebGLRenderer', 'WebGLRenderTarget', 'Scene', 'Object3D', 'Group', 'Clock',
  'PerspectiveCamera', 'OrthographicCamera',
  'Color', 'Fog', 'FogExp2', 'MathUtils',
  'Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4',
  'Box3', 'Sphere', 'Ray', 'Plane', 'Raycaster',
  // geometry
  'BufferGeometry', 'BufferAttribute', 'Float32BufferAttribute', 'Uint16BufferAttribute', 'Uint32BufferAttribute',
  'InstancedBufferAttribute', 'BoxGeometry', 'PlaneGeometry', 'CylinderGeometry', 'SphereGeometry',
  'ConeGeometry', 'CircleGeometry', 'RingGeometry',
  // objects
  'Mesh', 'InstancedMesh', 'SkinnedMesh', 'Skeleton', 'Bone', 'Sprite', 'Points', 'Line', 'LineSegments',
  // materials
  'MeshBasicMaterial', 'MeshLambertMaterial', 'SpriteMaterial', 'PointsMaterial', 'LineBasicMaterial',
  'ShaderMaterial',
  // textures
  'Texture', 'CanvasTexture', 'DataTexture',
  // lights
  'AmbientLight', 'HemisphereLight', 'DirectionalLight', 'PointLight',
  // constants
  'NearestFilter', 'LinearFilter', 'LinearMipmapLinearFilter', 'RepeatWrapping', 'ClampToEdgeWrapping',
  'FrontSide', 'BackSide', 'DoubleSide', 'NormalBlending', 'AdditiveBlending', 'MultiplyBlending',
  'SRGBColorSpace', 'LinearSRGBColorSpace', 'NoToneMapping', 'RGBAFormat', 'UnsignedByteType', 'FloatType',
  'REVISION',
];

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'node_modules', 'three', 'package.json'));
const license = fs.readFileSync(path.join(root, 'node_modules', 'three', 'LICENSE'), 'utf8').trim();

(async () => {
  const res = await esbuild.build({
    stdin: { contents: `export { ${USED.join(', ')} } from 'three';`, resolveDir: root, loader: 'js' },
    bundle: true,
    format: 'iife',
    globalName: 'THREE',
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    write: false,
  });
  const banner = `/* three.js ${pkg.version} (subset of ${USED.length} names) bundled by tools/vendor-three.js. Do not edit.\n${license}\n*/\n`;
  const out = path.join(root, 'vendor', 'three.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const code = banner + res.outputFiles[0].text;
  fs.writeFileSync(out, code);
  console.log(`wrote ${path.relative(root, out)}: three ${pkg.version}, ${USED.length} names, ${(code.length / 1024).toFixed(0)} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
