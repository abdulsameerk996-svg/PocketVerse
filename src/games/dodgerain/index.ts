import type { GameModule } from '@/core/registry';
import { DodgeRainSurface } from './DodgeRainSurface';
import type { DodgeRainSave } from './types';

export const dodgeRainModule: GameModule = {
  id: 'dodgerain',
  meta: {
    title: 'Dodge Rain',
    tagline: 'The sky is falling. Keep moving.',
    glyph: 'rain',
    gradient: 'deep',
    accent: '#4EA8FF',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 37,
    difficulty: 'easy',
    session: '2 min',
  },
  Surface: DodgeRainSurface,
  defaultSave: (): DodgeRainSave => ({ runs: 0, best: 0, bestTime: 0 }),

  quests: [
    {
      id: 'q_dodgerain_dodges',
      title: 'Under the Umbrella',
      description: 'Dodge 40 falling drops in one Dodge Rain session.',
      scope: 'daily',
      metric: 'dodgerain_dodges',
      target: 40,
      reward: { coins: 240, xp: 65 },
      icon: 'rain',
    },
  ],

  achievements: [
    {
      id: 'ach_dodgerain_time',
      title: 'Storm Survivor',
      description: 'Survive one Dodge Rain run for this long.',
      metric: 'dodgerain_time',
      icon: 'rain',
      tiers: [
        { target: 60, reward: { coins: 250 } },
        { target: 120, reward: { coins: 2000, gems: 6 } },
        { target: 240, reward: { coins: 10000, gems: 30 } },
      ],
    },
  ],
};
