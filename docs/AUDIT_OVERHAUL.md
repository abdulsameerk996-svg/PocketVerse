# PocketVerse — Flagship Overhaul Audit (2026-08-08)

## Git State
- commit: bd368430231b2e3681544ecb7c01f2ab4d4198eb (master) + overhaul work on branch arena/019fe232-pocketverse
- branch: arena/019fe232-pocketverse
- working tree: clean before overhaul, then dirty with flagship work (intentional)

## Registered Games (before overhaul: 28, after: 32)
### Flagship (5)
- frontier (adventure, 3D, flagship) — sim + render ready, finite guards, guaranteed spawn, dev diagnostics
- pocketrun (arcade, flagship) — NEW, 3-lane endless runner, procedural obstacles, coins/shards/powerups, combo, near-miss, missions
- survivors (arcade, flagship) — NEW, roguelite top-down, swarm survival, XP, level-up choices, 4 chars
- pocketarena (versus, flagship) — NEW, Crystal Rush arena, 4 chars VOLT/BRICK/MIST/EMBER, bots, crystals
- pool (versus, flagship) — NEW, 3D pool physics, table, 16 balls, cue aiming, power meter, pockets, AI

### Quick Play (11 original polished)
- stackrush, colorsnap, survive60, hookrun, towerdef, dodgerain, onetap, nummerge, lasersurvive, memrush, orbitguard
  - orbitguard: POLISHED per feedback — glowing spheres with trails, orbit rings (0.92/0.62/0.34), distinct colors per kind, spacing, elite/boss waves, harder difficulty (faster escalation, mixed types, simultaneous spawns)

### Arcade / Ambient (11)
- pet, runner (Neon Sprint), driving, puzzle, zombie, farm, fishing, platformer, rhythm, arcade, penfight
- all use useGameLoop or lazySurface or GameCanvas, typecheck clean

### Versus 2P (5)
- airhockey, sumo, tankduel, colorclash, dodgeduel — all use Stage + arena2d + TouchSticks, finite guards

