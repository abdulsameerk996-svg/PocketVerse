/**
 * ============================================================================
 *  ARENA2D — planar physics shared by the 3D arcade games
 * ============================================================================
 *
 * Every game in the 2-player collection is played on a flat surface: pucks,
 * sumo wrestlers, tanks, tiles. So the simulation is 2D (the XZ plane) and only
 * the *presentation* is 3D. That keeps the maths small enough to reason about
 * and fast enough for a phone.
 *
 * Pure: no React, no three.js. Same contract as `games/penfight/physics.ts`,
 * which stays on its own bespoke capsule solver — it is tuned and tested, and
 * rewriting it onto this would be change for its own sake.
 *
 * Units are world units; the caller decides how big an arena is.
 */

export type Body = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  mass: number;
  /** Per-second velocity damping, as a multiplier basis. */
  damping: number;
  /** Set false to freeze a body without removing it. */
  awake: boolean;
};

export const FIXED_STEP = 1 / 120;
const MAX_STEPS = 8;

export function makeBody(x: number, z: number, radius: number, mass = 1, damping = 1.2): Body {
  return { x, z, vx: 0, vz: 0, radius, mass, damping, awake: true };
}

/** Fixed-step driver. Keeps play identical at 60 Hz and 120 Hz. */
export function stepWorld(
  dt: number,
  acc: { value: number },
  simulate: (h: number) => void,
): number {
  acc.value += Math.min(dt, 0.05);
  let steps = 0;
  while (acc.value >= FIXED_STEP && steps < MAX_STEPS) {
    acc.value -= FIXED_STEP;
    steps += 1;
    simulate(FIXED_STEP);
  }
  if (acc.value > FIXED_STEP * MAX_STEPS) acc.value = 0;
  return steps;
}

export function integrate(b: Body, h: number) {
  if (!b.awake) return;
  b.x += b.vx * h;
  b.z += b.vz * h;
  const k = Math.exp(-b.damping * h);
  b.vx *= k;
  b.vz *= k;
}

export function speed(b: Body) {
  return Math.hypot(b.vx, b.vz);
}

export function clampSpeed(b: Body, max: number) {
  const s = speed(b);
  if (s > max) {
    b.vx = (b.vx / s) * max;
    b.vz = (b.vz / s) * max;
  }
}

export function push(b: Body, dx: number, dz: number, force: number) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return;
  b.vx += (dx / len) * force;
  b.vz += (dz / len) * force;
}

/* ------------------------------------------------------------ collisions -- */

export type Hit = { happened: boolean; nx: number; nz: number; impulse: number };
const NO_HIT: Hit = { happened: false, nx: 0, nz: 0, impulse: 0 };

/**
 * Elastic circle-circle resolution with positional correction.
 * Returns the contact normal and impulse so callers can spawn effects.
 */
export function collide(a: Body, b: Body, restitution = 0.9): Hit {
  let nx = a.x - b.x;
  let nz = a.z - b.z;
  let dist = Math.hypot(nx, nz);
  const min = a.radius + b.radius;
  if (dist >= min) return NO_HIT;

  if (dist < 1e-6) {
    nx = 1;
    nz = 0;
    dist = 1e-6;
  }
  nx /= dist;
  nz /= dist;

  const invA = 1 / a.mass;
  const invB = 1 / b.mass;
  const invSum = invA + invB;

  const corr = (min - dist) / invSum;
  a.x += nx * corr * invA;
  a.z += nz * corr * invA;
  b.x -= nx * corr * invB;
  b.z -= nz * corr * invB;

  const rvx = a.vx - b.vx;
  const rvz = a.vz - b.vz;
  const vn = rvx * nx + rvz * nz;
  if (vn > 0) return { happened: true, nx, nz, impulse: 0 };

  const j = (-(1 + restitution) * vn) / invSum;
  a.vx += nx * j * invA;
  a.vz += nz * j * invA;
  b.vx -= nx * j * invB;
  b.vz -= nz * j * invB;

  a.awake = true;
  b.awake = true;
  return { happened: true, nx, nz, impulse: Math.abs(j) };
}

/** Bounce a body off a rectangular boundary. Returns the axis hit, if any. */
export function bounceRect(
  b: Body,
  halfW: number,
  halfD: number,
  restitution = 0.92,
): 'x' | 'z' | null {
  let axis: 'x' | 'z' | null = null;
  if (b.x - b.radius < -halfW) {
    b.x = -halfW + b.radius;
    b.vx = Math.abs(b.vx) * restitution;
    axis = 'x';
  } else if (b.x + b.radius > halfW) {
    b.x = halfW - b.radius;
    b.vx = -Math.abs(b.vx) * restitution;
    axis = 'x';
  }
  if (b.z - b.radius < -halfD) {
    b.z = -halfD + b.radius;
    b.vz = Math.abs(b.vz) * restitution;
    axis = 'z';
  } else if (b.z + b.radius > halfD) {
    b.z = halfD - b.radius;
    b.vz = -Math.abs(b.vz) * restitution;
    axis = 'z';
  }
  return axis;
}

/** Keep a body inside a rectangle without bouncing (players, paddles). */
export function clampRect(b: Body, halfW: number, halfD: number, inset = 0) {
  const w = halfW - b.radius - inset;
  const d = halfD - b.radius - inset;
  if (b.x < -w) {
    b.x = -w;
    b.vx = 0;
  } else if (b.x > w) {
    b.x = w;
    b.vx = 0;
  }
  if (b.z < -d) {
    b.z = -d;
    b.vz = 0;
  } else if (b.z > d) {
    b.z = d;
    b.vz = 0;
  }
}

/** Distance from the arena centre — the ring-out test for Sumo. */
export function radiusFromCentre(b: Body) {
  return Math.hypot(b.x, b.z);
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
