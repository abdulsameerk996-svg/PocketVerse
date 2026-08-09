import { Platform } from 'react-native';
import { useTycoon } from './store';

/**
 * Minimal WebAudio synth — zero assets, zero dependencies.
 *
 * Web: tiny oscillator envelopes. Native: no-op (expo-haptics covers feedback
 * on device). All cues are synthesised, so there is nothing to download or
 * license. The AudioContext is created lazily on the first play (browsers
 * require a user gesture before audio can start).
 */

type Cue = 'tap' | 'buy' | 'upgrade' | 'milestone' | 'prestige' | 'error';

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function tone(
  audio: AudioContext,
  freq: number,
  start: number,
  duration: number,
  volume = 0.16,
  type: OscillatorType = 'triangle',
) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(start);
  osc.stop(start + duration + 0.03);
}

function noiseBurst(audio: AudioContext, start: number, duration: number, volume = 0.05) {
  const buffer = audio.createBuffer(1, audio.sampleRate * duration, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  src.connect(gain).connect(audio.destination);
  src.start(start);
}

export function playCue(cue: Cue) {
  if (muted) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') void audio.resume();
  const now = audio.currentTime;

  switch (cue) {
    case 'tap':
      tone(audio, 620 + Math.random() * 80, now, 0.08, 0.07, 'sine');
      break;
    case 'buy':
      tone(audio, 520, now, 0.09, 0.12);
      tone(audio, 780, now + 0.07, 0.12, 0.12);
      noiseBurst(audio, now, 0.05, 0.04);
      break;
    case 'upgrade':
      tone(audio, 523, now, 0.1, 0.13);
      tone(audio, 659, now + 0.09, 0.1, 0.13);
      tone(audio, 784, now + 0.18, 0.16, 0.13);
      break;
    case 'milestone':
      tone(audio, 587, now, 0.1, 0.13);
      tone(audio, 880, now + 0.1, 0.12, 0.13);
      tone(audio, 1175, now + 0.2, 0.2, 0.12);
      noiseBurst(audio, now, 0.12, 0.03);
      break;
    case 'prestige':
      tone(audio, 523, now, 0.12, 0.14);
      tone(audio, 659, now + 0.12, 0.12, 0.14);
      tone(audio, 784, now + 0.24, 0.12, 0.14);
      tone(audio, 1047, now + 0.36, 0.3, 0.14);
      noiseBurst(audio, now + 0.36, 0.2, 0.04);
      break;
    case 'error':
      tone(audio, 220, now, 0.12, 0.1, 'sawtooth');
      break;
  }
}

/** Keep the synth in sync with the Sound setting. */
export function syncSoundMute() {
  muted = !useTycoon.getState().settings.sound;
}
