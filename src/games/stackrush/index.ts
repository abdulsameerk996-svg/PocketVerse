import type { GameModule } from '@/core/registry';
import { StackRushSurface } from './StackRushSurface';
import type { StackRushSave } from './types';

export const stackRushModule: GameModule = {
  id: 'stackrush',
  meta: {
    title: 'Stack Rush',
    tagline: 'Tap at the line. Never blink.',
    glyph: '🟪',
    gradient: 'violet',
    accent: '#8B5CFF',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 31,
    difficulty: 'easy',
    session: '1 min',
  },
  Surface: StackRushSurface,
  defaultSave: (): StackRushSave => ({ runs: 0, best: 0, perfects: 0, bestStreak: 0 }),

  quests: [
    {
      id: 'q_stack_perfects',
      title: 'Clean Cut',
      description: 'Land 5 perfect stacks.',
      scope: 'daily',
      metric: 'stackrush_perfects',
      target: 5,
      reward: { coins: 220, xp: 60 },
      icon: '🎯',
    },
  ],

  achievements: [
    {
      id: 'ach_stack_perfects',
      title: 'Master Builder',
      description: 'Perfect stacks, lifetime.',
      metric: 'stackrush_perfects',
      icon: '🟪',
      tiers: [
        { target: 30, reward: { coins: 300 } },
        { target: 300, reward: { coins: 2400, gems: 8 } },
        { target: 1500, reward: { coins: 12000, gems: 40 } },
      ],
    },
  ],
};
