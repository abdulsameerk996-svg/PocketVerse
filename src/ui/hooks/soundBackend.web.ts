import { setSoundSink } from './useSound';
import { MIX, VOICES } from './soundVoices';

/**
 * ============================================================================
 *  AUDIO BACKEND — WEB
 * ============================================================================
 *
 * PocketVerse ships no binary assets on purpose (docs/ASSETS.md), and adding
 * twenty .m4a files just to make the web build audible would break that for
 * every platform. The browser already has a synthesiser built in, so every cue
 * is *generated* here — a few oscillators and a noise burst per sound, a few
 * hundred bytes of code instead of a megabyte of samples. The cue table itself
 * lives in `soundVoices.ts`, shared with the native backend.
 *
 * This plugs into the existing `setSoundSink` seam. Not one `play()` call site
 * changes, which is the entire reason those cues were written before the audio
 * existed.
 *
 * Constraints this respects:
 *   · Browsers refuse to start an AudioContext before a user gesture, so the
 *     context is created lazily and resumed on the first real interaction.
 *   · Nodes are created per cue and disposed on `ended` — a game fires hundreds
 *     of these per run and leaking oscillators would eventually stall the tab.
 *   · The Sound setting is honoured upstream in `useSound.play`, so there is no
 *     second settings check here.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = MIX;
    master.connect(ctx.destination);

    // One second of white noise, reused by every percussive cue.
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/**
 * Browsers start an AudioContext suspended until the page has seen a real
 * gesture. Resume on the first one, then stop listening.
 */
function armOnFirstGesture() {
  if (typeof window === 'undefined') return;
  const resume = () => {
    const c = audio();
    if (c && c.state === 'suspended') void c.resume();
    if (c && c.state === 'running') detach();
  };
  const detach = () => {
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
    window.removeEventListener('touchstart', resume);
  };
  window.addEventListener('pointerdown', resume, { passive: true });
  window.addEventListener('keydown', resume);
  window.addEventListener('touchstart', resume, { passive: true });
}

function ramp(param: AudioParam, peak: number, now: number, duration: number, attack: number) {
  const attackTime = Math.max(0.004, duration * attack);
  param.setValueAtTime(0.0001, now);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attackTime);
  param.exponentialRampToValueAtTime(0.0001, now + duration);
}

export function installSound() {
  if (typeof window === 'undefined') return;
  armOnFirstGesture();

  setSoundSink((cue, opts) => {
    const c = audio();
    if (!c || !master) return;
    // Still waiting on a gesture — drop the cue rather than queueing a burst
    // that would all fire at once the moment the context starts.
    if (c.state !== 'running') {
      void c.resume();
      return;
    }

    const voice = VOICES[cue];
    if (!voice) return;

    const now = c.currentTime;
    const volume = voice.gain * (opts?.volume ?? 1);
    const rate = opts?.rate ?? 1;
    const duration = voice.duration / rate;

    const out = c.createGain();
    ramp(out.gain, volume, now, duration, voice.attack);
    out.connect(master);

    const tones: OscillatorNode[] = [];
    const mk = (freqFrom: number, freqTo: number, gain: number) => {
      const osc = c.createOscillator();
      osc.type = voice.wave;
      osc.frequency.setValueAtTime(freqFrom * rate, now);
      if (freqTo !== freqFrom) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(freqTo * rate, 20), now + duration);
      }
      const g = c.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(out);
      tones.push(osc);
    };

    mk(voice.from, voice.to, 1);
    // `detune` is in cents: 702 ≈ a perfect fifth, 386 ≈ a major third.
    if (voice.detune) {
      const ratio = Math.pow(2, voice.detune / 1200);
      mk(voice.from * ratio, voice.to * ratio, 0.5);
    }

    let noise: AudioBufferSourceNode | null = null;
    if (voice.noise && noiseBuffer) {
      noise = c.createBufferSource();
      noise.buffer = noiseBuffer;
      const band = c.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = voice.from * 2;
      band.Q.value = 0.8;
      const ng = c.createGain();
      ng.gain.value = voice.noise;
      noise.connect(band).connect(ng).connect(out);
    }

    for (const osc of tones) {
      osc.start(now);
      osc.stop(now + duration);
    }
    noise?.start(now);
    noise?.stop(now + duration);

    // Release the graph once it has finished, or a long session leaks nodes.
    const last = tones[tones.length - 1];
    last.onended = () => {
      out.disconnect();
      for (const osc of tones) osc.disconnect();
      noise?.disconnect();
    };
  });
}
