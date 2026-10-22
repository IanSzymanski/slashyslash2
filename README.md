# SlashySlash 3D

A third-person 3D version of [SlashySlash](https://github.com/IanSzymanski/slashyslash): a Risk of Rain 2 style orbit camera and a Half-Life 1 style low-poly look, built with Three.js. The 2D game stays in its own repo and is the main game; this repo is the 3D lane. The build plan lives in the 2D repo at [`docs/3d-plan.md`](https://github.com/IanSzymanski/slashyslash/blob/main/docs/3d-plan.md).

**Status: Phases 1 to 4 of the plan are built.** Every mode plays in the crossroads, a 70 x 70 m arena built for the orbit camera, with baked light that flickers, rain and ash, a Blackout twist and a Retro look. The 2D street, converted to 3D in Phase 1, is still there as a free roam. You have the player's full move set: strings, slide attacks, plunge, dash slash, parry and counter, the tether (fling, zip, barrel throws, grenade kicks), bullet jump, wall kick and Overload. All eight 2D enemy types are in, each with its tells and its answer, and they follow you across the roofs, climbing fire escapes and dropping off ledges. The Wave Demo and Endless Survival play as in 2D, with endless upgrades and wave twists. The player is the armoured swordsman from the concept sheets, with poses ported from the 2D game and a cloth scarf. Phase 5, the rival AEGIS-07, is next.

## Running it

Open `index.html` in a desktop browser. No build step or server is needed; Three.js is vendored as a classic script so the page runs from `file://`. WebGL 2 is required.

If your browser blocks local files, serve the folder instead:

```sh
npx serve .
```

**The crossroads.** Four streets 18 m wide meet at a plaza raised a kerb's height. A block of four buildings fills each corner, split by 6 m alleys, with walkable roofs from 6 to 18 m. An overpass crosses the east street at 7 m, girders cross the other three, and fire escapes climb every building taller than an enemy's jump, so every roof is a route for you and for them. Container barricades close the street ends against a ring of facades too tall to climb. Lamps light the plaza and streets, neon signs face the plaza, and barrel fires burn in the alleys.

**Modes.** *Wave Demo* is the 2D demo's six waves, each built around one problem a move solves (shields, low armour, grenades, snipers on high ground); in 2D a seventh wave brings the rival, and it joins here in Phase 5. *Endless Survival* grows waves from a budget, adds a type every wave or two (all eight by wave 6) and a brute wave every fifth. After waves 2, 5, 8 and so on you pick one of three upgrades, and from wave 4 a wave can carry a twist: Elites (gilded, tougher, worth double), Glints Only (the threat ring shows glints and nothing else), Low Gravity, or Blackout (the street lamps go out for the wave; fires and neon still burn, and you carry a faint light). The rival waves every eighth wave wait for Phase 5. *Free Roam* is the crossroads with no enemies; *The 2D Street* is a free roam on the converted 2D level. Each arena has its red barrels. Rival Fight, Melee Duel and Training are disabled until their phase lands.

**The mouse.** Starting a mode locks the mouse; moving it turns the camera. `Esc` releases it and pauses (browsers keep `Esc` to themselves while the mouse is locked, so losing the lock is what pauses). Browsers refuse to re-lock for about a second after `Esc`; if Resume doesn't take, click it again. Clicking the scene beside the pause menu also resumes. Where the browser offers it (Chrome on Windows and macOS), the lock uses raw mouse input, so your OS pointer speed and acceleration don't apply; tune Sensitivity in Settings instead.

### Controls built so far

| Action | Default |
| --- | --- |
| Look | Mouse |
| Move (relative to the camera); keep running and it builds to a sprint | `W` `A` `S` `D` |
| Jump, double jump (tap for a short hop) | `Space` |
| Crouch; slide when running | `C` |
| Bullet jump toward the crosshair | `Space` while crouching or sliding |
| Wall slide; wall kick | Push into a wall while falling; `Space` beside any wall |
| Climb a ledge | Push into it near the top of a jump |
| Vault over cars and anything up to chest height, without breaking stride | Run into it |
| Dash (2 charges, brief invulnerability) | `Shift` + direction, forward if none |
| Slash string toward the crosshair (L L L ends in a lunging finisher) | Tap left mouse |
| Heavy (mixes into strings: L H L, H L L H...; a heavy third or fourth hit slams a ring across the ground) | Hold left mouse |
| Slide attack: rubble (tap) or a rock eruption that launches (hold) | Left mouse while sliding |
| Plunge, with a shockwave that grows with the fall | `C` + left mouse in the air |
| Dash slash (hold for a heavy one) | Left mouse during or right after a dash |
| Parry stance (costs 15 shield, refunded on a parry; parried bolts go back) | `E` just before a hit lands |
| Counter after a parry (chain lightning, kills heal) | Release `E` |
| Tether (15 shield, refunded by a zip strike): tap to fling toward the anchor, hold to zip | Right mouse |
| Tether a barrel: hold to swing it, release to throw it at the crosshair | Right mouse on a barrel |
| Tether a grenade in flight: time slows, you reel in and kick it at the crosshair (free) | Right mouse on a grenade |
| Overload: a shock sphere that throws back everything close and burns bolts (10 s cooldown) | `F` |
| Pause | `Esc` or `P` |

**Movement** is tuned for a third-person action feel rather than the 2D game's measured pace. You get to a run (9.5 m/s) in about a tenth of a second, and keeping it up builds to a sprint (13.8 m/s) over half a second. At a sprint the body pitches well forward, the free arm pumps and the blade trails behind. Turns carve round at speed instead of cutting across, banking the body into them; a hard reversal skids first. Running into a car or anything else up to chest height vaults it in stride. Jumps reach the same heights as in 2D but hang a moment at the top and carry your speed, and a hard landing at a run rolls through. The view widens a little at a sprint and trails slightly behind (the comfort toggle in Settings turns the widening off).

Swings turn onto the nearest enemy within 30 degrees of the crosshair and close the gap to it (melee aim assist). The tether snaps to an enemy, barrel or grenade within 4 degrees of the crosshair; the crosshair turns red when it would catch something you can pay for. Swings and dash slashes send gunner bolts back toward the crosshair, and a slash lights a barrel's fuse. Not built yet: the Sawblade ultimate (Phase 6).

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

The smoke test uses Chromium's SwiftShader for WebGL, so it runs without a GPU. Its scripted checks confirm that mouse look drops a lone cursor-recentring jump but keeps a fast flick, then put enemies in front of you and confirm that a light string lands three hits, a heavy launches, aim assist turns a swing onto a target 25 degrees off, a wind-up glints, `E` on the glint parries and stuns, the counter kills, an unparried strike takes shield before health, a dash slash cuts, kills throw gibs, a wind-up behind you marks the threat ring, and a scrapper between you and the camera fades. The Phase 2 checks follow: a gunner fires and a slash returns its bolt into it; a tethered grenade slows time and the kick sends it into its thrower; a slashed barrel explodes and a towed one is thrown into a scrapper; a zip strike hits and refunds the tether; a plunge, both slide attacks and the slam's ground ring land; Overload shocks and then refuses on cooldown; bullet jump, wall slide and wall kick move you; a dash leaves afterimages; a sprint leans the body forward; running at a wrecked car vaults it without stopping. The Phase 3 checks follow: a scrapper on the street jumps up onto the roof you stand on, and one on a roof drops down to you; a drone hovers above head height and a parry on its glint knocks it out of the air; a light hurts a brute without staggering it, and its ground wave hits you standing but not jumping; a shield scrapper blocks from the front but not behind, and a heavy or a parried bash breaks its guard; a crawler shrugs off slashes until a plunge cracks it; a sniper locks its laser and fires, zips away when you get close, and can be tethered; clearing endless wave 2 offers three upgrades, Ember Wake makes a dash cut, elites wear a gold outline, and the demo's second wave brings shield scrappers. Then it plays Endless from wave 6 with random input, tether and Overload included, The Phase 4 checks follow: Free Roam loads the crossroads and the 2D Street its own arena; fires flicker and neon stutters; a Blackout wave puts the lamps out and clearing it brings them back exactly; rain and ash fall; Retro renders at 480x270. Random play runs in the crossroads and fails on any page error, a camera inside a box, a body inside a box or outside the arena, a shader compiled mid-fight, or saved data outside the `slashyslash3d.*` keys.

`feel-check.js` runs the controller in Node with no browser. It checks both arenas from their box lists (reach between tiers, streets of at least 12 m and alleys of at least 6 m with nothing standing in them, 5 m under anything you walk under, the ground in one piece for enemies, a way down from every surface, every fire escape climbable, and fast falls onto a thin slab like the plaza deck landing on top of it); in the crossroads every one of the 78 raised surfaces can be climbed to by an enemy. Current movement numbers: a run of 9.5 m/s in 0.13 s, building to a 13.8 m/s sprint (90% in 0.45 s); a stop from a sprint in 0.22 s over 1.4 m; a 90 degree turn at a sprint in 0.2 s with no speed lost; a reversal that skids for 0.2 s; jump 4.4 m (0.78 s in the air), double jump 8.2 m, dash 6.2 m, slide 13.1 m, bullet jump 12.8 m when aimed 30 degrees up, wall slide 6.4 m/s and a wall kick that gains 3.9 m; a wrecked car vaulted end-on (onto its roof) and side-on (over it) at about 11 m/s; and the highest climb between street tiers is 9.1 m against a reach of 9.6 m (double jump plus mantle). The heights are the 2D values converted at 1 m = 11 px; the ground speeds, turning, gravity and slide were retuned for 3D. It then checks the nav graph: 21,526 nodes on 38 surfaces with 346 jump and 332 drop links, the street in one piece, a way down from every surface, and enemies able to climb every fire escape tier (21 of 31 raised surfaces are climbable, up to the 20.5 m roof).

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
| `js/fx.js` | Particles, sword trails, slash lines, lightning, rings, glints drawn over walls, gibs, ground marks, afterimage requests, effect lights, floating text, screen flash | New (flash copied) |
| `js/world.js` | The crossroads and the converted street, and loading either; box collision with sub-steps and step-up; raycasts and sphere sweeps; the light bake; the nav graph over every walkable surface with jump and drop links, and the flow field toward the player; the `Arena` interface | New |
| `js/controller.js` | Run building to a sprint, carving turns and skids, jump, double jump, crouch, slide, bullet jump, wall slide and wall kick, dash, vault and mantle, shared with the rival later | New |
| `js/gfx.js` | Renderer, procedural textures (facades with lit windows, containers), the baked level mesh with its steady, fire and buzz light channels, the Blackout rebake, flicker, character materials lit from their feet with a cool rim, the bullet-time desaturation, the character noise texture, ground-mark materials, outlines, the light pool, fog | New |
| `js/camera.js` | Orbit camera: mouse look, sphere-swept collision with ease-out, the aim ray, FOV kick, rotational shake, audio listener | New |
| `js/rig.js` | Rigid skinning: parts on bones merged into one SkinnedMesh per character, with an outline and gib pieces; two-bone IK; free root chains | New |
| `js/models.js` | All eight enemy models (humanoids on one rig, the brute scaled up, the crawler and drone on their own rigs), the barrel and the player; enemy poses; `PlayerPose`, the 2D pose function's targets mapped into 3D | New |
| `js/player.js` | Strings, heavies, slide attacks, plunge, dash slash, parry and counter, the tether and grenade kick, shield and health, facing and aim assist, afterimages, the scarf's cloth chain, Ember Wake | Ported |
| `js/utilities.js` | The utility registry and Overload | Ported |
| `js/enemies.js` | The scrapper, gunner, drone and brute; ground movement along the nav graph with jumps between surfaces; attack slots with the camera rule, glints, separation, `hurtEnemy`/`killEnemy`, pickups | Ported |
| `js/specialists.js` | The shield scrapper, armoured crawler, grenadier and sniper, and the shield and armour damage hooks | Ported |
| `js/projectiles.js` | Gunner and sniper bolts, slide-attack rubble, pulse grenades, red barrels, the heavy slam's ground ring and the brute's ground wave | Ported |
| `js/upgrades.js` | Endless upgrades and wave modifiers | Copied |
| `js/waves.js` | Wave director for the demo and endless, spawning through `Arena` | Copied |
| `js/views.js` | Meshes for bolts, rubble, grenades and their blast zones, barrels, the tether line, gunner and sniper lasers, the sniper's grapple line, grenadier arcs, the brute's ground wave, spawn beams, afterimages, and the rain and ash | New |
| `js/render.js` | Frame composition: interpolation, model sync and fading, the 3D scene, then the 2D HUD, the threat ring and the grenade-kick cue | New (HUD copied) |
| `js/ui.js` | Menus, results, settings panel; locks the pointer when a run starts or resumes | Copied |
| `js/core.js` | Game state, fixed 120 Hz step, style, slow motion, hitstop, bullet time, cutscene state | Copied from 2D `main.js` |
| `js/main.js` | Boot and the frame loop; mouse look is applied per rendered frame in real time | New |

**Lighting.** The scene has no ambient light. When an arena loads, light from the street lamps, neon signs and barrel fires is baked into the vertices of every surface (cut into cells of at most 1 m, 2 m on the tall boundary walls, and only where a cell isn't buried in another box) with shadow rays against the boxes. It's baked in three channels: steady lamps, fires and buzzing lights (neon and two failing lamps). Each frame the shader scales the fire channel by a waver and the buzz channel by an occasional stutter, so flicker shows on the world without rebaking. Characters take the same split light where they stand, as Half-Life 1 did, and everything also receives the dynamic pool. Loading an arena (collision, nav graph, bake and meshes) takes about 300 ms; the Blackout rebakes only the steady channel, in about 40 ms.

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
- **Street Waves is gone.** The Phase 2 feel test mode was endless waves of three types; Endless Survival covers it.
