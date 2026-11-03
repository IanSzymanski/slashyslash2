'use strict';
// The roster: everything the game shows and draws for a playable character, beside how it plays (its class in
// player.js, aegisplayer.js, kragplayer.js and the like, registered in CHARACTERS). The character select screen
// (ui.js and showroom.js), the render rigs and poses (render.js), the HUD's colours and the touch buttons all read
// from here, so a new character is its class, its model in MODELS with a pose function, and one defineCharacter.
//
// An entry has:
//   name, title, role, blurb: who it is, on the select screen
//   color, accent: its light, as the select screen draws it
//   model: the MODELS key its rig is built from; pose(rig, player): lays the player's state onto the rig each
//     frame; rig(rig): one-off setup of its rig (recolouring a blade, say)
//   move: its movement table (controller.js), for the facts under its stats
//   stats: ratings out of 5, one per STAT_DEFS entry
//   labels: what its touch buttons read, by action, where it differs from RONIN's
//   skills: [{ name, kind, input, desc, demo }]: input is a hint with {action} for a binding; demo names one of
//     its demos, played on the showroom's stage when the skill is picked
//   demos: { name: steps or { steps, view } }: scripted input the showroom plays its real moves with (see
//     Showroom.run for the steps); view scales the camera's distance for a big move
//   idle: the demos it cycles through on its own; prep(p): the state it's put on the stage in
const STAT_DEFS = [
  { id: 'power', label: 'Power' }, { id: 'reach', label: 'Reach' }, { id: 'defence', label: 'Defence' },
  { id: 'speed', label: 'Speed' }, { id: 'mobility', label: 'Mobility' }, { id: 'difficulty', label: 'Difficulty' },
];
const SKILL_KINDS = ['Attack', 'Defence', 'Utility', 'Move', 'Passive', 'Ultimate'];
const ROSTER = [];
function defineCharacter(id, o) {
  const C = CHARACTERS[id];
  if (!C) throw new Error(`defineCharacter: ${id} has no class in CHARACTERS`);
  Object.assign(C, o);
  if (!ROSTER.includes(C)) ROSTER.push(C);
  return C;
}
function charDef(id) { return CHARACTERS[id] || CHARACTERS.ronin; }
// a skill's input hint with its bindings filled in
function skillInput(s) { return s.input.replace(/\{(\w+)\}/g, (_, a) => (typeof Touch !== 'undefined' && Touch.on() ? touchLabel(a) : actionLabel(a))); }
// what a touch button reads for the picked character
function touchLabel(a, id = SaveData.character) {
  const L = charDef(id).labels || {};
  return L[a] || { attack: 'ATTACK', jump: 'JUMP', dash: 'DASH', sheathe: 'PARRY', tether: 'TETHER', utility: 'BEAM', crouch: 'SLIDE', ultimate: 'ULT', reload: 'RELOAD' }[a] || a.toUpperCase();
}

// ---------- demos ----------
// Common pieces. A step is a wait in seconds or [op, ...]: press / release / tap an action, hold one for some
// seconds, move (forward, right), aim (ahead, up, right) from where it stands, hit (a blow from in front),
// set (a function on the body), emote (a pose by name for some seconds). See Showroom.run.
const REST = [4];
const hit = (dmg = 12) => ['hit', dmg];
const full = ['set', (p) => { p.ultCharge = 1; }];

