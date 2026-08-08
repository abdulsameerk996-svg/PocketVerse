import type { Launch, PenBody, SideId, Table } from './types';

/**
 * ============================================================================
 *  PEN FIGHT — RIGID BODY SOLVER
 * ============================================================================
 *
 * Two capsules sliding on a table. Everything here is pure: no React, no
 * three.js, no shared values. `step()` advances the world by a fixed timestep
 * and reports what happened, so the renderer, the AI and the turn controller
 * all read the same truth and none of them can bend it.
 *
 * Why capsules rather than circles: a pen is long. Half the game is landing a
 * hit with the *tip* so the rival spins out sideways, and that only exists if
 * the contact point can be off-centre. Off-centre contact is also where the
 * spin comes from — the impulse solver below is the angular one for that
 * reason, not for physical piety.
 *
 * Units are table-space: the table is roughly 6 x 9, a pen is 2.2 long, and
 * speeds are in units/second.
 */

/* ------------------------------------------------------------- constants -- */

/** Fixed simulation step. Small enough that a fast pen cannot tunnel a capsule. */
export const FIXED_STEP = 1 / 120;
/** Never simulate more than this many steps for one frame (post-stall guard). */
const MAX_STEPS_PER_FRAME = 8;

/*
 * The constants below were not guessed. `physics.ts` and `ai.ts` are pure, so
 * they were swept headlessly against the real solver, scoring each combination
 * on opening-shot conversion, first-mover advantage, flicks per round and
 * stalemate rate. See the balance note at the bottom of this file.
 */

/** Viscous damping — the felt/wood drag that bleeds speed off continuously. */
const LINEAR_DAMPING = 0.95;
const ANGULAR_DAMPING = 2.1;
/**
 * Coulomb-style constant deceleration. Without this a pen approaches zero
 * asymptotically and the turn never ends; with it, pens actually stop.
 */
const STOP_ACCEL = 1.35;
const STOP_ANGULAR = 2.4;

/** Below these a body is considered at rest and is snapped to zero. */
const REST_SPEED = 0.16;
const REST_OMEGA = 0.22;

/** Pen-on-pen bounce and surface friction at the contact point. */
const RESTITUTION = 0.42;
const CONTACT_FRICTION = 0.28;

/** Launch speed range, mapped from the 0..1 power the UI reports. */
export const MIN_LAUNCH_SPEED = 3.2;
export const MAX_LAUNCH_SPEED = 14;
/** Sideways english converted into initial spin. */
const LAUNCH_SPIN = 7.5;

/** Fall animation once a pen is off the table. */
const GRAVITY = 22;

export const PEN_LENGTH = 2.2;
export const PEN_RADIUS = 0.15;

/* ------------------------------------------------------------- factories -- */

export function makePen(side: SideId, x: number, z: number, angle: number): PenBody {
  const radius = PEN_RADIUS;
  const half = Math.max(0.01, PEN_LENGTH / 2 - radius);
  const mass = 1;
  // Thin-rod inertia about the table normal. Cheap, and the only term that
  // decides how readily a tip hit sends a pen spinning.
  const inertia = (mass * (2 * (half + radius)) ** 2) / 12;
  return {
    side,
    x,
    z,
    vx: 0,
    vz: 0,
    angle,
    omega: 0,
    radius,
    half,
    mass,
    inertia,
    resting: true,
    fallen: false,
    y: 0,
    vy: 0,
    tumble: 0,
  };
}

/** Put a pen back on its starting mark, motionless. Used between rounds. */
export function resetPen(pen: PenBody, x: number, z: number, angle: number) {
  pen.x = x;
  pen.z = z;
  pen.vx = 0;
  pen.vz = 0;
  pen.angle = angle;
  pen.omega = 0;
  pen.resting = true;
  pen.fallen = false;
  pen.y = 0;
  pen.vy = 0;
  pen.tumble = 0;
}

/* ---------------------------------------------------------------- launch -- */

/**
 * The single entry point that puts a pen in motion.
 *
 * The human's drag and the AI's decision both come through here with the same
 * `Launch` shape, which is what stops the AI from being able to cheat: it has
 * no way to express a shot a player could not also take.
 */
