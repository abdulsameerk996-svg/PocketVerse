import { createRng, hashString } from '@/core/utils/rng';

export type SongDef = {
  id: string;
  name: string;
  artist: string;
  bpm: number;
  /** Seconds. */
  duration: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  glyph: string;
  colors: [string, string];
  minLevel: number;
};

export const SONGS: SongDef[] = [
  { id: 'song_pulse', name: 'First Pulse', artist: 'VERSE', bpm: 96, duration: 62, difficulty: 1, glyph: '🎵', colors: ['#7C5CFF', '#3B2A8C'], minLevel: 1 },
  { id: 'song_neon', name: 'Neon Rain', artist: 'VERSE', bpm: 118, duration: 74, difficulty: 2, glyph: '🌧️', colors: ['#22D3EE', '#1D4ED8'], minLevel: 1 },
  { id: 'song_drift', name: 'Drift Sequence', artist: 'VERSE', bpm: 132, duration: 80, difficulty: 3, glyph: '🌀', colors: ['#34E2A8', '#0F766E'], minLevel: 4 },
  { id: 'song_static', name: 'Static Bloom', artist: 'VERSE', bpm: 146, duration: 86, difficulty: 4, glyph: '⚡', colors: ['#FFB443', '#B45309'], minLevel: 7 },
  { id: 'song_void', name: 'Voidcore', artist: 'VERSE', bpm: 168, duration: 92, difficulty: 5, glyph: '🕳️', colors: ['#FF4D8D', '#7F1D4E'], minLevel: 11 },
];

export const LANES = 4;

export type Chart = { times: number[]; lanes: number[] };

/**
 * Charts are *generated*, not authored — deterministically, from the song id.
 * The same song always produces the same chart on every device, and adding a
 * song is one row of data. Patterns are built from musical units (beats,
 * eighths, bursts) rather than random noise so they feel played, not sprinkled.
 */
export function buildChart(song: SongDef): Chart {
  const rng = createRng(hashString(song.id));
  const beat = 60 / song.bpm;
  const times: number[] = [];
  const lanes: number[] = [];

  let t = 2.2; // lead-in
  let lastLane = Math.floor(rng() * LANES);
  const density = 0.35 + song.difficulty * 0.11;

  while (t < song.duration - 1.5) {
    const roll = rng();

    if (roll < density * 0.35) {
      // burst of four eighth notes walking across lanes
      const dir = rng() < 0.5 ? 1 : -1;
      for (let i = 0; i < 4; i++) {
        lastLane = (lastLane + dir + LANES) % LANES;
        times.push(t);
        lanes.push(lastLane);
        t += beat / 2;
      }
    } else if (roll < density * 0.55) {
      // double hit on two lanes
      const a = Math.floor(rng() * LANES);
      let b = (a + 1 + Math.floor(rng() * (LANES - 1))) % LANES;
      times.push(t, t);
      lanes.push(a, b);
      lastLane = b;
      t += beat;
    } else if (roll < density) {
      lastLane = Math.floor(rng() * LANES);
      times.push(t);
      lanes.push(lastLane);
      t += beat / 2;
    } else {
      lastLane = Math.floor(rng() * LANES);
      times.push(t);
      lanes.push(lastLane);
      t += beat;
    }
  }

  return { times, lanes };
}

export const JUDGE = {
  perfect: 0.06,
  great: 0.11,
  good: 0.16,
} as const;

export const LANE_COLORS = ['#FF6B6B', '#FFC53D', '#34E2A8', '#4EA8FF'];
