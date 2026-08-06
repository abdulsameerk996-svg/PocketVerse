import { useEffect } from 'react';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
  type FrameInfo,
} from 'react-native-reanimated';

/**
 * ============================================================================
 *  THE 60 FPS STRATEGY
 * ============================================================================
 *
 * Action games in PocketVerse run their simulation *on the UI thread* as a
 * Reanimated worklet. Positions live in `SharedValue`s and are consumed by
 * `useAnimatedStyle`, so a frame never crosses the JS bridge:
 *
 *      useGameLoop(worklet)  →  mutate SharedValues  →  useAnimatedStyle
 *
 * React state is used only for things that genuinely change rarely (score
 * milestones, game over, pause). Those cross back via `runOnJS` a handful of
 * times per run rather than 60 times per second.
 *
 * Entities are pre-allocated pools of fixed size — no allocation, no list
 * diffing, no re-render while playing. Recycling a pooled entity is just
 * resetting numbers on an object that already exists.
 */

export type LoopCallback = (dt: number, elapsed: number) => void;

/** Clamp dt so a stall (GC, backgrounding) never teleports entities. */
const MAX_DT = 1 / 30;

export function useGameLoop(
  /** MUST be a worklet ('worklet' directive) — runs on the UI thread. */
  callback: LoopCallback,
  active: boolean,
) {
  const elapsed = useSharedValue(0);

  const frame = useFrameCallback((info: FrameInfo) => {
    'worklet';
    const raw = (info.timeSincePreviousFrame ?? 16.67) / 1000;
    const dt = raw > MAX_DT ? MAX_DT : raw;
    elapsed.value += dt;
    callback(dt, elapsed.value);
  }, false);

  useEffect(() => {
    frame.setActive(active);
    return () => frame.setActive(false);
  }, [active, frame]);

  return elapsed;
}

/**
 * Fixed-timestep accumulator for simulations that must be deterministic
 * regardless of refresh rate (120 Hz iPads vs 60 Hz phones).
 */
export function useFixedStep(
  step: number,
  /** worklet */
  simulate: (stepSeconds: number, tick: number) => void,
  active: boolean,
) {
  const accumulator = useSharedValue(0);
  const tick = useSharedValue(0);

  useGameLoop((dt) => {
    'worklet';
    accumulator.value += dt;
    let guard = 0;
    while (accumulator.value >= step && guard < 5) {
      accumulator.value -= step;
      tick.value += 1;
      simulate(step, tick.value);
      guard += 1;
    }
    // Never let the accumulator run away after a long stall.
    if (accumulator.value > step * 5) accumulator.value = 0;
  }, active);

  return tick;
}

/* ------------------------------------------------------------ entity pool */

export type PooledEntity = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  kind: number;
  /** Free slot for per-game data (lane index, hp, sprite variant…). */
  data: number;
  /** Second free slot. */
  data2: number;
};

export function makeEntity(): PooledEntity {
  return { active: false, x: 0, y: 0, vx: 0, vy: 0, w: 0, h: 0, kind: 0, data: 0, data2: 0 };
}

/**
 * Fixed-size entity pool held in a SharedValue so worklets can mutate it
 * in place. `useSharedValue` boxes the array once; we never reassign `.value`,
 * we mutate members — which Reanimated supports for UI-thread objects.
 */
export function useEntityPool(size: number): SharedValue<PooledEntity[]> {
  const pool = useSharedValue<PooledEntity[]>(
    Array.from({ length: size }, () => makeEntity()),
  );
  return pool;
}

/** Worklet-safe: find a free slot, or return -1 when the pool is saturated. */
export function spawn(pool: PooledEntity[]): number {
  'worklet';
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].active) return i;
  }
  return -1;
}

/** Worklet-safe AABB overlap. */
export function overlaps(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  'worklet';
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Worklet-safe circle overlap — cheaper for bullets/zombies. */
export function circleHit(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
): boolean {
  'worklet';
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}
