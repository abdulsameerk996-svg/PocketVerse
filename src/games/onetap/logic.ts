/**
 * ============================================================================
 *  ONE-TAP FLIGHT — one-button gravity-runner logic
 * ============================================================================
 *
 * Pure and worklet-safe. The bird lives in a normalised 0..1 column (y grows
 * downward, 0 = ceiling, 1 = ground) at a fixed x; pipes slide leftward and
 * spawn on a deterministic schedule driven by the caller's rng.
 */

export const BIRD_R = 0.026;
export const BIRD_X = 0.06;
export const PIPE_POOL = 6;
export const PIPE_W = 0.088;
export const START_GAP = 0.3;
export const MIN_GAP = 0.17;

export type Pipe = {
  active: boolean;
  /** Normalised x of the pipe's left edge. */
  x: number;
  /** Top of the gap (0..1). */
  gapY: number;
  /** Gap height (0..1). */
  gapH: number;
  passed: boolean;
};

export type FlightState = {
  time: number;
  y: number;
  vy: number;
  over: boolean;
  score: number;
  passes: number;
  nextSpawn: number;
  pipes: Pipe[];
};

export function makeFlight(): FlightState {
  return {
    time: 0,
    y: 0.45,
    vy: 0,
    over: false,
    score: 0,
    passes: 0,
    nextSpawn: 1.2,
    pipes: Array.from({ length: PIPE_POOL }, () => ({
      active: false, x: 0, gapY: 0.5, gapH: START_GAP, passed: false,
    })),
  };
}

export function gravity(): number {
  return 0.95;
}

export function flapImpulse(): number {
  return -0.34;
}

/** Pipe slide speed in x-units/s — ramps, capped. */
export function pipeSpeed(time: number): number {
  return Math.min(0.34, 0.15 + time / 40);
}

/** Gap height shrinks as the run goes on. */
export function gapHeight(time: number): number {
  return Math.max(MIN_GAP, START_GAP - time / 170);
}

export function pipeInterval(time: number): number {
  return Math.max(0.92, 1.62 - time / 55);
}

export function flightScore(time: number, passes: number): number {
  return Math.round(time * 9 + passes * 26);
}

/** Fill a free pipe slot at the right edge. Returns true if spawned. */
export function spawnPipe(state: FlightState, rand: () => number): boolean {
  for (const p of state.pipes) {
    if (p.active) continue;
    p.active = true;
    p.x = 1.02;
    p.gapH = gapHeight(state.time);
    p.gapY = 0.08 + rand() * Math.max(0.12, 0.84 - p.gapH);
    p.passed = false;
    return true;
  }
  return false;
}

/**
 * Advance one fixed step. `flap` is a fresh impulse this step (caller decides
 * whether to auto-repeat on hold). Returns the number of pipes passed.
 */
export function stepFlight(
  state: FlightState,
  rand: () => number,
  dt: number,
  flap: boolean,
): number {
  'worklet';
  if (state.over) return 0;
  state.time += dt;

  if (flap) state.vy = flapImpulse();
  state.vy += gravity() * dt;
  state.vy = Math.max(state.vy, -1.5);
  state.y += state.vy * dt;

  if (state.y < BIRD_R) {
    state.y = BIRD_R;
    state.over = true;
  } else if (state.y > 1 - BIRD_R) {
    state.y = 1 - BIRD_R;
    state.over = true;
  }
  if (state.over) {
    state.score = flightScore(state.time, state.passes);
    return 0;
  }

  state.nextSpawn -= dt;
  if (state.nextSpawn <= 0) {
    state.nextSpawn = pipeInterval(state.time);
    spawnPipe(state, rand);
  }

  const speed = pipeSpeed(state.time);
  let passed = 0;
  for (const p of state.pipes) {
    if (!p.active) continue;
    p.x -= speed * dt;
    if (!p.passed && p.x + PIPE_W < BIRD_X) {
      p.passed = true;
      p.active = false;
      state.passes += 1;
      passed += 1;
      continue;
    }
    if (p.x > BIRD_X + 0.14 || p.x + PIPE_W < BIRD_X) continue;
    const birdTop = state.y - BIRD_R;
    const birdBot = state.y + BIRD_R;
    if (birdTop < p.gapY || birdBot > p.gapY + p.gapH) {
      state.over = true;
      break;
    }
  }

  state.score = flightScore(state.time, state.passes);
  return passed;
}
