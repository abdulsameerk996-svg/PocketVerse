# PocketVerse — Architecture

This document explains *why* the code is shaped the way it is. Read it before
adding a feature; most of the decisions here exist to stop the app degenerating
into ten separate apps sharing a bundle.

---

## 1. The central constraint

> **Ten games must feel like ten modes of one product.**

Two things make that true, and everything else follows from them:

1. **One vocabulary.** Rewards, metrics, items and cosmetics are defined once in
   `src/core/types.ts`. A game may not invent a second currency, a second XP
   ledger, or a private inventory.
2. **One host.** `app/game/[id].tsx` owns everything that is not gameplay —
   gating, energy, session timing, pause, results, replay. A module contains
   gameplay and nothing else, so any two games behave identically at the edges.

---

## 2. Layers

```
  routes (app/)                  thin; no game logic, no SQL
      │
      ├── services (core/services)     the only code that mutates the world
      │        │
      │        ├── stores (core/state)  in-memory truth during play
      │        │        │
      │        │        └── save scheduler (core/save)   write-behind, debounced
      │        │                 │
      │        │                 └── repositories (core/db)   the only SQL
      │        │
      │        └── economy (core/economy)   pure maths, no state
      │
      ├── registry (core/registry)     module contract + lookup
      └── content (content/)           merged world catalog
```

Rules that keep the layering honest:

- Only `core/db/repositories.ts` writes SQL. Nothing else imports `expo-sqlite`.
- Only `core/services/rewards.ts` grants a reward. Everything funnels there, so
  cosmetic bonuses, metrics, achievements, level-ups, celebrations and the
  activity feed happen exactly once, consistently, for every path.
- `core/economy/progression.ts` is pure functions only — trivially testable,
  and identical for every game.

---

## 3. The game module contract

```ts
export type GameModule = {
  id: GameId;
  meta: GameMeta;                       // title, glyph, gradient, energy, gating
  Surface: ComponentType<GameSurfaceProps>;
  items?: ItemDef[];                    // merged into the world catalog
  quests?: QuestDef[];                  // merged into the daily/weekly pool
  achievements?: AchievementDef[];
  defaultSave?: () => unknown;          // module-owned opaque save blob
  simulateOffline?: (save, elapsedMs) => { save; notice?; reward? } | null;
};
```

The surface receives a narrow, complete API:

| Prop | Purpose |
|---|---|
| `onFinish(result)` | Ends the run. The host takes over: scores, rewards, results sheet. |
| `track(metrics)` | Emits into the global metric stream — quests and achievements advance live. |
| `grant(reward, label)` | Grants a reward mid-run through the single funnel. |
| `modifiers` | Aggregated equipped-cosmetic bonuses. Games honour `speed` / `armor` / `luck`. |
| `paused` | Host-owned. The game must stop its loop. |
| `save` / `setSave` | Hydrated module state and a debounced writer. |

Because the registry is the only index, **the arcade grid, quest pool, item
catalog, achievement list, offline simulation and save hydration all discover a
new game automatically.** The only file that changes is `src/games/index.ts`.

---

## 4. State and persistence

### Stores (zustand)

| Store | Owns |
|---|---|
| `playerStore` | level, XP, coins, gems, energy, avatar, room, streak |
| `inventoryStore` | stackable items + permanent unlocks |
| `progressStore` | metric stream, quest progress, achievement tiers |
| `settingsStore` | haptics, sound, reduced motion, accessibility |
| `gameSaveStore` | per-module opaque save blobs |
| `uiStore` | toasts, celebration queue (never persisted) |

### Write-behind saving

Stores mark a channel dirty; `core/save/saveService.ts` flushes at most once per
1.2 s, and immediately on app background. Frames stay free of I/O and a crash
loses at most ~1 second of play. Each store persists only the rows it touched,
so write cost is proportional to change, not to inventory size.

### Migrations

`SCHEMA_MIGRATIONS` is an append-only array; `PRAGMA user_version` is the
cursor. Never edit a shipped migration — add a new one.

