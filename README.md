# SlashySlash 3D

A third-person 3D version of [SlashySlash](https://github.com/IanSzymanski/slashyslash): a Risk of Rain 2 style orbit camera and a Half-Life 1 style low-poly look, built with Three.js. The 2D game stays in its own repo and is the main game; this repo is the 3D lane. The build plan lives in the 2D repo at [`docs/3d-plan.md`](https://github.com/IanSzymanski/slashyslash/blob/main/docs/3d-plan.md).

**Status: Phases 1 to 5 of the plan are built; the rival is a first pass, open to tuning.** Every mode plays in the crossroads, a 70 x 70 m arena built for the orbit camera, with baked light that flickers, rain and ash, a Blackout twist and a Retro look. The 2D street, converted to 3D in Phase 1, is still there as a free roam. You have the player's full move set: strings that follow the aim up and down, slide attacks, plunge, dash slash, parry and counter, the tether (fling, zip, barrel throws, grenade kicks, the crane), bullet jump, skid turns, side vaults, wall cling and wall kick, and Overload. Street lamps, barrels, bins and site gear collide, and lamps can be cut down. All eight 2D enemy types are in, each with its tells and its answer, and they follow you across the roofs, climbing fire escapes and dropping off ledges. The Wave Demo and Endless Survival play as in 2D, with endless upgrades and wave twists. The player is the armoured swordsman from the concept sheets, with poses ported from the 2D game and a cloth scarf. The rival AEGIS-07 is in: a 2.5 m mech from its reference sheets that boosts on back thrusters, zones you or charges you, and chains sideways dashes into its cuts, with both of its 2D phases, its cutscenes, the Rival Fight and the Melee Duel. The scroll wheel zooms the camera, all the way in to first person. Phase 6 (the Sawblade ultimate and Training) is next.

## Running it

Open `index.html` in a desktop browser. No build step or server is needed; Three.js is vendored as a classic script so the page runs from `file://`. WebGL 2 is required.

If your browser blocks local files, serve the folder instead:

```sh
npx serve .
```

**The crossroads.** Four streets 18 m wide meet at a plaza raised a kerb's height. A block of four buildings fills three of the corners, split by 6 m alleys, with walkable roofs from 7 to 18 m. The south-east corner is a construction site behind plywood hoarding (three gates): a three-storey steel frame, scaffolding that carries the overpass on into the site, an excavator, a dirt pile, stacks of beams, pipes, bricks and timber, a mixer, site offices, port-a-potties and two floodlight towers. A tower crane stands by the plaza corner with its jib 25 m up over the east street and a bundle of beams hanging from its hook at 10 m; the tether reaches it from twice as far as anything else. An overpass crosses the east street at 7 m, girders cross the other three, and fire escapes climb every building taller than an enemy's jump, so every roof is a route for you and for them. Container barricades close the street ends against a ring of facades too tall to climb. Lamps light the plaza and streets, neon signs face the plaza, and barrel fires burn in the alleys.

**Modes.** *Wave Demo* is the 2D demo's six waves, each built around one problem a move solves (shields, low armour, grenades, snipers on high ground), and a seventh that brings the rival. *Endless Survival* grows waves from a budget, adds a type every wave or two (all eight by wave 6) and a brute wave every fifth. After waves 2, 5, 8 and so on you pick one of three upgrades, and from wave 4 a wave can carry a twist: Elites (gilded, tougher, worth double), Glints Only (the threat ring shows glints and nothing else), Low Gravity, or Blackout (the street lamps go out for the wave; fires and neon still burn, and you carry a faint light). Every eighth wave is the rival, tougher each time (a toggle in Settings turns it off). *Rival Fight* is AEGIS-07 alone; *Melee Duel* skips its shielded first phase and fights its blade phase at full health. *Free Roam* is the crossroads with no enemies; *The 2D Street* is a free roam on the converted 2D level. Each arena has its red barrels. Training is disabled until Phase 6.

**The mouse.** Starting a mode locks the mouse; moving it turns the camera. `Esc` releases it and pauses (browsers keep `Esc` to themselves while the mouse is locked, so losing the lock is what pauses). Browsers refuse to re-lock for about a second after `Esc`; if Resume doesn't take, click it again. Clicking the scene beside the pause menu also resumes. Where the browser offers it (Chrome on Windows and macOS), the lock uses raw mouse input, so your OS pointer speed and acceleration don't apply; tune Sensitivity in Settings instead.

### Controls built so far

| Action | Default |
| --- | --- |
| Look | Mouse |
| Zoom the camera in and out; all the way in is first person, where `W` `A` `S` `D` follow the view and the body turns with it | Mouse wheel |
| Move (relative to the camera); keep running and it builds to a sprint | `W` `A` `S` `D` |
| Jump, double jump (tap for a short hop) | `Space` |
| Crouch; slide when running | `C` |
| Bullet jump toward the crosshair | `Space` while crouching or sliding |
| Skid turn: a hand dug into the street, then a push off the other way | Reverse at a sprint (`S` from `W`, `A`+`S` from `W`+`D`...) |
| Wall cling: a hand dug in for a second, then a slide that builds, for as long as a movement key is held; wall kick from it | Jump into a tall wall; `Space` to kick off; let go of the movement keys (or `C`) to drop |
| Climb a ledge | Push into it near the top of a jump |
| Vault over cars and anything up to chest height, without breaking stride | Run into it |
| Dash (2 charges, brief invulnerability) | `Shift` + direction, forward if none |
| Slash string toward the crosshair, tipped up or down to follow it (L L L ends in a lunging finisher) | Tap left mouse |
| Heavy on the ground (mixes into strings: L H L, H L L H...; a heavy third or fourth hit slams a ring across the ground) | Hold left mouse |
| Slide attack: rubble (tap) or a rock eruption that launches (hold) | Left mouse while sliding |
| Plunge, with a shockwave that grows with the fall | Hold left mouse in the air |
| Dash slash (hold for a heavy one) | Left mouse during or right after a dash |
| Parry stance (costs 15 shield, refunded on a parry; parried bolts go back) | `E` just before a hit lands |
| Counter after a parry (chain lightning, kills heal) | Release `E` |
| Tether (15 shield, refunded by a zip strike): tap to fling toward the anchor, hold to zip | Right mouse |
| Tether the crane: tap to be flung up onto the jib, hold to be hauled onto it (or onto the hanging beams) | Right mouse at the jib or the hook's load |
| Tether a barrel: hold to swing it, release to throw it at the crosshair | Right mouse on a barrel |
| Tether a grenade in flight: time slows, you reel in and kick it at the crosshair (free) | Right mouse on a grenade |
| Overload: a shock sphere that throws back everything close and burns bolts (10 s cooldown) | `F` |
| Pause | `Esc` or `P` |
| Skip a cutscene you've seen this session | Hold `E` |

**Movement** is tuned for a third-person action feel rather than the 2D game's measured pace. You get to a run (9.5 m/s) in about a tenth of a second, and keeping it up builds to a sprint (13.8 m/s) over half a second. At a sprint the body pitches well forward, the free arm pumps and the blade trails behind. Turns carve round at speed instead of cutting across, banking the body into them. A hard reversal at speed is a skid turn: the body spins to face the new way and drops low, leaning hard onto the free hand dug into the street; sparks stream off the hand and it and the trailing boot carve marks that glow, cool and fade; when the slide is spent you push off the hand at a run. Running into a car or anything else up to chest height vaults it in stride: a hop that clears the top, the free hand planted on it and the body rolled onto its side with the knees swung over. Jumping into a tall wall clings to it: the left hand digs in above the shoulder and holds for a second, then the slide starts slowly and builds, the hand scoring a glowing groove down the wall. Wall kicks come from a cling. Jumps reach the same heights as in 2D but hang a moment at the top and carry your speed, and a hard landing at a run rolls through. The view widens a little at a sprint and trails slightly behind (the comfort toggle in Settings turns the widening off).

Swings turn onto the nearest enemy within 30 degrees of the crosshair and close the gap to it (melee aim assist), above or below you as well as level. Without a target a swing tips up or down with the crosshair (a little dead zone keeps ordinary play level); the body pitches with it in the air and bends at the waist on the ground, using the same swing animations, so you can cut a drone overhead or something below a ledge.

**Props.** Street lamps, fire barrels, bins, hydrants, cones, red barrels and the site's gear all collide; round things are cylinders you slide round rather than stop dead on, and running into a red barrel shoves it. A slash through a lamp post, or a blast beside one, cuts it in two: its light goes out (the light bake is redone around it over a few frames), the pole stops colliding, and the top topples away from the blade or the blast, smashes into pieces on whatever it lands on and hits anything under it. A short stump stays. Lamps stand again on a new run. The tether snaps to an enemy, barrel or grenade within 4 degrees of the crosshair; the crosshair turns red when it would catch something you can pay for. Swings and dash slashes send gunner bolts back toward the crosshair, and a slash lights a barrel's fuse. Not built yet: the Sawblade ultimate (Phase 6).

### Enemies

Every melee attack glints about 0.28 s before it lands, wherever the enemy is, and `E` on the glint parries it. There is no text in play; each enemy's state shows on its model.

| Enemy | What it does | The answer |
| --- | --- | --- |
| Scrapper | Rushes you with a cleaver | Parry the glint, or hit first |
| Gunner | Holds 9 to 17 m away and lays a laser on you: dashed while it tracks, white once locked | Slash or parry the bolt back into it |
| Drone | Circles 5 m above you and dives in a straight line; its lens blinks red through the wind-up | Jump and slash, or parry the dive (its glint is timed to the impact, not the launch) |
| Brute | 2.8 m tall. Punches up close; from further off it raises both fists and slams a ground wave that runs out as a ring of light | Jump the wave or parry it. Heavies hit it hard but don't stagger it |
| Shield scrapper | A riot shield blocks everything within 60 degrees of where it faces, and it is slow to turn round | Get behind it (a dash past works), land a heavy, or parry its bash. The shield then hangs low for 2.6 s |
| Armoured crawler | Low, six-legged, lunges from 5 m; slashes, bolts and lightning spark off its shell | Plunge, slide attacks, rubble and explosions crack it: its seams glow orange for 4 s and everything lands |
| Grenadier | Lobs a pulse grenade on an arc you can see, its blast zone marked on the ground | Tether it in flight and kick it home |
| Sniper | Stands at the edge of a high ledge with a red laser (dashed, then flashing); get close and it zips to another perch | Break line of sight, return the bolt, or tether up to it |

Scrappers, gunners, shield scrappers, crawlers and grenadiers follow you onto roofs: they jump up to 6.4 m, so they climb the fire escapes tier by tier and reach the low roofs and balconies, and drop off ledges to come back down. Where nothing can climb to you, they gather below. Brutes stay on the ground they can step to; drones fly; snipers zip.

### AEGIS-07

The rival from the 2D game, rebuilt for open space. It is a 2.5 m mech in white and grey pixel camo with blue patches, from its reference sheets: a T-shaped visor and a square chest core, big pauldrons, a beam cannon on the left shoulder, a thruster pack with two round jets, and a long housing on the right forearm that is both its gun barrel and the emitter for its energy blade. It runs heavily, boosts on its thrusters, hovers, and leaps up to whatever roof you are on.

**Stance.** It is always either zoning or charging, shown under its health bar (`ZONING` or `CHARGING`) and in its jets, which burn brighter while it charges. Zoning, it holds a band of range and strafes round you, boosting back out if you get in its face. Charging, it closes in, boosting along open street from far off. Which one it picks depends on the phase (more zoning while shielded, more charging after the enrage) and on you: keep your distance and it comes for you; crowd it, or hurt it badly, and it backs off to zone. Its eye glints and its jets flare when it switches.

**Dash chains.** Its thruster dashes come in chains of legs, each taken relative to where you are when it starts, so it rarely comes straight at you. Charging, it zigzags in (a boost off to one side of the line to you, then the other side, then the cut), swings round your flank and comes from the side, feints in and back out before it comes, or rushes straight. Zoning, it boosts across your front and throws a blade wave from each new angle, or backs off and throws one at head height. The leg that cuts glints first, so it can be parried or dashed through; the cut passes through where you stood.

**Phase 1 (above half health).** A shield covers it. It zones with a forearm gun (eight bolts, tracking you; its aim line shows through the wind-up) and a shoulder beam it fires hovering, which sweeps after you slowly and cuts down any street lamp in its path, so break line of sight or outrun the sweep. It lobs a pulse grenade with its arc and blast zone shown, and slashes or cleaves up close; charging, it dashes in to a slash. Slash its bolts back into the shield (eight cracks break it) or tether its grenade and kick it back (that breaks it at once). Broken, it's stunned for 3 s and the shield stays down for 10 s. Damage stops at half health until the enrage: a shockwave throws you clear, it rises on its jets, its three limiters blow, its glows turn red and it slams down.

**Phase 2.** Shield and guns offline, blade only, with red lightning on its swings. It fights in combos (slash, cleave with a ground ring, rising cut, thrust, spin), dash chains and blade waves, and dive bombs: a crouch, a boost high over you, a hang while a mark on the ground tracks you and locks, then a diving cut onto the mark that throws a ring. Ground columns erupt round you for the first 12 s (never within 5.5 m of you; they reach the sky, so roofs don't help).

| Its move | The tell | The answer |
| --- | --- | --- |
| Any swing | A blade glint 0.28 s before it lands | Parry. In phase 1 it flinches; in phase 2 the blades lock and it raises a guard |
| Guard | A cyan glint from its eye and a cyan outline | Don't swing into it: it parries you and ripostes. Wait it out |
| Riposte | Gold outline and bullet time; a reticle on its eye closes, then the eye flashes | Parry on the flash to stun it (sometimes it parries that back into a guard whose next answer is the red flash) |
| Red flash | Red outline and bullet time; it tracks you until its eye flashes, then locks | No parry stops it. Dash through its body into the 90 degree wedge behind it; whiffing stuns it |
| Blade wave | A wide crescent along the ground (9 m across), or at head height from the air | Jump the low one, stay down or slide under the high one, dash through, or parry it back into it |
| Dive bomb | A pink mark under you that blinks faster, then holds white once locked | Move off the mark after it locks; the landing is its punish window |

The last hit freezes into slow motion: it staggers, kneels on its blade and falls on its face, and its husk lies in the street until the next wave.

**Cutscenes.** Its entry (a beacon erupts, it kneels inside, stands, and its title hits), the enrage and the knockout take the camera from you with letterbox bars and set shots. Hold `E` to skip one you've seen this session.

### Feel test (the rival)

Play the Rival Fight a few times, then the Melee Duel. This is the part expected to take the most tuning; notes on any of these help:

1. Its stance reads: you can tell whether it's zoning or charging from how it moves, before the label tells you.
2. Its dash chains feel like a mech manoeuvring, not a homing missile: the side legs make you track it, and the cut's glint arrives early enough to parry or dash.
3. Phase 1's answers work in 3D: slashing bolts back into the shield, tethering and kicking its grenade, getting behind cover from the beam.
4. Phase 2's tells read at camera distance and in the dark: the guard, the gold and red flashes, the dive mark, the blade waves.
5. The red flash is fair: once its eye flashes, a dash through it reaches its back in time, and walking round can't.
6. The cutscenes frame it well and don't overstay; the camera comes back facing it.

### Feel test (camera and slashes)

1. Scrolling in and out feels smooth, and first person works for running, slashing and the tether.
2. A wall cling holds as long as you hold a movement key and drops the moment you let go.
3. The lightning on your slashes adds to them without hiding the enemy.

### Feel test (movement and the site)

1. A reversal at a sprint reads as a skid on the hand (sparks, marks) and gets you going the other way no slower than before.
2. Vaults read as a hop to the side over the car, not a step up onto it.
3. A wall cling gives a moment to look round before the slide, and a kick from it goes where you expect.
4. Slashing at a drone overhead or at something below a ledge lands without fighting the camera, and level play still swings level.
5. Holding attack in the air to plunge doesn't fire by accident when you meant a tap.
6. Lamps and barrels never snag you at a run, cutting a lamp down is satisfying, and the site's routes (frame floors, scaffolding, the crane) are worth using in a fight.

### Feel test (Phase 4)

Play Endless in the crossroads to about wave 10, with a Blackout wave if one comes (Endless picks twists at random from wave 4). The Phase 3 checks still apply. Then check:

1. The camera keeps you readable everywhere: the plaza, the alleys, under the overpass, on the fire escapes and roofs.
2. Fights spread across levels: enemies climb after you, and the roofs and girders are worth using rather than a place to hide.
3. Every tell reads in the dark corners and in a Blackout, and the flicker never hides one.
4. Rain and ash add atmosphere without noise, and Retro looks like the 2D game's pixels.

### Feel test (Phase 3)

Play the Wave Demo, then Endless to about wave 10, with no text on screen. The Phase 1 and 2 checks still apply. Then check:

1. Each enemy reads at camera distance: you can tell what it's about to do from its model, glint, laser or arc, and its sound when it's behind you.
2. The answers in the table above work without fighting the camera, in particular getting behind a shield scrapper and timing a drone parry.
3. Enemies that follow you up a fire escape or onto a roof look deliberate, not stuck, and standing somewhere they can't reach is a breather rather than an exploit (gunners, grenadiers, drones and snipers still reach you).
4. Upgrade picks and wave twists read without the 2D text, and a heavy wave (brutes) feels fair.

## Tools

```sh
npm install                      # pinned three, esbuild and playwright; only the tools need them
node tools/build.js              # one self-contained file: dist/slashyslash-3d.html
node tools/smoke-test.js 60      # headless: scripted combat checks, then random play; add --dist to also test the build
node tools/feel-check.js         # movement in metres, whether every tier can be climbed, and where enemies can follow
node tools/sync-2d.js            # what the 2D game changed since SYNCED_FROM, mapped to 3D files
node tools/vendor-three.js       # rebuild vendor/three.js after adding a class to its list
```

The smoke test uses Chromium's SwiftShader for WebGL, so it runs without a GPU. Its scripted checks confirm that mouse look drops a lone cursor-recentring jump but keeps a fast flick, then put enemies in front of you and confirm that a light string lands three hits, a heavy launches, aim assist turns a swing onto a target 25 degrees off, a wind-up glints, `E` on the glint parries and stuns, the counter kills, an unparried strike takes shield before health, a dash slash cuts, kills throw gibs, a wind-up behind you marks the threat ring, and a scrapper between you and the camera fades. The Phase 2 checks follow: a gunner fires and a slash returns its bolt into it; a tethered grenade slows time and the kick sends it into its thrower; a slashed barrel explodes and a towed one is thrown into a scrapper; a zip strike hits and refunds the tether; a plunge, both slide attacks and the slam's ground ring land; Overload shocks and then refuses on cooldown; bullet jump, wall slide and wall kick move you; a dash leaves afterimages; a sprint leans the body forward; running at a wrecked car vaults it without stopping; holding attack in the air plunges and a tap with `C` held slashes; a slash aimed up reaches a drone 4 m above; a wall cling holds still, then slides scoring the wall, and a jump kicks off; a reversal at a sprint skids on the hand, leaves marks and pushes off. The Phase 3 checks follow: a scrapper on the street jumps up onto the roof you stand on, and one on a roof drops down to you; a drone hovers above head height and a parry on its glint knocks it out of the air; a light hurts a brute without staggering it, and its ground wave hits you standing but not jumping; a shield scrapper blocks from the front but not behind, and a heavy or a parried bash breaks its guard; a crawler shrugs off slashes until a plunge cracks it; a sniper locks its laser and fires, zips away when you get close, and can be tethered; clearing endless wave 2 offers three upgrades, Ember Wake makes a dash cut, elites wear a gold outline, and the demo's second wave brings shield scrappers. Then it plays Endless from wave 6 with random input, tether and Overload included, The Phase 4 checks follow: Free Roam loads the crossroads and the 2D Street its own arena; fires flicker and neon stutters; a Blackout wave puts the lamps out and clearing it brings them back exactly; rain and ash fall; running into a lamp post stops you at it; a slash cuts a lamp down (it falls, smashes, its light goes and its collider with it), a barrel blast brings another down, running into a barrel shoves it, and a new run stands every lamp up again; holding the tether on the crane hauls you onto the jib, a tap flings you onto it, and the hook's load works the same; Retro renders at 480x270. The rival checks follow: the Rival Fight opens on its entry cutscene and then it fights; the demo ends on it and it comes for endless wave 8; eight returned bolts break its shield and stun it, and a kicked-back grenade breaks it at once; damage stops at half health, where it enrages in a cutscene into phase 2 as the street erupts; in phase 2 a parried swing raises its guard, a hit into the guard draws a riposte in bullet time, and parrying that stuns it; its red flash hits you through a parry in front but whiffs on you behind it and leaves it stunned; a sword dash chain goes off to one side of the line to you, then the other, then cuts through you; zoning it backs off to range and charging it closes in; on a 6 m roof it boosts up after you; and the last hit plays the knockout and leaves its husk. Random play runs in the crossroads, in Endless and then in the Rival Fight, and fails on any page error, a camera inside a box, a body inside a box or outside the arena, a shader compiled mid-fight, or saved data outside the `slashyslash3d.*` keys.

`feel-check.js` runs the controller in Node with no browser. It checks both arenas from their box lists (reach between tiers, streets of at least 12 m and alleys of at least 6 m with nothing standing in them, 5 m under anything you walk under, the ground in one piece for enemies, a way down from every surface, every fire escape climbable, and fast falls onto a thin slab like the plaza deck landing on top of it); in the crossroads every roof, fire escape and frame floor can be climbed to by an enemy (only the crane is tether-only). Current movement numbers: a run of 9.5 m/s in 0.13 s, building to a 13.8 m/s sprint (90% in 0.45 s); a stop from a sprint in 0.22 s over 1.4 m; a 90 degree turn at a sprint in 0.2 s with no speed lost; a reversal at a sprint that skids on the hand for 0.28 s and pushes off at 8.8 m/s; jump 4.4 m (0.78 s in the air), double jump 8.2 m, dash 6.2 m, slide 13.1 m, bullet jump 12.8 m when aimed 30 degrees up, a wall cling that holds 1 s and slides at 4 m/s after another 0.8 s (6.4 m/s at most) and drops within three ticks of the movement keys being let go, and a wall kick that gains 3.9 m; a wrecked car vaulted end-on (onto its roof) and side-on (over it) at about 11 m/s; and the highest climb between street tiers is 9.1 m against a reach of 9.6 m (double jump plus mantle). The heights are the 2D values converted at 1 m = 11 px; the ground speeds, turning, gravity and slide were retuned for 3D. It then checks the nav graph: 21,526 nodes on 38 surfaces with 346 jump and 332 drop links, the street in one piece, a way down from every surface, and enemies able to climb every fire escape tier (21 of 31 raised surfaces are climbable, up to the 20.5 m roof).

## Keeping up with the 2D game

The 3D lane forks the 2D files it can reuse instead of loading them, so changes on either side never break the other. `SYNCED_FROM` holds the 2D commit the copies last caught up with.

1. `node tools/sync-2d.js` adds the 2D repo as the `2d` remote, fetches it, and lists the 2D commits and files changed since `SYNCED_FROM`. Each file points at its 3D counterpart: names match where the role matches (`js/rival.js` ports `js/rival.js`), and the 2D `main.js` maps to `core.js` plus `main.js`.
2. Port what you want by hand (`--diff` prints the full diff).
3. `node tools/sync-2d.js --mark` records the 2D commit you caught up to.

Saves are separate: `slashyslash3d.settings.v1` and `slashyslash3d.save.v1`. Both games can run from the same origin (`file://` or the same local server), so shared keys would let rebinding keys here rebind the 2D game too.

## Code layout

Plain JavaScript, loaded as classic scripts. 1 unit = 1 m, y up, x along the old 2D street, z for depth.

| File | Contents | From 2D |
| --- | --- | --- |
| `vendor/three.js` | Three.js 0.186.1, a subset bundled as the global `THREE` by `tools/vendor-three.js`. Don't edit | |
| `js/util.js` | Math, the 3x5 bitmap font, plus vec3 helpers, `to3()` pixel conversion, ray-vs-box and sphere sweeps | Copied |
| `js/settings.js` | Defaults, presets, persistence, settings schema; 3D keys, WASD bindings, camera settings | Copied |
| `js/input.js` | Keyboard and mouse, rebindable actions, pointer lock and mouse-look deltas | Copied |
| `js/audio.js` | Procedural sound and music; `Sound.play(name, params, at)` places a sound in the world | Copied |
| `js/fx.js` | Particles, sword trails (pitched with the swing), slash lines, lightning, rings, glints drawn over walls, gibs and shattered props, ground and wall marks that can grow, afterimage requests, effect lights, floating text, screen flash | New (flash copied) |
| `js/world.js` | The crossroads (with the construction site and crane) and the converted street, and loading either; box collision with sub-steps and step-up, and round colliders you slide round; raycasts and sphere sweeps; the light bake; the nav graph over every walkable surface with jump and drop links, and the flow field toward the player; the `Arena` interface | New |
| `js/controller.js` | Run building to a sprint, carving turns and skid turns, jump, double jump, crouch, slide, bullet jump, wall cling and wall kick, dash, side vault, mantle and the haul onto the crane | New |
| `js/gfx.js` | Renderer, procedural textures (facades with lit windows, containers), the baked level mesh with its steady, fire and buzz light channels, baked street furniture and cables, lamp meshes that break, the Blackout rebake and the local rebake round a cut lamp, flicker and blinking warning lights, character materials lit from their feet with a cool rim, the bullet-time desaturation, the character noise texture, ground-mark materials, outlines, the light pool, fog | New |
| `js/camera.js` | Orbit camera: mouse look, scroll zoom down to first person, sphere-swept collision with ease-out, the aim ray, FOV kick, rotational shake, cutscene shots, audio listener | New |
| `js/rig.js` | Rigid skinning: parts on bones merged into one SkinnedMesh per character, with an outline and gib pieces, and a texture per model; two-bone IK; free root chains | New |
| `js/aegis.js` | AEGIS-07's model from its reference sheets (camo texture, thruster pack, shoulder cannon, forearm housing, energy blade) and `AegisPose`, which turns its state into bone rotations with IK | New |
| `js/models.js` | All eight enemy models (humanoids on one rig, the brute scaled up, the crawler and drone on their own rigs), the barrel and the player; enemy poses; `PlayerPose`, the 2D pose function's targets mapped into 3D | New |
| `js/player.js` | Strings, heavies, slide attacks, plunge, dash slash, parry and counter, the tether and grenade kick, shield and health, facing and aim assist, afterimages, the scarf's cloth chain, Ember Wake | Ported |
| `js/utilities.js` | The utility registry and Overload | Ported |
| `js/enemies.js` | The scrapper, gunner, drone and brute; ground movement along the nav graph with jumps between surfaces; attack slots with the camera rule, glints, separation, `hurtEnemy`/`killEnemy`, pickups | Ported |
| `js/specialists.js` | The shield scrapper, armoured crawler, grenadier and sniper, and the shield and armour damage hooks | Ported |
| `js/projectiles.js` | Gunner and sniper bolts, slide-attack rubble, pulse grenades, red barrels (with their colliders), the heavy slam's ground ring and the brute's ground wave | Ported |
| `js/rival.js` | AEGIS-07: stances, dash chains, thruster dashes and leaps, phase 1's gun, beam, grenade and shield, the enrage, phase 2's combos, guards, riposte, red flash, dive bomb and blade waves, the eruptions, the entry and knockout cutscenes with their camera shots, the husk | Reimplemented |
| `js/props.js` | Street lamps coming down: the cut, the topple, the smash, the light going out | New |
| `js/upgrades.js` | Endless upgrades and wave modifiers | Copied |
| `js/waves.js` | Wave director for the demo and endless, spawning through `Arena` | Copied |
| `js/views.js` | Meshes for bolts, rubble, grenades and their blast zones, barrels, the tether line, gunner and sniper lasers, the sniper's grapple line, grenadier arcs, the brute's ground wave, spawn beams, afterimages, and the rain and ash | New |
| `js/rivalviews.js` | The rival's shield bubble and cracks, jet flames, the beam and its charge, the gun's aim line, the grenade charging and its arc, the dive mark, the entry beacon, its afterimages, the blade-wave crescents and eruption columns, and its lights | New |
| `js/render.js` | Frame composition: interpolation, model sync and fading, the 3D scene, then the 2D HUD, the threat ring, the grenade-kick cue, the rival's health bar and parry cue, and the cutscene bars and title cards | New (HUD copied) |
| `js/ui.js` | Menus, results, settings panel; locks the pointer when a run starts or resumes | Copied |
| `js/core.js` | Game state, fixed 120 Hz step, style, slow motion, hitstop, bullet time, cutscene state | Copied from 2D `main.js` |
| `js/main.js` | Boot and the frame loop; mouse look is applied per rendered frame in real time | New |

**Lighting.** The scene has no ambient light. When an arena loads, light from the street lamps, neon signs and barrel fires is baked into the vertices of every surface (cut into cells of at most 1 m, 2 m on the tall boundary walls, and only where a cell isn't buried in another box) with shadow rays against the boxes. It's baked in three channels: steady lamps, fires and buzzing lights (neon and two failing lamps). Each frame the shader scales the fire channel by a waver and the buzz channel by an occasional stutter, so flicker shows on the world without rebaking. Characters take the same split light where they stand, as Half-Life 1 did, and everything also receives the dynamic pool. Loading an arena (collision, nav graph, bake and meshes) takes about 300 ms; the Blackout rebakes only the steady channel, in about 40 ms. A lamp going out rebakes just the vertices in its reach, 1,200 a frame.

Two Three.js rules from the plan apply: the light count never changes (a fixed pool of 8 for effects, unused ones at zero intensity), so shaders never recompile when effects come and go, and every material is compiled while the page loads (the smoke test fails if a shader compiles mid-fight); and each character is one draw call, so a fight with seven scrappers is about 30 draw calls before gibs.

## Differences from the plan

- **Two repos instead of a `3d/` directory.** Paths the plan writes as `3d/...` are at this repo's root. The sync diff runs through the `2d` remote instead of within one repo.
- **Movement is retuned for 3D**, as the plan said it would be after the feel test, toward Warframe's flow more than the 2D game's measured pace. Ground speed builds from a run to a sprint; turns carve the velocity round (7.5 rad/s at a sprint, 22 when slow) instead of accelerating straight at the new direction; reversals skid; stops take 0.2 s instead of 0.09. The 1 m step-up became 0.45 m, and anything up to 1.95 m is vaulted at speed, which replaces the instant pop onto car bodies. Gravity went from 87 to 70 m/s² with less pull near the top of a held jump; jump speeds were rescaled so every height is unchanged, so every climb in the level still works. The slide starts closer to your speed (x1.2 rather than a jump to 23 m/s) and lasts longer. Combat launches were left alone and hang a little longer.
- **The sprint pose** pitches the torso up to about 45 degrees, trails the blade behind with the arm straight and pumps the free arm; the whole body banks into turns from the sideways acceleration. Movement poses crossfade over 0.12 s; combat poses keep the 2D timing exactly.
- **Crouch defaults to `C` only, not `C`/`Ctrl`.** Holding Ctrl to crouch while pressing W to move forward is Ctrl+W, which closes the browser tab, and pages can't block it. Ctrl can still be bound in the second slot.
- **The player model** follows the concept sheets loosely: charcoal armour with a voxel noise texture, a red right arm, a glowing visor slit, silver fins on the helmet, gold fittings, small red running lights, a red scarf fraying to black, and a katana whose curved blade glows. It is boxes and hexagonal prisms on bones, like the scrapper, so it stays one draw call and breaks into gibs.
- **Poses come from the 2D game.** `PlayerPose` runs the 2D pose function's logic (feet and hand targets on the side plane, lean, flips) and maps the targets into 3D with two-bone IK. Swings point the blade along the same 3D arc the trail is drawn on. After 2.5 s at rest the blade goes back in its sheath and the left hand rests on the hilt, as on the concept sheet.
- **Characters get a cool rim light** (not in the plan). The dark armour disappeared against the night street without it.
- **Pulled forward from Phase 3: the gunner and the grenadier**, because Phase 2's bolt returns and grenade kicks need something to answer. Each has its 2D tell in 3D: the gunner's laser (dashed while it tracks, solid white once locked, ending on you) and the grenadier's arc with its blast zone drawn on the ground, which stays under the grenade while it flies.
- **Bullet time** desaturates lit surfaces in their shader instead of a separate screen pass; glowing parts and every effect stay bright, which is what the 2D emissive layer did.
- **Ground marks start hot.** Gouges, cracks and scorches glow orange and cool to pale scars lit by the street; dark marks on the dark asphalt were invisible.
- **Barrels sit on the 2D barrel spots**: five on the street, one on the overpass, one on a roof.
- **Pulled forward from Phase 3:** the camera rule for attack slots (an attacker more than 75 degrees off the view winds up 1.3x longer), glints drawn over walls at a minimum size, threat ring markers for wind-ups, glints and the direction a hit came from, pickups and damage numbers. Feel-test item 2 needs them.
- **The street's sides.** The 2D buildings become solid blocks behind the street with walkable roofs, and a row of facades too tall to climb closes the front, so the street is a 14 m canyon. Platforms are solid slabs you mantle onto rather than one-way ledges.
- **Navigation is one graph, not a grid per layer.** Every box top where a body fits gets a node every 0.5 m. Nodes link to neighbours within a 1 m step; surface edges link to surfaces up to 6.4 m above (a jump, stepping out from under an overhang first when a platform is stacked overhead, as on the fire escapes) and to whatever lies below (a drop). The flow field is a Dijkstra search back from the player, re-solved at most ten times a second and only within about 60 m of travel. Nodes on lower surfaces near the player are seeded at a cost, so enemies that can't climb to you wait below rather than wandering. The graph takes about 100 ms to build at load and a re-solve about 2 ms.
- **Enemy jumps are stronger than in 2D.** A 2D scrapper's jump tops out just short of the first tier of platforms, so in 2D melee enemies stay on the street. Here they jump up to 6.4 m, so a roof isn't a safe spot from melee unless it's high. Brutes are the exception and stay on the ground.
- **The drone's glint is timed to its impact.** In 2D the drone glints before its dive starts, and the dive's flight then puts the hit outside a parry made on the glint. Here the glint comes 0.28 s before the dive reaches you, as every other glint does.
- **Sniper perches are at ledge edges**, the middle of each side of a qualifying ledge, since a sniper in the middle of a 3 m balcony can't see past its own floor. A sniper rises off its ledge, zips along a straight line its whole body clears, and drops onto the new perch.
- **Glints Only** hides the threat ring's position and wind-up markers (the 3D ring stands in for the 2D `!` markers), keeping the glints and hit directions.
- **Spawn beams.** An arriving enemy shows as a narrowing column of light for 0.75 s, as the 2D spawn beam did.
- **The boundary walls continue upward as invisible collision**, so a zip from the highest roofs can't land on top of one and leave the arena.
- **The crossroads follows the plan's layout** with a few specifics: streets 18 m wide (the rule is 12), alleys exactly 6 m, the corner blocks set back so the plaza is 20 m square and raised 15 cm. Fire escapes have tiers 5.4 m apart from 5.5 m up, so there are 5 m between them and an enemy's 6.4 m jump reaches each. Container barricades (cars and containers are the only things at ground level you can get behind, keeping the plan's no-cover rule) close the street ends; the boundary is a ring of 26 m facades with invisible collision above.
- **The 2D street stays** as a free roam and as the fixture the movement checks were written against.
- **Retro is a toggle** in Visuals rather than a preset that changes other settings.
- **No glow pass.** Glowing parts are fullbright and effects additive, which covers what the 2D glow did; a bloom pass would mean vendoring Three's post-processing.
- **Not in the plan: the construction site and crane.** One corner block of the crossroads became a construction site with a tower crane whose jib and hanging load are tether points; the tether reaches them from 42 m (21 m otherwise) and snaps to them a little more readily. A tap flings you on an arc that tops out over the point and drops you onto it; a hold hauls you out round the beam's side and onto its top.
- **Not in the plan: skid turns, side vaults, wall clings, aimed swings, hold-to-plunge and breakable lamps**, asked for after Phase 4. A plunge is now a held attack in the air rather than `C` plus attack, so there's no air heavy; air strings are lights.
- **AEGIS-07 is a mech, not the player's rig.** The plan had the rival on the player's controller and rig, as in 2D. Its reference sheets show a 2.5 m mech with a thruster pack, a shoulder cannon and a forearm blade, so it has its own model and poses, and it moves by running, thruster dashes, hovering and leaps instead of the player's double jump, wall jump and tether zip. Its visor beam became the shoulder cannon's beam.
- **Not in the plan: stances and dash chains.** Zoning against charging, and dashes taken as chains of legs relative to the player (side to side, round the flank, a feint, then the cut), were asked for with the rival.
- **The plan's 3D rules for the rival's line-bound moves are in:** the red flash tracks until its eye flashes, then everything but a 90 degree wedge behind it is hit (out to 20 m, and its body blocks walking through); blade waves are 9 m wide; eruptions never open within 5.5 m of you and up to four stand at once; the cleave and the dive landing throw rings.
- **The rival's health bar is at the bottom of the screen**, under the action, rather than at the top where the wave label sits.
- **Not in the plan: first person and lightning on slashes**, asked for with the rival. The scroll wheel sets the camera distance, saved as the Camera Distance setting; at 0 the view is from the eyes, the body turns with the view and the head is hidden. Sword trails carry forked lightning strands, and the drawn slash throws forked bolts along its line.
- **Street Waves is gone.** The Phase 2 feel test mode was endless waves of three types; Endless Survival covers it.
