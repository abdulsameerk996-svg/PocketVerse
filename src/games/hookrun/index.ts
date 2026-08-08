import type { GameModule } from '@/core/registry';
import { HookRunSurface } from './HookRunSurface';
import type { HookRunSave } from './types';

export const hookRunModule: GameModule = {
  id: 'hookrun',
  meta: {
    title: 'Hook Run',
    tagline: 'Swing high, cut the line, fly.',
    glyph: '🪝',
    gradient: 'sunset',
    accent: '#FF4D8D',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'action', 'skill', 'scores'],
    order: 34,
    difficulty: 'hard',
    session: '2 min',
  },
  Surface: HookRunSurface,
  defaultSave: (): HookRunSave => ({ runs: 0, best: 0, grapples: 0 }),

  quests: [
    {
      id: 'q_hookrun_distance',
      title: 'High Wire',
      description: 'Cover 300 m in one Hook Run.',
      scope: 'daily',
      metric: 'hookrun_distance',
      target: 300,
      reward: { coins: 320, xp: 85 },
      icon: '🪝',
    },
  ],

  achievements: [
    {
      id: 'ach_hookrun_distance',
      title: 'Flight School',
      description: 'Total distance swung, lifetime.',
      metric: 'hookrun_distance',
      icon: '🦅',
      tiers: [
        { target: 2_000, reward: { coins: 350 } },
        { target: 20_000, reward: { coins: 3000, gems: 10 } },
        { target: 120_000, reward: { coins: 15000, gems: 50 } },
      ],
    },
  ],
};
