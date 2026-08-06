import type { RewardBundle } from '@/core/types';

/** 7-day rotating login ladder. Day 7 is deliberately worth returning for. */
export const DAILY_LADDER: { reward: RewardBundle; glyph: string; label: string }[] = [
  { reward: { coins: 200 }, glyph: '🪙', label: '200 coins' },
  { reward: { xp: 150 }, glyph: '⚡', label: '150 XP' },
  { reward: { coins: 500, items: { mat_scrap: 3 } }, glyph: '📦', label: '500 + scrap' },
  { reward: { gems: 5 }, glyph: '💎', label: '5 gems' },
  { reward: { coins: 900, items: { mat_circuit: 2 } }, glyph: '🧿', label: '900 + circuits' },
  { reward: { items: { con_energy_s: 2 }, xp: 300 }, glyph: '🍬', label: 'Snacks + 300 XP' },
  {
    reward: { coins: 2500, gems: 15, items: { mat_core: 1 } },
    glyph: '🎁',
    label: 'Jackpot crate',
  },
];

export function ladderIndexFor(streak: number) {
  return ((streak - 1) % DAILY_LADDER.length + DAILY_LADDER.length) % DAILY_LADDER.length;
}