export function applyLaunch(pen: PenBody, launch: Launch) {
  const power = clamp(launch.power, 0, 1);
  const speed = MIN_LAUNCH_SPEED + power * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
  const len = Math.hypot(launch.dirX, launch.dirZ) || 1;
  pen.vx = (launch.dirX / len) * speed;
  pen.vz = (launch.dirZ / len) * speed;
  pen.omega = clamp(launch.spin, -1, 1) * LAUNCH_SPIN * (0.35 + power * 0.65);
  pen.resting = false;
}

/* ------------------------------------------------------------------ step -- */

export type StepReport = {
  /** True once every body is at rest or has finished falling. */
  settled: boolean;
  /** Pens that left the table during this step. */
  knockedOff: SideId[];
  /** A pen-on-pen contact happened; magnitude is the normal impulse. */
  impact: number;
};

/**
 * Advance the world by `dt` seconds using a fixed-step accumulator.
 *
 * The accumulator is carried by the caller so the simulation rate is identical
 * on a 60 Hz phone and a 120 Hz one — a flick that wins on one device wins on
 * the other.
 */
export function step(
  pens: PenBody[],
  table: Table,
  dt: number,
  accumulator: { value: number },
): StepReport {
  const report: StepReport = { settled: false, knockedOff: [], impact: 0 };

  accumulator.value += dt;
  let steps = 0;
  while (accumulator.value >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
    accumulator.value -= FIXED_STEP;
    steps += 1;
    substep(pens, table, FIXED_STEP, report);
  }
  // After a long stall, drop the backlog rather than fast-forwarding the match.
  if (accumulator.value > FIXED_STEP * MAX_STEPS_PER_FRAME) accumulator.value = 0;

  report.settled = pens.every((p) => (p.fallen ? p.y <= FALLEN_FLOOR : p.resting));
  return report;
}

const FALLEN_FLOOR = -4;

function substep(pens: PenBody[], table: Table, h: number, report: StepReport) {
  for (const p of pens) {
    if (p.fallen) {
      // Off the edge: keep the horizontal drift, let gravity do the rest.
      p.vy -= GRAVITY * h;
      p.y += p.vy * h;
      p.x += p.vx * h;
      p.z += p.vz * h;
      p.tumble += p.omega * h + h * 3.2;
      if (p.y < FALLEN_FLOOR) {
        p.y = FALLEN_FLOOR;
        p.vx = 0;
        p.vz = 0;
        p.vy = 0;
      }
      continue;
    }

    if (p.resting) continue;

    p.x += p.vx * h;
    p.z += p.vz * h;
    p.angle += p.omega * h;

    // Viscous drag …
    const linDamp = Math.exp(-LINEAR_DAMPING * h);
    p.vx *= linDamp;
    p.vz *= linDamp;
    p.omega *= Math.exp(-ANGULAR_DAMPING * h);

    // … plus a constant deceleration so motion terminates in finite time.
    const speed = Math.hypot(p.vx, p.vz);
    if (speed > 0) {
      const next = Math.max(0, speed - STOP_ACCEL * h);
      p.vx = (p.vx / speed) * next;
      p.vz = (p.vz / speed) * next;
    }
    if (p.omega !== 0) {
      const sign = Math.sign(p.omega);
      p.omega = sign * Math.max(0, Math.abs(p.omega) - STOP_ANGULAR * h);
    }

    if (Math.hypot(p.vx, p.vz) < REST_SPEED && Math.abs(p.omega) < REST_OMEGA) {
      p.vx = 0;
      p.vz = 0;
      p.omega = 0;
      p.resting = true;
    }
  }

  resolveContacts(pens, report);

  for (const p of pens) {
    if (p.fallen) continue;
    // A pen goes over when its centre of mass clears the edge — the same rule
    // the player is reading off the screen.
    if (Math.abs(p.x) > table.halfW || Math.abs(p.z) > table.halfD) {
      p.fallen = true;
      p.resting = false;
      p.vy = 0;
      report.knockedOff.push(p.side);
    }
  }
}

/* ------------------------------------------------------------ collisions -- */

function resolveContacts(pens: PenBody[], report: StepReport) {
  for (let i = 0; i < pens.length; i++) {
    for (let j = i + 1; j < pens.length; j++) {
      const a = pens[i];
      const b = pens[j];
      if (a.fallen || b.fallen) continue;
      if (a.resting && b.resting) continue;
      collide(a, b, report);
    }
  }
}

