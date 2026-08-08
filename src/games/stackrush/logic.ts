/**
 * ============================================================================
 *  STACK RUSH — pure drop/width math
 * ============================================================================
 *
 * All functions are worklet-safe (the surface runs the moving block on the UI
 * thread) and pure, so the same numbers are exercised headlessly by
 * tools/quickgames-sim. Nothing here knows pixels — widths and positions are
 * fractions of the playfield (0..1).
 */

export type StackLayer = {
  /** Left edge of the layer, as a playfield fraction. */
  x: number;
  /** Layer width, as a playfield fraction. */
  w: number;
};

/** A drop is 'perfect' when the cut is under this fraction of the block width. */
export const PERFECT_TOL = 0.055;
/** Below this remaining width the tower is too thin to build on — game over. */
export const MIN_WIDTH = 0.08;
/** A tower this tall is a completed run for reward purposes. */
export const MAX_LAYERS = 99;

export type DropOutcome =
  | { kind: 'placed'; layer: StackLayer; perfect: boolean }
  | { kind: 'over' };

/**
 * Resolve a drop. `movingLeft` is the moving block's left edge at the moment
 * of the tap; `prev` is the layer it lands on; `tol` is the perfect tolerance
 * (luck equipment widens it).
 */
export function dropBlock(movingLeft: number, prev: StackLayer, tol = PERFECT_TOL): DropOutcome {
  'worklet';
  const left = Math.max(movingLeft, prev.x);
  const right = Math.min(movingLeft + prev.w, prev.x + prev.w);
  const w = Math.max(0, right - left);
  if (w < Math.max(MIN_WIDTH, 0.02)) return { kind: 'over' };
  const perfect = w >= prev.w * (1 - Math.max(0, tol));
  return { kind: 'placed', layer: { x: left, w }, perfect };
}

/**
 * The next block's sweep bounds. It ping-pongs from fully left of the previous
 * layer (right edge touching) to fully right (left edge touching), so a
 * perfectly-timed drop always stacks exactly — pure timing, zero luck.
 */
export function nextSlideBounds(prev: StackLayer): { min: number; max: number } {
  'worklet';
  return { min: prev.x - prev.w, max: prev.x + prev.w };
}

/** Ping-pong sweep speed in playfield-fractions per second. */
export function slideSpeed(level: number, speedMod = 0): number {
  'worklet';
  const base = 0.42 + Math.min(level, 40) * 0.05;
  // Equipped "speed" cosmetics mean agility here: a faster pilot reads the
  // block better, so the block moves slightly slower for them.
  return Math.max(0.2, base * (1 - Math.min(0.35, speedMod * 0.3)));
}

/** Points for landing one layer on top of `level` previous ones. */
export function layerPoints(level: number): number {
  'worklet';
  return level * 10;
}
