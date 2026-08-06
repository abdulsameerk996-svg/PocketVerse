import type { GameId, SessionResult } from '../types';
import { getGame } from '../registry';
import { usePlayerStore } from '../state/playerStore';
import { useProgressStore } from '../state/progressStore';
import { activityRepo, scoreRepo } from '../db/repositories';
import { grantReward, currentModifiers } from './rewards';
import { flush } from '../save/saveService';

/**
 * Session lifecycle.
 *
 * The host screen owns the *UI* of a run; this module owns the *rules*: can you
 * start, what does starting cost, what happens when you finish. Games never see
 * energy or scores directly.
 */

export type StartOutcome =
  | { ok: true; startedAt: number }
  | { ok: false; reason: 'locked' | 'energy' | 'missing'; needed?: number };

export function canStart(gameId: GameId): StartOutcome {
  const mod = getGame(gameId);
  if (!mod) return { ok: false, reason: 'missing' };
  const { player } = usePlayerStore.getState();
  if (player.level < mod.meta.minLevel) return { ok: false, reason: 'locked' };
  if (mod.meta.energyCost > 0 && player.energy < mod.meta.energyCost) {
    return { ok: false, reason: 'energy', needed: mod.meta.energyCost - player.energy };
  }
  return { ok: true, startedAt: Date.now() };
}

export function startSession(gameId: GameId): StartOutcome {
  const check = canStart(gameId);
  if (!check.ok) return check;
  const mod = getGame(gameId)!;
  if (mod.meta.energyCost > 0) {
    const paid = usePlayerStore.getState().spendEnergy(mod.meta.energyCost);
    if (!paid) return { ok: false, reason: 'energy', needed: mod.meta.energyCost };
  }
  return { ok: true, startedAt: Date.now() };
}

export type FinishedSession = SessionResult & {
  /** Reward after cosmetic multipliers — what the results screen should show. */
  finalReward: SessionResult['reward'];
  isBest: boolean;
  previousBest: number;
};

export async function finishSession(result: SessionResult): Promise<FinishedSession> {
  const progress = useProgressStore.getState();

  // 1. metrics (quests + achievements advance here)
  progress.track({ ...result.metrics, sessions_played: 1 }, result.gameId);

  // 2. score ledger
  const previousBest = await scoreRepo.best(result.gameId);
  if (result.score > 0) await scoreRepo.add(result.gameId, result.score);
  const isBest = result.score > previousBest;

  // 3. reward (single funnel — applies bonuses, celebrates, feeds activity)
  const mod = getGame(result.gameId);
  const finalReward = grantReward(result.reward, {
    silent: true,
    gameId: result.gameId,
  });

  await activityRepo.add(
    'session',
    `${mod?.meta.title ?? result.gameId}`,
    isBest && result.score > 0 ? `New best · ${Math.round(result.score)}` : undefined,
    mod?.meta.glyph,
  );

  // 4. durable write now that the run is over
  void flush();

  return { ...result, finalReward, isBest, previousBest };
}

export function sessionModifiers() {
  return currentModifiers();
}
