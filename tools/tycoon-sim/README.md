# Donut Tycoon headless simulation

```bash
npm run sim:tycoon
```

Compiles the pure engine (`src/tycoon/{types,data,engine,format}.ts` — no React,
no React Native) to plain CommonJS and plays it in Node. The `require` doubles
as a coupling guard: if a platform dependency ever leaks into the engine, it
crashes here instead of on a device.

## What it checks

- **Fresh state** — zero cash, zero cps, tap power 1, all finite.
- **Tapping** — cash/taps/lifetime move together.
- **Generators** — cost curve `base × 1.15^owned`, tier locks, affordability.
- **Idle income** — cps accrues with wall-clock seconds.
- **Offline earnings** — 50% of live cps, 8h cap, 60s floor, `lastSeenAt` stamp.
- **Upgrades** — multiplier stacking, no double-buy, generator-count gating.
- **Milestones** — threshold unlocking, one-time claim, reward grant.
- **Prestige** — token math `floor(sqrt(lifetime/1e6))`, full reset semantics,
  permanent ×1.1/token income boost, no-prestige below threshold.
- **Determinism + fuzz** — a 50,000-step run (taps + ticks + buys + upgrades +
  prestiges) that must stay finite, plus identical-seed reproducibility.
- **Corrupt saves** — NaN/Infinity/bogus ids sanitised by `validateState`.
- **Formatting** — money/duration/number display.

Tune a number in `src/tycoon/data.ts` or the engine and this suite tells you
what broke.
