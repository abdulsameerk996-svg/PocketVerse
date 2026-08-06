import { DAILY_LADDER, ladderIndexFor } from '@/content/dailyRewards';
import { dailyRepo } from '../db/repositories';
import { usePlayerStore } from '../state/playerStore';
import { grantReward } from './rewards';
import { dayKey, daysBetween } from '../utils/time';

/**
 * Daily login rewards + streak.
 *
 * The streak is derived from `lastClaimDay` rather than a background timer, so
 * it survives the app being killed for a week and works fully offline.
 */

export type DailyStatus = {
  day: string;
  /** 0-based position in the 7-day ladder for the *next* claim. */
  index: number;
  streak: number;
  available: boolean;
  /** Streak will reset on claim because a day was missed. */
  broken: boolean;
};

export async function getDailyStatus(): Promise<DailyStatus> {
  const p = usePlayerStore.getState().player;
  const today = dayKey();
  const claimedToday = await dailyRepo.claimed(today);

  let streak = p.streak;
  let broken = false;
  if (p.lastClaimDay) {
    const gap = daysBetween(p.lastClaimDay, today);
    if (gap > 1) {
      streak = 0;
      broken = true;
    }
  } else {
    streak = 0;
  }

  const nextStreak = claimedToday ? streak : streak + 1;
  return {
    day: today,
    index: ladderIndexFor(Math.max(1, nextStreak)),
    streak,
    available: !claimedToday,
    broken,
  };
}

export async function claimDaily(): Promise<{ claimed: boolean; index: number }> {
  const status = await getDailyStatus();
  if (!status.available) return { claimed: false, index: status.index };

  const entry = DAILY_LADDER[status.index];
  const nextStreak = status.streak + 1;

  await dailyRepo.claim(status.day, status.index, entry.reward);
  usePlayerStore.setState((s) => ({
    player: { ...s.player, streak: nextStreak, lastClaimDay: status.day },
  }));

  grantReward(entry.reward, {
    raw: true,
    silent: true,
    label: `Day ${status.index + 1} reward`,
    icon: entry.glyph,
  });

  return { claimed: true, index: status.index };
}