function collide(a: PenBody, b: PenBody, report: StepReport) {
  const [pa, pb] = closestPointsBetweenSegments(a, b);
  let nx = pa.x - pb.x;
  let nz = pa.z - pb.z;
  let dist = Math.hypot(nx, nz);
  const minDist = a.radius + b.radius;
  if (dist >= minDist) return;

  if (dist < 1e-6) {
    // Exactly concentric — push apart along the line of centres instead.
    nx = a.x - b.x || 1;
    nz = a.z - b.z;
    dist = Math.hypot(nx, nz) || 1;
  }
  nx /= dist;
  nz /= dist;

  // --- positional correction, split evenly (equal masses today, but written
  // --- against the mass terms so a heavier "marker" skin is a data change.
  const penetration = minDist - dist;
  const invA = 1 / a.mass;
  const invB = 1 / b.mass;
  const invSum = invA + invB;
  const corr = penetration / invSum;
  a.x += nx * corr * invA;
  a.z += nz * corr * invA;
  b.x -= nx * corr * invB;
  b.z -= nz * corr * invB;

  // --- contact offsets from each centre of mass
  const rax = pa.x - a.x;
  const raz = pa.z - a.z;
  const rbx = pb.x - b.x;
  const rbz = pb.z - b.z;

  // Velocity of each contact point: v + ω × r (2D form).
  const vax = a.vx - a.omega * raz;
  const vaz = a.vz + a.omega * rax;
  const vbx = b.vx - b.omega * rbz;
  const vbz = b.vz + b.omega * rbx;

  const rvx = vax - vbx;
  const rvz = vaz - vbz;
  const vn = rvx * nx + rvz * nz;
  if (vn > 0) return; // already separating

  const raCrossN = rax * nz - raz * nx;
  const rbCrossN = rbx * nz - rbz * nx;
  const denom =
    invA + invB + (raCrossN * raCrossN) / a.inertia + (rbCrossN * rbCrossN) / b.inertia;

  const jn = (-(1 + RESTITUTION) * vn) / denom;
  applyImpulse(a, jn * nx, jn * nz, rax, raz, 1);
  applyImpulse(b, jn * nx, jn * nz, rbx, rbz, -1);

  // --- tangential friction: this is what converts a glancing tip hit into a
  // --- spin rather than a clean bounce, and it is most of the game's feel.
  const tx = -nz;
  const tz = nx;
  const vt = rvx * tx + rvz * tz;
  if (Math.abs(vt) > 1e-5) {
    const raCrossT = rax * tz - raz * tx;
    const rbCrossT = rbx * tz - rbz * tx;
    const denomT =
      invA + invB + (raCrossT * raCrossT) / a.inertia + (rbCrossT * rbCrossT) / b.inertia;
    let jt = -vt / denomT;
    const maxT = CONTACT_FRICTION * Math.abs(jn);
    jt = clamp(jt, -maxT, maxT);
    applyImpulse(a, jt * tx, jt * tz, rax, raz, 1);
    applyImpulse(b, jt * tx, jt * tz, rbx, rbz, -1);
  }

  a.resting = false;
  b.resting = false;
  report.impact = Math.max(report.impact, Math.abs(jn));
}

function applyImpulse(
  p: PenBody,
  ix: number,
  iz: number,
  rx: number,
  rz: number,
  sign: number,
) {
  const inv = 1 / p.mass;
  p.vx += sign * ix * inv;
  p.vz += sign * iz * inv;
  p.omega += (sign * (rx * iz - rz * ix)) / p.inertia;
}

/* --------------------------------------------------------------- geometry -- */

type Pt = { x: number; z: number };

function endpoints(p: PenBody): [Pt, Pt] {
  const dx = Math.cos(p.angle) * p.half;
  const dz = Math.sin(p.angle) * p.half;
  return [
    { x: p.x - dx, z: p.z - dz },
    { x: p.x + dx, z: p.z + dz },
  ];
}

/** World-space tip of a pen, used for the aim indicator and hit sparks. */
export function penTip(p: PenBody): Pt {
  const reach = p.half + p.radius;
  return { x: p.x + Math.cos(p.angle) * reach, z: p.z + Math.sin(p.angle) * reach };
}

/**
 * Closest pair of points between the two capsules' inner segments.
 *
 * Standard clamped-parameter segment/segment solve. Degenerate (parallel or
 * zero-length) cases fall back to clamping, which is why the pens never explode
 * when they end up perfectly side by side.
 */
