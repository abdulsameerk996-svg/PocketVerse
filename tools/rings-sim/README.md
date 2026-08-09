# Neon Rings headless simulation

```bash
npm run sim:rings
```

Compiles the pure engine (`src/rings/logic.ts` — no React, no React Native) to
plain CommonJS and plays it in Node. The `require` doubles as a coupling guard.

## What it checks

- **Level generation** — ring counts grow with level and cap, identical levels
  are byte-identical (seeded), gaps shrink, ring 0 starts fair (gap down).
- **Ring motion** — slide/rotation stay finite and inside pole bounds over 20s,
  rotation wraps into [-π, π].
- **Idle + launch** — idle ball bounces in range, tap launches, double-tap is
  a no-op.
- **Gap alignment** — an open gap passes, a closed gap hits, an edge-of-gap
  pass is within tolerance.
- **Scoring + combos** — perfect passes score 2, quick consecutive passes
  build a combo.
- **Level flow** — reaching the top levels up, regenerates rings, sets the
  banner and tracks best level.
- **Game over + retry** — a hit ends the run; retry keeps best score/level.
- **60-second fuzz** — a full minute of taps/steps/restarts stays finite.
- **Save sanitising** — NaN/Infinity/float values are normalised.

Tune a number in `src/rings/logic.ts` and this suite tells you what broke.
