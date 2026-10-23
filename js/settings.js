'use strict';
// Settings data, presets and persistence. UI lives in ui.js.

// 3D keys: both games can run from the same origin, and shared keys would rebind the 2D game too.
const SETTINGS_KEY = 'slashyslash3d.settings.v1';
const SAVE_KEY = 'slashyslash3d.save.v1';

const ACTIONS = [
  { id: 'forward', label: 'Move Forward' },
  { id: 'back', label: 'Move Back' },
  { id: 'left', label: 'Move Left' },
  { id: 'right', label: 'Move Right' },
  { id: 'jump', label: 'Jump / Double Jump' },
  { id: 'crouch', label: 'Crouch / Slide / Plunge' },
  { id: 'dash', label: 'Dash' },
  { id: 'attack', label: 'Slash (tap) / Heavy (hold)' },
  { id: 'sheathe', label: 'Parry stance (costs shield) / AEGIS: beam or block' },
  { id: 'utility', label: 'Utility (cooldown) / AEGIS: hold to switch mode' },
  { id: 'tether', label: 'Tether (tap fling / hold zip / grab)' },
  { id: 'ultimate', label: 'Ultimate (hold)' },
  { id: 'reload', label: 'Reload (AEGIS gun)' },
  { id: 'pause', label: 'Pause' },
];

// Movement is relative to the camera. Esc never reaches the page while the mouse is locked; losing the lock pauses.
// Crouch avoids Ctrl: Ctrl+W (crouch while moving forward) closes the tab, and pages can't block it.
const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', ''],
  crouch: ['KeyC', ''],
  dash: ['ShiftLeft', 'ShiftRight'],
  attack: ['Mouse0', ''],
  sheathe: ['KeyE', ''],
  utility: ['KeyF', ''],
  tether: ['Mouse2', ''],
  ultimate: ['KeyQ', ''],
  reload: ['KeyR', ''],
  pause: ['Escape', 'KeyP'],
};

const DIFFICULTY_PRESETS = {
  easy: { health: 0.7, damage: 0.6, speed: 0.9, count: 0.8, aggression: 0.7, telegraph: 1.35 },
  normal: { health: 1, damage: 1, speed: 1, count: 1, aggression: 1, telegraph: 1 },
  hard: { health: 1.3, damage: 1.4, speed: 1.1, count: 1.25, aggression: 1.3, telegraph: 0.85 },
  nightmare: { health: 1.8, damage: 2, speed: 1.25, count: 1.6, aggression: 1.7, telegraph: 0.7 },
};

const DEFAULT_SETTINGS = {
  enemies: {
    preset: 'normal',
    health: 1, damage: 1, speed: 1, count: 1, aggression: 1, telegraph: 1,
    maxAlive: 10, waveBreak: 4,
    scrapper: true, gunner: true, drone: true, brute: true, shielder: true, crawler: true, grenadier: true, sniper: true, bossEndless: true,
  },
  gameplay: { parryWindow: 0.2, ultKills: 12, invincible: false, ultimate: 'sawblade' },
  // v: the binding layout's version (2: the ultimate on Q, reload on R)
  controls: { v: 2, bindings: deepClone(DEFAULT_BINDINGS) },
  // distance in metres behind the pivot; fovKick widens the view on dashes and zips
  camera: { distance: 5, sensitivity: 1, invertY: false, fovKick: true },
  audio: { master: 0.8, sfx: 0.9, music: 0.45, muteOnBlur: true },
  visuals: {
    shake: 1, hitstop: 1, particles: 1, resScale: 1,
    damageNumbers: true, lighting: true, glow: true, flashes: true, slowmo: true,
    weather: true, scanlines: false, showFps: false, indicators: true, retro: false,
  },
};

const S = (() => {
  let saved = null;
  try { saved = JSON.parse(safeStorageGet(SETTINGS_KEY) || 'null'); } catch (e) { saved = null; }
  const s = deepMerge(deepClone(DEFAULT_SETTINGS), saved);
  // settings saved before the ultimate moved to Q (with R free for AEGIS's reload) keep a rebound ultimate
  const b = saved && saved.controls && saved.controls.bindings;
  if (b && !saved.controls.v && Array.isArray(b.ultimate) && b.ultimate[0] === 'KeyR' && !b.ultimate[1]) s.controls.bindings.ultimate = ['KeyQ', ''];
  return s;
})();
// Old saves may have the wrong binding slot count.
for (const a of ACTIONS) {
  const b = S.controls.bindings[a.id];
  if (!Array.isArray(b) || b.length !== 2) S.controls.bindings[a.id] = DEFAULT_BINDINGS[a.id].slice();
}

let _saveTimer = 0;
function saveSettings() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => safeStorageSet(SETTINGS_KEY, JSON.stringify(S)), 150);
}
function resetSettings(section) {
  const d = deepClone(DEFAULT_SETTINGS);
  if (section) S[section] = d[section];
  else for (const k in d) S[k] = d[k];
  saveSettings();
}
function applyPreset(name) {
  const p = DIFFICULTY_PRESETS[name];
  if (!p) return;
  Object.assign(S.enemies, p);
  S.enemies.preset = name;
  saveSettings();
}

// unlocks.aegis records the rival's defeat (AEGIS-07 is playable either way).
// character: who the next run plays as ('ronin' or 'aegis')
const SaveData = deepMerge({ bestWave: 0, bestScore: 0, demoCleared: false, bossKills: 0, unlocks: { aegis: false }, character: 'ronin' }, (() => {
  try { return JSON.parse(safeStorageGet(SAVE_KEY) || 'null'); } catch (e) { return null; }
})());
function saveProgress() { safeStorageSet(SAVE_KEY, JSON.stringify(SaveData)); }

