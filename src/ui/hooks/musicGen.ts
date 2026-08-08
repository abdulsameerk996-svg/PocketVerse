import { WAV_SAMPLE_RATE, shape, wavBytes } from './synthWav';
import type { Wave } from './soundVoices';

/**
 * Generated ambient music — the counterpart to the cue synth in `synthWav.ts`.
 *
 * PocketVerse ships no audio binaries (docs/ASSETS.md). Where cues are single
 * one-shot sounds, this module composes *loops*: chord progressions played by a
 * few layered voices (pad + arpeggio + bass), rendered to a seamless looping
 * WAV with the same primitives the cues use. Web plays the WAV through a
 * looping AudioBufferSourceNode; native through a looping expo-audio player —
 * both platforms hear the same file.
 *
 * Pure TypeScript, no React/DOM imports: `tools/audio-sim` compiles and runs
 * this in Node, which is how the loop-seam and amplitude checks stay honest.
 *
 * Loop seam: the last chord of the progression is the tonic, held into a short
 * tail that decays to silence, and the head of the buffer fades in — so the
 * loop point lands in quiet and never clicks.
 */

export type MusicTrackId = 'hub' | 'action' | 'chill';

export const MUSIC_TRACK_IDS: MusicTrackId[] = ['hub', 'action', 'chill'];

export type RenderedTrack = {
  /** Complete RIFF/WAVE file bytes (16-bit PCM, mono). */
  bytes: Uint8Array;
  /** Post-mix samples (scaled and clipped) — used by the audio-sim for seam checks. */
  samples: Float64Array;
  sampleRate: number;
  duration: number;
  peak: number;
  rms: number;
};

type Layer = {
  wave: Wave;
  gain: number;
  /** Semitone shift applied to chord pitches (+12 = one octave up). */
  octave: number;
  /** Per-8th-note pattern of chord-tone indices; -1 rests. 8 steps = one bar. */
  steps: number[];
  /** Note length in beats. */
  dur: number;
  attack: number;
  release: number;
};

type TrackDef = {
  bpm: number;
  /** Seconds of tonic held after the last bar, decaying into the seam. */
  tail: number;
  /** One chord (midi pitches) per bar. */
  progression: number[][];
  layers: Layer[];
};

const BEATS_PER_BAR = 4;