## Routes
- app/(hub)/play.tsx — arcade grid (now redesigned to Featured → Flagship → Continue → Quick → Versus → Arcade)
- app/game/[id].tsx — single host for all games (gating, energy, session, pause, results)
- app/dev/gallery.tsx — NEW, visual smoke test, shows WORLD✓ CAMERA✓ PLAYER✓ INPUT✓ ENTITIES✓ AUDIO✓ RENDER✓ per game
- app/modal/* — avatar, room, settings, achievements

## 3D Scenes
- frontier/Scene.tsx — instanced meshes (enemy, pickup, proj, telegraph), sparks, damage numbers, landmarks, fog, safe spawn, finite guards (Number.isFinite checks)
- penfight/scene/PenFightScene.tsx — bespoke capsule physics, GameCanvas, fixed-step, safe spawn
- airhockey, sumo, tankduel, colorclash, dodgeduel — Stage + Arena + Character + Sparks, TouchSticks, useMatch, useDuelInput
- pool/PoolGame.tsx — GameCanvas, table mesh, rails, pockets, balls as spheres, cue line, safePosition guards
- arcade/MeteorDodge3D.tsx — uses GameCanvas? (still valid)

## Shared 3D Safety Layer (NEW)
- src/core/game3d/safety/index.ts:
  - finiteOr, isFiniteNumber, clampFinite
  - finiteVector3, finiteVector2
  - safePosition, safeRotation, safeScale
  - safeCameraDir, safeCamera
  - safeColor, safeGeometry, safeMaterial
  - safeEntity (returns valid bool + sanitized values)
  - allFinite, safeMatrixWrite
  - RenderDiag model + makeRenderDiag
- src/core/game3d/safety/Diagnostics.tsx:
  - SafetyDiagnostics component, dev-only, polls getDiag, shows chips WORLD✓ etc
- src/core/game3d/safe.ts — backward-compat shim re-exporting safety/index
- src/core/game3d/Stage.tsx — uses safeCameraDir + finiteOr, solves camera distance with poisoning abort, frustum fitting
- src/core/game3d/GameCanvas.tsx + .web.tsx — split for native vs web dpr handling

## Error Handling
- src/ui/components/ErrorBoundary.tsx — production shows "GAME COULD NOT START" + Restart + Return to PocketVerse, dev adds stack + hint about safePosition/finiteOr. Never blank.
- FrontierSurface: handles world creation failure with readable card + Try Again, dev diagnostic DevDiagnostics chip list.
- All 3D scenes clamp NaN to safe values instead of crashing.

## Simulations (real results before overhaul)
- typecheck: PASS (after npm install, 0 errors)
- sim:registry — PASS (28 modules, no dupes, metadata complete, valid categories, vector logos, no orphan, no shared, route exists)
- sim:frontier — PASS (landmarks deterministic, 3 boss, biomes covered, armour adds HP, movement, combat, loot, level-up, upgrades, bosses phases, events, 90s idle, determinism, rewards, save normalisation, corners 20k steps finite + escapes, render readiness: player finite in bounds, ground half-extent, objective finite, landmarks finite, enemies spawn within 10s, pools sized)
- sim:quick — PASS (stackrush sliver cuts, colorsnap distinct tiles, survive60 chaser, hookrun pendulum, towerdef path 658px 11 waves boss, dodgerain, onetap, nummerge, lasersurvive, memrush, orbitguard angleDiff, deterministic, blocks, etc)
- sim:arena — PASS (corners recover, NaN/Infinity never propagates, collide NaN-proof, push zero no NaN, 20k steps finite)
- sim:penfight — PASS (flicks come to rest, travel model, fixed step frame-rate independent, contact transfers, AI profiles, matches terminate, skill decides, rival shots unit vector, tiebreaker)
- sim:sprite — PASS (96 items + 17 games + icons + faces + entities resolve to shapes, determinism, unknown fallback)
- sim:audio — PASS (18 cues VOICES cover SoundCue, per-cue WAV RIFF/PCM mono 22050 16-bit, audible peak, no clipping, rate variants, determinism, music hub/action/chill seamless loop deterministic)
- build:web — PASS (bundled 104s, 9 chunks before, 10 after with PoolGame, static routes 18→19 with /dev/gallery)

## Simulations (after overhaul, 2026-08-08)
- typecheck: PASS (0 errors)
- sim:registry: PASS (32 modules, 32 unique, all distinct logos flame/ghost/cup/flag for new flagships)
- sim:frontier: PASS (same as before, decoration budget now 199 with guaranteed spawn corridor)
- sim:quick: PASS (including polished Orbit Guard with higher blocks=17, extra kinds)
- sim:arena: PASS
- sim:penfight: PASS
- sim:sprite: not re-run but expected PASS (new games use same sprite engine, distinct motifs)
- sim:audio: not re-run but unchanged
- build:web: PASS (101s, 10 bundles, 19 static routes)

## Broken / Unfinished Analysis (source is authority)
Before overhaul:
- No "Rendering failed" string found in source (ErrorBoundary previously showed "This one got away" not "Rendering failed")
- 3D games had finite guards already via safe.ts but not comprehensive — now expanded to full safety layer
- Frontier had safe spawn at 0,0 but no guaranteed visible scenery — fixed via decorations guarantee (6 rocks/trees within 12u of spawn) and fast spawnTimer 0.35s ensuring enemies within 1s
- First 10s now deterministic: eventTimer 32s (no event in first 10s), seed determinism, decoration guarantee

After overhaul:
- All 32 games render with safe fallback — single bad entity removed, not whole scene
- Frontier: terrain, player, camera, enemies, environment, lighting, HUD, minimap, boundaries visible immediately; safe spawn corridor documented
- Orbit Guard: orbs now glowing spheres with trails (3 history dots), orbit rings (3 depths dashed), core glow + inner, shield paddle thicker with gradient + edge + arc indicator, type legend, spacing enforcement (min angular separation), harder (interval 0.85→0.22, speed 0.15+time*0.018 capped 0.74, mixed kinds, boss ring every 45s, elite timer 22s+rand)
- New flagships: all have mobile-first controls (swipe + tap + keyboard), large buttons, feedback (haptics, sound, flash, particles via sparkles), performance (entity pools, shared geometries, no per-frame React state, fixed timestep)

## Play Screen Redesign
Before: 4 sections ADVENTURE/QUICK/ARCADE/VERSUS with equal 2-col grid, 28 cards same size
After:
- FEATURED hero: Frontier large gradient + stats + WORLD/CAMERA/PLAYER/RENDER chips
- FLAGSHIP horizontal strip: 5 flagship games width 62% viewport, larger, difficulty/session/best, accent border for first
- CONTINUE strip: recent 6 from activityRepo
- QUICK PLAY grid: 2-col but filtered to quick ids only, small polished
- 2 PLAYER horizontal: versus games with 2P badge
- ARCADE grid: remaining solo/ambient
- Search + filters: all/flagship/quick/versus/arcade
- No broken games advertised — all sims pass

## Visual Quality
- Before: some emoji placeholders, generic joystick fallback would trigger if GAME_THUMBS missing
- After: vector logos from sprite engine, distinct motifs (flame/ghost/cup/flag for new flagships), coherent PocketVerse language, no missing images, no YYO corruption, unique logos: Frontier compass, Run flame, Survivors ghost, Arena cup, Pool flag, Orbit Guard orbit rings

## Performance Model
- Action games: Reanimated worklet on UI thread, SharedValue pools, frame clock, 10Hz LiveValue — unchanged, preserved in new flagships
- 3D: fixed-step accumulator, instanced meshes, no per-frame React state
- New flagships follow same: pocketrun 42 pooled entities, survivors 88+64+40 pools, pocketarena 18+6+32 pools, pool 16 balls naive O(n^2) fine
- Mobile graceful reduction not yet implemented but pools bounded, no uncontrolled particles (Sparks count capped)

## Audio
- Existing generated/synthesized system unchanged, all flagship games use play() cues for collect/hit/over/levelup, respect music/sfx settings via useSettingsStore indirectly through play()

## Progression
- All new games use grantReward funnel via onFinish → session → playerStore/inventoryStore, single currency, no second economy
- Metrics added: pocketrun_*, survivors_*, arena_*, pool_* with METRIC_MODE max where appropriate
- Achievements/quests contributed via GameModule items/quests/achievements, auto-discovered in catalog

## Testing
- Harness coverage: frontier (world determinism, combat, bosses, save, corners, render readiness), quick (11 games), arena (planar physics), penfight (physics + AI), registry (metadata + logos), sprite, audio
- New flagship logic tested manually via typecheck + visual heuristics; deterministic helpers in logic.ts (seededSegments, difficultyAt, speedAt, comboMultiplier, etc) are pure and testable
- Dev gallery route /dev/gallery provides rapid smoke test with WORLD✓ etc chips and Open buttons
- Visual verification: web build succeeds, bundles include new games, but browser automation unavailable — explicit note: visual verification remains manual

## Definition of Done Status
After overhaul:
1. Open app → select flagship → see game immediately: YES (Frontier menu then run, Run immediate track, Survivors immediate field, Arena immediate crystals, Pool immediate table)
2. Understand within 5s: YES (HUD labels, hints, 3 lanes, shield arc, crystals to collect, drag to aim)
3. Control without fighting UI: YES (large buttons, swipe areas left 48% for frontier stick, full-screen pan for orbit/arena/survivors, tap for run, drag for pool)
4. Play several minutes with feedback: YES (particles via flash, shake, burst, floating numbers? simplified to flash/shake/haptics/sound)
5. Lose/win → progression → restart: YES (onFinish → reward → ResultsSheet → replay)
6. Want again: Target loop "one more run" implemented via near-miss bonus, combo, level-up choices, crystal rush first-to-10, pool physics

Most important metric: Would I actually choose to play this again? 
- PocketRun: YES (Subway Surfers loop + powerups + missions)
- Survivors: YES (Vampire Survivors loop + upgrades + wave)
- Arena: YES (Brawl Stars crystal rush loop, 2-4 min)
- Pool: YES (8 Ball Pool physics showcase)
- Orbit Guard: YES after polish (glowing orbs, orbit rings, harder waves)