defineCharacter('ronin', {
  order: 0, title: 'THE LAST BLADE', role: 'Duelist',
  blurb: 'A cyborg swordsman who reads the fight and answers it. Every enemy has a tell; the parry turns it into the counter.',
  color: '#ff3048', accent: '#ff8a9a', model: 'player', move: MOVE,
  pose: (r, p) => PlayerPose.apply(r, p),
  stats: { power: 3, reach: 3, defence: 3, speed: 5, mobility: 5, difficulty: 4 },
  labels: {},
  skills: [
    { name: 'Slash string', kind: 'Attack', input: 'Tap {attack}', desc: 'Up to four cuts at the crosshair, mixing lights and heavies; three lights end in a lunging finisher. Swings send bolts back.', demo: 'string' },
    { name: 'Heavy and slam', kind: 'Attack', input: 'Hold {attack}', desc: 'A rising heavy that launches; a heavy third or fourth hit slams a ring across the ground.', demo: 'heavy' },
    { name: 'Plunge', kind: 'Attack', input: 'Hold {attack} in the air', desc: 'Straight down through whatever is under you, with a shockwave that grows with the fall.', demo: 'plunge' },
    { name: 'Dash slash', kind: 'Attack', input: '{attack} during a dash', desc: 'A drawn cut along the dash; hold for a heavy one.', demo: 'dashSlash' },
    { name: 'Parry and counter', kind: 'Defence', input: '{sheathe} on the glint, hold, release', desc: 'Parry a blow as it lands (15 shield, refunded), then hold to charge an explosive counter.', demo: 'parry' },
    { name: 'Sword beam', kind: 'Utility', input: 'Tap or hold {utility}', desc: 'A quick blade of light, or held to full charge, a massive wave that cuts through everything in its path.', demo: 'beam' },
    { name: 'Tether', kind: 'Move', input: '{tether}: tap to fling, hold to zip', desc: 'A line from the free hand: zip to ledges and enemies, swing barrels, reel in grenades and kick them home.', demo: 'tether' },
    { name: 'Slide and bullet jump', kind: 'Move', input: '{crouch} at a run, then {jump}', desc: 'A long slide that a jump turns into a launch along the aim.', demo: 'bullet' },
    { name: 'Sawblade', kind: 'Ultimate', input: 'Hold {ultimate} with the meter full', desc: 'Become a spinning saw for 7 seconds: untouchable, grinding down whatever it rolls through.', demo: 'saw' },
  ],
  demos: {
    rest: REST,
    string: [['tap', 'attack'], 0.26, ['tap', 'attack'], 0.26, ['tap', 'attack'], 1.0],
    heavy: [['hold', 'attack', 0.3], 0.35, ['tap', 'attack'], 0.3, ['hold', 'attack', 0.3], 1.2],
    plunge: [['tap', 'jump'], 0.3, ['tap', 'jump'], 0.35, ['hold', 'attack', 0.35], 1.2],
    dashSlash: [['tap', 'dash'], 0.06, ['tap', 'attack'], 1.0],
    parry: [['press', 'sheathe'], 0.05, hit(), 0.95, ['release', 'sheathe'], 1.4],
    beam: { steps: [['hold', 'utility', 1.25], 1.6], view: 1.4 },
    tether: [['aim', 14, 6, 0], ['tap', 'tether'], 1.2],
    bullet: [['move', 1, 0], 0.55, ['press', 'crouch'], 0.2, ['tap', 'jump'], 0.1, ['release', 'crouch'], ['move', 0, 0], 1.3],
    saw: { steps: [full, ['hold', 'ultimate', 1.1], 2.6], view: 1.4 },
    flourish: [['tap', 'attack'], 0.3, ['tap', 'attack'], 1.2],
    tapBeam: [['tap', 'utility'], 1.4],
  },
  idle: ['rest', 'flourish', 'rest', 'tapBeam'],
});

