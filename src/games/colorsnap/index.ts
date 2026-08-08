import type { GameModule } from '@/core/registry';
import { ColorSnapSurface } from './ColorSnapSurface';
import type { ColorSnapSave } from './types';

export const colorSnapModule: GameModule = {
  id: 'colorsnap',
  meta: {
    title: 'Color Snap',
    tagline: 'See the disc. Beat the clock.',
    glyph: '🎨',
    gradient: 'gold',
    accent: '#FFD166',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 32,
    difficulty: 'easy',
    session: '1 min',
  },
  Surface: ColorSnapSurface,
  defaultSave: (): ColorSnapSave => ({ runs: 0, best: 0, bestStreak: 0 }),

  quests: [
    {
      id: 'q_colorsnap_score',
      title: 'Snap Happy',
      description: 'Score 800 in one Color Snap run.',
      scope: 'daily',
      metric: 'colorsnap_score',
      target: 800,
      reward: { coins: 260, xp: 70 },
      icon: '🎨',
    },
  ],

  achievements: [
    {
      id: 'ach_colorsnap_streak',
      title: 'Colour Run',
      description: 'Longest single-run streak.',
      metric: 'colorsnap_streak',
      icon: '🌈',
      tiers: [
        { target: 5, reward: { coins: 250 } },
        { target: 15, reward: { coins: 2000, gems: 6 } },
        { target: 40, reward: { coins: 10000, gems: 30 } },
      ],
    },
  ],
};
