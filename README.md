# SlashySlash 3D

A third-person 3D version of [SlashySlash](https://github.com/IanSzymanski/slashyslash): a Risk of Rain 2 style orbit camera and a Half-Life 1 style low-poly look, built with Three.js. The 2D game stays in its own repo and is the main game; this repo is the 3D lane. The build plan lives in the 2D repo at [`docs/3d-plan.md`](https://github.com/IanSzymanski/slashyslash/blob/main/docs/3d-plan.md).

**Status: Phase 1 of the plan is built.** The 2D street is converted to 3D and you can fight endless waves of scrappers on it with the orbit camera, the full movement set and the melee core: light and heavy strings, dash slash, parry and counter. The player is the armoured swordsman from the concept sheets, with poses ported from the 2D game and a cloth scarf. Phase 1 ends with a feel test (below) before Phase 2 starts.

## Running it

Open `index.html` in a desktop browser. No build step or server is needed; Three.js is vendored as a classic script so the page runs from `file://`. WebGL 2 is required.

If your browser blocks local files, serve the folder instead:

```sh
npx serve .
```

**Modes.** *Scrapper Waves* is the Phase 1 feel test: endless waves of scrappers that grow like endless waves do, with no upgrades or rival yet. *Free Roam* is the street with no enemies. The other modes are disabled until their phase lands.

**The mouse.** Starting a mode locks the mouse; moving it turns the camera. `Esc` releases it and pauses (browsers keep `Esc` to themselves while the mouse is locked, so losing the lock is what pauses). Browsers refuse to re-lock for about a second after `Esc`; if Resume doesn't take, click it again. Clicking the scene beside the pause menu also resumes.

### Controls built so far

| Action | Default |
| --- | --- |
| Look | Mouse |
| Move (relative to the camera) | `W` `A` `S` `D` |
| Jump, double jump (tap for a short hop) | `Space` |
| Crouch; slide when running | `C` |
| Climb a ledge | Push into it near the top of a jump |
| Walk over cars and kerbs | Just walk |
| Dash (2 charges, brief invulnerability) | `Shift` + direction, forward if none |
| Slash string toward the crosshair (L L L ends in a lunging finisher) | Tap left mouse |
| Heavy (mixes into strings: L H L, H L L H...) | Hold left mouse |
| Dash slash (hold for a heavy one) | Left mouse during or right after a dash |
| Parry stance (costs 15 shield, refunded on a parry) | `E` just before a hit lands |
| Counter after a parry (chain lightning, kills heal) | Release `E` |
| Pause | `Esc` or `P` |

Swings turn onto the nearest scrapper within 30 degrees of the crosshair and close the gap to it (melee aim assist). Not built yet: tether, plunge, slide attacks, bullet jump, wall kick, Overload, the Sawblade; they arrive in Phases 2 and 6.

### Feel test (before Phase 2)

Play Scrapper Waves for about 15 minutes with no text on screen and check:

1. Light strings land on a moving scrapper without frequent whiffs, and heavies read as committed from behind.
2. You can parry from the glint alone at the default 0.2 s window, including glints from scrappers beside or behind you (they sound from where they are and mark the threat ring).
3. Dash into dash slash into a string feels like one move.
4. The camera keeps you readable through double jumps, slides, dashes and fights against a building wall, without clipping or losing you.

If 1 or 3 fail, the plan's answer is stronger aim assist or a lock-on toggle. If 4 fails, change the arena clearances and the camera's pivot and distance first.

## Tools

```sh
npm install                      # pinned three, esbuild and playwright; only the tools need them
node tools/build.js              # one self-contained file: dist/slashyslash-3d.html
node tools/smoke-test.js 60      # headless: scripted combat checks, then random play; add --dist to also test the build
node tools/feel-check.js         # movement in metres, and whether every tier of the street can be climbed
node tools/sync-2d.js            # what the 2D game changed since SYNCED_FROM, mapped to 3D files
node tools/vendor-three.js       # rebuild vendor/three.js after adding a class to its list
```

The smoke test uses Chromium's SwiftShader for WebGL, so it runs without a GPU. Its scripted checks put scrappers in front of you and confirm that a light string lands three hits, a heavy launches, aim assist turns a swing onto a target 25 degrees off, a wind-up glints, `E` on the glint parries and stuns, the counter kills, an unparried strike takes shield before health, a dash slash cuts, kills throw gibs, a wind-up behind you marks the threat ring, and a scrapper between you and the camera fades. Then it plays Scrapper Waves with random input and fails on any page error, a camera inside a box, a body inside a box or outside the arena, or saved data outside the `slashyslash3d.*` keys.

`feel-check.js` runs the controller in Node with no browser. Current numbers: run 13.8 m/s, jump 4.4 m, double jump 8.2 m, dash 6.2 m, slide 10.9 m, and the highest climb between street tiers is 9.1 m against a reach of 9.7 m (double jump plus mantle). These are the 2D values converted at 1 m = 11 px; the plan treats them as a starting point to retune in metres after the feel test.

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
| `js/fx.js` | Particles, sword trails, slash lines, lightning, rings, glints drawn over walls, gibs, effect lights, floating text, screen flash | New (flash copied) |
| `js/world.js` | The converted street; box collision with sub-steps and step-up; raycasts and sphere sweeps; the light bake; the street flow field; the `Arena` interface | New |
| `js/controller.js` | Run, jump, double jump, crouch, slide, dash, step-up and mantle, shared with the rival later | New |
| `js/gfx.js` | Renderer, procedural textures (facades with lit windows), the baked level mesh, character materials lit from their feet with a cool rim, the character noise texture, outlines, the light pool, fog | New |
| `js/camera.js` | Orbit camera: mouse look, sphere-swept collision with ease-out, the aim ray, FOV kick, rotational shake, audio listener | New |
| `js/rig.js` | Rigid skinning: parts on bones merged into one SkinnedMesh per character, with an outline and gib pieces; two-bone IK; free root chains | New |
| `js/models.js` | The scrapper and player models; scrapper poses; `PlayerPose`, the 2D pose function's targets mapped into 3D | New |
| `js/player.js` | Strings, heavies, dash slash, parry and counter, shield and health, facing and aim assist, the scarf's cloth chain | Ported |
| `js/enemies.js` | The scrapper, attack slots with the camera rule, separation, `hurtEnemy`/`killEnemy`, pickups | Ported |
| `js/upgrades.js` | Endless upgrades and wave modifiers | Copied |
| `js/waves.js` | Wave director, spawning through `Arena`; the Scrapper Waves mode | Copied |
| `js/render.js` | Frame composition: interpolation, model sync and fading, the 3D scene, then the 2D HUD and the threat ring | New (HUD copied) |
| `js/ui.js` | Menus, results, settings panel; locks the pointer when a run starts or resumes | Copied |
| `js/core.js` | Game state, fixed 120 Hz step, style, slow motion, hitstop, bullet time, cutscene state | Copied from 2D `main.js` |
| `js/main.js` | Boot and the frame loop; mouse look is applied per rendered frame in real time | New |

**Lighting.** The scene has no ambient light. When the level loads, light from the street lamps, neon signs and barrel fires is baked into the vertices of every surface (cut into cells of at most 1 m) with shadow rays against the boxes, which takes about 50 ms. Characters take the baked light where they stand, as Half-Life 1 did, and everything also receives the dynamic pool.

Two Three.js rules from the plan apply: the light count never changes (a fixed pool of 8 for effects, unused ones at zero intensity), so shaders never recompile when effects come and go, and every material is compiled while the page loads (the smoke test fails if a shader compiles mid-fight); and each character is one draw call, so a fight with seven scrappers is about 30 draw calls before gibs.

## Differences from the plan

- **Two repos instead of a `3d/` directory.** Paths the plan writes as `3d/...` are at this repo's root. The sync diff runs through the `2d` remote instead of within one repo.
- **Crouch defaults to `C` only, not `C`/`Ctrl`.** Holding Ctrl to crouch while pressing W to move forward is Ctrl+W, which closes the browser tab, and pages can't block it. Ctrl can still be bound in the second slot.
- **The player model** follows the concept sheets loosely: charcoal armour with a voxel noise texture, a red right arm, a glowing visor slit, silver fins on the helmet, gold fittings, small red running lights, a red scarf fraying to black, and a katana whose curved blade glows. It is boxes and hexagonal prisms on bones, like the scrapper, so it stays one draw call and breaks into gibs.
- **Poses come from the 2D game.** `PlayerPose` runs the 2D pose function's logic (feet and hand targets on the side plane, lean, flips) and maps the targets into 3D with two-bone IK. Swings point the blade along the same 3D arc the trail is drawn on. After 2.5 s at rest the blade goes back in its sheath and the left hand rests on the hilt, as on the concept sheet.
- **Characters get a cool rim light** (not in the plan). The dark armour disappeared against the night street without it.
- **Pulled forward from Phase 3:** the camera rule for attack slots (an attacker more than 75 degrees off the view winds up 1.3x longer), glints drawn over walls at a minimum size, threat ring markers for wind-ups, glints and the direction a hit came from, pickups and damage numbers. Feel-test item 2 needs them.
- **The street's sides.** The 2D buildings become solid blocks behind the street with walkable roofs, and a row of facades too tall to climb closes the front, so the street is a 14 m canyon. Platforms are solid slabs you mantle onto rather than one-way ledges.
