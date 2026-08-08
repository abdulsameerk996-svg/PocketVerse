import type { GameModule } from '@/core/registry';
import { Survive60Surface } from './Survive60Surface';
import type { Survive60Save } from './types';

export const survive60Module: GameModule = {
  id: 'survive60',
  meta: {
    title: 'Survive 60',
    tagline: 'One minute. A screen of chasers.',
    glyph: '⏱️',
    gradient: 'cyan',
    accent: '#22D3EE',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'action', 'survival', 'scores'],
    order: 33,
    difficulty: 'medium',
    session: '1 min',
  },
  Surface: Survive60Surface,
  defaultSave: (): Survive60Save => ({ runs: 0, best: 0, totalKills: 0 }),

  quests: [
    {
      id: 'q_survive60_time',
      title: 'Still Standing',
      description: 'Survive 45 seconds in one run.',
      scope: 'daily',
      metric: 'survive60_time',
      target: 45,
      reward: { coins: 300, xp: 80 },
      icon: '⏱️',
    },
  ],

  achievements: [
    {
      id: 'ach_survive60_kills',
      title: 'Dash Through',
      description: 'Enemies popped with the dash, lifetime.',
      metric: 'survive60_kills',
      icon: '💨',
      tiers: [
        { target: 50, reward: { coins: 350 } },
        { target: 400, reward: { coins: 2800, gems: 9 } },
        { target: 2000, reward: { coins: 14000, gems: 45 } },
      ],
    },
  ],
};
