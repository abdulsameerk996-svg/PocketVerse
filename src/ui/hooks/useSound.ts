import { getSettings } from '@/core/state/settingsStore';

/**
 * Sound hooks.
 *
 * The game ships without audio binaries (see `docs/ASSETS.md`). Every place
 * that *should* make a noise calls through this façade with a stable cue name,
 * and the platform backends (web: WebAudio synthesis; native: runtime WAV
 * synthesis via expo-audio) register a sink here at boot — so no call site
 * ever touches audio internals.
 *
 * Music follows the same seam: the platform backends register a music sink and
 * loop generated tracks (`musicGen.ts`) that the root layout's MusicDirector
 * picks per screen.
 */

export type SoundCue =
  | 'ui.tap'
  | 'ui.back'
  | 'ui.error'
  | 'reward.coin'
  | 'reward.levelup'
  | 'reward.chest'
  | 'game.start'
  | 'game.over'
  | 'game.collect'
  | 'game.hit'
  | 'game.jump'
  | 'game.crash'
  | 'game.splash'
  | 'game.harvest'
  | 'rhythm.perfect'
  | 'rhythm.miss'
  | 'pet.happy'
  | 'pet.eat';

type Sink = (cue: SoundCue, opts?: { volume?: number; rate?: number }) => void;

let sink: Sink | null = null;

/** Wire a real audio backend at boot. */
export function setSoundSink(next: Sink | null) {
  sink = next;
}

export function play(cue: SoundCue, opts?: { volume?: number; rate?: number }) {
  if (!getSettings().sound) return;
  sink?.(cue, opts);
}

/* ------------------------------------------------------------- music -- */

export type MusicTrack = 'hub' | 'action' | 'chill';

/** `null` stops the current track. */
type MusicSink = (track: MusicTrack | null) => void;

let musicSink: MusicSink | null = null;

/** Wire the platform music backend at boot (same lifecycle as the sound sink). */
export function setMusicSink(next: MusicSink | null) {
  musicSink = next;
}

export function playMusic(track: MusicTrack) {
  if (!getSettings().music) return;
  musicSink?.(track);
}

export function stopMusic() {
  musicSink?.(null);
}

export const sfx = { play, playMusic, stopMusic };

export function useSound() {
  return sfx;
}
