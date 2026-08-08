# Assets

PocketVerse ships with **no binary assets**. That is a deliberate choice, not an
omission: it keeps the repository small, avoids licensing questions, and means
the app runs the moment you clone it. Both art and audio are routed through a
single seam so they can be replaced without touching call sites.

---

## Art

PocketVerse renders every non-photographic mark through a single **generated
sprite engine** — `src/ui/assets/sprites.ts` (pure TS) + `SpriteView.tsx`
(react-native-svg). There are still **no binary assets**: every item, game
thumbnail, quest/achievement icon, avatar face and pooled game entity is a set
of vector shapes drawn deterministically from its id, so anything new gets
coherent art the moment it is registered.

### How it works

- `spriteForItem(item)` — the catalog's ~95 items. Specific motifs are authored
  per id where identity matters (materials, consumables, hats, shirts, shoes,
  auras, backgrounds, decorations, pets, trails, weapons, cars, skins, pens,
  toys); everything else falls back by `kind` (fish → fish, crop → sprout, …),
  then by cosmetic slot, then to a hash-seeded generic mark. **It never returns
  null.**
- `spriteForGame(id, accent, label)` — one thumbnail per registered game, using
  the module's own accent colour.
- `spriteForIcon(emoji, label, accent)` — quest/achievement/HUD icons. Known
  emoji map to the same motif library; unknown ones get the deterministic
  fallback, so a new quest never shows a blank tile.
- `spriteForFace(faceId)` — the six avatar faces as vector art.
- `spriteForEntity(kind, variant)` — Last Signal's pooled zombies (hue variants
  so a horde reads as individuals), scrap, player and bullets.

### Replacing with real art

The engine is a render-time mapping, so the data model (`ItemDef.glyph`,
`GameMeta.glyph`) is untouched. To ship a real atlas instead, add
`sprite?: ImageSourcePropType` alongside `glyph` and prefer it in the two
components that draw items (`ItemTile`, `AvatarView`); pooled entities swap the
`<SpriteView>` for an `<Image>` with the same static size prop — the animated
style is unchanged because position already comes from the pool.

`npm run sim:sprite` resolves every registered id in Node and verifies geometry
(bounds, finite numbers, non-empty), determinism and the fallback chain.

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
