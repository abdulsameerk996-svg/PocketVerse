import type { GameModule } from '@/core/registry';
import { createLazySurface } from '@/core/game3d/lazySurface';

export const airHockeyModule: GameModule = {
  id: 'airhockey',
  meta: {
    title: 'Air Hockey',
    tagline: 'Two paddles, one puck, no mercy',
    glyph: '🏒',
    gradient: 'cyan',
    accent: '#22D3EE',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['action', 'versus', '3d'],
    order: 200,
    category: 'versus',
    players: 2,
  },
  Surface: createLazySurface(() => import('./AirHockeyGame'), '🏒', 'Chalking the table'),

  quests: [
    {
      id: 'q_versus_wins',
      title: 'House Rules',
      description: 'Win 2 two-player matches.',
      scope: 'daily',
      metric: 'versus_wins',
      target: 2,
      reward: { coins: 400, xp: 110, items: { mat_scrap: 2 } },
      icon: '🎮',
    },
  ],

  achievements: [
    {
      id: 'ach_versus_matches',
      title: 'Couch Legend',
      description: 'Two-player matches played.',
      metric: 'versus_matches',
      icon: '🛋️',
      tiers: [
        { target: 10, reward: { coins: 700 } },
        { target: 75, reward: { coins: 4200, gems: 12 } },
        { target: 400, reward: { coins: 19000, gems: 60 } },
      ],
    },
  ],
};
