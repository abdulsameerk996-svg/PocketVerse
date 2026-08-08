import type { GameModule } from '@/core/registry';
import { TowerDefSurface } from './TowerDefSurface';
import type { TowerDefSave } from './types';

export const towerDefModule: GameModule = {
  id: 'towerdef',
  meta: {
    title: 'Tower Defense',
    tagline: 'One path. Eleven waves. Hold the line.',
    glyph: '🗼',
    gradient: 'mint',
    accent: '#34E2A8',
    energyCost: 3,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'strategy', 'towers', 'scores'],
    order: 35,
    difficulty: 'medium',
    session: '5 min',
  },
  Surface: TowerDefSurface,
  defaultSave: (): TowerDefSave => ({ runs: 0, best: 0, bestWave: 0 }),

  quests: [
    {
      id: 'q_towerdef_wave',
      title: 'Hold the Line',
      description: 'Reach wave 6 in one Tower Defense run.',
      scope: 'daily',
      metric: 'towerdef_wave',
      target: 6,
      reward: { coins: 340, xp: 90, items: { mat_circuit: 1 } },
      icon: '🗼',
    },
  ],

  achievements: [
    {
      id: 'ach_towerdef_wave',
      title: 'Architect of Defense',
      description: 'Furthest wave ever reached.',
      metric: 'towerdef_wave',
      icon: '🏰',
      tiers: [
        { target: 5, reward: { coins: 300 } },
        { target: 9, reward: { coins: 2400, gems: 8 } },
        { target: 11, reward: { coins: 11000, gems: 40 } },
      ],
    },
  ],
};
