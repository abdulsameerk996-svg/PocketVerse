/**
 * ============================================================================
 *  LASER SURVIVE — rotating-beam arena logic
 * ============================================================================
 *
 * Pure and worklet-safe. The arena is normalised to 0..1 with the emitter at
 * (0.5, 0.5). Each beam is a full line through the centre rotating at an
 * angular speed that escalates with time; the count grows on a fixed
 * schedule, so a run is fully deterministic with no rng at all.
 */

export const PLAYER_R = 0.024;
export const MAX_BEAMS = 4;
export const START_LIVES = 3;
const CENTER = 0.5;

export type Beam = {
  active: boolean;
  /** Line angle in radians. */
  angle: number;
  /** Signed angular speed (rad/s). */
  omega: number;
  /** Half-width of the visible beam, in normalised units. */
  half: number;
};

export type LaserState = {
  time: number;
  over: boolean;
  hp: number;
  score: number;
  dodges: number;
  prevX: number;
  prevY: number;
  beams: Beam[];
};

export function makeLasers(): LaserState {
  return {
    time: 0,
    over: false,
    hp: START_LIVES,
    score: 0,
    dodges: 0,
    prevX: CENTER,
    prevY: CENTER,
    beams: Array.from({ length: MAX_BEAMS }, () => ({
      active: false, angle: 0, omega: 0, half: 0.028,
    })),
  };
}

/** How many beams are sweeping right now. */
export function beamCount(time: number): number {
  return Math.min(MAX_BEAMS, 2 + Math.floor(time / 25));
}

/** Angular speed — escalates forever, never unbounded. */
export function beamSpeed(time: number): number {
  return Math.min(2.4, 0.42 + time * 0.012);
}

/** Score: time-based survival plus a small premium per life left. */
export function laserScore(time: number, hp: number, dodges: number): number {
  return Math.round(time * 10 + hp * 25 + dodges * 6);
}

/** Normalised perpendicular distance from a point to a beam line. */
export function distToBeam(x: number, y: number, angle: number): number {
  return Math.abs((x - CENTER) * -Math.sin(angle) + (y - CENTER) * Math.cos(angle));
}

/**
 * Advance one fixed step. `px, py` are the player's *new* position; the state
 * keeps the previous one for close-call counting. Returns the number of hits
 * (0 when the player is invulnerable or already over).
 */
export function stepLasers(
  state: LaserState,
  dt: number,
  px: number,
  py: number,
  invuln: number,
): number {
  'worklet';
  if (state.over) return 0;
  state.time += dt;

  const count = beamCount(state.time);
  const speed = beamSpeed(state.time);
  for (let i = 0; i < MAX_BEAMS; i++) {
    const b = state.beams[i];
    if (i < count) {
      if (!b.active) {
        b.active = true;
        b.angle = i * (Math.PI / 2) + 0.4;
        b.omega = (i % 2 === 0 ? 1 : -1) * speed;
      } else {
        b.omega = (i % 2 === 0 ? 1 : -1) * speed;
      }
      b.angle = (b.angle + b.omega * dt) % (Math.PI * 2);
      if (b.angle < 0) b.angle += Math.PI * 2;
    } else {
      b.active = false;
    }
  }

  // close calls: the segment prev→now crosses a beam line without a hit
  for (const b of state.beams) {
    if (!b.active) continue;
    const s1 = (state.prevX - CENTER) * -Math.sin(b.angle) + (state.prevY - CENTER) * Math.cos(b.angle);
    const s2 = (px - CENTER) * -Math.sin(b.angle) + (py - CENTER) * Math.cos(b.angle);
    if (s1 * s2 < 0) state.dodges += 1;
  }

  state.prevX = px;
  state.prevY = py;

  let hits = 0;
  if (invuln <= 0) {
    for (const b of state.beams) {
      if (!b.active) continue;
      if (distToBeam(px, py, b.angle) < b.half + PLAYER_R) {
        state.hp -= 1;
        hits += 1;
        if (state.hp <= 0) {
          state.over = true;
          break;
        }
        break; // one beam contact per frame
      }
    }
  }

  state.score = laserScore(state.time, state.hp, state.dodges);
  return hits;
}