const TRACKS: Record<MusicTrackId, TrackDef> = {
  /**
   * hub — warm Am–F–C–G pad with a gentle triangle arpeggio. Heard on the
   * hub and modal screens; the default "here is PocketVerse" mood.
   */
  hub: {
    bpm: 84,
    tail: 1.4,
    progression: [
      [45, 48, 52], // Am
      [41, 45, 48], // F
      [48, 52, 55], // C
      [43, 47, 50], // G
    ],
    layers: [
      { wave: 'sine', gain: 0.1, octave: 0, steps: [0, 0, 0, 0, 0, 0, 0, 0], dur: 4, attack: 0.12, release: 0.7 },
      { wave: 'triangle', gain: 0.035, octave: 12, steps: [0, 2, 1, 2, 0, 2, 1, 2], dur: 0.9, attack: 0.01, release: 0.25 },
    ],
  },

  /**
   * action — the same progression at 132 BPM with a square bass pulse and a
   * tight octave arpeggio. Session games (runner, zombie, arcade, duels).
   */
  action: {
    bpm: 132,
    tail: 1.0,
    progression: [
      [45, 48, 52], // Am
      [41, 45, 48], // F
      [48, 52, 55], // C
      [43, 47, 50], // G
    ],
    layers: [
      { wave: 'square', gain: 0.05, octave: 0, steps: [0, -1, -1, -1, 2, -1, -1, -1], dur: 0.42, attack: 0.004, release: 0.1 },
      { wave: 'triangle', gain: 0.035, octave: 12, steps: [0, 2, 1, 2, 0, 2, 1, 2], dur: 0.21, attack: 0.004, release: 0.09 },
      { wave: 'sine', gain: 0.05, octave: 0, steps: [0, 0, 0, 0, 0, 0, 0, 0], dur: 4, attack: 0.05, release: 0.35 },
    ],
  },

  /**
   * chill — slow D–Bm–G–A sine pads with a sparse melody. Ambient games
   * (pet, farm, fishing) where a pulse would fight the calm.
   */
  chill: {
    bpm: 72,
    tail: 1.6,
    progression: [
      [50, 54, 57], // D
      [47, 50, 54], // Bm
      [43, 47, 50], // G
      [45, 49, 52], // A
    ],
    layers: [
      { wave: 'sine', gain: 0.09, octave: 0, steps: [0, 0, 0, 0, 0, 0, 0, 0], dur: 4, attack: 0.2, release: 1.1 },
      { wave: 'sine', gain: 0.04, octave: 12, steps: [0, -1, 1, -1, 2, -1, 1, -1], dur: 0.8, attack: 0.02, release: 0.5 },
    ],
  },
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type Note = {
  start: number;
  dur: number;
  freq: number;
  wave: Wave;
  gain: number;
  attack: number;
  release: number;
};

/** Global trim so layered voices never clip. */
const TRACK_MIX = 0.5;

export function renderTrack(id: MusicTrackId): RenderedTrack {
  const def = TRACKS[id];
  const spb = 60 / def.bpm;
  const barSeconds = BEATS_PER_BAR * spb;

  const notes: Note[] = [];
  def.progression.forEach((chord, bar) => {
    const barStart = bar * barSeconds;
    for (const layer of def.layers) {
      for (let s = 0; s < layer.steps.length; s++) {
        const idx = layer.steps[s];
        if (idx < 0) continue;
        const pitch = chord[idx % chord.length] + layer.octave;
        notes.push({
          start: barStart + s * 0.5 * spb,
          dur: layer.dur * spb,
          freq: midiToFreq(pitch),
          wave: layer.wave,
          gain: layer.gain,
          attack: layer.attack,
          release: layer.release,
        });
      }
    }
  });

  // Tail: hold the tonic as a pad and let it decay into the seam.
  const tonic = def.progression[0];
  const pad = def.layers[0];
  const tailStart = def.progression.length * barSeconds;
  for (const pitch of tonic) {
    notes.push({
      start: tailStart,
      dur: def.tail,
      freq: midiToFreq(pitch),
      wave: pad.wave,
      gain: pad.gain,
      attack: 0.1,
      release: def.tail - 0.15,
    });
  }

  const total = tailStart + def.tail;
  const n = Math.max(2, Math.round(total * WAV_SAMPLE_RATE));
  const out = new Float64Array(n);

  for (const note of notes) {
    const onset = Math.round(note.start * WAV_SAMPLE_RATE);
    const len = Math.round(note.dur * WAV_SAMPLE_RATE);
    const end = Math.min(n, onset + len);
    const attack = Math.max(1, Math.round(note.attack * WAV_SAMPLE_RATE));
    const release = Math.max(1, Math.round(note.release * WAV_SAMPLE_RATE));
    const twoPi = 2 * Math.PI;
    for (let i = Math.max(0, onset); i < end; i++) {
      const t = i - onset;
      let env = 1;
      if (t < attack) env = t / attack;
      else if (t > len - release) env = Math.max(0, (len - t) / release);
      const phase = twoPi * note.freq * (t / WAV_SAMPLE_RATE);
      out[i] += note.gain * env * shape(note.wave, phase);
    }
  }

  // Seam dressing: fade in the head, fade the tail's final 120 ms to zero.
  const fadeIn = Math.round(0.03 * WAV_SAMPLE_RATE);
  for (let i = 0; i < fadeIn && i < n; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.round(0.12 * WAV_SAMPLE_RATE);
  for (let i = Math.max(0, n - fadeOut); i < n; i++) out[i] *= (n - i) / fadeOut;

  let peak = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, out[i] * TRACK_MIX));
    out[i] = s;
    peak = Math.max(peak, Math.abs(s));
    sumSq += s * s;
  }

  return {
    bytes: wavBytes(out, WAV_SAMPLE_RATE),
    samples: out,
    sampleRate: WAV_SAMPLE_RATE,
    duration: n / WAV_SAMPLE_RATE,
    peak,
    rms: Math.sqrt(sumSq / n),
  };
}
