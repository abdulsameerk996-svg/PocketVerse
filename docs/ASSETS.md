# Assets

PocketVerse ships with **no binary assets**. That is a deliberate choice, not an
omission: it keeps the repository small, avoids licensing questions, and means
the app runs the moment you clone it. Both art and audio are routed through a
single seam so they can be replaced without touching call sites.

---

## Art

Every sprite in the game is an emoji glyph rendered through `<Text>`. Each one
comes from either:

- `ItemDef.glyph` in the catalog (items, cosmetics, fish, crops, cars, weapons),
- `GameMeta.glyph` (arcade cards, HUDs, activity feed),
- a module-local table (`RUNNER_SKINS`, `CARS`, `ZOMBIE_GLYPHS`, `BAND_VISUAL`).

### Replacing with a sprite atlas

1. Add `sprite?: ImageSourcePropType` alongside `glyph` in `ItemDef`
   (`src/core/types.ts`) and in the module-local tables.
2. Change the two components that render item art — `ItemTile` and `AvatarView` —
   to prefer `sprite` and fall back to `glyph`.
3. For pooled game entities, swap the `<Text>` inside the entity sprite component
   for an `<Image>`; the animated style is unchanged because position and size
   already come from the pool.

Nothing else needs to change: no game reads a glyph directly from another game.

---

## Audio

Sound is wired but silent. Every place that *should* make a noise already calls
through the façade in `src/ui/hooks/useSound.ts` with a stable cue name:

```ts
play('game.collect');
play('reward.levelup');
play('rhythm.perfect');
```

The façade checks the user's Sound setting and forwards to a **sink**, which is
currently unset. To make the whole app audible:

1. Drop files into `assets/audio/<cue>.m4a` using the cue names in `SoundCue`.
2. Install `expo-audio`.
3. Implement and register a sink once at boot:

```ts
// src/ui/hooks/soundBackend.ts
import { createAudioPlayer } from 'expo-audio';
import { setSoundSink, type SoundCue } from './useSound';

const CUES: Partial<Record<SoundCue, number>> = {
  'game.collect': require('../../../assets/audio/game.collect.m4a'),
  'reward.levelup': require('../../../assets/audio/reward.levelup.m4a'),
  // …
};

const players = new Map<SoundCue, ReturnType<typeof createAudioPlayer>>();

export function installSound() {
  setSoundSink((cue, opts) => {
    const source = CUES[cue];
    if (!source) return;
    let p = players.get(cue);
    if (!p) {
      p = createAudioPlayer(source);
      players.set(cue, p);
    }
    p.volume = opts?.volume ?? 1;
    p.seekTo(0);
    p.play();
  });
}
```

Then call `installSound()` next to `installGames()` in `app/_layout.tsx`.

**No call site changes.** Every `play(...)` in the ten games starts working at
once — which is the entire reason the cues were written before the audio existed.

### Cue inventory

| Cue | Fired by |
|---|---|
| `ui.tap`, `ui.back`, `ui.error` | `PressableScale`, shop failures |
| `reward.coin`, `reward.chest`, `reward.levelup` | reward funnel, purchases, celebrations |
| `game.start`, `game.over` | every session game |
| `game.collect`, `game.hit`, `game.jump`, `game.crash` | runner, driving, zombie, platformer |
| `game.splash`, `game.harvest` | fishing, pet cleaning, farm |
| `rhythm.perfect`, `rhythm.miss` | rhythm judgements |
| `pet.happy`, `pet.eat` | pet care actions |

---

## Haptics

Already fully implemented in `src/ui/hooks/useHaptics.ts`. Games call **semantic**
verbs (`tap`, `press`, `collect`, `tick`, `heavy`, `success`, `fail`) rather than
raw impact styles, so the feel of the whole app can be retuned in one file. Every
call is settings-aware and no-ops on web.

---

## Fonts

The app uses the platform system font at weights 500–900. To adopt a custom face,
load it with `expo-font` in `app/_layout.tsx` and add `fontFamily` to the type
ramp in `src/ui/theme/tokens.ts` — `Text` is the only component that reads the
ramp, so one edit restyles every string in the app.
