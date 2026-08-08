/**
 * ============================================================================
 *  DODGE RAIN — falling-hazard survival logic
 * ============================================================================
 *
 * Pure and worklet-safe. The playfield is normalised to 0..1 on both axes
 * (y grows downward, so the top of the screen is 0). A seeded rng reproduces
 * the exact same storm; Math.random in the surface is the only divergence
 * between the app and the harness.
 */

export const DROP_POOL = 22;
export const PLAYER_R = 0.042;
export const PLAYER_Y = 0.84;
export const DROP_R = 0.035;
export const START_LIVES = 3;

export type Drop = {
  active: boolean;
  /** 0..1 horizontal lane. */
  x: number;
  /** 0..1 vertical position, 0 = top. */
  y: number;
  r: number;
  /** y-units per second. */
  speed: number;
  /** True once the drop has passed the player line without a hit. */
  passed: boolean;
};

export type RainState = {
  time: number;
  over: boolean;
  lives: number;
  dodges: number;
  score: number;
  nextSpawn: number;
  drops: Drop[];
};

export function makeRain(): RainState {
  return {
    time: 0,
    over: false,
    lives: START_LIVES,
    dodges: 0,
    score: 0,
    nextSpawn: 1.1,
    drops: Array.from({ length: DROP_POOL }, () => ({
      active: false, x: 0, y: 0, r: DROP_R, speed: 0, passed: false,
    })),
  };
}

/** Seconds between spawns — the storm thickens with time. */
export function dropInterval(time: number): number {
  return Math.max(0.4, 1.12 - time / 40);
}

/** Fall speed in y-units/s — grows with time, never unbounded. */
export function dropSpeed(time: number): number {
  return Math.min(1.05, 0.24 + time / 16);
}

export function runScore(time: number, dodges: number): number {
  return Math.round(time * 10 + dodges * 4);
}

/** Find a free pool slot and fill it. Returns true if a drop spawned. */
export function spawnDrop(state: RainState, rand: () => number): boolean {
  for (const d of state.drops) {
    if (d.active) continue;
    d.active = true;
    d.x = rand();
    d.y = -0.06;
    d.speed = dropSpeed(state.time);
    d.passed = false;
    return true;
  }
  return false;
}

/**
 * Advance one fixed step. `playerX` is the normalised player lane.
 * Returns the number of hits the player took this step.
 */
export function stepRain(
  state: RainState,
  rand: () => number,
  dt: number,
  playerX: number,
): number {
  'worklet';
  if (state.over) return 0;
  state.time += dt;

  state.nextSpawn -= dt;
  if (state.nextSpawn <= 0) {
    state.nextSpawn = dropInterval(state.time);
    spawnDrop(state, rand);
  }

  const reach = DROP_R + PLAYER_R;
  let hits = 0;
  for (const d of state.drops) {
    if (!d.active) continue;
    d.y += d.speed * dt;
    const atLine = d.y + d.r >= PLAYER_Y;
    if (atLine) {
      if (Math.abs(d.x - playerX) < reach) {
        d.active = false;
        state.lives -= 1;
        hits += 1;
        if (state.lives <= 0) {
          state.over = true;
          state.score = runScore(state.time, state.dodges);
          return hits;
        }
        continue;
      }
      if (!d.passed) {
        d.passed = true;
        state.dodges += 1;
      }
    }
    if (d.y - d.r > 1.05) d.active = false;
  }

  state.score = runScore(state.time, state.dodges);
  return hits;
}
