# Adding a game

A game is a **plug-in**, not a screen. Adding one touches exactly two files that
already exist — `src/games/index.ts` (one line) and nothing else.

---

## 1. Create the folder

```
src/games/<yourgame>/
├─ index.ts          the GameModule (metadata, content, hooks)
├─ types.ts          the save blob shape
├─ content.ts        items / levels / tables the game introduces
└─ <Name>Surface.tsx the playable component
```

## 2. Write the module

```ts
// src/games/pinball/index.ts
import type { GameModule } from '@/core/registry';
import { PinballSurface } from './PinballSurface';
import type { PinballSave } from './types';

export const pinballModule: GameModule = {
  id: 'pinball',                       // add to GameId in core/types.ts
  meta: {
    title: 'Tilt',
    tagline: 'One ball, no mercy',
    glyph: '🎱',
    gradient: 'sunset',                // key of ui/theme/tokens.gradients
    accent: '#FF8A3D',
    energyCost: 2,                     // 0 = ambient, always open
    minLevel: 3,
    kind: 'session',                   // or 'ambient'
    tags: ['action', 'arcade'],
    order: 110,                        // sort weight in the arcade grid
  },
  Surface: PinballSurface,
  defaultSave: (): PinballSave => ({ runs: 0, best: 0 }),

  // Optional: contribute to the shared world.
  items: [...],
  quests: [...],
  achievements: [...],
  simulateOffline: (save, elapsedMs) => null,
};
```

Add `'pinball'` to the `GameId` union in `src/core/types.ts`, and any new metric
names to `MetricKey`. Those two unions are the contract that makes quests and
achievements type-safe across modules.

## 3. Register it

```ts
// src/games/index.ts
import { pinballModule } from './pinball';

export const GAME_MODULES = [
  …,
  pinballModule,   // ← the only edit
];
```

Done. The game now appears in the arcade grid with its gating and energy cost,
its quests join the daily rotation, its items appear in the inventory, store and
collection screens, its achievements appear grouped under its name, and its save
blob is hydrated at boot.

---

## 4. Write the surface

```tsx
export function PinballSurface({ onFinish, track, grant, modifiers, paused, save, setSave }: GameSurfaceProps) {
  …
  onFinish({
    score,
    outcome: 'lose',
    metrics: { pinball_flips: flips },        // feeds quests + achievements
    reward: { coins, xp, items: { mat_scrap: 2 } },
    breakdown: [{ label: 'Flips', value: `${flips}` }],
  });
}
```

Rules:

- **Never** touch `playerStore` / `inventoryStore` directly. Use `grant()`.
- **Always** stop your loop when `paused` is true.
- **Honour `modifiers`** — at minimum `speed`, `armor` and `luck`. This is what
  makes cosmetics bought elsewhere matter here.
- Persist through `setSave`, not module-level variables. It is debounced; safe to
  call often, but not once per frame.

### For an action game

Use the shared loop rather than `setInterval` or `requestAnimationFrame`:

```tsx
const pool = useEntityPool(24);
const frame = useSharedValue(0);

const loop = useCallback((dt: number) => {
  'worklet';
  frame.value += 1;
  for (let i = 0; i < 24; i++) {
    const e = pool.value[i];
    if (!e.active) continue;
    e.y += e.vy * dt;
    if (overlaps(...)) { e.active = false; runOnJS(onHit)(); }
  }
}, [/* every shared value you touch */]);

useGameLoop(loop, !paused && !over);
```

Render each pooled entity with a style that reads `frame.value` — that is what
makes in-place mutation observable:

```tsx
const style = useAnimatedStyle(() => {
  frame.value;                       // subscribe to the frame clock
  const e = pool.value[index];
  if (!e.active) return { opacity: 0 };
  return { opacity: 1, transform: [{ translateX: e.x }, { translateY: e.y }] };
});
```

Give each pool slot a **fixed visual** where you can (see the runner's `BANDS`),
so the glyph never has to cross the bridge.

> ⚠️ Seeding a pool from the JS thread must **assign the whole array**
> (`pool.value = [...]`). Mutating `pool.value[i]` from JS only changes the
> JS-side copy. Inside a worklet, mutate in place.

---

## 5. Checklist

- [ ] `GameId` and any new `MetricKey`s added to `core/types.ts`
- [ ] Module registered in `src/games/index.ts`
- [ ] Surface stops its loop on `paused`
- [ ] Rewards go through `grant()` / `onFinish()`, never a store
- [ ] `modifiers.speed` / `armor` / `luck` honoured
- [ ] Items given a `rarity`, a `value` and a `source`
- [ ] Reduced Motion respected (use `Burst`/`Confetti`, which already do)
- [ ] `npm run typecheck` clean
