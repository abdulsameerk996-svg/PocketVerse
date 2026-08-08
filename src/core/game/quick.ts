import type { RewardBundle } from '@/core/types';

/**
 * ============================================================================
 *  QUICK-PLAY SHARED SYSTEMS
 * ============================================================================
 *
 * The Phase 7 quick-play collection is five games with the same skeleton:
 * instant start, score chasing, one-tap retry, modest rewards. The few numbers
 * that all of them share — the reward envelope, the escalating-difficulty
 * curve, the streak combo — live here once, so retuning one game's economy
 * never happens in five places.
 *
 * All functions are pure and worklet-safe (they are called from game loops).
 */

/**
 * The reward envelope for a quick run. Deliberately modest: these games are
 * cheap to replay, so per-run payouts are small and best-score chasing is what
 * pays. `won` is a flat win bonus (survived the full clock, cleared the boss…).
 */
export function quickReward(
  score: number,
  seconds: number,
  opts?: { won?: boolean; wave?: number },
): RewardBundle {
  const won = opts?.won ?? false;
  const coins = Math.round(
    40 + score * 0.22 + seconds * 1.1 + (opts?.wave ?? 0) * 8 + (won ? 140 : 0),
  );
  const xp = Math.round(14 + score * 0.06 + seconds * 0.45 + (won ? 45 : 0));
  const items: Record<string, number> = {};
  if (score >= 500 || (opts?.wave ?? 0) >= 6) items.mat_circuit = 1;
  else items.mat_scrap = 1;
  return { coins, xp, items };
}

/**
 * Escalating difficulty: `base` at t=0 grows toward `base * (1 + growth)` as t
 * approaches 1. `t` is a normalised progression (survival fraction, wave
 * fraction, level fraction).
 */
export function difficultyCurve(base: number, growth: number, t: number): number {
  'worklet';
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return base * (1 + growth * k);
}

/** Streak combo multiplier, capped so scores stay readable. */
export function comboMultiplier(streak: number, cap = 5): number {
  'worklet';
  return 1 + Math.min(Math.max(0, streak), cap) * 0.25;
}

/** Best-score bookkeeping shared by every quick game's finish handler. */
export function bumpBest(save: { runs: number; best: number }, score: number) {
  return {
    runs: save.runs + 1,
    best: Math.max(save.best, Math.round(score)),
  };
}
