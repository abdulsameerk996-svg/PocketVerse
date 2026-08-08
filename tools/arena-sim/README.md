# Arena solver regression

```bash
npm run sim:arena
```

Regression suite for the shared planar solver (`src/core/game3d/arena2d.ts`)
used by every 3D arena game — Air Hockey, Sumo, Tank Duel, Color Clash and
Dodge Duel.

The Phase 6A corner fix lives in the solver itself: non-finite recovery in
`integrate`/`collide`/`clampRect` and velocity zeroing at walls. This suite
rams bodies into every corner and edge, poisons them with NaN/Infinity, and
asserts the world always recovers: finite values, in-bounds positions, and a
body that can still move after a corner collision. A 20 000-step fuzz run
proves no escape and no non-finite value over a long, chaotic session.
