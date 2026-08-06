import type { QuestDef } from '@/core/types';

/**
 * Cross-game quests. These deliberately span modules — "play 3 different games"
 * only means something because every module reports into the same metric stream.
 * Module-local quests live in each game's folder and are merged by `catalog.ts`.
 */
export const CORE_QUESTS: QuestDef[] = [
  {
    id: 'q_daily_sessions',
    title: 'Warm Up',
    description: 'Play any 3 sessions.',
    scope: 'daily',
    metric: 'sessions_played',
    target: 3,
    reward: { coins: 250, xp: 60 },
    icon: '🎮',
  },
  {
    id: 'q_daily_variety',
    title: 'Tour the Verse',
    description: 'Play 3 different games today.',
    scope: 'daily',
    metric: 'games_distinct_played',
    target: 3,
    reward: { coins: 400, xp: 110, items: { mat_circuit: 1 } },
    icon: '🧭',
  },
  {
    id: 'q_daily_coins',
    title: 'Payday',
    description: 'Earn 1,200 coins.',
    scope: 'daily',
    metric: 'coins_earned',
    target: 1200,
    reward: { gems: 3, xp: 80 },
    icon: '🪙',
  },
  {
    id: 'q_daily_items',
    title: 'Collector',
    description: 'Collect 12 items from any game.',
    scope: 'daily',
    metric: 'items_collected',
    target: 12,
    reward: { coins: 320, items: { mat_scrap: 5 } },
    icon: '🎒',
  },
  {
    id: 'q_weekly_xp',
    title: 'Grind Week',
    description: 'Earn 4,000 XP this week.',
    scope: 'weekly',
    metric: 'xp_earned',
    target: 4000,
    reward: { gems: 25, coins: 2500, items: { mat_core: 1 } },
    icon: '📊',
  },
  {
    id: 'q_weekly_sessions',
    title: 'Regular',
    description: 'Play 25 sessions this week.',
    scope: 'weekly',
    metric: 'sessions_played',
    target: 25,
    reward: { gems: 15, coins: 1800 },
    icon: '🗓️',
  },
  {
    id: 'q_story_level5',
    title: 'Finding Your Feet',
    description: 'Reach level 5.',
    scope: 'story',
    metric: 'levels_gained',
    target: 4,
    reward: { coins: 1000, gems: 10, unlocks: ['hat_cap'] },
    icon: '🌱',
  },
  {
    id: 'q_story_collector',
    title: 'Hoarder',
    description: 'Collect 250 items across all games.',
    scope: 'story',
    metric: 'items_collected',
    target: 250,
    reward: { coins: 4000, gems: 30, unlocks: ['aura_pulse'] },
    icon: '📦',
  },
];

/** How many daily/weekly quests are surfaced at a time. */
export const DAILY_QUEST_SLOTS = 4;
export const WEEKLY_QUEST_SLOTS = 3;
