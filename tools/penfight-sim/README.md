# Pen Fight headless simulation

```bash
npm run sim:penfight
```

Compiles Pen Fight's solver and opponent to plain CommonJS and plays them
against each other in Node — no emulator, no device, no renderer.

This is possible because `src/games/penfight/physics.ts` and `ai.ts` import
nothing from React, three.js or React Native. Keeping them that way is the
point: the part of a physics game that is hardest to eyeball is the part you can
actually test.

## What it checks

| # | Property |
|---|---|
| 1 | Every flick comes to rest — no perpetual motion, no NaN |
| 2 | The closed-form travel model agrees with the solver, and inverts cleanly |
| 3 | 60 Hz, 120 Hz and jittery frames produce identical play |
| 4 | Contact transfers momentum; a glancing hit produces spin |
| 5 | Opening-shot conversion rises monotonically with difficulty |
| 6 | 800 AI-vs-AI matches terminate; skill decides them; rounds stay short |
| 7 | The rival never emits a launch outside the human input range |

## Why it exists

Three real defects came out of writing it, none of which typechecking or
bundling would have caught:

1. **The opponent's power model was dimensionally wrong** — it scaled a
   *distance* by `TRANSFER`, which is a *speed* ratio. Travel is superlinear in
   speed, so every shot was mis-powered. The symptom was that the hard rival
   lost to the easy one, because noise was accidentally correcting the model.
2. **The opening flick converted ~100% of the time**, so whoever went first won
   the match. Fixed by racking the pens end-on rather than broadside — see the
   balance note in `physics.ts`.
3. **47% of rounds ran to the turn limit** at the original drag and restitution;
   one hit could not shove a pen far enough to score from mid-desk.

Numbers 5 and 6 are regression guards for exactly those. If someone retunes the
constants in `physics.ts`, this is what tells them the rival stopped missing.

## Note

The thresholds encode a design intent, not physics. They are meant to be
argued with — just re-measure rather than relaxing them.
