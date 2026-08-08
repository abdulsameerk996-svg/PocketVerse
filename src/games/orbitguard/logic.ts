/**
 * ============================================================================
 *  ORBIT GUARD — rotating-shield core defence logic
 * ============================================================================
 *
 * Pure and worklet-safe. Orbs spiral in from the arena rim toward the core at
 * (0.5, 0.5); the player swings a shield arc (centre angle `shieldA`, half
 * width `shieldHalf`) to deflect them. The only randomness is orb spawn
 * angles, driven by the caller's rng.
 */

export const ORB_POOL = 14;
export const START_LIVES = 3;
const CENTER = 0.5;

export type Orb = {
  active: boolean;
  /** Angle from the core, radians. */
  angle: number;
  /** Distance from the core, 0..1 (0.46 = rim). */
  dist: number;
  speed: number;
  r: number;
};

export type OrbitState = {
  time: number;
  over: boolean;
  hp: number;
  score: number;
  blocks: number;
  nextSpawn: number;
  shieldA: number;
  orbs: Orb[];
};

export function makeOrbit(): OrbitState {
  return {
    time: 0,
    over: false,
    hp: START_LIVES,
    score: 0,
    blocks: 0,
    nextSpawn: 0.9,
    shieldA: 0,
    orbs: Array.from({ length: ORB_POOL }, () => ({
      active: false, angle: 0, dist: 0.46, speed: 0, r: 0.028,
    })),
  };
}

/** Orb approach speed (distance-units/s) — escalates, capped. */
export function orbSpeed(time: number): number {
  return Math.min(0.52, 0.13 + time * 0.012);
}

/** Seconds between orb spawns — thickens with time. */
export function orbInterval(time: number): number {
  return Math.max(0.4, 1.0 - time / 60);
}

/** Shield half-width shrinks as the run goes on. */
export function shieldHalf(time: number): number {
  return Math.max(0.32, 0.5 - time * 0.004);
}

export function orbitScore(time: number, blocks: number, hp: number): number {
  return Math.round(time * 8 + blocks * 12 + hp * 20);
}

/** Smallest signed difference between two angles, in [-π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Fill a free orb slot at the rim with a random angle. */
export function spawnOrb(state: OrbitState, rand: () => number): boolean {
  for (const o of state.orbs) {
    if (o.active) continue;
    o.active = true;
    o.angle = rand() * Math.PI * 2;
    o.dist = 0.46;
    o.speed = orbSpeed(state.time);
    return true;
  }
  return false;
}

/**
 * Advance one fixed step with the current shield angle. Returns the number of
 * core hits this step.
 */
export function stepOrbit(
  state: OrbitState,
  rand: () => number,
  dt: number,
  shieldA: number,
): number {
  'worklet';
  if (state.over) return 0;
  state.time += dt;
  state.shieldA = shieldA;
  const half = shieldHalf(state.time);

  state.nextSpawn -= dt;
  if (state.nextSpawn <= 0) {
    state.nextSpawn = orbInterval(state.time);
    spawnOrb(state, rand);
  }

  let hits = 0;
  for (const o of state.orbs) {
    if (!o.active) continue;
    o.dist -= o.speed * dt;
    if (o.dist < 0.03) {
      o.active = false;
      state.hp -= 1;
      hits += 1;
      if (state.hp <= 0) {
        state.over = true;
        break;
      }
      continue;
    }
    if (o.dist < 0.42 && Math.abs(angleDiff(o.angle, shieldA)) < half) {
      o.active = false;
      state.blocks += 1;
      continue;
    }
    if (o.dist <= 0.03) o.active = false;
  }

  state.score = orbitScore(state.time, state.blocks, state.hp);
  return hits;
}
