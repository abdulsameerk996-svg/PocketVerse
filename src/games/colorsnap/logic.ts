/**
 * ============================================================================
 *  COLOR SNAP — round generation + scoring math
 * ============================================================================
 *
 * Pure and deterministic-given-a-seed: `makeRound` produces a tile set where
 * the target appears exactly once, all tiles are distinct, and (at higher
 * levels) a near-miss "fake" shade joins the board. tools/quickgames-sim
 * exercises every invariant here.
 */

/** The palette. Indices are the colour identity used everywhere. */
export const SNAP_COLORS = [
  '#FF5D5D',
  '#4EA8FF',
  '#34E2A8',
  '#FFD166',
  '#C05CFF',
  '#FF8A3D',
  '#22D3EE',
  '#A3E635',
] as const;

export type Round = { target: number; tiles: number[]; fakes: number[] };

export function tileCount(level: number): number {
  return Math.min(SNAP_COLORS.length, 4 + Math.floor(level / 4));
}

/**
 * Build one round. `rng` must be a () => 0..1 generator (Math.random in the
 * surface, a seeded rng in the harness).
 */
export function makeRound(level: number, rng: () => number): Round {
  const count = tileCount(level);
  const target = Math.floor(rng() * SNAP_COLORS.length);
  const others = SNAP_COLORS.map((_, i) => i).filter((i) => i !== target);
  // Fisher–Yates on the slice we take.
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const tiles = [target, ...others.slice(0, count - 1)];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }

  // From level 5 a "fake" shade of the target joins the board — same hue,
  // darker, so speed is what separates the real tile from the trap. Picked
  // from the rng so the whole round is reproducible from a seed.
  const fakeSlot = Math.floor(rng() * tiles.length);
  const fakes = level >= 5 && tiles[fakeSlot] !== target ? [tiles[fakeSlot]] : [];
  return { target, tiles, fakes };
}

export function isFake(tile: number, fakes: number[], target: number): boolean {
  return tile !== target && fakes.includes(tile);
}

/** Seconds allowed for one round. Shrinks with level; luck buys time. */
export function roundTime(level: number, luck = 0): number {
  return Math.max(0.85, 3.1 - level * 0.13) * (1 + luck * 0.3);
}

/** Points for a hit: base 100 × combo, plus a speed bonus for fast answers. */
export function hitScore(streak: number, remaining: number): number {
  return Math.round(100 * (1 + Math.min(streak, 5) * 0.25) + Math.max(0, remaining) * 12);
}

/** Darken a hex colour for the fake-tile shade. */
export function shade(hex: string, amount = 0.55): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
