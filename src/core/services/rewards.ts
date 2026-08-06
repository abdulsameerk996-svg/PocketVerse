import type { GameId, RewardBundle } from '../types';
import { usePlayerStore } from '../state/playerStore';
import { useInventoryStore } from '../state/inventoryStore';
import { useProgressStore } from '../state/progressStore';
import { celebrate, toast } from '../state/uiStore';
import { activityRepo } from '../db/repositories';
import { getAchievement, getItem } from '@/content/catalog';
import { isRewardEmpty, mergeModifiers } from '../economy/progression';
import { haptics } from '@/ui/hooks/useHaptics';

/**
 * THE single place a reward is granted.
 *
 * Nothing else in the codebase mutates coins/xp/items. Because every path flows
 * through here we get, for free and consistently:
 *   - cosmetic bonuses applied exactly once
 *   - coins_earned / xp_earned / items_collected metrics recorded
 *   - achievement tiers evaluated and celebrated
 *   - level-up celebration
 *   - the activity feed on the home screen
 */

export function currentModifiers() {
  const { equipped } = usePlayerStore.getState().player.avatar;
  const unlocked = useInventoryStore.getState().unlocks;
  const mods = Object.values(equipped)
    .filter((id): id is string => !!id && !!unlocked[id])
    .map((id) => getItem(id).modifiers);
  return mergeModifiers(mods);
}

export type GrantOptions = {
  /** Suppress the toast (used when a results screen already shows the reward). */
  silent?: boolean;
  /** Skip cosmetic multipliers (quest/achievement payouts are already tuned). */
  raw?: boolean;
  label?: string;
  gameId?: GameId;
  icon?: string;
};

export function grantReward(reward: RewardBundle, opts: GrantOptions = {}): RewardBundle {
  if (isRewardEmpty(reward)) return reward;

  const player = usePlayerStore.getState();
  const inventory = useInventoryStore.getState();
  const progress = useProgressStore.getState();

  const mods = currentModifiers();
  const final: RewardBundle = opts.raw
    ? reward
    : {
        ...reward,
        coins: reward.coins ? Math.round(reward.coins * (1 + mods.coinBonus)) : undefined,
        xp: reward.xp ? Math.round(reward.xp * (1 + mods.xpBonus)) : undefined,
      };

  if (final.coins) player.addCoins(final.coins);
  if (final.gems) player.addGems(final.gems);
  if (final.energy) player.addEnergy(final.energy);

  let itemCount = 0;
  if (final.items) {
    inventory.addMany(final.items);
    for (const qty of Object.values(final.items)) itemCount += qty;
  }
  if (final.unlocks?.length) inventory.unlockMany(final.unlocks);

  // XP last: levelling can top up energy, which should reflect the full grant.
  const levelsGained = final.xp ? player.addXp(final.xp) : 0;

  progress.track(
    {
      coins_earned: final.coins ?? 0,
      xp_earned: final.xp ?? 0,
      items_collected: itemCount,
      levels_gained: levelsGained,
    },
    opts.gameId,
  );

  if (levelsGained > 0) {
    const newLevel = usePlayerStore.getState().player.level;
    celebrate({ kind: 'levelUp', level: newLevel });
    haptics.success();
  }

  flushAchievementUnlocks();

  if (!opts.silent) {
    toast({
      title: opts.label ?? 'Reward collected',
      subtitle: describeReward(final),
      glyph: opts.icon ?? '🎁',
      tone: 'reward',
    });
  }

  if (opts.label) {
    void activityRepo.add('reward', opts.label, describeReward(final), opts.icon ?? '🎁');
  }

  return final;
}

/** Achievements grant their own rewards; loop-safe because tiers only rise. */
export function flushAchievementUnlocks() {
  const progress = useProgressStore.getState();
  const unlocks = progress.drainAchievementUnlocks();
  if (!unlocks.length) return;
  for (const u of unlocks) {
    const def = getAchievement(u.id);
    celebrate({
      kind: 'achievement',
      title: def?.title ?? 'Achievement',
      tier: u.tier,
      icon: def?.icon ?? '🏆',
      reward: u.reward,
    });
    grantReward(u.reward, {
      silent: true,
      raw: true,
      label: `${def?.title ?? 'Achievement'} · Tier ${u.tier}`,
      icon: def?.icon ?? '🏆',
    });
  }
}

export function describeReward(r: RewardBundle): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`+${r.coins} 🪙`);
  if (r.gems) parts.push(`+${r.gems} 💎`);
  if (r.xp) parts.push(`+${r.xp} XP`);
  if (r.energy) parts.push(`+${r.energy} ⚡`);
  for (const [id, qty] of Object.entries(r.items ?? {})) {
    parts.push(`${getItem(id).glyph} ${getItem(id).name} ×${qty}`);
  }
  for (const id of r.unlocks ?? []) parts.push(`${getItem(id).glyph} ${getItem(id).name}`);
  return parts.join('  ');
}
