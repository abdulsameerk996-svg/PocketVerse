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

Sound is wired and audible on both platforms — still with **no audio binaries
in the repository**. Every place that *should* make a noise calls through the
façade in `src/ui/hooks/useSound.ts` with a stable cue name:

```ts
play('game.collect');
play('reward.levelup');
play('rhythm.perfect');
```

The façade checks the user's Sound setting and forwards to a **sink** registered
once at boot by the platform backend:

- **Web** — `soundBackend.web.ts` synthesises each cue live with the browser's
  WebAudio (`AudioContext`, a couple of oscillators + a noise burst). Nothing is
  downloaded; the context starts on the first gesture.
- **Native** — `soundBackend.ts` renders each cue to a small 16-bit PCM WAV with
  the *same* voice math (`src/ui/hooks/synthWav.ts`), writes it to the app cache
  on first use, and plays it through `expo-audio`.

Both backends read the single voice table in `src/ui/hooks/soundVoices.ts`, so
platforms cannot drift. `npm run sim:audio` renders every cue in Node and checks
the WAV structure, amplitude, duration and determinism.

### Replacing with real recordings

The generated cues are deliberately small and game-y. To use real recordings
instead, drop files into `assets/audio/<cue>.m4a` using the cue names in
`SoundCue`, then in `soundBackend.ts` swap the synthesis step for the packaged
asset:

```ts
// src/ui/hooks/soundBackend.ts
import { createAudioPlayer } from 'expo-audio';

const source = require('../../../assets/audio/game.collect.m4a');
const player = createAudioPlayer(source);
player.volume = opts?.volume ?? 1;
player.seekTo(0).then(() => player.play());
```

**No call site changes** either way — every `play(...)` in the games goes
through the same sink, which is the entire reason the cues were written before
the audio existed.

### Music

`playMusic` drives generated, seamlessly looping ambient tracks — `hub`,
`action` and `chill` — composed by `src/ui/hooks/musicGen.ts` (pure TS) and
rendered to WAV with the same synthesis primitives as the cues. The root
layout's `MusicDirector` picks the track from the current route (hub and modals
→ `hub`, session games → `action`, ambient games → `chill`), and the Music
setting in the app stops it. Web plays the WAV through a looping
`AudioBufferSourceNode`; native through a looping `expo-audio` player.
`npm run sim:audio` verifies structure, duration, amplitude and loop-seam
continuity for every track, so a retune of `musicGen.ts` is caught in Node.

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
