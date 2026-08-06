import { getSettings } from '@/core/state/settingsStore';

/**
 * Sound hooks.
 *
 * The game ships without audio binaries (see `docs/ASSETS.md`), but every place
 * that *should* make a noise already calls through this façade with a stable
 * cue name. Dropping files into `assets/audio/<cue>.m4a` and implementing
 * `loadCue` below turns the whole app audible without touching a single call
 * site — that is the entire point of routing it here now.
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

/** Wire a real audio backend at boot once assets exist. */
export function setSoundSink(next: Sink | null) {
  sink = next;
}

export function play(cue: SoundCue, opts?: { volume?: number; rate?: number }) {
  const s = getSettings();
  if (!s.sound) return;
  sink?.(cue, opts);
}

export function playMusic(track: string) {
  if (!getSettings().music) return;
  sink?.(`music.${track}` as SoundCue);
}

export const sfx = { play, playMusic };

export function useSound() {
  return sfx;
}
