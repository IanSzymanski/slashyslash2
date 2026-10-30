# SlashySlash 2: Three.js → Unity Migration Guide

**Repository:** [IanSzymanski/slashyslash2](https://github.com/IanSzymanski/slashyslash2)  
**Source baseline:** [`1b1aa46`](https://github.com/IanSzymanski/slashyslash2/tree/1b1aa46f3d538cf572ab7f23341a3a586224ea18) (`main`, October 29, 2026), reviewed October 30, 2026. Supersedes the revision pinned to `3e7f601`.  
**Purpose:** An implementation plan for rebuilding the 3D game in Unity with its movement, combat, content and look intact. Each system's parity is proven by a recorded trace rather than by feel, and the architecture keeps likely replacements (motor, navigation, animation, audio) behind tested seams so they can change later without reopening the port.

## Start here

Build a new Unity project and port the game's rules into plain C#. Keep the box-hull collision, movement controller, combat timing and navigation graph for the first playable version. Rebuild the engine-facing layer (rendering, input, audio playback, UI, packaging) in Unity.

The game has far more custom behavior than a basic Three.js scene. Swapping in a stock character controller, animation-event attacks and a default NavMesh at the same time would change several systems at once with no way to tell which change broke the feel. Port first, prove parity against the JavaScript reference with recorded traces, then replace individual systems behind the seams in [section 10](#10-design-for-later-replacement) when a measurement justifies it.

**First milestone:** RONIN can run, skid, jump, dash, vault, mantle, slash, parry and counter against one scrapper in Crossroads, with camera collision, hitstop, slow motion, health, shield and restart, and every `feel-check.js` movement scenario reproduces the JavaScript trace in a C# test. This slice proves the shared systems and the parity harness before the bosses arrive.

**Assumptions:** Single-player only. Desktop keyboard/mouse and touch stay supported. A desktop player is the iteration target; a Unity Web build is tested in phase 1 if browser play remains a release requirement. Multiplayer, new art direction and new mechanics are out of scope.

**Verification status:** At `1b1aa46`, `node tools/feel-check.js` exits OK and every movement number matches the previous baseline. The browser smoke suite (`node tools/smoke-test.js 30`) also exits OK: 196 scripted checks pass and seven random-play runs finish clean ([section 12](#12-reference-measurements-and-regression-cases)). No Unity project has been built. Class names, exporters, tools and folder layouts below are recommendations, not files in the repository.

### Architecture at a glance

```text
Platform (Unity)                 Simulation (plain C#, no UnityEngine)              Presentation (Unity)
Input System, touch ──edges────► SimulationHost ─► GameSession.Tick(1/120) ─events─► views, FX, audio, HUD
Persistence, Web bridge ◄─────── SaveData, SettingsSnapshot          WorldQueries ◄─reads── camera, views
```

The simulation owns all gameplay state and advances only through the fixed tick. Presentation reads that state and drains a per-tick event buffer; it never writes back. Platform turns devices and storage into plain data the simulation accepts.

### Rules the port does not break

These hold in every phase. Each one closes a specific way parity can drift without anyone noticing.

1. **One clock.** `SimulationHost` runs its own 120 Hz accumulator on unscaled time. `Time.timeScale` stays `1`; slow motion and hitstop are session state.
2. **No engine in the rules.** The simulation assembly sets `noEngineReferences: true`. It cannot see `Transform`, `Mathf`, `Vector3`, `Physics` or `Time`, so it cannot depend on them by accident.
3. **Double precision.** JavaScript numbers are 64-bit doubles. Simulation math uses `double`; storage mirrors the source's typed arrays (`Float32Array` becomes `float[]`). Presentation converts to `float` once.
4. **Events out, never calls out.** The simulation emits typed events (sound, spark, shake, light) into a per-tick buffer. It never calls a view, audio source or camera.
5. **No rendered Transform decides a hit.** Gameplay sockets (muzzles, fists, blade points) are computed on the tick from simulation state.
6. **Two random streams.** Gameplay draws and cosmetic draws come from separate seeded generators, in both the JS reference and C#.
7. **Settings are inputs.** Settings that change timing or spawns are a snapshot passed into the session and recorded with every trace.
8. **No mutable static state.** JS globals (`Game`, `Director`, `World`, `Nav`) become instances owned by `GameSession`. Unity 6.8 is planned to drop domain reloads, after which static state leaks between play sessions.
9. **One coordinate boundary.** The simulation keeps source coordinates (−Z forward, radians). The Z reflection happens once, at the presentation/editor boundary.
10. **No per-tick heap allocation.** Pools, structs and in-place list compaction. Unity's Web player collects garbage only between frames and has no incremental GC.
11. **Parity is a test.** A system is done when its trace fixtures match the JS reference within the tolerances in [section 9](#9-parity-harness), not when it feels right.

### What changed in this revision

- **Rebaselined** from `3e7f601` to `1b1aa46`. Seven commits landed in between: the Foundry (a second region with a molten river, conveyors, crucibles, ladles and portals), Endless travel between regions, and a KRAG rework (arm durability split from heat, heat bar removed, the Molten Fist's molten chasm). 22 files changed; there are now 40 game modules, not 38.
- **Fixed** the Endless boss cadence. It is no longer "every eighth wave, alternating": wave 8 is AEGIS-07 in Crossroads, then each region gets three regular waves and its own boss (KRAG on 12 in the Foundry, AEGIS-07 on 16 back in Crossroads, and so on).
- **Fixed** the tick order (it now includes `Foundry.update`) and the migration map (it was missing `camera.js`; `foundry.js` and `foundrymap.js` are new).
- **Found:** the reference's gameplay sockets (rival muzzle and lens, KRAG fist and feet) read the rendered rig in the browser and a body-frame fallback headless, so the browser build is frame-rate dependent there. The port targets the fallback.
- **Found:** about 1,400 FX, Sound, shake and light calls sit inside simulation files. Converting them to events is now an explicit phase-1 design task.
- **Found:** real-time state decides simulation outcomes (hitstop and slow motion count down in frame time; the upgrade offer draws randomness in a real-time callback), so parity fixtures drive whole frames, not bare ticks. Also, at most 6 ticks run per frame, so the 10-tick cap never binds.
- **Found:** input edges are per physical key (both Shift keys dash independently), which Unity's default action-level Button semantics do not reproduce.
- **Found:** four render behaviors Unity will not match by default: fog is `smoothstep` on view depth and blends in sRGB space, Lambert divides by π, point lights use a `1.2` decay with a windowed cutoff, and characters have inverted-hull outlines (missing from the previous revision).
- **Added** sections for the parity harness, design for later replacement, and a tick budget; the assembly rules, double-precision policy, JS-to-C# translation table, exact rotation conversions, the CoreCLR/6.8 implication, Editor-time light and nav baking, and Foundry and portal-travel regression cases.
- **Tightened** parity tolerances from "about 1 cm, within one tick" to "same tick, 1e-6 m", which double precision makes achievable.
- **Ran** the browser smoke suite, which the previous revision only read.

## 1. What is being migrated

The repository identifies the game as **SlashySlash 3D**, a separate 3D lane from the original 2D SlashySlash. It uses Three.js `0.186.1`, runs directly from `index.html` (including from `file://`), and the Node tooling builds a self-contained HTML version. The baseline has 40 game modules in `js/`. [README][readme] · [Package configuration][package] · [Build tool][build]

| Area | Existing scope to preserve |
| --- | --- |
| Playable characters | RONIN; AEGIS-07 with gunner/melee modes, hover, reload, beam, block/burst and orbital strike |
| Movement | Camera-relative movement, sprint buildup, carving turns, skid reversals, variable-height jump, double jump, crouch, slide, bullet jump, two-charge dash, vault, mantle, wall cling/kick, crane haul |
| RONIN combat | Mixed light/heavy strings, slide attacks, plunge, dash slash, parry/counter, sword beam, tether interactions, Sawblade ultimate |
| Standard enemies | Scrapper, gunner, drone, brute, shielder, crawler, grenadier, sniper |
| Bosses | Rival AEGIS-07 with two phases; KRAG with heat, a separate onyx-arm durability that can break, strings that drive through a parry, gold stoppers, a blue-flash guard and its detonation, the Molten Fist and its molten chasm, stomps, vents, charges, leaps and chain swings |
| Arenas | Crossroads, the Foundry, converted 2D Street, Training Hall |
| Foundry hazards | A molten river that burns and throws bodies back onto a bank, conveyors that carry bodies, crucibles (the barrels' equivalent), ladles that tip and pour, slag pools, portals between regions |
| Modes | Wave Demo, Endless Survival (travels Crossroads ⇄ Foundry), Rival Fight, Melee Duel, KRAG Fight (in the Foundry), Free Roam (a standing portal in each region), 2D Street free roam, Training |
| Progression | Style/combo scoring, ultimate charge, endless upgrades and modifiers, best scores/waves, boss records, tutorial completion, character selection |
| Presentation | Low-poly procedural characters with inverted-hull outlines, procedural textures, split baked lighting, emissive effects, weather and embers, first-person feedback, 480×270 HUD and optional retro scene rendering |

Treat the pinned code and its checks as authoritative when the README rounds a number. Playable AEGIS's beam charge is `0.42 s` in `AP.BEAM_CHARGE`; the README says about `0.4 s`. [Playable AEGIS][aegisplayer]

### Four decisions to make before implementation

| Decision | Recommended default | Why it matters |
| --- | --- | --- |
| Is browser play required? | Keep it unless deliberately dropped | Web affects audio, loading, persistence, mouse lock, GC and performance; test it in phase 1 |
| Must the art closely match? | Match the existing look for the first port | The art is generated by code, so extraction must be planned |
| What happens to the JS game during the port? | Freeze its gameplay through phase 2; after that, every JS gameplay change ships with a trace fixture | The JS game changed 22 files in the two days after the previous baseline. Parity cannot be proven against a reference that moves faster than the port |
| Is a native mobile build in scope? | Not for the port; keep the Platform layer able to add one | Mobile Web performance is unproven. Native iOS/Android would reuse the same Simulation and touch code if Web falls short |

## 2. Unity project setup

### Version

Use **Unity 6.3 LTS** (the newest LTS at this review, supported through December 2027) with a URP project. Record the exact Editor and package versions once the first desktop and Web builds pass. [Unity release support][u-support] · [URP introduction][u-urp]

Two upcoming releases matter. Unity 6.7 LTS, expected in late 2026, is the last release built on Mono. Unity 6.8 is planned to move the Editor and desktop player to CoreCLR and remove domain reloads; Web and mobile stay on IL2CPP. [Unity CoreCLR update, June 2026][u-coreclr] Do not wait for either. Start on 6.3; consider moving to 6.7 LTS only at a phase boundary after phase 2, with the full trace suite as the regression check. Rules 2 and 8 keep the simulation portable across the CoreCLR change: plain C#, no engine types, no static state.

Start with GameObjects and C# classes. ECS/DOTS, Addressables, a third-party character controller, Cinemachine and AI Navigation are later decisions; none is needed to prove this port.

### Unity concepts in this port

| Unity concept | Role in this port |
| --- | --- |
| Scene | An arena or test environment, plus references to its presentation objects |
| GameObject | A visible character, camera, prop, UI root or service host |
| Prefab | A reusable assembled character, prop or effect |
| MonoBehaviour | Lifecycle adapter only: input collection, simulation host, renderer, audio or UI bridge |
| Plain C# class | Movement, combat, waves, boss rules and other logic that runs without a scene |
| ScriptableObject | Editable definitions (attacks, character stats, wave lists, audio catalogs) generated from the JS export |

### Assemblies

| Assembly | References | Contains |
| --- | --- | --- |
| `SlashySlash.Simulation` | nothing (`noEngineReferences: true`) | Session, clock, world queries, motor, nav, combat, AI, waves, save/settings DTOs, event types, RNG |
| `SlashySlash.Presentation` | Simulation, UnityEngine, URP | Actor views, poses, camera rig, FX, HUD, material parameters |
| `SlashySlash.Platform` | Simulation, Input System | Input edge buffer, touch, audio backend, persistence, Web bridge |
| `SlashySlash.Bootstrap` | all runtime assemblies | Composition root: builds the session and wires views; no logic |
| `SlashySlash.Editor` | all, UnityEditor | Importers, mesh/rig/prefab generators, light and nav bake, fixture tools |
| `SlashySlash.Tests.Simulation` (Edit Mode) | Simulation | Rule tests and trace replays |
| `SlashySlash.Tests.PlayMode` | all | Host, input, view and build integration |

[Assembly definition file format][u-asmdef]

Because the simulation has no engine references, the same `.cs` files also compile into a small `dotnet test` project outside Unity (`sim-tests/`, globbing `Assets/SlashySlash/Runtime/Simulation/**/*.cs`). That gives a CI lane that runs every trace fixture in seconds, with no Unity license or Editor start. Keep simulation code to C# 9, the language level Unity 6.3 compiles, so both builds accept it.

Convert JS globals into explicit references passed down from the composition root. A dependency-injection framework is not needed at this size.

### Folder structure

```text
unity/
  Assets/SlashySlash/
    Runtime/Simulation/     # session, clock, world, motor, nav, combat, AI, waves, events, RNG
    Runtime/Presentation/   # actor views, poses, camera, HUD, effects
    Runtime/Platform/       # input edges, touch, audio backend, persistence, Web bridge
    Runtime/Bootstrap/      # composition root
    Data/Imported/          # generated from the JS export; never hand-edited
    Data/Authored/          # tuning Unity owns after a system's authority flips (section 10)
    Art/  Audio/  Prefabs/
    Scenes/                 # Bootstrap, Crossroads, Foundry, Street, Training, ParityLab
    Editor/                 # importers, generators, light and nav bake
    Tests/EditMode/  Tests/PlayMode/
    Tests/Fixtures/         # trace fixtures and golden traces, stamped with the source commit
  sim-tests/                # dotnet test project over Runtime/Simulation
  Packages/  ProjectSettings/
```

One Unity unit is one metre. The 3D movement and arena values are already in metres; the historical `1/11` pixel conversion has already happened. Do not apply it again.

One simulation owner: each view reads its entity; nothing runs combat in `Update`. Root motion stays off so animation cannot change movement distances.

## 3. System and file migration map

**Port** means rewrite the rules in C# with identical behavior. **Rebuild** means replace browser/Three.js integration with Unity integration. **Split** means the file mixes rules with presentation and needs both treatments; for those, the presentation calls become events (see [section 4](#simulation-to-presentation-events)).

| Existing source | Treatment | Unity destination / important detail |
| --- | --- | --- |
| [util.js][util] | Split | `GameMath` (JS-exact helpers, see [numeric policy](#numeric-policy)), `Mulberry32`, geometry queries; the bitmap font becomes a UI asset |
| [world.js][world] | Split | `ArenaDefinition`, `WorldQueries`, `BoxHullMotor`, `SurfaceGraph`, `ArenaLoader` (load and region travel); arena meshes, light bake and nav build move to the Editor |
| [foundrymap.js][foundrymap] | Port as data | The Foundry's `ArenaDefinition`, through the same export as the other arenas |
| [foundry.js][foundry] | Split | `FoundryHazards` (river burn and eject, conveyor carry, crucibles, ladle tip and pour, slag pools, portal and travel) and `FoundryViews` (flowing metal, pours, belts, embers) |
| [controller.js][controller] | Port | `CharacterMotor` + `MovementDefinition`; keep the shared intent interface; add moving-surface carry for conveyors |
| [camera.js][camera] | Split | `CameraRig` in presentation; `AimSolver` and camera visibility handed to the simulation as tick input |
| [core.js][core] | Port/split | `GameSession`, `SimulationClock` (hitstop, slow motion, bullet time, delayed cuts), style/scoring, run state, cutscene state; `shake` becomes an event |
| [main.js][main] | Rebuild | `SimulationHost`, frame host, pause/focus/lock policy, camera/render scheduling |
| [input.js][input], [touch.js][touch] | Rebuild | Per-code edge buffer over the Input System, pointer-lock adapter, touch overlay writing `T:<action>` codes into the same buffer |
| [settings.js][settings] | Split | Versioned settings/save DTOs, defaults, binding migration, `SettingsSnapshot` for the simulation, settings UI schema |
| [player.js][player] | Split | Shared `PlayerState`, RONIN combat/defense/tether, feedback events; `bladeAt` uses its body-frame fallback; scarf to presentation |
| [utilities.js][utilities] | Split | Utility registry and `SwordBeam` rules; beam visuals become Unity effects |
| [ultimates.js][ultimates] | Split | `SawbladeAbility` simulation; the saw mesh built inline in this file moves to a view |
| [aegisplayer.js][aegisplayer] | Port/split | Playable `AegisCombat`: mode switch, hover, rounds, beam, burst, strike targeting |
| [enemies.js][enemies] | Port/split | Base enemy logic, four basic types, attack slots, glint events, `hurtEnemy` resolver, pickups |
| [specialists.js][specialists] | Port | Shielder/crawler/grenadier/sniper policies and shield/armor hooks |
| [boss.js][boss] | Port/split | Shared boss steering, leaps, arc tests, body frame; `boneAt` replaced by simulation-owned sockets |
| [rival.js][rival] | Port/split | `RivalBrain`: phases, combos, shields, counter/riposte, cutscene state, husk; muzzle, lens and orb from the body frame |
| [kragboss.js][kragboss] | Port/split | `KragBrain`: heat, arm durability and break, strings, stoppers, guard and detonation, Molten Fist and chasm, charge, leap, stomps, vents, chain swing, cutscene state; fist and feet from the body frame |
| [projectiles.js][projectiles] | Port/split | Bolts, rubble, pulse grenades, barrels, ground waves/rings; pooled views |
| [strike.js][strike] | Port | Probe trajectory, beacon/eruption phases, damage cadence and ownership |
| [props.js][props] | Split | Lamp cut/fall/break, collision changes, light-invalidation events, view animation |
| [waves.js][waves], [upgrades.js][upgrades] | Port | `WaveDirector` with regions and portals, budgets, upgrade and modifier definitions |
| [training.js][training] | Split | Tutorial state/conditions/checkpoints, dummy, ball machine, practice controls; markers and UI to presentation |
| [rig.js][rig], [models.js][models] | Rebuild from data | Editor mesh/rig builder, rigid bone weights, outline hull, gib pieces, prefabs, procedural poses |
| [aegis.js][aegis], [krag.js][krag] | Split | Model definitions and procedural pose solvers |
| [gfx.js][gfx] | Rebuild | Custom URP shader, texture export/import, arena mesh builder, Editor light bake, runtime local rebake |
| [fx.js][fx], [fpfx.js][fpfx] | Rebuild | Effects pool, decals, trails, flashes, camera impulses, first-person overlays |
| [views.js][views], [rivalviews.js][rivalviews], [aegisviews.js][aegisviews], [kragviews.js][kragviews] | Rebuild | Consume simulation state and events to draw projectiles, hazards, tells, jets, beams, cracks, chasm and weather |
| [render.js][render] | Rebuild | Interpolation, model sync and fading, camera occlusion fading, HUD, markers, threat ring, title cards, shader prewarm |
| [audio.js][audio] | Rebuild/extract | Baked catalog + Unity playback; keep event names, loops, bus levels, intensity and slow-motion states |
| [ui.js][ui], [index.html][html], [style.css][css] | Rebuild | Menus, settings, pause, results, upgrade picker, character selection, touch layouts |
| [feel-check.js][feel], [smoke-test.js][smoke] | Translate | Become trace fixtures and Unity tests; feel-check's Node `vm` loader is the template for the trace recorder |
| [build.js][build], [vendor-three.js][vendor], [sync-2d.js][sync] | Replace/retire | Unity build profiles, Unity asset generation, deliberate upstream-change tracking |

Do not copy Three.js, its vendoring process or the HTML bundler into the Unity runtime. Keep the JavaScript version runnable as the reference application for the whole port.

## 4. Simulation clock, settings, events and input

### The clock

The game already runs a fixed-step simulation. `main.js` clamps the frame delta to `0..0.05 s`, applies mouse look once per rendered frame, and calls `Game.step`. `Game.step` advances real-time timers (cutscene, bullet time, slow motion, delayed cuts, announcements), then, outside hitstop, runs `Game.tick` at **1/120 s** and consumes input edges after each tick. Rendering interpolates previous/current actor positions. [Frame loop][main] · [Simulation][core] · [Interpolation][render]

Two consequences follow from those numbers:

- **At most 6 ticks run per frame.** The accumulator gains at most `0.05 × slowScale` per frame, and every writer keeps `slowScale ≤ 1`, so the 10-tick cap in `core.js` never binds. Keep the cap as a guard, but size the per-tick budget for 6.
- **Below 20 FPS the game slows down rather than skipping time.** That is the source's policy. Keep it, and measure how often mobile devices hit it.

`SimulationHost.Update` reads `Time.unscaledDeltaTime`, keeps its own accumulator and applies its own slow-motion scale, with `Time.timeScale` left at `1`. Menus, camera look and real-time feedback keep running while the simulation is frozen. Route every presentation timer through the intended clock; Unity animation and particles otherwise advance on their own.

```text
frameDelta = clamp(unscaledDelta, 0, 0.05)
session.realTime += frameDelta
handle pause input, focus loss and pointer-lock loss (pause after 0.35 s without the lock while playing)
apply accumulated look and zoom once, unless a cutscene blocks it

if playing:
    advance cutscene timers; a 0.5 s skip hold may end the cutscene and clear hitstop and slow motion
    advance bullet-time, slow-motion, delayed-cut and announcement timers by frameDelta
    if hitstop > 0:
        hitstop -= frameDelta                      # no simulation time accrues
    else:
        accumulator += frameDelta * slowScale
        n = 0
        while accumulator >= 1/120 and n < 10:
            session.Tick(1/120); accumulator -= 1/120; n += 1
            input.ConsumeEdges()
        if n >= 10: accumulator = 0               # unreachable while slowScale <= 1
    advance the results-screen delay

interpolate views; update camera; draw HUD
```

Keep the source's boundary behavior: a hitstop started during a tick does not stop the remaining catch-up ticks in that frame, and a frame with zero ticks keeps its input edges.

Keep `Game.tick`'s exact order. Changing it alters same-tick kills, projectile reflections, hazard contact and wave completion.

1. Advance session time and run time.
2. Rebuild dynamic barrel colliders (`World.dyn`).
3. Player.
4. Training (Training mode only).
5. Nav target update (`Nav.update`).
6. Enemies (only the cutscene owner during a cutscene).
7. Enemy separation.
8. Projectiles.
9. Hazards.
10. Props (barrels, crucibles, ladles, boss husks).
11. `Foundry.update` (river, conveyors, ladles, slag pools, portal).
12. `Props.update` (street lamps).
13. Pickups.
14. Wave director (not during a cutscene or after the player dies).
15. Simulation-time FX update.
16. Combo and style decay.
17. Remove dead enemies, projectiles, hazards, pickups and props, preserving order.

### Time domains

| Time domain | Examples | Migration rule |
| --- | --- | --- |
| Real frame time | Mouse look, camera easing, hitstop countdown, bullet-time duration, slow-motion duration, delayed cuts, cutscene framing | Continues independently of simulation speed, subject to the pause policy |
| Simulation time | Velocity, attack age, parry eligibility, cooldowns, waves, projectiles, hazards, `FX.update` | Advances only through the fixed tick |
| Presentation time | Particles, trails, shader animation, pose blending | Assigned per effect; effects the source updates in the tick must follow simulation time |
| Audio playback time | Clip playback, music scheduling, persistent loops | Controlled through the audio adapter; simulation slow motion does not by itself define audio behavior |

Not every cutscene timer is real-time: `Game.cine.t` is, but boss-owned cutscene logic also advances through simulation updates. Keep that split or reauthor and test each sequence.

### Settings that change gameplay

Some settings look like accessibility or presentation options but change simulation outcomes:

- `S.visuals.hitstop` scales every hitstop, and `0` disables it.
- `S.visuals.slowmo` off disables slow motion and bullet time.
- `S.enemies` toggles enemy types, scales wave size (`count`), applies presets, and turns Endless bosses off (`bossEndless`, which also means no portal and no region travel).

Pass a `SettingsSnapshot` into `GameSession` at run start. Apply changes made in the pause menu as a recorded event when play resumes. Store the snapshot in every trace and fixture; a fixture without it is not reproducible. [Clock][core] · [Settings][settings] · [Wave director][waves]

### Simulation to presentation events

The source calls `FX.*`, `Sound.*`, `Game.shake`, `Gfx.light` and `Fpfx.*` directly from simulation code: about 1,400 call sites, led by `kragboss.js` (323), `player.js` (274), `rival.js` (269) and `aegisplayer.js` (157). In the port each becomes an event.

```csharp
public struct SimEvent {
    public int Tick; public EventKind Kind; public EntityHandle Source;
    public Vec3d Pos; public Vec3d Dir; public int Id;   // sound name, palette or effect ID
    public float A, B, C;                                // intensity, size, count
}
```

- The buffer is append-only per tick. Presentation drains it after the step loop in emission order; the tick number lets views place the event between interpolated frames.
- Events carry everything a view needs. Views never query back into mid-tick state.
- Cosmetic randomness ("60% chance of a dust puff", spark spread) moves to the presentation side and draws from the cosmetic stream.
- Hitstop, slow motion and bullet time are not events. They change simulation timing, so they are `SimulationClock` state.
- `FX.update` runs inside the tick in the source, so slow motion slows sparks. Those views take the simulated time delta, not `Time.deltaTime`.
- Sound events use the existing sound names. Loops are start/stop events owned by an entity handle, so despawning an entity always stops its loops.

Design the event set before porting `player.js`. Retrofitting it after several thousand lines of combat code is the expensive path.

### Input edges

The source tracks physical codes (`KeyW`, `Mouse0`, and `T:attack` from touch) in three sets: `down`, `pressed` and `released`. An action is pressed if any of its bound codes is in `pressed`. Keep that model:

- **Edges are per code, not per action.** Dash is bound to both Shift keys. Pressing the second Shift while holding the first is a new dash press in the source. A Unity `Button` action merges both bindings into one actuation and does not report it. Use `PassThrough` actions (or monitor bound controls directly) and record which control changed.
- A press and a release that both happen before the next tick are both observed.
- Edges persist across rendered frames until a tick consumes them. Zero-tick frames and hitstop keep them; several ticks in one frame do not repeat a press.
- Opening pause consumes all edges. Losing focus or hiding the tab moves every held code into `released`.
- During cutscenes every action except pause reads as up (`Input.locked`). The skip hold ignores keys already held when the cutscene began.
- Touch buttons press virtual `T:<action>` codes into the same buffer, so touch and keyboard share every rule above.
- Key auto-repeat is ignored.
- Mouse look drops a lone event far larger than recent ones (Chrome reports the hidden cursor recentring as one huge move when raw input is refused). Keep the filter on Web; check whether desktop needs it.
- The wheel converts deltas to notches (`deltaY / 100`, or `/ 3` in line mode), clamped to ±3 per event.

Use the Input System in dynamic update and pass an `InputIntent` into the next tick. [Input update timing][u-input-timing]

Keep tap/hold decisions in simulation code. RONIN's heavy threshold is `0.15 s`, plunge `0.2 s`, action buffer `0.12 s` and counter charge `0.9 s`, all in simulation time, so slow motion stretches them. Unity Hold/Tap interactions use their own timing and must not replace these rules. [Player constants][player]

## 5. Movement, collision, numerics, coordinates and camera

### Keep the custom motor for the first port

`World.moveBody` uses **axis-aligned box hulls** with feet-position origins, moves X then Z then Y, subdivides displacement at `0.25 m`, and handles round props separately (treated as circles of `0.9 r`). It has custom step-up, standing, ceiling and thin-slab landing rules with `EPS = 1e-4`. `Controller` adds vaulting, mantling, sliding, clinging, skids and dashes on top. [World][world] · [Controller][controller]

Port these before considering Unity's CharacterController. A CharacterController is a capsule with different corner, step and skin-width behavior; its `Move` takes a displacement, not a velocity, and applies no gravity. It can be a later replacement behind the motor seam, gated by the same movement fixtures. [CharacterController reference][u-controller] · [Move API][u-move]

For the first port:

1. Keep boxes, cylinders and collision queries as C# data in the simulation.
2. Generate Unity meshes and optional editor/debug colliders from that same data.
3. Let only the custom motor decide gameplay movement and contacts.
4. Cosmetic Rigidbody debris is fine if it stays out of gameplay collision.

Never run one body through both the custom motor and Unity physics. If Unity colliders exist for editor queries or effects, keep them on layers no gameplay query reads.

Keep the feet origin and hull resizing checks. RONIN's `R = 0.36` is a horizontal **half-width**, not a capsule radius. Standing, crouch and slide heights are `1.82`, `1.18` and `0.91 m`. Playable AEGIS has its own table: `R = 0.48`, standing `2.4 m`, crouch `1.65 m`, slide `1.4 m`, run `9 m/s`, sprint `12.6 m/s`, dash `40 m/s` for `0.16 s`. [RONIN movement][controller] · [AEGIS movement][aegisplayer]

The Foundry adds surfaces the Crossroads did not need:

- **Conveyors** carry whatever stands on them. The motor needs a ground-velocity contribution from the surface under the hull, applied in the same phase of the tick as the source.
- **The molten river** runs 1.6 m below the floor. Falling in damages the player for `14` and an enemy for `42`, and throws the body up at `15 m/s` and out at `9 m/s` onto a bank. Enemies do not walk into it; the nav graph routes them over the three bridges. [Foundry hazards][foundry] · [Foundry layout][foundrymap]

### Numeric policy

JavaScript numbers are IEEE-754 doubles. Use `double` for all simulation math and convert to `float` only in presentation. With float32, a body near `x = 100 m` has a resolution of about `7.6e-6 m`; the motor's `1e-4` epsilon is then only about 13 representable steps, and per-tick integration drifts. Doubles remove that class of mismatch for negligible cost at this entity count.

Mirror the source's typed arrays exactly. The nav graph stores node positions in `Float32Array` and costs and links in `Int32Array`/`Uint8Array`; writes to them round or wrap. Store those as `float[]`, `int[]` and `byte[]`, and write through helpers with JS semantics.

| JavaScript | Trap in C# | Port as |
| --- | --- | --- |
| `a \|\| b` | `0`, `NaN` and `""` fall through to `b` | an explicit check per site (`a != 0 ? a : b`), never `??` |
| `Float32Array[i] = d` | rounds to float32 | `(float)d`, which rounds to nearest like `Math.fround` |
| `Int32Array[i] = d`, `x \| 0`, `x >>> 0` | ToInt32/ToUint32 wrap modulo 2³²; C# casts of out-of-range doubles do not | `JsMath.ToInt32`, `JsMath.ToUint32` helpers |
| `Math.round(x)` | `Math.Round` defaults to banker's rounding; `AwayFromZero` differs for negative halves | `Math.Floor(x + 0.5)` |
| `a / b` | integer division if both operands are `int` | keep operands `double` |
| `x % m` | same sign rules in both languages | port literally; do not swap in `Mathf.Repeat` |
| `arr.sort(cmp)` | JS sort is stable; `Array.Sort` and `List.Sort` are not | a stable sort wherever ties can occur (training perches, drone targeting) |
| `Map`, `Set`, object key order | insertion order in JS; `Dictionary`/`HashSet` order is unspecified | ordered collections wherever iteration order reaches gameplay (per-swing hit sets, entity lists) |
| `undefined`/`NaN` arithmetic | silently yields `NaN` | explicit defaults; assert no `NaN` during trace runs |
| `Math.min()` / `Math.max()` with no arguments, `Math.max(...[])` | `Infinity` / `-Infinity` | guard empty inputs explicitly |
| `arr = arr.filter(...)` each tick | allocates a new array | in-place, order-preserving `RemoveAll` |
| `Math.sin`, `cos`, `pow`, `atan2` | last-bit differences between V8 and .NET | accepted within the trace tolerance; not a reason to use `float` |
| `mulberry32` (`Math.imul`, `>>>`) | needs exact 32-bit unsigned arithmetic | port with `uint` and `unchecked` |

### Choose one coordinate boundary

The source rig faces **−Z**, with yaw and pitch in radians: `fwdX(yaw) = -sin(yaw)`, `fwdZ(yaw) = -cos(yaw)`. Unity's conventional forward is **+Z** and its Euler angles are in degrees. [Source math][util] · [Source rig][rig] · [Unity rotations][u-coordinates]

Keep source coordinates and radians inside the simulation. Convert at the presentation/editor boundary with a Z reflection `S = diag(1, 1, −1)`. Three.js is right-handed and Unity left-handed, so the reflection keeps the image unmirrored, and a reflected mesh that faced −Z now faces Unity's +Z with no extra offset.

| Value | Source → Unity presentation |
| --- | --- |
| Position or direction | `(x, y, z) → (x, y, −z)` |
| AABB limits | Unity `minZ = −source.maxZ`; Unity `maxZ = −source.minZ` |
| Quaternion | `(x, y, z, w) → (−x, −y, z, w)` (the rotation `S R S`) |
| Actor root and camera (Three order `YXZ`) | `Quaternion.Euler(−pitch°, −yaw°, roll°)`. Both engines compose these as Y·X·Z, and the reflection negates only the X and Y angles |
| Facing from yaw alone | Unity Y angle `= −yaw × Rad2Deg` |
| Part rotations (Three default order `XYZ`) | compose `Qx(−a) * Qy(−b) * Qz(c)`; `Quaternion.Euler` cannot express XYZ order |
| Camera forward | reflect the source direction, then `Quaternion.LookRotation(dir, Vector3.up)` |
| Mesh data | reflect vertices and normals, reverse triangle winding, flip tangent handedness |

Do this once per boundary. Keep world queries, nav data, attacks and source-frame math in the simulation basis. Convert editor-authored Unity positions back through the inverse before saving them as simulation data. A double conversion puts visuals and hitboxes on opposite sides of the arena.

Before mass-generating assets, check all four facings, left/right asymmetry, a pitched slash, normals, culling and a wrist blade that could look mirrored.

### Camera and aiming are part of combat

Port `camera.js` behavior before replacing it with a general camera rig. [Camera][camera] · [Frame loop][main]

- Vertical FOV `62°` (both engines use vertical FOV), near `0.05`, far `260`, no MSAA, pixel ratio `1`.
- Follow distance from settings (default `5 m`); the wheel moves `0.6 m` per notch up to `9 m`; anything closer than `1.2 m` snaps to first person at distance `0`.
- Look is `0.0022 rad` per pixel at sensitivity `1`, pitch limited to ±80°, optional invert-Y, and never multiplied by frame delta.
- The pivot sits `max(0.5, h − 0.3)` above the feet and is swept to its target so it cannot enter geometry.
- Collision is a ray against boxes padded by `0.25 m`: square corners, despite the code comment calling it a sphere. The camera stops `0.02 m` short of a hit, moves in at once, and eases out at `max(distance, 2) / 0.3` m/s.
- The Sawblade pulls the camera to at least `7.5 m`; playable AEGIS scales distance by `camScale = 1.22`. FOV kicks `8°` during a dash or iaido, otherwise up to `5°` with sprint fraction. Shake trauma decays at `1.7/s` into small rotations.
- Aim runs through the crosshair (`AIM_FAR = 60 m`). Attacks and projectiles start at the actor or weapon and head for the camera-derived aim point, so a camera that sees around a corner cannot let a muzzle shoot through it.
- Enemy attack fairness depends on what the camera sees. Pass camera visibility into the simulation as tick input, never as a query back into the scene. [Enemy wind-up policy][enemies]

Keep the padded-box query at first; a Unity sphere cast differs at corners. Recreate first-person near-camera fading, occluding-character fades, FOV kicks and rotational shake after basic follow and aim pass.

## 6. Combat, enemies, bosses and progression

### Separate attack rules from attack animation

Attack definitions carry duration, active interval, reach, span, vertical band, damage, knockback/launch, lunge, recovery/cancel rules and feedback values, in seconds and radians. A pose reads attack state; it never decides when a hit happens.

RONIN's first light has `dur = 0.22`, active `0..0.11`, reach `3.27 m`, span `2.7`, band `1.2`, damage `14` and hitstop `0.035 s`. The finisher and heavies differ in windows, arcs, bands, launch and lunge. One Unity sword trigger for every swing would erase those differences. [Attack definitions][player]

Give each attack instance a unique ID and an ordered set of already-hit entity handles for one-hit-per-swing. Keep repeated-hit abilities on their own cadence: Sawblade contact every `0.09 s`, orbital strike ticks as configured. Pooled entities get generation-checked handles so a reused object cannot inherit an old hit record. [Sawblade][ultimates] · [Orbital strikes][strike]

Port the existing hit geometry: tilted/pitched arcs, cut boxes, line/corridor attacks, radial ground waves, projectile/body tests. Do not collapse them into an overlap sphere. Keep obstruction and elevation rules per attack.

Keep the damage-resolution order: spawn/death rejection; shields, intercepts and dodges; modifiers; boss damage gates; hit notifications; HP; knockback; poise/stagger; feedback and scoring; death. The rival's first-phase HP gate, for example, stops a burst from skipping its phase transition. [Damage resolver][enemies] · [Boss arc test][boss]

### Tether and projectiles need their own acceptance pass

The tether is a stateful movement and interaction ability. Cover target selection (enemy, barrel, crucible, grenade, ledge, crane, ladle); aim assist and obstruction; tap fling versus held zip; shield cost/refund; ledge arrival; thrown barrels and crucibles; grenade reel-in and kick bullet time; yanking a ladle to tip it; interruption rules; and the Sawblade's tether grind. Keep the wider touch aim assist. [Player tether rules][player] · [Touch integration][touch] · [Sawblade][ultimates] · [Foundry hazards][foundry]

For fast rounds, copy the source's continuous segment queries and first-hit ordering. Playable AEGIS rounds travel `150 m/s`, or `1.25 m` per tick, so testing only the end point misses targets and walls. Keep grenade and probe trajectories consistent with their visual aim previews. [AEGIS rounds][aegisplayer] · [Projectiles][projectiles] · [Strike probes][strike]

### Port enemy navigation and fairness before replacing them

`Nav` is a surface graph with stacked walkable heights, jump/drop links, clearance checks and one shared distance solution toward the player. Crossroads has roofs, fire escapes, girders, an overpass and construction floors; the Foundry has catwalks, bridges and a river enemies must route around. Floor-only movement would break most of the combat space. [Navigation][world]

Keep the graph and its recalculation policy in C#. The source re-solves at most every `0.1 s` when the player stays on the same layer, not per enemy per tick. Keep melee attack tokens, off-camera wind-up extension, glint timing, separation, line-of-fire checks and rooftop sniper behavior. [Enemy policies][enemies]

Build each arena's graph in the Editor at import and check its node and link counts against the JS build ([section 12](#12-reference-measurements-and-regression-cases)). Portal travel then swaps a prebuilt graph instead of rebuilding about 18,000 nodes mid-run.

AI Navigation can replace graph search later, behind the nav seam, if explicit links still trigger the motor's jump, climb and drop states. Prove roof reachability, descent and river avoidance before removing the old graph. Drones need their own movement policy either way.

### Gameplay sockets come from the simulation

The reference decides several gameplay origins from the rendered rig when one exists, and from fixed body-frame offsets when it does not:

- the rival's muzzle (bolt origin), lens (beam and strike-probe origin) and orb;
- KRAG's fists and feet (Molten Fist, guard, stomp and charge checks);
- RONIN's `bladeAt`, used for stance and counter effects.

`boneAt` reads bones the renderer posed at an interpolated render-frame state. In the browser those origins therefore vary with frame rate; headless (feel-check, the trace recorder) they use the fallback. [Boss socket lookup][boss] · [Rival sockets][rival] · [KRAG sockets][kragboss] · [Blade point][player]

Port the fallback as the gameplay socket: it is deterministic and it is what the trace recorder sees. Then calibrate it. Sample the rendered bone in the browser at each attack's release tick, and where the difference is visible, adjust the fallback offsets in the JS reference first so both sides keep matching. Cosmetic uses (glints, trails, jet flames) may follow interpolated presentation bones.

### Translate JavaScript defaults carefully

See the [numeric policy](#numeric-policy) table. `value || fallback` appears in attack and clock code (`(a.lunge || 0)` in AEGIS's melee, `o.scale || 0.25` for bullet time); each site needs a deliberate translation, because a legitimate `0` would silently become the fallback.

### Restore content in a controlled order

1. Scrapper, then gunner: basic melee, projectile, parry and reflection.
2. Drone and brute: aerial attacks, heavy bodies and ground waves.
3. Shielder and crawler: attack direction and armor breaking.
4. Grenadier and sniper: ballistic threats, tethered grenades, line of fire and vertical navigation.
5. Wave Demo waves 1 to 6, Endless in Crossroads, style/scoring, upgrades and modifiers (including Blackout).
6. Rival AEGIS: phases, shields, gun/beam/grenades, blade combos, guards/riposte, red attacks, orbital strikes, transitions and cutscenes.
7. The Foundry: arena, river, conveyors, crucibles, ladles, slag pools, portals and travel; Endless region loop; Free Roam portals.
8. KRAG: heat and the arm before the full move set; then strings and stoppers, guard and detonation, Molten Fist and chasm, charge, leap, stomps, vents, chain swing and cutscenes.
9. Playable AEGIS: shared motor first, then gunner/melee modes, hover, beam/burst and orbital strike.
10. The guided tutorial and practice controls.

Share beam, strike and projectile services while keeping player and boss ownership, damage, colors and input policies separate. Rival AEGIS and playable AEGIS are different behaviors on one model.

KRAG needs explicit tests for its combat language. String blows drive through a parry: no damage, the player is shoved back, KRAG is not staggered and no counter opens. A parried gold stopper knocks it off balance and opens the counter. A blue flash precedes the guard; the onyx arm then takes frontal blows for a fraction of their damage and wears down (`ARM`), separately from heat (`HEAT`). A broken arm shatters the guard: KRAG reels, cannot guard for a while, and the arm re-forms. Reaching full heat while guarding drops straight into the Molten Fist; hitting a charged guard detonates it, KRAG's only stun. The Molten Fist's cone tracks the player until halfway through the wind-up, then holds. The chasm splits to the cone's end and down off ledges onto the ground below, hurts only while it glows, and no parry or dash protects inside it. A generic "parried means staggered" rule erases all of this. [KRAG rules][kragboss]

Keep progression formulas and mode IDs (`demo`, `endless`, `boss`, `duel`, `krag`, `test`, `street`, `training`) data-driven. [Wave director][waves] · [Upgrades][upgrades] · [Foundry travel][foundry]

- Demo: six standard waves, then the rival.
- Endless: Crossroads waves 1 to 8, with AEGIS-07 on wave 8 when `bossEndless` is on. Its defeat opens a portal; stepping in travels to the Foundry, where waves 9 to 11 are regular and KRAG is wave 12. Then back to Crossroads for 13 to 15 and AEGIS-07 on 16, and so on.
- Upgrade offers after waves 2, 5, 8 and every third wave after (`UPGRADE_FIRST = 2`, `UPGRADE_EVERY = 3`).
- A regular wave whose number is a multiple of 5 is a heavy wave with extra brutes. From wave 4, 45% of regular waves carry a modifier.
- Travel carries HP, shield and ultimate charge into a newly built player. It clears enemies, projectiles, hazards, pickups, delayed cuts and props, ends bullet time and lifts Blackout. Style, combo, score, upgrades and wave count carry on in the session.

## 7. Assets and the look

### Build a small extraction pipeline

There is no conventional asset folder. Characters are built from rig/part descriptions, arena geometry from definitions, textures are drawn procedurally and sound and music are synthesized. Budget for export and import tools. [Models][models] · [Rig][rig] · [Graphics][gfx] · [Audio][audio]

Export source data once, then generate Unity assets in the Editor. Run the exporters inside the existing toolchain: a Node `vm` loader like feel-check's for plain data, and the existing Playwright setup for anything that needs a canvas or WebAudio.

| Asset | Extraction / Unity destination |
| --- | --- |
| Arena collision and metadata | Export evaluated `ARENAS` (Crossroads, Foundry, Street, Training) as JSON: boxes, cylinders, surface flags, bounds, spawns, arrival points, perches, anchors, barrel and crucible spots, lamps/lights, river, conveyor and ladle definitions, training metadata |
| Tuning tables | `MOVE`, `PC`, attack tables, `COUNTER`, `ENEMY_DEFS`, `DEMO_WAVES`, `ENDLESS_TYPES`, upgrades, `WAVE_MODIFIERS`, `HEAT`, `ARM`, `LAVA`, `POUR`, `SLAG`, camera constants |
| Model definitions | Bones, parents, rest positions, scale, part shapes/dimensions, offsets, rotations, colors, glow/plain masks, named tags, outline width |
| Procedural extras | Attach callbacks, jets, blade elements, flames and other generated extras; functions do not survive JSON, so export their evaluated output or rebuild them |
| Character geometry | Editor builder creates bones and one combined skinned mesh with one rigid bone weight per part, plus the outline hull and gib pieces; generate prefabs |
| Textures | Run the generators in Playwright and save PNGs. They use seeded `mulberry32`, so output is deterministic; keep texture-to-metre scale |
| Bitmap font | An atlas from `FONT_SRC`, or a small bitmap text renderer that keeps 3×5 glyph spacing |
| Audio | Render effect variants, persistent loops and synchronized music stems to files, then import as AudioClips |

Whitelist exported fields; do not stringify live runtime objects with owner references, caches or renderer handles. Export definitions and stable IDs; keep runtime state separate. Keep gameplay flags such as `noNav`, `slick`, `vaultOnly` and `tetherOnly`. Stamp every export with the source commit and an export schema version.

If you export finished `.glb`/FBX meshes another way, pin the exporter and importer deliberately. Unity will not ingest JavaScript model constructors, Three.js shader patches or custom vertex attributes as-is. Rebuild the shader and gameplay metadata even when a mesh imports cleanly.

### Bake in the Editor, not at load

The source bakes vertex lighting every time an arena loads, including mid-run portal travel, and rebakes the whole arena for the Blackout modifier. In Unity:

- Port the bake (cells of at most 1 m, 2 m on tall boundary walls, shadow rays, three channels: steady, fire, buzz) to an Editor step that writes the channels into the arena mesh.
- Bake a second channel set with the street lamps off, so Blackout swaps channel sets instead of rebaking.
- Keep only the local rebake around a cut lamp at runtime. Port it to C# and measure it on the Web build.

Region travel then loads a prebuilt mesh and nav graph, with no bake or graph build on the critical path.

### Preserve animation as state-driven posing first

`Rig` already merges rigid parts into one skinned mesh per character. Recreate that rather than making every cube its own Renderer. Port the pose functions to C# so they read motor and combat state; keep the scarf's secondary motion and character-specific IK. Bone hierarchy, rest pose, scale and attachment tags matter as much as visible geometry. [Rig builder][rig] · [Model poses][models] · [AEGIS poses][aegis] · [KRAG poses][krag]

Animator clips can come later, behind the pose seam. Attack windows stay in the simulation; poses blend on the appropriate clock; source lunge and velocity are preserved. Check skinning bounds and culling for extended weapons, airborne poses and the scarf.

### Recreate the lighting model exactly

The look comes from custom lighting, not just low-poly geometry. `gfx.js` patches `MeshLambertMaterial` with baked vertex channels, character "feet" lighting, a rim term, bullet-time desaturation and near-camera dithering, with no ambient light, no shadows, no tone mapping and sRGB output. [Graphics][gfx] · [Vendored Three.js][vendor-three]

Write one hand-written URP shader that does its own lighting, with keywords `_BAKED` (level) or `_FEET` (characters) plus `_NO_RIM`. Do not build on URP/Lit: its light loop, falloff and ambient terms change the look and multiply shader variants. Per fragment, in linear space:

```text
albedo    = texture × material colour            # characters: mix(texture, 1, plain) × colour
direct    = Σ over the 8 pool lights:
              colour × intensity × saturate(N·L) × albedo / π
              × 1 / max(d^1.2, 0.01) × saturate(1 − (d / range)^4)^2
level     : indirect = albedo × (baked + bakedFire × uFire + bakedBuzz × uBuzz)
character : indirect = albedo × mix(uFeet, 1, glow) + uRim × (1 − saturate(N·V))^3 × (1 − glow)
colour    = direct + indirect + emissive
colour    = mix(colour, dot(colour, (0.3, 0.59, 0.11)), uDesat × (1 − glow))    # bullet time
then      : encode to sRGB, apply fog, decode to linear for output
fog       = mix(colour_sRGB, #0b0710, smoothstep(28, 95, viewDepth))           # viewDepth = −viewPos.z
nearCut   : characters only; dithered discard between uNearCut and 1.5 × uNearCut (interleaved gradient noise)
```

Four details here differ from Unity defaults:

- **Fog** in Three.js uses `smoothstep` between near and far, on view-space depth rather than radial distance, and it is applied after the output colour has been encoded to sRGB, with the fog colour also in sRGB. Unity's linear fog is a straight line applied in linear space. Do the encode, mix and decode in the shader so normal and retro (render texture) output match.
- **Lambert** divides by π. Unity folds π into light intensity, so a Three.js intensity of `I` corresponds to `I / π` in a Unity-style formula. Keep the π in the custom shader and port intensities unchanged.
- **Point lights** use decay `1.2` with the windowed cutoff above, not Unity's inverse-square-with-smooth-range. Effect lights come from a fixed pool of 8; unused ones sit at zero intensity, so the light count never changes.
- **Outlines** are the skinned mesh drawn again, back faces only, pushed out along normals by `0.035 m` in a flat colour with no fog. Use a second material pass on the character renderer.

Use Linear color space. Mark procedural textures as sRGB; hex material colours convert from sRGB to linear (Three.js color management does this by default); export baked channels as raw linear floats. Background is `#0b0710`.

A stock URP/Lit material is fine as a temporary debug material only. A static Unity lightmap is not enough on its own for lamp destruction and Blackout: removing a light does not remove its stored contribution. Use the channel approach above.

Use point-filtered pixel textures. Compare mipmapping on and off at distance before choosing import settings. Confirm the result against side-by-side screenshots from the reference at fixed camera positions.

Keep the optional **480×270 retro world render** separate from the **480×270 HUD**. The normal scene renders at full resolution while the HUD stays pixelated. Retro mode renders to a 480×270 render texture with a point-filtered upscale, 16:9 composition and appropriate touch/UI scaling. [Renderer sizing][render]

Rebuild effects with bounded pools for trails, decals, sparks, debris, telegraph rings, jets, beams, weather, embers and lights. Critical tells must stay readable with particles, shake, flashes or glow reduced. Standard particle systems and custom meshes are enough for the first port.

The source fixes the light count and precompiles every material at load; its smoke test fails if a shader compiles mid-fight. The small keyword set above keeps Unity's variant count low. Still plan warmup: list required variants, render representative objects and material states during loading, and profile the built player. A variant collection alone does not prove there are no first-use hitches. [Source warmup][render] · [Unity shader loading][u-shaders] · [Shader variant collections][u-variants]

## 8. Audio, UI, touch, saves and Web delivery

### Audio: bake the synthesis before porting a synthesizer

`audio.js` contains procedural effects and layered music, positional sounds, loop lifecycles, gain controls, focus muting, slow-motion treatment and intensity behavior. Its WebAudio graph is not a Unity asset. [Audio source][audio]

Build an audio catalog keyed by the existing sound names. Render representative variants and sustained loops offline in the Playwright harness (with `OfflineAudioContext` where `audio.js` can target one, otherwise a capture). Strip spatial placement from the recordings and apply it in Unity. Export clean loop regions and synchronized music stems so intensity can still change mid-fight. Note pitch and parameter variations; one recording per sound name may not cover every source branch.

Use pooled AudioSources behind an `IAudioBackend` with master/SFX/music levels, focus, slow-motion treatment and loop ownership. Pause, death, character changes, region travel, menu return and pooled despawn must stop or hand over every loop.

For Unity Web, check the supported audio surface early. Unity 6.3 documents limited Web audio APIs, partial AudioClip support, and AudioMixer group volume without the full mixer-effects feature set. Do not depend on desktop-only DSP or streaming for a Web release. Use prerecorded slow-motion or muffled variants where needed, and test that audio starts from the first click or tap. [Unity Web audio][u-web-audio]

### UI and input

Use uGUI for the HUD, world-space markers and touch buttons, and rebuild menus and settings with the same stack. Keep character selection, mode selection, rebinding, enemy presets, results, upgrade offers, practice controls and accessibility toggles.

Suggested action maps: `Gameplay`, `UI`, and a small cutscene/pause layer, with `PassThrough` gameplay actions feeding the per-code edge buffer. The `sheathe` action is RONIN's parry, AEGIS's beam in gunner mode and AEGIS's block in melee mode; keep that mapping explicit.

| Input | Source default / port requirement |
| --- | --- |
| Move | WASD and arrow keys, relative to camera |
| Look / zoom | Mouse delta / scroll; continuous zoom through first person |
| Jump / crouch / dash | Space / C / either Shift (each Shift is its own edge) |
| Attack / tether | Left mouse / right mouse; keep press, hold and release behavior |
| Defense / utility | E / F; behavior depends on character and weapon mode |
| Ultimate / reload | Q / R; keep the legacy binding migration (ultimate on R moves to Q) |
| Pause | Esc or P; works during cutscenes and input lock |
| Touch | Floating movement stick; independent right-side look; aim while holding buttons; character-aware labels and fills |

[Bindings/settings][settings] · [Input state][input] · [Touch behavior][touch]

Touch parity needs simultaneous contacts, not buttons that emulate mouse clicks. Keep drag-to-look from a held combat button, held tether/beam/parry, landscape handling and the portrait prompt, touch aim assist, adjustable opacity/size/look speed, vibration, and character-aware mode and ultimate controls. Gamepad support is a new feature if added; the migration does not need it.

On Web, cursor lock must start from a user interaction. Unity's default sticky cursor lock can keep reporting a lock the browser has already released; configure Web to follow browser state if the existing Esc-to-pause behavior is to survive. Check the actual browser state and focus every frame, as the source does, rather than trusting the requested cursor state. Pause after `0.35 s` without the lock while playing. Clear gameplay input on pause, resume and focus loss. [Unity Web input][u-web-input]

### Save migration

The current keys are `slashyslash3d.settings.v1` and `slashyslash3d.save.v1` (plus `slashyslash3d.tab` for the last settings tab). Progress holds best wave and score, demo completion, boss kills and records, selected character and tutorial completion. Settings carry a binding version and migrate the old ultimate-on-R default to Q while keeping custom bindings. [Persistence][settings] · [Tutorial completion][training]

Create a versioned save envelope with separate progress and settings sections, behind `IPersistence`. On desktop, write a JSON file under `Application.persistentDataPath`; implement and test the browser storage route for Web. PlayerPrefs will not find or translate the current localStorage keys.

The most portable transfer path is **Export save** in the reference build and **Import save** in Unity. Validate version, enum values, ranges and missing fields, and keep a copy of the old save before upgrading it. Map browser binding codes (`KeyW`, `Mouse2`) to Unity binding paths; do not store them as if they were Unity paths. Keep the binding-version migration.

A same-origin browser bridge can read the old keys only from the same storage origin and context. A new domain, a native build or a different embedding context cannot share them. Use a new save namespace so testing the Unity build never overwrites the reference game's settings.

### Web delivery is a separate build product

The existing game opens from `file://` and bundles into one HTML file. A Unity Web build has a loader plus separate data files and needs to be served over HTTP; plan on losing open-from-disk distribution. Plan loading UI, compression and server headers, memory growth settings, caching and download size. Target WebGL 2, which the source already requires. [Existing build][build] · [Unity Web development][u-web-dev]

Managed memory behaves differently on Web. The garbage collector runs only when no managed code is on the stack, which in practice means between frames, and incremental GC is unavailable. Up to six ticks of per-tick allocation pile up before any collection, which is why rule 10 bans it. [Unity Web memory][u-web-memory] · [GC modes][u-gc-modes]

Test desktop Chrome, Edge, Firefox and Safari as the release audience requires, plus real iOS Safari and Android Chrome devices if phone play stays. Unity 6.3 documents mobile Web support; that does not establish this game's frame rate, memory use, save reliability or touch usability. Safari iframe persistence is a documented constraint. [Browser compatibility][u-web-browsers]

## 9. Parity harness

Parity is decided by comparing per-tick traces from the JS reference and the C# port running the same fixture. Phase 0 builds this before any gameplay is ported.

### Make the reference deterministic (phase 0, in the JS repository)

**Split the random streams.** Add `Rng.play` and `Rng.fx` to `util.js`: each a `mulberry32` when seeded and `Math.random` otherwise, so players see no change. Route every draw through one of them: about 194 direct `Math.random()` calls, 331 `rand(...)` calls, and the `randi`, `chance` and `pick` helpers. A draw whose result can reach simulation state (a branch, spawn, target or timer) is `play`. A draw that only shapes an FX or sound call is `fx`. When unsure, use `play`.

Gameplay draws also happen outside the tick, in real-time delayed cuts such as the upgrade offer; they belong to `play` too.

The split matters because the streams are interleaved today. `kragboss.js`, for example, makes cosmetic spark and dust draws and then a weighted move choice from the same `Math.random` in the same tick, so the move choice depends on how many sparks were drawn first. A C# port that moved sparks to presentation could never match it.

**Make gameplay sockets use the body frame in the browser too** (rig for cosmetics only), after calibration as described in [section 6](#gameplay-sockets-come-from-the-simulation). That removes the reference's own frame-rate dependency.

Run feel-check and the smoke suite after both changes and rebaseline on that commit.

### Trace recorder

`tools/trace.js`, built on feel-check's `vm` loader. It loads the simulation modules with view modules stubbed (FX, Sound, Gfx, Render and Fpfx calls are recorded as events), runs a fixture and writes one JSON line per tick.

A **fixture** names the arena, character, mode, start state, `SettingsSnapshot`, both seeds, a sequence of frame deltas (constant `1/60` by default, as the smoke harness uses) and an input script per frame (codes pressed and released, look deltas). Fixtures drive the full `Game.step`, not bare ticks, because real-time state decides simulation outcomes: hitstop and slow-motion durations count down in frame time, and delayed cuts run between ticks. The upgrade offer, for example, shuffles its choices with `Math.random` one real second after a wave ends. Pure motor fixtures may drive ticks directly, as feel-check does.

A **trace record** holds the frame and tick; the intent; player position, velocity, state flags, HP and shield; attack ID and age; every entity's handle, type, position, state and HP; clock state (hitstop, slow scale); draw counts per random stream; and the events emitted that tick.

Feasibility: feel-check already runs `util.js`, `world.js`, `foundrymap.js` and `controller.js` headless. `player.js`, `enemies.js` and `boss.js` touch `THREE` only inside guarded rig paths. `ultimates.js`, `foundry.js` and `training.js` build meshes inline and need their view code split or stubbed first, which is the same Split work the port needs anyway.

### C# replay

`TraceReplay` runs the same fixture through `GameSession`, in the `dotnet test` lane and in Edit Mode, diffs record by record, and reports the first divergent tick with the fields that differ. Golden traces live in `Tests/Fixtures/`, stamped with the source commit and export schema version, and are regenerated only by an explicit command.

### Tolerances

- **Discrete:** the same tick for every state transition, event and hit. "Within one tick" admits an 8 ms shift in a parry window, which players can feel.
- **Continuous:** `1e-6 m` and `1e-6 m/s` per tick for motor fixtures. Last-bit differences in `sin`, `pow` and `atan2` between V8 and .NET sit far below this.
- **Long fights:** fixtures longer than about 10 s can amplify last-bit differences through thresholds. Require exact event order and outcomes (hits, kills, damage totals, wave transitions). If numbers drift, find the first divergent tick and confirm it is last-bit math, not logic, before loosening that fixture's bound; write the reason into the fixture.

### Host and frame-rate tests

Traces bypass the host. Separate Play Mode tests run the host at 30, 60, 120 and 144 rendered FPS, and with zero-tick frames, multi-tick frames, hitstop, repeated slow motion and focus loss. They assert no duplicated or lost press/release and no change in the outcome of scripted fights.

### Test layers

| Layer | What it verifies |
| --- | --- |
| `dotnet test` and Edit Mode | Trace fixtures; hull/ground queries; nav graph counts; attack-window boundaries; shield/armor; scoring and waves; boss gates; save conversion |
| Play Mode | Input edge buffer and camera; interpolation; pause/resume; pooling and reset; poses; tutorial conditions; UI routing; event-to-view coverage |
| Built desktop player | Camera/body containment; shader first use; render and CPU cost; audio loops; frame pacing; resolution changes; focus loss |
| Built Web/mobile | Pointer lock and Esc; first-tap audio; simultaneous touch; orientation; loading and memory; persistence; embedding; background/foreground |

Translate [feel-check.js][feel] scenarios into motor fixtures and the scripted checks in [smoke-test.js][smoke] into gameplay fixtures plus Play Mode tests. Playwright cannot inspect Unity C# state; recreate its assertions through a Unity test or debug interface.

## 10. Design for later replacement

Put a seam only where a replacement is plausible. Each seam is an interface plus a fixture set that any implementation must pass. Everything else stays concrete.

| Seam | First implementation | Plausible replacement | Gate before switching |
| --- | --- | --- | --- |
| `IMotor` | `BoxHullMotor` port | Unity CharacterController or a kinematic controller | All movement fixtures, thin-slab landings, both hull sizes, conveyors |
| `INavProvider` | `SurfaceGraph` port | AI Navigation with links | Reachability counts in [section 12](#12-reference-measurements-and-regression-cases), roof descent, river avoidance |
| `ICameraCollision` | Padded-box ray | Sphere cast against generated colliders | Camera containment cases (overpass, walls, catwalks) |
| `IPoseSource` | Ported procedural poses | Animator clips | Visual references; gameplay cannot change because sockets are simulation-owned |
| `IAudioBackend` | Baked clips and an AudioSource pool | Middleware or runtime synthesis | Catalog coverage, loop ownership tests |
| `IPersistence` | JSON file (desktop), browser storage (Web) | Cloud saves | Round-trip and migration tests |

Choose implementations through a development-only `SimFeatures` field in the `SettingsSnapshot`. The trace harness can then run two implementations on one fixture and diff them, which turns "should we switch to X?" into a measurement.

**Data authority.** Tuning tables are exported from JS into `Data/Imported` as generated ScriptableObjects with a content hash. Until a system is signed off, JS is the authority and a re-export overwrites. Sign-off flips that system: its assets move to `Data/Authored`, the importer refuses to overwrite them, and the conversion manifest records the flip. The flip is one-way and per system.

**Stable IDs.** Generate C# constants for attack IDs, enemy types, sound names, mode IDs, modifier IDs and event kinds from the export, so a typo fails at compile time instead of at runtime.

**Live tuning.** The simulation reads definitions by reference each tick, so designers can edit ScriptableObjects in Play Mode and feel the change at once. Those edits persist on the asset after Play Mode ends; commit them deliberately.

**New content.** A new enemy or hazard is a definition asset, a brain class in Simulation, a view prefab, and fixtures. Nothing else should need to change; if it does, a seam is missing.

## 11. Implementation sequence and acceptance gates

Advance by working builds and passing fixtures. Risk sits in movement fidelity, procedural asset recovery, combat timing, lighting and the two bosses; menu polish is not a first dependency.

| Phase | Work | Exit gate |
| --- | --- | --- |
| 0. Freeze and instrument | Rebaseline; RNG split and socket fallback in JS; trace recorder; arena, model and tuning exporters; golden traces for feel-check scenarios and the first combat fixtures; Export save in the reference | Same seed gives an identical trace twice; feel-check and smoke pass after the JS changes; exports load in a stub importer |
| 1. Foundation | Unity project, assemblies, `dotnet test` lane; coordinate adapter; import of all four arenas; motor; nav graph; clock and host; input edge buffer; event buffer; camera; desktop and Web builds | All movement fixtures match; C# nav node and link counts equal JS for all four arenas; thin-slab landings 840/840 and 60/60; a Web build runs Crossroads |
| 2. First combat slice | RONIN light/heavy, dash slash, parry/counter, HP/shield, scrapper, gunner, HUD essentials; one skinned RONIN with outline, the level and character shader, one audio loop | Combat fixtures match (same-tick windows, reflections, one hit per swing); host tests show no render-rate dependence |
| 3. Traversal and interactions | Tether, barrels, grenades, lamps, sword beam, Sawblade, vertical navigation | Traversal course; throw/kick/zip fixtures; enemies reach roofs and descend |
| 4. Core modes in Crossroads | Remaining enemies, demo and endless director, upgrades, modifiers (Blackout with its baked set), scoring, results, saves | Demo waves 1 to 6 and Endless waves 1 to 7 fixtures match; boss waves stubbed and labeled |
| 5. Bosses, Foundry, second character | Rival; Foundry hazards and portal travel; KRAG; playable AEGIS | Demo wave 7, Rival Fight, Melee Duel, KRAG Fight and Endless through wave 16 (both region trips) pass; both characters work in every applicable mode |
| 6. Presentation and training | Final rigs, poses and outlines; lighting fidelity; effects and audio; first person; full tutorial; touch layouts | Feature matrix complete; tutorial checkpoints and character handoff work; visual references accepted side by side |
| 7. Release validation | Built-player profiling, Web/mobile, save import, focus/lock edge cases, packaging, regression pass | Budgets in [section 13](#13-performance-budget) met on named devices; reproducible builds |

Asset extraction starts in phases 0 and 1, and each phase ships with usable placeholder presentation. The final visual pass can come later, but a skinned RONIN, the custom shader and one audio loop are proven in phase 2, not at the end.

The optional move to Unity 6.7 LTS fits between phases 2 and 3, gated by the full fixture suite.

At the end of each phase, make a playable build and record remaining differences. Keep intentional design changes in a separate list from migration defects, so tuning cannot hide lost behavior.

## 12. Reference measurements and regression cases

### What was verified for this revision

At `1b1aa46`, `node tools/feel-check.js` exits **OK** in about 3 s. Every movement value matches the previous baseline at `3e7f601`; the Foundry rows are new. The browser smoke suite also passed (below). No Unity parity results are claimed.

Reproduce the same start, input schedule, timestep and measurement point before comparing Unity values. A dash-end sample includes the harness's tick-boundary behavior; do not replace a measured distance with speed × rounded duration.

| Movement scenario | Measured result |
| --- | --- |
| Run → sprint | `9.50 → 13.80 m/s`; 95% of run speed in `0.13 s`; 90% of sprint in `0.45 s` |
| Stop from sprint | `1.37 m` in `0.22 s` |
| 90° sprint turn | `0.20 s`; minimum speed `13.80 m/s` |
| Sprint reversal | `0.28 s` skid turn on the hand; moving back after `0.27 s`; push-off `8.77 m/s` |
| Held jump | `4.38 m` apex; `0.78 s` airtime |
| Tap jump, release at `0.05 s` | `1.75 m` apex |
| Double jump at first apex | `8.19 m` total apex (`+3.81 m` from the second jump) |
| Dash | `6.21 m` at the `0.14 s` sample; `10.55 m` total to stop |
| Slide from full run | `13.06 m` over `1.17 s` |
| Bullet jump, aim 30° up | `12.81 m` travel; `1.98 m` apex; `0.54 s` airtime |
| Wall cling | At `4.20 m`, held `1.01 s`; slide reaches `4.04 m/s` after `0.8 s`; releases a tick after keys are let go |
| Wall kick | Additional `3.90 m` rise; `11.32 m` outward travel |
| Vault onto a wrecked car | Top `1.99 m` in `0.21 s`; `11.44 → 10.93 m/s` |
| Vault over a wrecked car side-on | Clear at `0.84 s`; `12.37 m/s` after |
| Girder mantle | Reaches `9.09 m` top |
| Walk into a wrecked car | On top at `1.56 m` in `0.25 s` |
| Walk into a 2.6 m container | On top at `2.61 m` in `0.32 s` |
| Running jump at a container | On top at `2.61 m` in `0.16 s` from the air |
| Reach | Double jump `8.19 m` + mantle `2.40 m` = `10.59 m` |

| Arena | Boxes | Highest tier climb | Narrowest street / alley | Min. headroom | Nav graph | Enemy-climbable raised surfaces | Thin-slab landings |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Crossroads | 143 | 5.85 m | 18.00 / 6.00 m | 5.10 m | 18,920 nodes, 107 surfaces, 1,458 jump links, 740 drop links | 77 of 84 (crane routes excepted by design) | 840/840 |
| Foundry | 75 | 7.50 m | 12.50 / 6.10 m | 5.10 m | 18,437 nodes, 48 surfaces, 1,276 jump links, 674 drop links | 25 of 26 | not measured |
| 2D Street | 60 | 9.09 m | 14.00 / 8.00 m | 5.55 m | 21,466 nodes, 38 surfaces, 360 jump links, 332 drop links | 21 of 31 | not measured |
| Training | 51 | 0.00 m | 30.00 / 28.00 m | none | 4,874 nodes, 2 surfaces, 0 jump links, 1 drop link | 0 of 1 | 60/60 |

Every arena reports zero cut-off ground nodes. Training marks much of its movement course `noNav` on purpose; its small surface count is not a defect. Exact graph counts are port diagnostics, not permanent design limits if navigation is later replaced. [Measurement harness][feel]

**Smoke suite at `1b1aa46`:** `node tools/smoke-test.js 30` exited **OK**. All **196** scripted checks passed with no page errors, under headless Chromium with SwiftShader WebGL 2 (about 16 minutes). The random-play runs all finished with no camera or body inside geometry and no shader compiled mid-fight:

| Random-play run | Simulated | Outcome | Draw calls | Shader programs |
| --- | --- | --- | --- | --- |
| Endless from wave 6, RONIN | 27.0 s | up to 5 enemies | 40 | 29 |
| Rival fight, RONIN | 28.0 s | rival in phase 2 | 85 | 29 |
| KRAG fight, RONIN | 26.3 s | KRAG at 1270/1500 | 82 | 28 |
| Training hall | 14.0 s | n/a | 76 | 28 |
| Endless from wave 6, AEGIS-07 | 29.2 s | up to 10 enemies | 58 | 29 |
| Rival fight, AEGIS-07 | 28.7 s | rival in phase 2 | 65 | 29 |
| KRAG fight, AEGIS-07 | 26.6 s | KRAG at 1488/1500 | 63 | 28 |

The 196 checks are the most detailed existing specification of gameplay behavior; each one should become a fixture or a Play Mode test.

### Required gameplay regression cases

- RONIN light/heavy strings hit each eligible target once and keep vertical aim, armor answers and cancel recovery.
- Parry at the early/late boundary; repeated-parry penalty; counter charge and release; shield break and overflow; interruptions.
- Tether tap/hold, blocked targets, crane and ledge arrival, barrel and crucible throws, grenade kick, ladle yank, cutscene cancellation and Sawblade grind.
- Both Shift keys produce independent dash presses; a press and release inside one frame both register; returning from an upgrade pick does not attack.
- Playable AEGIS mode-switch cancellation, empty reload, first-target rounds, piercing beam, hover limits and ultimate input consumption.
- All eight standard enemies keep their response, visibility policy and vertical routes; none enters the molten river on its own.
- Rival shield and phase gate, guards and riposte, red-attack evasion, duel start, defeat and intro-skip rules; bolt, beam and probe origins come from body-frame sockets.
- KRAG: strings through a parry (shove, no stagger, no counter); stopper parry opens the counter; arm wear and break separate from heat; full heat while guarding goes to the Molten Fist; charged-guard detonation stuns; the chasm tracks then holds, cascades off ledges, hurts only while glowing, and ignores parry and dash; vents and chain swing.
- Foundry: river burn and ejection for player and enemies; conveyor carry; crucible burst into slag; ladle tip and pour (and refill next wave); slag pool burn cadence.
- Portal travel keeps HP, shield and ultimate charge; clears enemies, projectiles, hazards, pickups, delayed cuts and props; ends bullet time; lifts Blackout. Free Roam portals go both ways.
- Demo wave 7. Endless upgrade cadence, modifiers, heavy waves, the boss on wave 8 then every fourth wave by region, and `bossEndless` off (no boss, no portal).
- Settings snapshot: hitstop scale `0` and slow motion off change outcomes exactly as in the reference.
- The tutorial forces RONIN during instruction and restores the picked character on completion or skip; checkpoints and locked abilities prevent course skips.
- Pause, menu, restart, character change and travel clear transient state, loops and pooled views without leaking enemies, lights, hazards or input.

## 13. Performance budget

Choose named target devices and record build settings. The numbers below are proposals to confirm or replace, not measurements of the current game or a port.

| Budget | Proposal | Reasoning |
| --- | --- | --- |
| Frame rate | Stable 60 FPS on the desktop baseline; at least 30 FPS on supported mobile devices | Below 20 FPS the source policy slows the game |
| Simulation per tick, populated fight | ≤ 1.0 ms desktop; ≤ 2.5 ms on the slowest supported mobile Web device | At 30 FPS, 4 ticks take ≤ 10 ms and leave about 23 ms for rendering; the 6-tick worst case still fits a 30 FPS frame on desktop |
| Managed allocation per tick | 0 bytes in steady state | Web GC runs between frames only and is not incremental |
| Shader compilation during a fight | none | The source already enforces this |
| Effect lights | 8, fixed | Matches the source pool |

Profile a populated Endless fight in each region and both bosses. Add a profiler marker per tick phase (the 17 steps in [section 4](#the-clock)) so a regression points at a system. Watch nav solves, skinned meshes, transparent overdraw, shader variants, GC, audio voices and Web heap growth. The smoke test's Three.js draw-call and program counters do not transfer to Unity; keep their intent (no fight-time compilation or first-use stalls) with Unity-specific checks.

## 14. Repository and release handoff

Use a dedicated `unity-port` branch with a `unity/` project directory, or a separate Unity repository linked to the source commit. Keep the web reference working throughout. Do not replace `main` with an unplayable Unity scaffold.

Commit Unity's `Assets` (with `.meta` files), `Packages` manifest and lock file, and `ProjectSettings`. Exclude `Library`, `Temp`, `Obj`, `Logs`, `UserSettings` and build output. Set Asset Serialization to Force Text and keep meta files visible. Route scenes, prefabs and assets through Unity's YAML merge tool in `.gitattributes`, and put large binary art and audio under Git LFS if needed.

Store exporter and importer code with a conversion manifest: source commit, export schema version, coordinate convention, stable asset IDs, and the authority state of each system ([section 10](#10-design-for-later-replacement)).

`tools/sync-2d.js` compares against the original 2D game. During the port, track JS changes after the baseline as explicit backlog items with their fixtures, not as continuous merges into an unfinished C# rewrite. Review `git log <baseline>..origin/main -- js/` weekly and record a new baseline only when its fixtures and checks are regenerated.

CI runs three lanes:

1. **Reference (Node):** feel-check and trace regeneration whenever JS changes, failing if a golden trace changes without an explicit regeneration commit.
2. **Simulation (`dotnet test`):** every fixture, on every commit, with no Unity license needed.
3. **Unity:** Edit Mode and Play Mode tests, desktop and Web builds, and a built-player smoke run (a representative fight, loading, restart). Tie the results to the exact Unity commit and Editor/package versions.

The migration is complete when every agreed mode and both playable characters work, all fixtures pass, the tutorial and settings/save transfer are verified, presentation is accepted against references, and target builds meet the focus, input, audio and performance budgets. Intentional changes stay documented separately.

## 15. First implementation checklist

- [ ] Pin source commit `1b1aa46f3d538cf572ab7f23341a3a586224ea18` and keep a runnable reference build.
- [ ] Decide the JS freeze policy for phases 1 and 2.
- [ ] Split `Rng.play`/`Rng.fx` in the reference; move gameplay sockets to calibrated body-frame offsets; rerun feel-check and smoke; rebaseline.
- [ ] Build `tools/trace.js`; record golden traces for every feel-check scenario and the first combat fixtures.
- [ ] Export arenas (all four), tuning tables and model definitions with schema version and source commit.
- [ ] Capture reference clips and fixed-camera screenshots for movement, RONIN combat, tether, the Foundry, both bosses and playable AEGIS.
- [ ] Confirm browser/mobile scope and choose test devices.
- [ ] Create the Unity 6.3 LTS URP project with the assembly layout above and the `sim-tests/` lane; record exact versions.
- [ ] Implement the coordinate boundary; test winding, left/right parts, yaw, pitch, roll and AABB limits.
- [ ] Port `GameMath`, `JsMath`, `Mulberry32`, `WorldQueries` and `CharacterMotor`; pass the movement fixtures before touching tuning.
- [ ] Build the nav graph in C#; match node and link counts for all four arenas.
- [ ] Implement the 120 Hz host, the per-code input edge buffer, the event buffer and interpolated actor views.
- [ ] Port the camera and crosshair aim; test the overpass, walls, catwalks and first person.
- [ ] Prove one skinned RONIN with outline, the custom shader against reference screenshots, and one imported audio loop.
- [ ] Add scrapper, gunner, damage/parry/counter and the essential HUD and feedback.
- [ ] Produce a desktop build and, if browser support stays, a Web build.
- [ ] Sign off the first combat slice before expanding to the full roster.

---

## Source references

Repository links are pinned to the audited commit so the guide stays valid as `main` changes. Unity references were checked October 30, 2026; use documentation matching the chosen Editor and package versions.

[readme]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/README.md
[package]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/package.json
[html]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/index.html
[css]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/css/style.css
[build]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/tools/build.js
[vendor]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/tools/vendor-three.js
[vendor-three]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/vendor/three.js
[sync]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/tools/sync-2d.js
[feel]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/tools/feel-check.js
[smoke]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/tools/smoke-test.js
[aegis]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/aegis.js
[aegisplayer]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/aegisplayer.js
[aegisviews]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/aegisviews.js
[audio]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/audio.js
[boss]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/boss.js
[camera]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/camera.js
[controller]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/controller.js
[core]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/core.js
[enemies]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/enemies.js
[foundry]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/foundry.js
[foundrymap]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/foundrymap.js
[fpfx]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/fpfx.js
[fx]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/fx.js
[gfx]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/gfx.js
[input]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/input.js
[krag]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/krag.js
[kragboss]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/kragboss.js
[kragviews]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/kragviews.js
[main]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/main.js
[models]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/models.js
[player]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/player.js
[projectiles]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/projectiles.js
[props]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/props.js
[render]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/render.js
[rig]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/rig.js
[rival]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/rival.js
[rivalviews]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/rivalviews.js
[settings]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/settings.js
[specialists]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/specialists.js
[strike]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/strike.js
[touch]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/touch.js
[training]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/training.js
[ui]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/ui.js
[ultimates]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/ultimates.js
[upgrades]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/upgrades.js
[util]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/util.js
[utilities]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/utilities.js
[views]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/views.js
[waves]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/waves.js
[world]: https://github.com/IanSzymanski/slashyslash2/blob/1b1aa46f3d538cf572ab7f23341a3a586224ea18/js/world.js

[u-support]: https://unity.com/releases/unity-6/support
[u-coreclr]: https://discussions.unity.com/t/coreclr-scripting-and-serialization-update-june-2026/1723299
[u-urp]: https://docs.unity3d.com/6000.3/Documentation/Manual/urp/urp-introduction.html
[u-asmdef]: https://docs.unity.com/en-us/engine/6000.3/manual/programming-environment/script-compilation/assembly-definition-files/file-format
[u-controller]: https://docs.unity3d.com/6000.3/Documentation/Manual/class-CharacterController.html
[u-move]: https://docs.unity3d.com/6000.3/Documentation/ScriptReference/CharacterController.Move.html
[u-coordinates]: https://docs.unity3d.com/6000.3/Documentation/Manual/QuaternionAndEulerRotationsInUnity.html
[u-input-timing]: https://github.com/Unity-Technologies/InputSystem/blob/develop/Packages/com.unity.inputsystem/Documentation~/timing-select-mode.md
[u-web-audio]: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/develop/audio
[u-web-input]: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/develop/input
[u-web-memory]: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/develop/memory
[u-gc-modes]: https://docs.unity3d.com/6000.3/Documentation/Manual/performance-incremental-garbage-collection.html
[u-web-browsers]: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/intro/browsercompatibility
[u-web-dev]: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/webgl/develop
[u-shaders]: https://docs.unity.com/en-us/engine/6000.3/manual/materials-and-shaders/shaders/shader-troubleshooting/shader-reduce-stalling/shader-loading
[u-variants]: https://docs.unity.com/en-us/engine/6000.3/script-reference/unityengine/shadervariantcollection
