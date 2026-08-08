import type { GameModule } from '@/core/registry';
import { LaserSurviveSurface } from './LaserSurviveSurface';
import type { LaserSurviveSave } from './types';

export const laserSurviveModule: GameModule = {
  id: 'lasersurvive',
  meta: {
    title: 'Laser Survive',
    tagline: 'Dodge the beam. Read the gap.',
    glyph: 'laser',
    gradient: 'blood',
    accent: '#FF6B6B',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 40,
    difficulty: 'medium',
    session: '2 min',
  },
  Surface: LaserSurviveSurface,
  defaultSave: (): LaserSurviveSave => ({ runs: 0, best: 0, bestTime: 0 }),

  quests: [
    {
      id: 'q_lasersurvive_time',
      title: 'Clear Line',
      description: 'Survive 90 seconds in one Laser Survive run.',
      scope: 'daily',
      metric: 'lasersurvive_time',
      target: 90,
      reward: { coins: 240, xp: 65 },
      icon: 'laser',
    },
  ],

  achievements: [
    {
      id: 'ach_lasersurvive_time',
      title: 'Ghost in the Machine',
      description: 'Longest single Laser Survive run.',
      metric: 'lasersurvive_time',
      icon: 'laser',
      tiers: [
        { target: 60, reward: { coins: 250 } },
        { target: 150, reward: { coins: 2200, gems: 7 } },
        { target: 300, reward: { coins: 11000, gems: 35 } },
      ],
    },
  ],
};