// Settings panel schema; rendered by ui.js.
const SETTINGS_SCHEMA = {
  enemies: [
    { type: 'preset', key: 'enemies.preset', label: 'Difficulty', options: ['easy', 'normal', 'hard', 'nightmare', 'custom'] },
    { type: 'range', key: 'enemies.health', label: 'Enemy health', min: 0.25, max: 3, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.damage', label: 'Enemy damage', min: 0, max: 3, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.speed', label: 'Enemy speed', min: 0.5, max: 1.8, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.count', label: 'Enemies per wave', min: 0.3, max: 3, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.aggression', label: 'Attack frequency', min: 0.3, max: 2.5, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.telegraph', label: 'Attack wind-up time', min: 0.5, max: 2, step: 0.05, fmt: 'x', custom: true },
    { type: 'range', key: 'enemies.maxAlive', label: 'Max enemies at once', min: 2, max: 30, step: 1, fmt: 'int' },
    { type: 'range', key: 'enemies.waveBreak', label: 'Break between waves', min: 1, max: 15, step: 0.5, fmt: 's' },
    { type: 'heading', label: 'Enemy types' },
    { type: 'toggle', key: 'enemies.scrapper', label: 'Scrappers (melee)' },
    { type: 'toggle', key: 'enemies.gunner', label: 'Gunners (ranged)' },
    { type: 'toggle', key: 'enemies.drone', label: 'Drones (flying divers)' },
    { type: 'toggle', key: 'enemies.brute', label: 'Brutes (heavy)' },
    { type: 'toggle', key: 'enemies.shielder', label: 'Shield scrappers' },
    { type: 'toggle', key: 'enemies.crawler', label: 'Armoured crawlers' },
    { type: 'toggle', key: 'enemies.grenadier', label: 'Grenadiers' },
    { type: 'toggle', key: 'enemies.sniper', label: 'Rooftop snipers' },
    { type: 'toggle', key: 'enemies.bossEndless', label: 'Rival boss every 8th endless wave' },
    { type: 'heading', label: 'Player' },
    { type: 'range', key: 'gameplay.parryWindow', label: 'Parry window', min: 0.08, max: 0.45, step: 0.01, fmt: 'ms' },
    { type: 'range', key: 'gameplay.ultKills', label: 'Kills to charge ultimate', min: 3, max: 40, step: 1, fmt: 'int' },
    { type: 'toggle', key: 'gameplay.invincible', label: 'Invincible (practice)' },
  ],
  controls: [
    { type: 'bindings' },
  ],
  camera: [
    { type: 'range', key: 'camera.sensitivity', label: 'Mouse sensitivity', min: 0.2, max: 3, step: 0.05, fmt: 'x' },
    { type: 'toggle', key: 'camera.invertY', label: 'Invert mouse Y' },
    { type: 'range', key: 'camera.distance', label: 'Camera distance (scroll wheel; 0 is first person)', min: 0, max: 9, step: 0.25, fmt: 'm' },
    { type: 'toggle', key: 'camera.fovKick', label: 'Widen the view at speed (sprints, dashes)' },
  ],
  audio: [
    { type: 'range', key: 'audio.master', label: 'Master volume', min: 0, max: 1, step: 0.01, fmt: '%' },
    { type: 'range', key: 'audio.sfx', label: 'Sound effects', min: 0, max: 1, step: 0.01, fmt: '%' },
    { type: 'range', key: 'audio.music', label: 'Music', min: 0, max: 1, step: 0.01, fmt: '%' },
    { type: 'toggle', key: 'audio.muteOnBlur', label: 'Mute when window loses focus' },
    { type: 'test-sound' },
  ],
  visuals: [
    { type: 'range', key: 'visuals.shake', label: 'Screen shake', min: 0, max: 2, step: 0.05, fmt: '%' },
    { type: 'range', key: 'visuals.hitstop', label: 'Hit-stop (impact freeze)', min: 0, max: 2, step: 0.05, fmt: '%' },
    { type: 'range', key: 'visuals.particles', label: 'Particle density', min: 0.1, max: 2, step: 0.05, fmt: '%' },
    { type: 'range', key: 'visuals.resScale', label: 'Resolution scale', min: 0.5, max: 1, step: 0.25, fmt: '%' },
    { type: 'toggle', key: 'visuals.lighting', label: 'Dynamic lighting' },
    { type: 'toggle', key: 'visuals.glow', label: 'Glow' },
    { type: 'toggle', key: 'visuals.flashes', label: 'Screen flashes' },
    { type: 'toggle', key: 'visuals.slowmo', label: 'Slow-motion on parry and big hits' },
    { type: 'toggle', key: 'visuals.damageNumbers', label: 'Damage numbers' },
    { type: 'toggle', key: 'visuals.indicators', label: 'Threat ring around the crosshair' },
    { type: 'toggle', key: 'visuals.weather', label: 'Ash and rain' },
    { type: 'toggle', key: 'visuals.retro', label: 'Retro: render at 480x270, pixelated' },
    { type: 'toggle', key: 'visuals.scanlines', label: 'CRT scanlines' },
    { type: 'toggle', key: 'visuals.showFps', label: 'Show FPS' },
  ],
};