function closestPointsBetweenSegments(a: PenBody, b: PenBody): [Pt, Pt] {
  const [p1, q1] = endpoints(a);
  const [p2, q2] = endpoints(b);

  const d1x = q1.x - p1.x;
  const d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x;
  const d2z = q2.z - p2.z;
  const rx = p1.x - p2.x;
  const rz = p1.z - p2.z;

  const A = d1x * d1x + d1z * d1z;
  const E = d2x * d2x + d2z * d2z;
  const F = d2x * rx + d2z * rz;

  let s = 0;
  let t = 0;

  if (A <= 1e-8 && E <= 1e-8) {
    return [p1, p2];
  }
  if (A <= 1e-8) {
    t = clamp(F / E, 0, 1);
  } else {
    const C = d1x * rx + d1z * rz;
    if (E <= 1e-8) {
      s = clamp(-C / A, 0, 1);
    } else {
      const B = d1x * d2x + d1z * d2z;
      const denom = A * E - B * B;
      s = denom !== 0 ? clamp((B * F - C * E) / denom, 0, 1) : 0;
      t = (B * s + F) / E;
      if (t < 0) {
        t = 0;
        s = clamp(-C / A, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((B - C) / A, 0, 1);
      }
    }
  }

  return [
    { x: p1.x + d1x * s, z: p1.z + d1z * s },
    { x: p2.x + d2x * t, z: p2.z + d2z * t },
  ];
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------ travel model -- */

/**
 * How far a pen slides before stopping, given a launch speed.
 *
 * Closed form of the damping model above — `dv/dt = -k·v - a` integrated to
 * rest. The opponent needs this to choose a power that actually reaches, and
 * deriving it here rather than hard-coding a measured pair of numbers means
 * retuning the drag constants cannot silently make the AI play badly.
 */
export function travelForSpeed(v0: number): number {
  if (v0 <= 0) return 0;
  const k = LINEAR_DAMPING;
  const a = STOP_ACCEL;
  return (v0 + a / k) * (v0 / (a + k * v0)) - (a / (k * k)) * Math.log(1 + (k * v0) / a);
}

/**
 * Inverse of `travelForSpeed`. Monotonic, so bisect.
 *
 * This is the piece that makes the opponent's reasoning composable: travel is
 * *not* linear in speed, so anything that wants to convert "shove them this far"
 * into "arrive this fast" has to go through here rather than scaling distances.
 */
export function speedForTravel(distance: number): number {
  if (distance <= 0) return 0;
  let lo = 0;
  let hi = MAX_LAUNCH_SPEED * 4;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (travelForSpeed(mid) < distance) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Launch speed → the 0..1 power the UI and the AI both speak in. */
export function powerForSpeed(speed: number): number {
  return clamp(
    (speed - MIN_LAUNCH_SPEED) / (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED),
    0,
    1,
  );
}

/** Convenience: the power that produces a given unobstructed slide. */
export function powerForTravel(distance: number): number {
  return powerForSpeed(speedForTravel(distance));
}

/** Fraction of the incoming speed a head-on hit hands to the target. */
export const TRANSFER = (1 + RESTITUTION) / 2;
/** Fraction the striker keeps. */
export const SELF_CARRY = (1 - RESTITUTION) / 2;

/*
 * ─── BALANCE NOTE ───────────────────────────────────────────────────────────
 *
 * Measured by simulating the rival against itself, 120 matches per cell:
 *
 *              opening shot converts    first seat wins    flicks/round
 *   Casual              8%                                     ~2
 *   Steady             30%                    57%              ~2
 *   Ruthless           74%                    71%              ~2
 *   Ruthless v Casual                         87%
 *   stalemates          2%
 *
 * Two findings shaped these numbers, and both are easy to undo by accident:
 *
 * 1. Pens start **end-on**, not broadside (`START_MARKS` in content.ts). A
 *    broadside pen is a 2.2-unit wall that every difficulty hits, so the
 *    opening shot converted ~100% of the time and whoever flicked first won the
 *    match. End-on presents a 0.3-unit needle, which is what turns aim accuracy
 *    into the thing that separates the difficulties.
 * 2. Damping and restitution are lower than they look like they should be. At
 *    the original 1.15 / 0.55 a single hit could not shove a pen far enough to
 *    score from mid-desk, and ~47% of rounds ran to the turn limit.
 *
 * If you retune anything here, re-measure. The interesting failure mode is not
 * a crash — it is a game where the rival stops missing.
 */
