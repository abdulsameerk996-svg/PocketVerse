/**
 * ============================================================================
 *  FINITE-VALUE GUARDS — shared by the 3D engine
 * ============================================================================
 *
 * The last line before pixels. Simulations are fuzz-tested for finiteness,
 * but the presentation layer must never trust that: one NaN reaching a camera
 * position, a rotation or an instanced transform renders a blank or corrupted
 * scene that no amount of game logic can recover from.
 *
 * These helpers are intentionally tiny and pure (no three.js, no React), so
 * they are unit-testable and free to call from `useFrame` without allocation
 * concerns — a number-in, number-out coercion, not a vector class.
 */

/** Coerce a value to a finite number; NaN/±Infinity fall back. */
export function finiteOr(v: number, fallback = 0): number {
  return Number.isFinite(v) ? v : fallback;
}

/**
 * A safe camera direction. A zero-length or non-finite vector would produce a
 * NaN camera (and therefore a blank scene) the moment it is normalised, so it
 * falls back to the engine default. The default is deliberately non-degenerate:
 * up-and-forward, never looking straight down.
 */
export function safeCameraDir(
  dir: readonly [number, number, number],
  fallback: readonly [number, number, number] = [0, 13.5, 11],
): [number, number, number] {
  const x = finiteOr(dir[0]);
  const y = finiteOr(dir[1], 1);
  const z = finiteOr(dir[2], 0.8);
  if (Math.hypot(x, y, z) < 1e-6) return [fallback[0], fallback[1], fallback[2]];
  return [x, y, z];
}

/** Clamp a value into [lo, hi], tolerating poisoned input. */
export function clampFinite(v: number, lo: number, hi: number): number {
  const c = finiteOr(v, lo);
  return c < lo ? lo : c > hi ? hi : c;
}
