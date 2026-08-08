/*
 * Audio regression suite — renders every cue through the exact synthWav.ts the
 * app ships (compiled from src, not a copy) and checks the WAV structure,
 * amplitude and duration. The synth and the voice table are pure modules, so
 * this is execution, not inference.
 *
 * The `require` of the compiled modules doubles as a coupling guard: if someone
 * ever drags React Native or a DOM dependency into the synth, these requires
 * crash here instead of on a device.
 */
const { renderWav, WAV_SAMPLE_RATE } = require('./build/ui/hooks/synthWav.js');
const { VOICES } = require('./build/ui/hooks/soundVoices.js');
const { renderTrack, MUSIC_TRACK_IDS } = require('./build/ui/hooks/musicGen.js');

// Must match the `SoundCue` union in src/ui/hooks/useSound.ts exactly.
const EXPECTED_CUES = [
  'ui.tap', 'ui.back', 'ui.error',
  'reward.coin', 'reward.chest', 'reward.levelup',
  'game.start', 'game.over', 'game.collect', 'game.hit', 'game.jump',
  'game.crash', 'game.splash', 'game.harvest',
  'rhythm.perfect', 'rhythm.miss',
  'pet.happy', 'pet.eat',
];

let failures = 0;
function check(name, cond, detail) {
  if (!cond) failures++;
  console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : '  ' + detail}`);
}

const u8 = (arr, off) => arr[off];
const u16 = (arr, off) => arr[off] | (arr[off + 1] << 8);
const u32 = (arr, off) => u16(arr, off) | (u16(arr, off + 2) << 16);
const magic = (arr, off, s) => {
  for (let i = 0; i < s.length; i++) if (arr[off + i] !== s.charCodeAt(i)) return false;
  return true;
};

console.log('Cue inventory');
check(
  'VOICES covers SoundCue exactly',
  EXPECTED_CUES.length === Object.keys(VOICES).length &&
    EXPECTED_CUES.every((c) => Object.prototype.hasOwnProperty.call(VOICES, c)),
  `${Object.keys(VOICES).length} cues`
);

console.log('\nPer-cue WAV checks');
for (const cue of EXPECTED_CUES) {
  const w = renderWav(cue);
  const b = w.bytes;

  check(`${cue}: RIFF/WAVE magic`, magic(b, 0, 'RIFF') && magic(b, 8, 'WAVE'));
  check(`${cue}: PCM fmt`, u16(b, 20) === 1, `fmt ${u16(b, 20)}`);
  check(`${cue}: mono`, u16(b, 22) === 1);
  check(`${cue}: sample rate`, u32(b, 24) === WAV_SAMPLE_RATE, `${u32(b, 24)}`);
  check(`${cue}: 16-bit`, u16(b, 34) === 16);
  check(`${cue}: data chunk`, magic(b, 36, 'data'));

  const dataLen = u32(b, 40);
  const expectedLen = Math.round(w.duration * WAV_SAMPLE_RATE) * 2;
  check(`${cue}: data length`, Math.abs(dataLen - expectedLen) <= 2, `${dataLen} vs ${expectedLen}`);

  check(`${cue}: audible peak`, w.peak > 0.02, `peak ${w.peak.toFixed(4)}`);
  check(`${cue}: no clipping`, w.peak <= 0.999, `peak ${w.peak.toFixed(4)}`);
  check(`${cue}: has energy`, w.rms > 0.001, `rms ${w.rms.toFixed(5)}`);

  console.log(
    `        ${cue}: ${w.duration.toFixed(3)}s, ${b.length} bytes, peak ${w.peak.toFixed(3)}, rms ${w.rms.toFixed(4)}`
  );
}

console.log('\nRate variants');
const normal = renderWav('game.collect');
const fast = renderWav('game.collect', { rate: 2 });
check('rate 2 halves duration', Math.abs(fast.duration - normal.duration / 2) < 1e-9, `${normal.duration} -> ${fast.duration}`);
check('fast variant stays audible', fast.peak > 0.02, `peak ${fast.peak.toFixed(4)}`);
const slow = renderWav('game.crash', { rate: 0.5 });
check('rate 0.5 doubles duration', Math.abs(slow.duration - renderWav('game.crash').duration * 2) < 1e-9, slow.duration.toFixed(3));

console.log('\nDeterminism');
const a = renderWav('game.crash');
const b2 = renderWav('game.crash');
let same = a.bytes.length === b2.bytes.length;
if (same) for (let i = 0; i < a.bytes.length; i++) if (a.bytes[i] !== b2.bytes[i]) { same = false; break; }
check('noise cue renders identically each time', same);

console.log('\nMusic tracks');
const TRACK_DURATIONS = { hub: [9, 16], action: [5, 12], chill: [11, 18] };
for (const id of MUSIC_TRACK_IDS) {
  const w = renderTrack(id);
  const b = w.bytes;
  check(`${id}: RIFF/WAVE magic`, magic(b, 0, 'RIFF') && magic(b, 8, 'WAVE'));
  check(
    `${id}: PCM mono 16-bit @22050`,
    u16(b, 20) === 1 && u16(b, 22) === 1 && u32(b, 24) === WAV_SAMPLE_RATE && u16(b, 34) === 16
  );
  const [minD, maxD] = TRACK_DURATIONS[id];
  check(`${id}: duration in range`, w.duration >= minD && w.duration <= maxD, `${w.duration.toFixed(2)}s`);
  check(`${id}: audible`, w.peak > 0.01, `peak ${w.peak.toFixed(3)}`);
  check(`${id}: no clipping`, w.peak <= 0.999, `peak ${w.peak.toFixed(3)}`);
  check(`${id}: has energy`, w.rms > 0.001, `rms ${w.rms.toFixed(4)}`);
  // Loop seam: both ends must fade to silence so the loop point never clicks.
  let head = 0;
  for (let i = 0; i < 100; i++) head = Math.max(head, Math.abs(w.samples[i]));
  let tail = 0;
  for (let i = Math.max(0, w.samples.length - 100); i < w.samples.length; i++) tail = Math.max(tail, Math.abs(w.samples[i]));
  check(`${id}: seamless loop (quiet ends)`, head < 0.01 && tail < 0.01, `head ${head.toFixed(4)} tail ${tail.toFixed(4)}`);
  const again = renderTrack(id);
  let same = again.bytes.length === b.length;
  if (same) for (let i = 0; i < b.length; i++) if (again.bytes[i] !== b[i]) { same = false; break; }
  check(`${id}: deterministic`, same);
  console.log(`        ${id}: ${w.duration.toFixed(2)}s, ${b.length} bytes, peak ${w.peak.toFixed(3)}, rms ${w.rms.toFixed(4)}`);
}

console.log(failures === 0 ? '\nALL AUDIO CHECKS PASSED' : `\n${failures} AUDIO CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
