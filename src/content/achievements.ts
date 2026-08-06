import type { AchievementDef } from '@/core/types';

/** Tiered, permanent, cross-game. Every tier grants its own reward. */
export const CORE_ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'ach_sessions',
    title: 'Persistent',
    description: 'Play sessions across the whole verse.',
    metric: 'sessions_played',
    icon: '🎯',
    tiers: [
      { target: 10, reward: { coins: 300, xp: 100 } },
      { target: 50, reward: { coins: 1200, gems: 5 } },
      { target: 200, reward: { coins: 4000, gems: 20, unlocks: ['trail_spark'] } },
      { target: 1000, reward: { coins: 15000, gems: 80, unlocks: ['aura_solar'] } },
    ],
  },
  {
    id: 'ach_coins',
    title: 'Tycoon',
    description: 'Earn coins from any activity.',
    metric: 'coins_earned',
    icon: '💰',
    tiers: [
      { target: 2500, reward: { xp: 150 } },
      { target: 25000, reward: { gems: 10, unlocks: ['hat_beanie'] } },
      { target: 150000, reward: { gems: 40, unlocks: ['hat_crown'] } },
    ],
  },
  {
    id: 'ach_items',
    title: 'Archivist',
    description: 'Collect items from every corner of the verse.',
    metric: 'items_collected',
    icon: '🗃️',
    tiers: [
      { target: 50, reward: { coins: 400 } },
      { target: 500, reward: { coins: 2500, gems: 10 } },
      { target: 2500, reward: { coins: 12000, gems: 45, unlocks: ['deco_trophy'] } },
    ],
  },
  {
    id: 'ach_levels',
    title: 'Ascendant',
    description: 'Level up your account.',
    metric: 'levels_gained',
    icon: '🔺',
    tiers: [
      { target: 5, reward: { coins: 500 } },
      { target: 15, reward: { gems: 15, unlocks: ['shirt_hoodie'] } },
      { target: 30, reward: { gems: 50, unlocks: ['shirt_aurora'] } },
    ],
  },
  {
    id: 'ach_variety',
    title: 'Omnivore',
    description: 'Play every game at least once.',
    metric: 'games_distinct_played',
    icon: '🌐',
    tiers: [{ target: 10, reward: { coins: 5000, gems: 30, unlocks: ['bg_void'] } }],
  },
];
