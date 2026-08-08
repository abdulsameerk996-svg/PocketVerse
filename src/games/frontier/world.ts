import { createRng } from '../../core/utils/rng';
import { BOSSES, HALF_W } from './content';
import type { BiomeId, BossId, Landmark } from './types';

/**
 * FRONTIER WORLD GENERATION
 *
 * The same seed produces the same world: biome field, landmarks, decorations.
 * Hash-based value noise keeps it cheap and smooth; everything is pure so the
 * sim harness can assert determinism in Node.
 */

const CELL = 22;

/** Deterministic [0,1) hash of a grid point. */
function hash2(x: number, z: number, seed: number): number {
  let h = (seed ^ (Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca6b))) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise — bilinear interp of a random field. */
function noise(x: number, z: number, seed: number): number {
  const xi = Math.floor(x / CELL);
  const zi = Math.floor(z / CELL);
  const fx = (x / CELL - xi + 1) % 1;
  const fz = (z / CELL - zi + 1) % 1;
  const a = hash2(xi, zi, seed);
  const b = hash2(xi + 1, zi, seed);
  const c = hash2(xi, zi + 1, seed);
  const d = hash2(xi + 1, zi + 1, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const ab = a + (b - a) * sx;
  const cd = c + (d - c) * sx;
  return ab + (cd - ab) * sz;
}

/**
 * Biome field. The centre is always Meadow so a fresh run starts somewhere
 * safe, and the outer fringe is always Danger Zone.
 *
 * Between those, the biome is a radial band whose boundary is jittered by
 * deterministic value noise — organic edges, but *guaranteed* coverage: every
 * seed contains all four biomes, which is what keeps boss arenas placeable and
 * quests completable. A purely noise-driven field could (and did) miss an
 * entire biome for a given seed.
 */
export function biomeAt(x: number, z: number, seed: number): BiomeId {
  const d = Math.hypot(x, z);
  if (d < 12) return 'meadow';
  if (d > HALF_W - 12) return 'danger';
  const band = d + (noise(x, z, seed + 7) - 0.5) * 9;
  if (band < 16.5) return 'meadow';
  if (band < 23.5) return 'forest';
  if (band < 30.5) return 'ruins';
  return 'danger';
}

export type Decoration = { x: number; z: number; kind: 'tree' | 'rock' | 'pillar' | 'crystal'; scale: number };

/**
 * Deterministic landmark placement: three boss arenas (one per boss biome) and
 * three sight landmarks. Positions are derived from the seed via a dedicated
 * RNG so adding a landmark later cannot reshuffle the existing ones.
 */
export function makeLandmarks(seed: number): Landmark[] {
  const rng = createRng(seed ^ 0xf10a71);
  const arena = (boss: BossId): Landmark => {
    const def = BOSSES[boss];
    // Keep boss arenas inside the world with a wide margin.
    const x = (rng() - 0.5) * (HALF_W * 2 - 26);
    const z = (rng() - 0.5) * (HALF_W * 2 - 26);
    return { id: `lm_${boss}`, name: def.name, biome: def.biome, x, z, kind: 'boss', boss, discovered: false };
  };
  const sight = (id: string, name: string, x: number, z: number): Landmark => ({
    id,
    name,
    biome: biomeAt(x, z, seed),
    x,
    z,
    kind: 'sight',
    discovered: false,
  });

  const list: Landmark[] = [
    arena('warden'),
    arena('rootbeast'),
    arena('voidengine'),
    sight('lm_camp', 'The Last Camp', -16, -14),
    sight('lm_obelisk', 'The Sunken Obelisk', 18, 20),
    sight('lm_geyser', 'The Glass Geyser', 8, -24),
  ];

  // Force each boss into a region that matches its biome: resample with a
  // different offset until biomeAt agrees (bounded, deterministic).
  for (const lm of list) {
    if (lm.kind !== 'boss') continue;
    let guard = 0;
    while (biomeAt(lm.x, lm.z, seed) !== lm.biome && guard < 40) {
      const x = (rng() - 0.5) * (HALF_W * 2 - 26);
      const z = (rng() - 0.5) * (HALF_W * 2 - 26);
      lm.x = x;
      lm.z = z;
      guard += 1;
    }
  }

  // Guarantee every biome is represented (sanity for quests/objectives): if a
  // biome did not win any boss arena or sight, search deterministically for a
  // point where the biome field actually is that biome.
  for (const b of ['forest', 'ruins', 'danger'] as BiomeId[]) {
    if (list.some((lm) => lm.biome === b)) continue;
    const pt = findBiomePoint(rng, seed, b);
    if (pt) list.push(sight(`lm_${b}`, `The ${b} threshold`, pt[0], pt[1]));
  }
  return list;
}

/** Bounded deterministic search for a point whose biome field is `b`. */
function findBiomePoint(
  rng: ReturnType<typeof createRng>,
  seed: number,
  b: BiomeId,
): [number, number] | null {
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    const x = (rng() - 0.5) * (HALF_W * 2 - 8);
    const z = (rng() - 0.5) * (HALF_W * 2 - 8);
    if (biomeAt(x, z, seed) === b) return [x, z];
  }
  return null;
}

/**
 * Deterministic decoration field for the renderer. Pure visual — the sim never
 * reads this.
 */
export function decorations(seed: number): Decoration[] {
  const rng = createRng(seed ^ 0xdec0);
  const out: Decoration[] = [];
  let i = 0;
  while (i < 210 && out.length < 210) {
    i += 1;
    const x = (rng() - 0.5) * (HALF_W * 2 - 6);
    const z = (rng() - 0.5) * (HALF_W * 2 - 6);
    const b = biomeAt(x, z, seed);
    const kind: Decoration['kind'] =
      b === 'forest' ? 'tree' : b === 'ruins' ? 'pillar' : b === 'danger' ? 'crystal' : 'rock';
    const p = rng();
    if (b === 'meadow' && p < 0.45) continue; // meadows are open
    out.push({ x, z, kind, scale: 0.8 + rng() * 0.7 });
  }
  return out;
}
