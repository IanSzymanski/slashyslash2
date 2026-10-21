# SlashySlash 3D

A third-person 3D version of [SlashySlash](https://github.com/IanSzymanski/slashyslash): a Risk of Rain 2 style orbit camera and a Half-Life 1 style low-poly look, built with Three.js. The 2D game stays in its own repo and is the main game; this repo is the 3D lane. The build plan lives in the 2D repo at [`docs/3d-plan.md`](https://github.com/IanSzymanski/slashyslash/blob/main/docs/3d-plan.md).

**Status: Phase 0 of the plan.** The page boots into a lit test room with the orbit camera, pointer-locked mouse look and a stand-in figure. No gameplay yet: the mode buttons are disabled until their phase lands.

## Running it

Open `index.html` in a desktop browser. No build step or server is needed; Three.js is vendored as a classic script so the page runs from `file://`. WebGL 2 is required.

If your browser blocks local files, serve the folder instead:

```sh
npx serve .
```

**Test room.** Click Test Room to lock the mouse, then move it to orbit the camera. `Esc` releases the mouse and pauses (browsers keep `Esc` to themselves while the mouse is locked, so losing the lock is what pauses). Browsers refuse to re-lock for about a second after `Esc`; if Resume doesn't take, click it again. Clicking the scene beside the pause menu also resumes. Camera distance, sensitivity and invert Y are under **Settings → Camera**.

## Tools

```sh
npm install                      # pinned three, esbuild and playwright; only the tools need them
node tools/build.js              # one self-contained file: dist/slashyslash-3d.html
node tools/smoke-test.js 60      # headless run with random input and mouse look; add --dist to also test the build
node tools/sync-2d.js            # what the 2D game changed since SYNCED_FROM, mapped to 3D files
node tools/vendor-three.js       # rebuild vendor/three.js after adding a class to its list
```

The smoke test uses Chromium's SwiftShader for WebGL, so it runs without a GPU. It fails on any page error, a camera inside a box or under the floor, a pitch past ±80°, a player outside the arena, saved data outside the `slashyslash3d.*` keys, or a refused pointer lock that doesn't leave the run paused with a hint.

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
| `js/util.js` | Math, the 3x5 bitmap font, plus vec3 helpers, `to3()` pixel conversion and ray-vs-box | Copied |
| `js/settings.js` | Defaults, presets, persistence, settings schema; 3D keys, WASD bindings, camera settings | Copied |
| `js/input.js` | Keyboard and mouse, rebindable actions, pointer lock and mouse-look deltas | Copied |
| `js/audio.js` | Procedural sound and music; `Sound.play(name, params, at)` places a sound in the world | Copied |
| `js/fx.js` | Screen flash for now; 3D effects arrive in Phase 2 | Partly copied |
| `js/world.js` | Box-list arena: raycasts and collision queries, the `Arena` interface the Director spawns through, the test room | New |
| `js/gfx.js` | WebGL renderer, procedural textures, merged level meshes, the fixed light pool, fog | New |
| `js/camera.js` | Orbit camera: mouse look, ray pull-in with ease-out, rotational shake, audio listener | New |
| `js/player.js` | Stand-in figure until Phase 1's controller and rig | |
| `js/upgrades.js` | Endless upgrades and wave modifiers | Copied |
| `js/waves.js` | Wave director, spawning through `Arena` | Copied |
| `js/render.js` | Frame composition: the 3D scene, then the 480×270 pixel HUD canvas on top | New (2D HUD copied in Phase 1) |
| `js/ui.js` | Menus, results, settings panel; locks the pointer when a run starts or resumes | Copied |
| `js/core.js` | Game state, fixed 120 Hz step, style, slow motion, hitstop, bullet time, cutscene state | Copied from 2D `main.js` |
| `js/main.js` | Boot and the frame loop; mouse look is applied per rendered frame in real time | New |

Two Three.js rules from the plan apply from the start: the light count never changes (a fixed pool of 8, unused ones at zero intensity), so shaders never recompile mid-fight; and level boxes merge into one mesh per texture, so the test room is about 20 draw calls.

## Differences from the plan

- **Two repos instead of a `3d/` directory.** Paths the plan writes as `3d/...` are at this repo's root. The sync diff runs through the `2d` remote instead of within one repo.
- **Crouch defaults to `C` only, not `C`/`Ctrl`.** Holding Ctrl to crouch while pressing W to move forward is Ctrl+W, which closes the browser tab, and pages can't block it. Ctrl can still be bound in the second slot.