---

## 5. The 60 FPS strategy

Action games (runner, driving, zombie, platformer, rhythm, dodge) run the
simulation as **one Reanimated worklet on the UI thread**:

```
useGameLoop(worklet)  →  mutate SharedValues  →  useAnimatedStyle  →  pixels
```

Three techniques make this work:

1. **Fixed entity pools.** `useEntityPool(n)` allocates once. Spawning finds a
   free slot and resets numbers. No allocation, no GC pressure, no list diffing.
2. **A frame clock.** Reanimated reacts to `.value` *assignment*, not deep
   mutation. Each loop increments a `frame` shared value, and every entity's
   `useAnimatedStyle` reads `frame.value` — which is what makes in-place pool
   mutation observable.
3. **Banded pools.** In the runner, each pool slot has a *fixed* visual (slots
   0–7 are bricks, 14–27 are coins, …). An entity's glyph therefore never has to
   cross the bridge; spawning is pure arithmetic.

`dt` is clamped to 1/30 s so a GC pause or a backgrounded app can never teleport
an entity through a wall. `useFixedStep` is available for simulations that must
be identical at 60 Hz and 120 Hz.

React re-renders during play only for: game over, powerup pickup, wave change,
pause. Score readouts use `LiveValue`, which polls a shared value at 10 Hz inside
its own component so the surface itself never re-renders.

---

## 6. Offline-first, literally

There is no server, and no code is written as though one might appear:

- **Time-based systems are derived, not ticked.** Energy, pet stat decay and crop
  growth are computed from `now - lastUpdate`. Correct after the app has been
  killed for a week; impossible to drift.
- **Offline simulation** runs once at boot: the host asks each module to fold in
  the elapsed time and optionally return a notice and a reward.
- **Daily content is a pure function of the date.** The daily puzzle, arcade
  rotation, quest rotation and store picks are derived from `dayKey()` through a
  seeded RNG — same everywhere, and relaunching cannot reroll them.
- **Player photos never leave the device.** The picker's URI is copied into the
  app's document directory and referenced from there.

---

## 7. Design system

`src/ui/theme/tokens.ts` is the single source of visual truth: palette,
gradients, 4 pt spacing scale, radii, type ramp, shadows, motion constants,
rarity colours. Screens never hard-code a hex value.

Consistency is enforced by primitives rather than by discipline:

- `Screen` owns the background treatment, safe areas and tab-bar clearance.
- `PressableScale` owns press physics, haptics and audio cues for *every*
  tappable surface in the app.
- `Card` is the only bordered box. `ItemTile` is the only item representation —
  so a legendary fish and a legendary hat glow identically.
- `useResponsive()` scales spatially by width and type on a damped curve, so a
  5.4" phone and a tablet both read correctly without per-screen overrides.

Reduced Motion is honoured globally: `Starfield`, `Burst`, `Confetti` and
`Shimmer` return `null`, and springs collapse to instant assignment.

---

## 8. Deliberate trade-offs

| Decision | Alternative | Why this way |
|---|---|---|
| Emoji glyphs as art | Sprite atlases | Zero binary assets, no licensing, instantly legible; every glyph is a single prop swap away from an `<Image>`. See `docs/ASSETS.md`. |
| Auto-targeting in the zombie game | Twin-stick | One thumb. Twin-stick on a phone is a worse game, not a harder one. |
| Auto-run in the platformer | On-screen d-pad | Tap-to-jump is the only platformer control scheme that survives a touchscreen. |
| Generated rhythm charts | Hand-authored | Ships with playable content and no audio binaries; a new song is one row of data. |
| React state for puzzle/farm/fishing shells | Worklet loops everywhere | Input is discrete and infrequent; a worklet would add complexity for no frame-rate gain. |
| SQLite over MMKV/AsyncStorage | Key-value | Real queries for scores, activity, aggregate stats; migrations; one durable file. |
