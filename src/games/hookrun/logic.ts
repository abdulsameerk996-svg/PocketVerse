/**
 * ============================================================================
 *  HOOK RUN — deterministic arcade swing math
 * ============================================================================
 *
 * No rope physics: the player swings on a rigid pendulum with a fixed radius,
 * a gravity term, and a clamped angular velocity. That is fully deterministic
 * (same inputs → same arc), stable (no integration blow-ups, all numbers
 * guarded), and testable headlessly — the harness in tools/quickgames-sim
 * verifies the pendulum conserves its bounds and the release launches forward.
 */

export type Swing = {
  /** Angle of the arm, measured from the +X axis (screen space, y down). */
  angle: number;
  angVel: number;
  radius: number;
  /** Anchor world position. */
  ax: number;
  ay: number;
};

export const GRAVITY = 980; // px/s²
export const MAX_ANG_VEL = 7.5; // rad/s — keeps flings from becoming missiles
export const MIN_RADIUS = 36;
export const HOOK_RANGE = 320; // horizontal reach for the tap-to-hook search
export const HOOK_VERTICAL = 190; // |Δy| allowed for a hook

export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

export function wrapAngle(a: number): number {
  'worklet';
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Attach the player to an anchor. Angular velocity comes from the tangential
 * component of the player's current velocity — a player already moving fast
 * gets a fast swing, so chaining hooks accelerates rather than resetting.
 */
export function attachSwing(
  px: number,
  py: number,
  vx: number,
  vy: number,
  ax: number,
  ay: number,
): Swing | null {
  'worklet';
  const dx = px - ax;
  const dy = py - ay;
  const radius = Math.hypot(dx, dy);
  if (radius < MIN_RADIUS) return null;
  const angle = Math.atan2(dy, dx);
  const tx = -Math.sin(angle);
  const ty = Math.cos(angle);
  const angVel = (vx * tx + vy * ty) / radius;
  return { angle, angVel, radius, ax, ay };
}

/** One physics step. Bounded by construction — nothing can diverge here. */
export function stepPendulum(s: Swing, dt: number): Swing {
  'worklet';
  const angVel = clamp(
    s.angVel + (-GRAVITY / s.radius) * Math.sin(s.angle) * dt,
    -MAX_ANG_VEL,
    MAX_ANG_VEL,
  );
  return { ...s, angle: wrapAngle(s.angle + angVel * dt), angVel };
}

export function swingPos(s: Swing): { x: number; y: number } {
  'worklet';
  return {
    x: s.ax + Math.cos(s.angle) * s.radius,
    y: s.ay + Math.sin(s.angle) * s.radius,
  };
}

/**
 * Release: launch along the arm tangent, plus a forward assist from the base
 * cruise speed. `perfect` is true when the release happened near the zenith —
 * the player threw themself forward instead of letting the pendulum fall back.
 */
export function releaseVelocity(
  s: Swing,
  baseSpeed: number,
): { vx: number; vy: number; perfect: boolean } {
  'worklet';
  const tx = -Math.sin(s.angle);
  const ty = Math.cos(s.angle);
  const tang = s.angVel * s.radius;
  const perfect = Math.abs(s.angle + Math.PI / 2) < 0.55 && tang > 0;
  return {
    vx: tx * tang + baseSpeed * 0.55,
    vy: ty * tang - baseSpeed * 0.4,
    perfect,
  };
}

/**
 * Pick the anchor worth hooking: the closest one *ahead* of the player that is
 * within horizontal reach and roughly at their height band. Returns the index
 * or -1.
 */
export function nearestAnchor(
  px: number,
  py: number,
  anchors: { x: number; y: number; active: boolean }[],
): number {
  'worklet';
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (!a.active) continue;
    const dx = a.x - px;
    if (dx < 40 || dx > HOOK_RANGE) continue;
    if (Math.abs(a.y - py) > HOOK_VERTICAL) continue;
    if (dx < bestD) {
      bestD = dx;
      best = i;
    }
  }
  return best;
}

/** AABB overlap test for the obstacle check. */
export function overlaps(
  px: number,
  py: number,
  pr: number,
  ob: { x: number; y: number; w: number; h: number; active: boolean },
): boolean {
  'worklet';
  if (!ob.active) return false;
  return px + pr > ob.x && px - pr < ob.x + ob.w && py + pr > ob.y && py - pr < ob.y + ob.h;
}

/** Cruise speed grows with distance, capped so the late game stays playable. */
export function baseSpeed(dist: number): number {
  'worklet';
  return Math.min(480, 245 + dist * 0.02);
}

/** Score for distance travelled this frame (1 m ≈ 10 px). */
export function distanceScore(dist: number): number {
  'worklet';
  return dist * 0.1;
}
