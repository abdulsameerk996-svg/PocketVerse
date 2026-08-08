import type { SoundCue } from './useSound';

export type { SoundCue } from './useSound';

/**
 * One voice describes how a cue is synthesised. The web backend renders it with
 * WebAudio nodes; the native backend renders the *same* math to a WAV
 * (`synthWav.ts`) and plays it through expo-audio. Keeping the table here means
 * the two platforms cannot drift.
 */

/** Waveform for the tonal part — a subset of `OscillatorType`, minus "custom". */
export type Wave = 'sine' | 'square' | 'triangle' | 'sawtooth';

export type Voice = {
  /** Waveform for the tonal part. */
  wave: Wave;
  /** Start and end frequency in Hz — a slide when they differ. */
  from: number;
  to: number;
  /** Seconds. */
  duration: number;
  /** Peak gain before the global mix, 0..1. */
  gain: number;
  /** Fraction of the duration spent attacking, rest decays. */
  attack: number;
  /** Adds a filtered noise burst — for impacts, crashes and splashes. */
  noise?: number;
  /** Optional second oscillator a fixed interval above, for chords. */
  detune?: number;
};

/**
 * The cue table. Tuned by ear against what each sound is *for*: pickups rise,
 * failures fall, impacts are short and noisy, rewards are bright intervals.
 */
export const VOICES: Record<SoundCue, Voice> = {
  'ui.tap': { wave: 'sine', from: 660, to: 660, duration: 0.05, gain: 0.1, attack: 0.15 },
  'ui.back': { wave: 'sine', from: 520, to: 380, duration: 0.09, gain: 0.1, attack: 0.15 },
  'ui.error': { wave: 'square', from: 220, to: 150, duration: 0.16, gain: 0.11, attack: 0.05 },

  'reward.coin': { wave: 'triangle', from: 900, to: 1400, duration: 0.1, gain: 0.14, attack: 0.05, detune: 702 },
  'reward.chest': { wave: 'triangle', from: 520, to: 1050, duration: 0.28, gain: 0.16, attack: 0.06, detune: 386 },
  'reward.levelup': { wave: 'triangle', from: 440, to: 1320, duration: 0.5, gain: 0.18, attack: 0.05, detune: 702 },

  'game.start': { wave: 'triangle', from: 330, to: 660, duration: 0.22, gain: 0.14, attack: 0.08 },
  'game.over': { wave: 'sawtooth', from: 400, to: 90, duration: 0.6, gain: 0.16, attack: 0.03 },
  'game.collect': { wave: 'triangle', from: 780, to: 1170, duration: 0.08, gain: 0.12, attack: 0.05 },
  'game.hit': { wave: 'square', from: 200, to: 110, duration: 0.09, gain: 0.11, attack: 0.02, noise: 0.5 },
  'game.jump': { wave: 'sine', from: 300, to: 720, duration: 0.13, gain: 0.12, attack: 0.04 },
  'game.crash': { wave: 'sawtooth', from: 180, to: 60, duration: 0.34, gain: 0.16, attack: 0.02, noise: 0.85 },
  'game.splash': { wave: 'sine', from: 900, to: 260, duration: 0.26, gain: 0.12, attack: 0.03, noise: 0.65 },
  'game.harvest': { wave: 'triangle', from: 520, to: 880, duration: 0.18, gain: 0.13, attack: 0.06, detune: 498 },

  'rhythm.perfect': { wave: 'square', from: 1046, to: 1568, duration: 0.09, gain: 0.12, attack: 0.03, detune: 702 },
  'rhythm.miss': { wave: 'sawtooth', from: 240, to: 130, duration: 0.14, gain: 0.11, attack: 0.03 },

  'pet.happy': { wave: 'sine', from: 620, to: 990, duration: 0.2, gain: 0.13, attack: 0.08, detune: 386 },
  'pet.eat': { wave: 'triangle', from: 380, to: 240, duration: 0.12, gain: 0.11, attack: 0.05, noise: 0.3 },
};

/** Global trim so a busy game never clips. */
export const MIX = 0.55;
