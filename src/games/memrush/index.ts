import type { GameModule } from '@/core/registry';
import { MemRushSurface } from './MemRushSurface';
import type { MemRushSave } from './types';

export const memRushModule: GameModule = {
  id: 'memrush',
  meta: {
    title: 'Memory Rush',
    tagline: 'Watch the lights. Repeat the pattern.',
    glyph: 'pulse',
    gradient: 'cyan',
    accent: '#22D3EE',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'memory', 'scores'],
    order: 41,
    difficulty: 'easy',
    session: '2 min',
  },
  Surface: MemRushSurface,
  defaultSave: (): MemRushSave => ({ runs: 0, best: 0, bestStreak: 0 }),

  quests: [
    {
      id: 'q_memrush_clears',
      title: 'Pattern Reader',
      description: 'Clear a 6-step pattern in one Memory Rush run.',
      scope: 'daily',
      metric: 'memrush_streak',
      target: 6,
      reward: { coins: 240, xp: 65 },
      icon: 'pulse',
    },
  ],

  achievements: [
    {
      id: 'ach_memrush_streak',
      title: 'Eidetic',
      description: 'Longest single-run pattern cleared.',
      metric: 'memrush_streak',
      icon: 'pulse',
      tiers: [
        { target: 5, reward: { coins: 250 } },
        { target: 12, reward: { coins: 2200, gems: 7 } },
        { target: 25, reward: { coins: 11000, gems: 35 } },
      ],
    },
  ],
};
