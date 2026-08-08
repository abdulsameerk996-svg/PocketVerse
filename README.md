# PocketVerse

An offline-first mobile game built with **Expo + React Native + TypeScript + Expo Router**.
Eleven games, one avatar, one inventory, one save file. No backend, no account, no network.

```bash
npm install
npx expo start          # then press a / i, or scan with Expo Go
npm run typecheck       # tsc --noEmit, zero errors expected
```

> Native modules used (SQLite, haptics, blur, image picker, **GL**) run in a
> development build. `npx expo run:android` / `run:ios` produce local builds.
> `expo-gl` is a native module, so Pen Fight needs a build newer than the one
> that first shipped the 2D games — Expo Go will not do.

---

## What it is

PocketVerse is deliberately **not** a launcher with eleven unrelated games behind it.
Everything the player does anywhere lands in the same place:

| Shared system | Where it lives | Why it matters |
|---|---|---|
| Avatar + cosmetics | `player.avatar` | The hat you buy shows up on the hub, in the store, in the pre-run loadout, and tints your character inside the runner. |
| Coins / gems / XP / level | `playerStore` | Zombie scrap funds a shotgun upgrade; fishing money buys a hat that makes the runner faster. |
| Inventory | `inventoryStore` | Fish, crops, scrap, seeds and cosmetics all live in one bag with one sell path. |
| Quests | `progressStore` + `content/quests` | "Play 3 different games" only means something because every module reports the same metrics. |
| Achievements | `progressStore` | Tiered, permanent, and contributed by both core and modules. |
| Energy | `economy/progression` | Regenerates from wall-clock time — no timers, works while the app is killed. |
| Save | SQLite via `core/db` | One database, migrated forward, written behind a 1.2 s debounce. |

---

## Layout

```
app/                          Expo Router routes — thin, no game logic
├─ _layout.tsx                boot sequence + global overlays
├─ (hub)/                     home · play · quests · collection · store
├─ game/[id].tsx              THE GAME HOST — one screen hosts every game
└─ modal/                     avatar studio · room · settings · achievements

src/
├─ core/
│  ├─ types.ts                shared domain vocabulary (rewards, metrics, items)
│  ├─ db/                     schema, migrations, connection, repositories
│  ├─ state/                  zustand stores (player, inventory, progress, …)
│  ├─ economy/                XP curve, energy regen, modifier maths (pure)
│  ├─ services/               boot · session · rewards · shop · daily
│  ├─ save/                   write-behind autosave scheduler
│  ├─ registry/               GameModule contract + registry
│  └─ game/                   useGameLoop, entity pools, collision helpers
├─ ui/
│  ├─ theme/                  design tokens + responsive scaling
│  │
│  │  (games/penfight is the one module with a scene/ folder — the 3D arena.
│  │   It is lazy-imported so three.js never loads unless you open it.)
│  ├─ components/             Screen, Card, Button, ItemTile, AvatarView, …
│  ├─ fx/                     particles, confetti, shimmer, starfield
│  ├─ game/                   GameHud, PauseSheet, ResultsSheet, LiveValue
│  └─ hooks/                  haptics façade, sound cue façade
├─ content/                   world catalog: items, quests, achievements, dailies
└─ games/                     ten plug-in modules + one registration file
```

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the full design, and
**[docs/ADDING_A_GAME.md](docs/ADDING_A_GAME.md)** for the plug-in workflow.

---

## The games

| # | Game | Kind | Loop |
|---|---|---|---|
| 1 | **Pocket Pet** 🐣 | ambient | Feed, clean, play, sleep. Stats decay on real time and are simulated at boot. |
| 2 | **Neon Sprint** 🏃 | session | Three-lane endless runner. Jump, slide, magnets, shields, skins. |
| 3 | **Highway Drift** 🏎️ | session | Procedurally curving endless road, traffic, near-misses, mission chain, unlockable cars. |
| 4 | **Logic Deck** 🧩 | session | Three puzzle modes (Blackout, Shuffle, Echo) + a date-seeded daily. |
| 5 | **Last Signal** 🧟 | session | Top-down wave survival, auto-targeting, persistent weapon upgrades bought with scrap. |
| 6 | **Homestead** 🌾 | ambient | Plots, seeds, real-time growth, harvest, plot expansion. |
| 7 | **Still Waters** 🎣 | ambient | Cast → bite → reel minigame. Four locations, twenty species, collection screen. |
| 8 | **Skyward** 🧗 | session | Five data-driven platformer levels with hidden gems. |
| 9 | **Signal Beat** 🎧 | session | Four-lane rhythm game, charts generated deterministically per track, combo multiplier. |
| 10 | **The Arcade** 🕹️ | session | Four micro-games, three rotate daily, high scores kept forever. |
| 11 | **Pen Fight** 🖊️ | session · **3D** | Real-time capsule physics on a desk. Drag back to aim, release to flick, knock the rival's pen over the edge. Best of three against an AI. |

---

## Performance model

Action games run their simulation **on the UI thread** as a single Reanimated
worklet. Positions live in `SharedValue`s consumed by `useAnimatedStyle`, so a
frame never crosses the JS bridge. Entities are fixed-size pools — no allocation,
no list diffing, no React re-render while playing. React state changes only for
things that genuinely change rarely (game over, powerup pickup, pause).

Score readouts use `LiveValue`, which polls a shared value at 10 Hz **inside its
own component**, so the readout updates without re-rendering the game surface.

### The 3D exception

Pen Fight cannot use that model and does not pretend to. `expo-gl` draws from
JS, so a UI-thread worklet would have to cross the bridge every frame to touch
the scene — strictly worse than not using one. Instead:

- the rigid-body solver runs inside the single `useFrame` that is already the
  render tick, and writes straight onto `THREE.Object3D` transforms;
- it is **fixed-step** (1/120 s, accumulator-driven), so a 120 Hz phone and a
  60 Hz phone play an identical match;
- nothing in the Canvas subtree re-renders while playing — the world is a
  mutable object in a ref, never React state;
- the aim guide and power meter are the same story: the guide is a mesh the
  frame loop positions, the meter is a Reanimated shared value. Dragging costs
  zero React renders.

Everything in the arena is procedural geometry. There are no textures, no
models and no `useLoader`, so opening the game allocates a handful of buffer
geometries and nothing else, and R3F disposes all of them on unmount.

---

## Offline-first

There is no server, and nothing is designed as if there might be one later:

- SQLite is opened once at boot and migrated forward by `user_version`.
- Stores are the in-memory truth during play; writes are batched behind a 1.2 s
  debounce and flushed immediately when the app backgrounds.
- Time-based systems (energy, pet decay, crop growth) are computed from
  wall-clock deltas rather than ticked, so they are correct after the app has
  been killed for a week.
- Daily content (puzzle, arcade rotation, quest rotation, store picks) is a pure
  function of the date — identical on every device, impossible to reroll.
- Player photos are copied into the app's own document directory and referenced
  locally. Nothing is uploaded; the app requests no network permission.

## Status

`npm run typecheck` passes and the project bundles with Metro. Audio ships as
cue hooks rather than binaries — sound effects and looping music are
synthesised at runtime, see [docs/ASSETS.md](docs/ASSETS.md).
