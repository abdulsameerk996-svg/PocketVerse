import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { setSoundSink, type SoundCue } from './useSound';
import { renderWav } from './synthWav';

/**
 * Audio backend — native.
 *
 * PocketVerse ships no audio binaries (docs/ASSETS.md), and the browser has a
 * built-in synthesiser while the phone does not. So this backend renders each
 * cue to a small 16-bit PCM WAV with the *same* voice math the web backend uses
 * (`synthWav.ts`), writes it to the app cache the first time it is heard, and
 * plays it through expo-audio.
 *
 * This plugs into the same `setSoundSink` seam as the web backend — not one
 * `play()` call site changes.
 *
 * Constraints this respects:
 *   · `rate` is baked into the WAV (duration + pitch), matching the web
 *     backend's behaviour instead of expo-audio's pitch-preserving rate change.
 *   · Players are created once per (cue, rate) variant and reused — a game
 *     fires hundreds of cues per run and churning players would stutter.
 *   · The Sound setting is honoured upstream in `useSound.play`, so there is no
 *     second settings check here.
 */

/** Cached player per (cue, rate) variant; the promise dedupes a burst of plays. */
const players = new Map<string, Promise<AudioPlayer>>();

let dirReady: Promise<string> | null = null;

function audioDir(): Promise<string> {
  if (!dirReady) {
    dirReady = (async () => {
      const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
      const dir = `${base}pocketverse-audio/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      return dir;
    })();
  }
  return dirReady;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Minimal base64 encoder — Hermes has no Buffer, and the cue files are tiny. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

function playerFor(cue: SoundCue, rate: number): Promise<AudioPlayer> {
  const key = rate === 1 ? cue : `${cue}|${rate}`;
  let pending = players.get(key);
  if (!pending) {
    pending = (async () => {
      const { bytes } = renderWav(cue, { rate });
      const name = key.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
      const uri = `${await audioDir()}${name}.wav`;
      await FileSystem.writeAsStringAsync(uri, toBase64(bytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
      return createAudioPlayer({ uri });
    })();
    players.set(key, pending);
  }
  return pending;
}

export function installSound() {
  // SFX should never take over the session or the device's other audio.
  void setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
  }).catch(() => {});

  setSoundSink((cue, opts) => {
    const rate = Math.min(2, Math.max(0.25, opts?.rate ?? 1));
    playerFor(cue, rate)
      .then((player) => {
        player.volume = Math.min(1, Math.max(0, opts?.volume ?? 1));
        // seekTo(0) then play: retriggering a finished clip starts cleanly.
        return player.seekTo(0).then(() => player.play());
      })
      .catch(() => {
        // Synthesis or disk failure — stay silent rather than crash the game.
      });
  });
}
