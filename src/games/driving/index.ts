import type { GameModule } from '@/core/registry';
import { DriveSurface } from './DriveSurface';
import { CAR_ITEMS } from './content';
import type { DrivingSave } from './types';

export const drivingModule: GameModule = {
  id: 'driving',
  meta: {
    title: 'Highway Drift',
    tagline: 'A road that never repeats',
    glyph: '🏎️',
    gradient: 'deep',
    accent: '#4EA8FF',
    energyCost: 2,
    minLevel: 2,
    kind: 'session',
    tags: ['action', 'endless', 'vehicles'],
    order: 30,
  },
  Surface: DriveSurface,
  items: CAR_ITEMS,
  defaultSave: (): DrivingSave => ({
    car: 'car_hatch',
    unlockedCars: ['car_hatch'],
    runs: 0,
    bestDistance: 0,
    totalDistance: 0,
    missionIndex: 0,
    missionProgress: 0,
    missionsCompleted: 0,
  }),

  quests: [
    {
      id: 'q_drive_distance',
      title: 'Road Trip',
      description: 'Drive 2,000 m today.',
      scope: 'daily',
      metric: 'drive_distance',
      target: 2000,
      reward: { coins: 340, xp: 100 },
      icon: '🛣️',
    },
    {
      id: 'q_drive_near',
      title: 'Adrenaline',
      description: 'Get 15 near misses.',
      scope: 'daily',
      metric: 'drive_near_miss',
      target: 15,
      reward: { coins: 420, items: { mat_circuit: 1 } },
      icon: '💨',
    },
  ],

  achievements: [
    {
      id: 'ach_drive_missions',
      title: 'Contractor',
      description: 'Complete driving missions.',
      metric: 'drive_missions',
      icon: '📋',
      tiers: [
        { target: 3, reward: { coins: 800 } },
        { target: 12, reward: { coins: 3200, gems: 12 } },
        { target: 40, reward: { coins: 12000, gems: 40, unlocks: ['car_hyper'] } },
      ],
    },
  ],
};
