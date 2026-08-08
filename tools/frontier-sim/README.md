# Frontier headless simulation

```bash
npm run sim:frontier
```

Compiles the Frontier simulation core to plain CommonJS and plays it in Node —
no device, no renderer, no React. This works because `src/games/frontier/sim.ts`,
`world.ts` and `content.ts` import nothing from React, three.js or React Native;
the `require` of the compiled modules in the harness doubles as a coupling
guard that keeps it that way.

## What it checks

| # | Property |
|---|---|
| 1 | World generation is deterministic per seed (landmarks, biome field, decorations) |
| 2 | Every boss has an arena in its own biome; all four biomes exist in the world |
| 3 | Run construction: armour → max HP, speed/luck modifiers fold in, pools sized |
| 4 | Player movement: full speed, normalised diagonals, world clamping |
| 5 | Combat: melee kills, loot drops, contact damage, all values stay finite |
| 6 | Level-up: gem collection triggers the upgrade picker with 3 distinct choices |
| 7 | Upgrades: damage/maxHp/multishot math, unknown ids rejected |
| 8 | Bosses: spawn at full HP, phase 2 at 66%, death, loot, permanent bonuses, rewards |
| 9 | Events fire in a long run; 90 s of idle time stays finite and alive |
| 10 | **Full determinism**: same seed → byte-identical 20 s run |
| 11 | Reward math agrees with `content.rewardForRun`; material thresholds hold |
| 12 | Save normalisation: garbage in, finite defaults out; unknown boss ids filtered |

## Why it exists

The frontier is the one game where the hard part is systems rather than
geometry: seeded world generation, spawn pressure, boss phase transitions,
loot tables and reward envelopes. Those are exactly the things that silently
rot — a NaN sneaks in via knockback, a phase transition never fires, a boss
arena lands in the wrong biome, a reward formula drifts from the one the UI
shows. Every check above came from a failure mode this game could actually
hit; re-tune `content.ts` and the suite tells you what broke.
