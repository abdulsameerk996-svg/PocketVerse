# Quick-play headless simulation

```bash
npm run sim:quick
```

Compiles the pure logic of all five Phase 7 quick games (Stack Rush, Color
Snap, Survive 60, Hook Run, Tower Defense) to plain CommonJS and plays it in
Node — no device, no renderer, no React. The `require` of the compiled modules
doubles as a coupling guard: if a renderer dependency ever leaks into a
`logic.ts`, it crashes here instead of on a device.

## What it checks

- **Stack Rush** — aligned drops are perfect, small cuts are placed-not-perfect,
  big misses end the run, sweep bounds straddle the previous layer, speed
  tuning, and 40 consecutive near-perfect drops never produce NaN widths.
- **Color Snap** — every seeded round has the target exactly once, distinct
  tiles, the right tile count per level, fakes only at level ≥ 5 and never
  equal to the target; timer and scoring curves.
- **Survive 60** — tier boundaries, monotonic difficulty, chaser steering and
  convergence, zigzag finiteness, spawn invariants, scoring math.
- **Hook Run** — attach math, a 15-second pendulum that stays inside its
  angular-velocity bounds, deterministic runs, zenith releases launch forward,
  nearest-anchor selection.
- **Tower Defense** — the whole fire→hit→kill→coin chain, shield-absorb, leaks,
  upgrade/level-cap math, **full 11-wave determinism**, a maxed-board win, and
  a defenseless-run loss.
- **Shared helpers** — reward envelope, difficulty curve, combo cap, best-score
  bookkeeping.

Every check above maps to a failure mode a quick game can actually hit; retune
a `logic.ts` and the suite tells you what broke.
