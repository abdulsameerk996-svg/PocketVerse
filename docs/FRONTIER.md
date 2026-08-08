# PocketVerse Frontier — design (Phase 6)

**One expedition = one run.** You enter a procedurally-seeded frontier, fight
through four biomes, find landmarks, defeat three bosses, level up during the
run, and get rewarded when you fall. Everything a run produces flows through
the existing PocketVerse economy — this is a game *in* the platform, not a game
beside it.

## Architecture

```
src/games/frontier/
├─ types.ts            sim + save types (pure)
├─ content.ts          enemy/boss/upgrade tables, save defaults + normalise
├─ world.ts            seeded world generation (biomes, landmarks, decor)
├─ bosses.ts           three boss brains (phases, telegraphs, summons)
├─ sim.ts              the simulation core (pure TS, no React, no three.js)
├─ Scene.tsx           R3F presentation (lazy-imported — three.js never loads
│                      unless Frontier is opened, see ADDING_A_GAME.md)
├─ FrontierSurface.tsx the shell: input, HUD, minimap, upgrade sheet
└─ index.ts            GameModule (meta, quests, achievements, defaultSave)
```

The simulation is a **pure, deterministic module** stepped from the render
loop's `useFrame` with a fixed-step accumulator (the same pattern as
`arena2d`/Pen Fight): no per-frame React state, no allocation, and the exact
same code runs headlessly in `tools/frontier-sim` and passes or fails on real
math. Presentation is R3F with instanced meshes — one draw call per enemy
species, projectiles, pickups — and a follow camera.

## Game loop

Explore → fight → collect → level up → pick an upgrade → reach landmarks →
defeat bosses → survive. There is no win screen: you fall, the run ends, and
the results sheet turns the run into coins/XP/items through the normal
`onFinish` funnel. Long runs are automatically more valuable, so staying alive
*is* the score.

## World (6B)

- One square world, 100 × 100 units, generated deterministically from a run
  seed via hash-based value noise.
- Four biomes: **Meadow** (spawn, walkers/chasers), **Forest** (chasers,
  ranged, swarms), **Ruins** (tanks, ranged, elites), **Danger Zone** (all
  species, elites, the Void Engine).
- 6 landmarks: three boss arenas (The Warden, The Rootbeast, The Void Engine)
  and three sight landmarks (camp, obelisk, geyser). Discovering one is a
  tracked milestone.
- Depth feel: fog, vertex-tinted ground by biome, instanced trees/rocks/
  pillars/crystals, a following camera, biome banner on transitions.

## Player (6C)

Move (stick / WASD), sprint (stamina), dash (i-frames, cooldown), melee arc
attack, auto-aimed ranged shot, radial Nova ability. HP, damage, i-frames,
death → results. `modifiers.speed/armor/luck` from equipped cosmetics apply.

## Combat (6D)

Hit detection, knockback, hit-flash, spawn/impact particles, telegraph rings
for big attacks, crits, attack cooldowns, projectile pools. Responsiveness and
readability before physical fidelity.

## Enemies (6E)

walker · chaser · ranged · tank · swarm · elite — each with distinct stats,
speed, silhouette, behaviour and a spawn cost, fed by a budget-based spawn
director that scales with survival time and biome.

## Bosses (6F)

The Warden (meadow), The Rootbeast (forest), The Void Engine (danger). Each has
3 phases, telegraphed attacks, summons, a big HUD bar, a death sequence, a
first-kill permanent reward and a reward burst.

## Loot & upgrades (6G/6H)

Gems (XP), HP, temporary buffs, rare stars. Rarity affects end-of-run
rewards (scrap/circuits/cores/star fragments — existing materials, no new
currency). Level-ups offer 1-of-3 in-run upgrades (damage, attack speed, move
speed, max HP, crit, multishot, dash cooldown, ability power). First-time boss
kills grant small permanent bonuses stored in the module save.

## Quests / achievements / events / HUD / audio (6I–6L)

Module quests + achievements use existing metric seams (`track`). Seeded
events (swarm, treasure rush, healing zone, meteor shower, elite invasion)
fire on a deterministic schedule. HUD: HP, level/XP, timer, score, minimap,
biome + objective + boss warning, boss bar, cooldown pips. Audio reuses the
existing `play()` cues and the music director (`action` track).

## Save (6M)

Module blob persists best score/time, totals, defeated boss ids and capped
permanent bonuses. Normalised on load (see `normalizeFrontierSave`).

## Performance (6O)

Fixed entity pools (enemies, projectiles, pickups, telegraphs), instanced
meshes, zero per-frame React state, HUD polled at ~8 Hz, sim on the render
thread. Budget: 90 enemy slots.

## Simulation harness (6P)

`npm run sim:frontier` compiles `src/games/frontier/*` to Node and verifies
world determinism, movement, damage, enemy death, loot, upgrades, boss phase
transitions, reward math, save round-tripping, and no-NaN/no-negative
invariants over a simulated run.
