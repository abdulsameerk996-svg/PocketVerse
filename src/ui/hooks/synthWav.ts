import { MIX, VOICES, type SoundCue } from './soundVoices';

/**
 * Pure WAV synthesizer — the native counterpart to the WebAudio backend.
 *
 * The web backend (`soundBackend.web.ts`) renders each cue with a handful of
 * oscillators and a noise burst through the browser's AudioContext. Native has
 * no built-in synthesiser, so this file renders the *same* voice math to a
 * plain 16-bit PCM mono WAV, which the native backend (`soundBackend.ts`)
 * writes to the app cache and plays through expo-audio.
 *
 * It is deliberately free of React, React Native and DOM imports so it can run
 * in Node — that is what makes `tools/audio-sim` (and the per-cue regression
 * checks in it) possible.
 */

/** Sample rate for generated WAVs — plenty for short SFX, half the size of 44.1k. */
export const WAV_SAMPLE_RATE = 22050;

export type RenderedWav = {
  /** Complete RIFF/WAVE file bytes (16-bit PCM, mono). */
  bytes: Uint8Array;
  sampleRate: number;
  /** Rendered duration in seconds (cue duration divided by `rate`). */
  duration: number;
  /** Peak absolute sample amplitude after clipping, 0..1. */
  peak: number;
  /** Root-mean-square amplitude, 0..1. */
  rms: number;
};

/**
 * Deterministic PRNG (mulberry32) so the noise component of a cue is identical
 * on every render — the audio-sim checks stay reproducible.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** RBJ cookbook 2nd-order bandpass (constant 0 dB peak gain) — applied in place. */
function bandpass(data: Float64Array, freq: number, q: number, sampleRate: number): void {
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
}

/** Waveform shapes from a phase in radians — matches WebAudio's oscillators. */
function shape(wave: 'sine' | 'square' | 'triangle' | 'sawtooth', phase: number): number {
  switch (wave) {
    case 'square':
      return Math.sin(phase) >= 0 ? 1 : -1;
    case 'triangle':
      return (2 / Math.PI) * Math.asin(Math.sin(phase));
    case 'sawtooth': {
      const p = (phase / (2 * Math.PI)) % 1;
      return 2 * (p < 0 ? p + 1 : p) - 1;
    }
    default:
      return Math.sin(phase);
  }
}

function wavBytes(samples: Float64Array, sampleRate: number): Uint8Array {
  const n = samples.length;
  const bytes = new Uint8Array(44 + n * 2);
  const dv = new DataView(bytes.buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[off + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + n * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return bytes;
}

/**
 * Render one cue to a WAV. `rate` mirrors the web backend's `opts.rate`: it
 * stretches duration and transposes the oscillator slide by the same factor
 * (a game firing `play(cue, { rate: 1.5 })` hears it faster and higher).
 */
export function renderWav(cue: SoundCue, opts?: { rate?: number }): RenderedWav {
  const voice = VOICES[cue];
  const rate = Math.min(2, Math.max(0.25, opts?.rate ?? 1));
  const duration = voice.duration / rate;
  const n = Math.max(2, Math.round(duration * WAV_SAMPLE_RATE));

  const f0 = voice.from * rate;
  const f1 = voice.to * rate;

  // Analytic phase for an exponential frequency slide: phase = 2π ∫ f(t) dt.
  const phaseAt = (t: number) => {
    if (Math.abs(f1 - f0) < 1e-6) return 2 * Math.PI * f0 * t;
    const k = Math.log(f1 / f0);
    return (2 * Math.PI * f0 * duration * (Math.exp((k * t) / duration) - 1)) / k;
  };

  const attack = Math.min(Math.max(0.004, duration * voice.attack), duration * 0.95);
  const peak = voice.gain * MIX;
  const detuneRatio = voice.detune ? Math.pow(2, voice.detune / 1200) : null;

  const tone = new Float64Array(n);
  const tone2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = phaseAt(i / WAV_SAMPLE_RATE);
    tone[i] = shape(voice.wave, p);
    if (detuneRatio) tone2[i] = shape(voice.wave, p * detuneRatio);
  }

  const noise = voice.noise ? new Float64Array(n) : null;
  if (noise) {
    const rnd = mulberry32(hashString(cue));
    for (let i = 0; i < n; i++) noise[i] = rnd() * 2 - 1;
    bandpass(noise, voice.from * 2, 0.8, WAV_SAMPLE_RATE);
  }

  const out = new Float64Array(n);
  let peakAmp = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const t = i / WAV_SAMPLE_RATE;
    // Mirrors WebAudio's exponentialRamp envelope: 0.0001 → peak over the
    // attack, then peak → 0.0001 over the rest of the duration.
    const env =
      t <= attack
        ? 0.0001 * Math.pow(peak / 0.0001, t / attack)
        : peak * Math.pow(0.0001 / peak, (t - attack) / (duration - attack));
    let s = tone[i] + (detuneRatio ? tone2[i] * 0.5 : 0);
    if (noise) s += noise[i] * voice.noise!;
    s = Math.max(-1, Math.min(1, s * env));
    out[i] = s;
    peakAmp = Math.max(peakAmp, Math.abs(s));
    sumSq += s * s;
  }

  return {
    bytes: wavBytes(out, WAV_SAMPLE_RATE),
    sampleRate: WAV_SAMPLE_RATE,
    duration,
    peak: peakAmp,
    rms: Math.sqrt(sumSq / n),
  };
}