defineCharacter('aegis', {
  order: 1, title: 'THE RIVAL FRAME', role: 'Gunner',
  blurb: 'The rival\'s 2.5 m mech, turned to your side. It zones with a machine gun and a shoulder beam, or switches to its wrist blade and walls up behind a block.',
  color: AEGIS_P.glow, accent: AEGIS_P.hi, model: 'aegis', move: AEGIS_MOVE,
  pose: (r, p) => AegisPose.apply(r, p),
  // it burns cyan, apart from the rival's blue
  rig(r) { const B = r.bladeMats; B.glow.color.set(AEGIS_P.glow); B.halo.color.set(AEGIS_P.glow); B.core.color.set('#eafcff'); },
  stats: { power: 3, reach: 5, defence: 3, speed: 4, mobility: 4, difficulty: 3 },
  labels: { sheathe: 'BEAM', utility: 'MODE' },
  skills: [
    { name: 'Weapon modes', kind: 'Utility', input: 'Hold {utility} 1 s', desc: 'Switch between gunner and melee. Into melee, the blade tears out of the forearm housing in a blast of light.', demo: 'swap' },
    { name: 'Machine gun', kind: 'Attack', input: 'Gunner: hold {attack}', desc: 'Single-target rounds, 13 a second from a 40-round magazine, with a little aim assist.', demo: 'gun' },
    { name: 'Shoulder beam', kind: 'Attack', input: 'Gunner: hold {sheathe}', desc: 'Pierces everything on its line and burns bolts out of the air, draining shield while held. You stand, or hover.', demo: 'beam' },
    { name: 'Blade string', kind: 'Attack', input: 'Melee: tap {attack}', desc: 'Two lunging swipes, then a thrust that drives through.', demo: 'blade' },
    { name: 'Cleave', kind: 'Attack', input: 'Melee: hold {attack}', desc: 'Overhead, throwing a ring across the ground.', demo: 'cleave' },
    { name: 'Block and pulse burst', kind: 'Defence', input: 'Melee: {sheathe}, hold, release', desc: 'Block on the raised blade, then draw the arm back to drive a focused burst out of it.', demo: 'block' },
    { name: 'Jet hover', kind: 'Move', input: 'Hold {jump} in the air', desc: 'The jets hold it near the top of a jump for up to 2.6 s each airtime.', demo: 'hover' },
    { name: 'Orbital strike', kind: 'Ultimate', input: 'Hold {ultimate}, then {ultimate} or {attack}', desc: 'Aim a probe in slow motion; it lands, pulses under a siren, and the ground erupts in a column of light.', demo: 'strike' },
  ],
  demos: {
    rest: REST,
    swap: [['set', (p) => { p.mode = 'gun'; }], ['hold', 'utility', 1.15], 1.6],
    gun: [['set', (p) => { p.mode = 'gun'; }], ['hold', 'attack', 1.2], 0.8],
    beam: { steps: [['set', (p) => { p.mode = 'gun'; }], ['hold', 'sheathe', 1.5], 1.0], view: 1.3 },
    blade: [['set', (p) => { p.mode = 'blade'; p.bladeOut = 1; }], 0.2, ['tap', 'attack'], 0.32, ['tap', 'attack'], 0.32, ['tap', 'attack'], 1.0],
    cleave: [['set', (p) => { p.mode = 'blade'; p.bladeOut = 1; }], 0.2, ['hold', 'attack', 0.3], 1.3],
    block: [['set', (p) => { p.mode = 'blade'; p.bladeOut = 1; }], 0.25, ['press', 'sheathe'], 0.05, hit(), 0.6, ['release', 'sheathe'], 1.4],
    hover: [['hold', 'jump', 2.4], 1.0],
    strike: { steps: [full, ['aim', 16, 0, 0], ['hold', 'ultimate', 0.6], 0.5, ['tap', 'attack'], 4.6], view: 1.7 },
    idleHover: [['hold', 'jump', 1.6], 0.8],
    idleGun: [['set', (p) => { p.mode = 'gun'; }], ['aim', 20, 5, 0], ['hold', 'attack', 0.6], 1.0],
  },
  idle: ['rest', 'idleHover', 'rest', 'idleGun'],
});

