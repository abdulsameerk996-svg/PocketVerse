import type { Rng } from '@/core/utils/rng';
import {
  MAX_LAUNCH_SPEED,
  MIN_LAUNCH_SPEED,
  SELF_CARRY,
  TRANSFER,
  clamp,
  powerForTravel,
  speedForTravel,
  travelForSpeed,
} from './physics';
import type { Difficulty, Launch, PenBody, Table } from './types';

/**
 * ============================================================================
 *  PEN FIGHT — OPPONENT
 * ============================================================================
 *
 * The rival cannot cheat, and the shape of this file is the proof: it takes the
 * same two pen bodies and the same table the player can see, and returns a
 * `Launch` — the identical struct a human drag produces. It has no way to
 * express a shot a player could not also take, and it never touches the solver.
 *
 * ── How it plays ────────────────────────────────────────────────────────────
 *
 * An earlier version tried to be clever: aim off-centre so the impulse shoved
 * the target toward its nearest edge. Simulated against itself it lost to its
 * own easy setting, because that idea only works when the striker happens to be
 * on the far side of the target from that edge — the rest of the time it aims
 * deliberately wide for no gain. Accuracy was making it worse.
 *
 * So it now plays the shot that is actually available:
 *
 *   1. Aim at the target's centre. A centre hit pushes the target along the
 *      line of approach, which is the only push direction the striker controls.
 *   2. Choose power from the *travel model in `physics.ts`* — enough to cross
 *      the gap and then shove the target past whatever desk is behind it, in
 *      that direction.
 *   3. Don't ride your own pen off the edge doing it. Caution is the difference
 *      between a good player and a reckless one, and it is the main reason a
 *      hard rival beats an easy one.
 *
 * Difficulty is aim noise, power noise and caution. Nothing else.
 */

export type AiProfile = {
  /** Peak aim error in radians. */
  aimError: number;
  /** Peak power error, 0..1. */
  powerError: number;
  /** 0..1 — how much it avoids shots that send its own pen over. */
  caution: number;
  /** Sloppy sidespin; a tell that the rival is not a machine. */
  spin: number;
  /** Seconds of "thinking" before the flick lands. */
  delay: number;
};

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { aimError: 0.22, powerError: 0.28, caution: 0, spin: 0.55, delay: 0.75 },
  normal: { aimError: 0.09, powerError: 0.12, caution: 0.55, spin: 0.3, delay: 0.6 },
  hard: { aimError: 0.03, powerError: 0.045, caution: 0.95, spin: 0.15, delay: 0.45 },
};

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Casual',
  normal: 'Steady',
  hard: 'Ruthless',
};

/** Overshoot past the edge, so a shot that "just reaches" still scores. */
const PUSH_MARGIN = 0.8;
/** Keep this much desk between the striker's resting place and the drop. */
const SELF_MARGIN = 0.5;
/** Never flick so softly that the pens do not touch. */
const MIN_USEFUL_OVERRUN = 0.35;

export function chooseLaunch(
  self: PenBody,
  target: PenBody,
  table: Table,
  difficulty: Difficulty,
  rng: Rng,
  /**
   * Multiplier on the rival's aim and power error. This is how the player's
   * equipped `luck` reaches a game with no drop tables: a lucky desk is one
   * where the rival is having a slightly worse day.
   */
  errorScale = 1,
): Launch {
  const profile = AI_PROFILES[difficulty];
  const aimError = profile.aimError * errorScale;
  const powerError = profile.powerError * errorScale;

  let dx = target.x - self.x;
  let dz = target.z - self.z;
  const dist = Math.hypot(dx, dz) || 1;
  dx /= dist;
  dz /= dist;

  // Aim error is a rotation, not an offset, so a miss gets worse with distance
  // — the way a real one does.
  const jitter = (rng() * 2 - 1) * aimError;
  const cos = Math.cos(jitter);
  const sin = Math.sin(jitter);
  const dirX = dx * cos - dz * sin;
  const dirZ = dx * sin + dz * cos;

  // Distance to close before the capsules touch. Both pens are capsules, so
  // what matters is how far each one reaches along the line of approach —
  // a broadside target is a much nearer surface than an end-on one.
  const reach = Math.max(
    0,
    dist - extentAlong(target, dirX, dirZ) - extentAlong(self, dirX, dirZ),
  );
  // How much desk the target has behind it, in the direction it will be shoved.
  const roomTarget = roomAlong(target.x, target.z, dirX, dirZ, table);
  // And how much the striker has, on the same line.
  const roomSelf = roomAlong(self.x, self.z, dirX, dirZ, table);

  /*
   * Compose the shot through speed, never through distance.
   *
   *   shove the target `roomTarget + margin`   →  the speed it must leave at
   *   ÷ TRANSFER                               →  the speed we must arrive at
   *   → travel                                 →  how far past contact to aim
   *
   * Scaling a distance by TRANSFER instead looks equivalent and is not: travel
   * is superlinear in speed, so that version mis-powers every shot — which is
   * exactly how an earlier build ended up with a hard rival that lost to easy.
   */
  const arrivalNeeded = speedForTravel(roomTarget + PUSH_MARGIN) / TRANSFER;
  let wanted = reach + travelForSpeed(arrivalNeeded);

  // A cautious player does not win a round by losing it. Cap the shot at the
  // one whose rebound still leaves its own pen on the desk, and blend toward
  // that cap by however careful this difficulty is.
  const selfRoom = roomSelf - reach - SELF_MARGIN;
  if (profile.caution > 0 && selfRoom > 0) {
    const safeArrival = speedForTravel(selfRoom) / Math.max(SELF_CARRY, 0.05);
    const cap = reach + travelForSpeed(safeArrival);
    if (cap < wanted) wanted += (cap - wanted) * profile.caution;
  }
  wanted = Math.max(reach + MIN_USEFUL_OVERRUN, wanted);

  const power = clamp(powerForTravel(wanted) + (rng() * 2 - 1) * powerError, 0.15, 1);

  return { dirX, dirZ, power, spin: (rng() * 2 - 1) * profile.spin };
}

/** How far a capsule reaches from its centre along a unit direction. */
function extentAlong(pen: PenBody, dx: number, dz: number): number {
  const ax = Math.cos(pen.angle);
  const az = Math.sin(pen.angle);
  return Math.abs(ax * dx + az * dz) * pen.half + pen.radius;
}

/** Distance from a point to the table edge along a unit direction. */
function roomAlong(x: number, z: number, dx: number, dz: number, table: Table): number {
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (table.halfW - x) / dx);
  else if (dx < -1e-6) t = Math.min(t, (-table.halfW - x) / dx);
  if (dz > 1e-6) t = Math.min(t, (table.halfD - z) / dz);
  else if (dz < -1e-6) t = Math.min(t, (-table.halfD - z) / dz);
  return t === Infinity ? 0 : Math.max(0, t);
}

/** Seconds the rival should appear to deliberate before flicking. */
export function thinkingTime(difficulty: Difficulty, rng: Rng): number {
  const base = AI_PROFILES[difficulty].delay;
  return base + rng() * 0.45;
}

/** Human-readable strength of a launch, for the rival's shot readout. */
export function launchSpeed(power: number) {
  return MIN_LAUNCH_SPEED + clamp(power, 0, 1) * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
}