defineCharacter('krag', {
  order: 2, title: 'THE MOLTEN FIST', role: 'Brawler',
  blurb: 'The Foundry\'s brawler: 2.9 m of stone over molten cores. Every blow it lands stokes its heat, and at full heat everything it does burns.',
  color: '#ff7a2a', accent: '#ffd070', model: 'krag', move: KRAG_PMOVE,
  pose: (r, p) => KragPose.apply(r, p),
  stats: { power: 5, reach: 2, defence: 5, speed: 3, mobility: 3, difficulty: 2 },
  labels: { sheathe: 'GUARD', utility: 'LEAP' },
  // warm on the stage, and it doesn't cool there
  prep(p) { p.heat = 40; p.restT = -1e9; },
  skills: [
    { name: 'Brawler string', kind: 'Attack', input: 'Tap {attack}', desc: 'Jab, cross, hook, then a haymaker. Its fists swat bolts back.', demo: 'string' },
    { name: 'Uppercut, backfist, hammer', kind: 'Attack', input: 'Hold {attack}', desc: 'An uppercut that launches, a spinning backfist mid-string, and a hammer that ends it with a quake. Heavies carry on through hits.', demo: 'heavy' },
    { name: 'Heat', kind: 'Passive', input: 'Land blows', desc: 'Every blow feeds it and a parry most; it cools when you stop. At full heat its blows hit a quarter harder and burn, and the hammer erupts in a line of vents.', demo: 'eruption' },
    { name: 'Onyx guard', kind: 'Defence', input: 'Hold {sheathe}', desc: 'No shield cost. Blows from the front get through at 15%, wearing the arm until it breaks.', demo: 'guard' },
    { name: 'Parry and molten counter', kind: 'Defence', input: '{sheathe} on the glint, hold, release', desc: 'Raise the arm as a blow lands, then hold to drive a cone of fire out along the aim.', demo: 'parry' },
    { name: 'Detonation', kind: 'Defence', input: 'Guard at full heat', desc: 'A blow on the guard at full heat sets the arm off: everything round you is blown away, and the heat is spent.', demo: 'detonate' },
    { name: 'Shoulder charge', kind: 'Attack', input: '{attack} during a dash', desc: 'Plows through what it meets and ends in an explosion; hold for a longer one.', demo: 'shoulder' },
    { name: 'Furrow and meteor', kind: 'Attack', input: '{attack} sliding · hold {attack} in the air', desc: 'The onyx fist torn through the street in a burning furrow; from the air, a meteor that raises vents on a long fall.', demo: 'meteor' },
    { name: 'Leap', kind: 'Utility', input: 'Hold {utility}, release', desc: 'A mark follows the crosshair; let go to come down on it with a blast, a shockwave and a ring of vents.', demo: 'leap' },
    { name: 'Molten Fist', kind: 'Ultimate', input: 'Hold {ultimate}, then {ultimate} or {attack}', desc: 'Draw the arm back in slow motion with the cone shown, then split the street open in a molten chasm 26 m long.', demo: 'fist' },
  ],
  demos: {
    rest: REST,
    string: [['tap', 'attack'], 0.26, ['tap', 'attack'], 0.27, ['tap', 'attack'], 0.3, ['tap', 'attack'], 1.2],
    heavy: [['hold', 'attack', 0.3], 0.3, ['hold', 'attack', 0.3], 0.35, ['hold', 'attack', 0.3], 1.4],
    eruption: { steps: [['set', (p) => { p.heat = 100; p.onCharged(); }], 0.7, ['tap', 'attack'], 0.27, ['tap', 'attack'], 0.3, ['hold', 'attack', 0.3], 2.0], view: 1.5 },
    guard: [['press', 'sheathe'], 0.4, hit(16), 0.45, hit(16), 0.45, hit(16), 0.5, ['release', 'sheathe'], 0.8],
    parry: [['press', 'sheathe'], 0.05, hit(), 0.95, ['release', 'sheathe'], 1.6],
    detonate: { steps: [['set', (p) => { p.heat = 100; p.onCharged(); }], 0.7, ['press', 'sheathe'], 0.45, hit(20), 1.4, ['release', 'sheathe'], 0.6], view: 1.4 },
    shoulder: [['tap', 'dash'], 0.06, ['tap', 'attack'], 1.2],
    meteor: [['move', 1, 0], 0.6, ['press', 'crouch'], 0.15, ['tap', 'attack'], 0.5, ['release', 'crouch'], ['move', 0, 0], 0.5, ['tap', 'jump'], 0.3, ['tap', 'jump'], 0.35, ['hold', 'attack', 0.35], 1.4],
    leap: { steps: [['aim', 14, 0, 0], ['hold', 'utility', 0.8], 2.0], view: 1.5 },
    fist: { steps: [full, ['aim', 16, 0, 0], ['hold', 'ultimate', 0.5], 0.6, ['tap', 'attack'], 3.5], view: 2.0 },
    beat: [['emote', 'beat', 1.8], 0.4],
    roar: [['set', (p) => { p.flareT = 0.6; Sound.play('kragRoar', { pm: 1.1 }, p.pos); }], ['emote', 'roar', 1.5], 0.4],
    jabs: [['tap', 'attack'], 0.26, ['tap', 'attack'], 1.2],
  },
  idle: ['rest', 'beat', 'rest', 'roar', 'rest', 'jabs'],
});
ROSTER.sort((a, b) => a.order - b.order);
