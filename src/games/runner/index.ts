import type { GameModule } from '@/core/registry';
import { RunnerSurface } from './RunnerSurface';
import { RUNNER_ITEMS } from './content';
import type { RunnerSave } from './types';

export const runnerModule: GameModule = {
  id: 'runner',
  meta: {
    title: 'Neon Sprint',
    tagline: 'Three lanes, no brakes',
    glyph: '🏃',
    gradient: 'mint',
    accent: '#34E2A8',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    tags: ['action', 'endless', 'reflex'],
    order: 20,
  },
  Surface: RunnerSurface,
  items: RUNNER_ITEMS,
  defaultSave: (): RunnerSave => ({
    runs: 0,
    bestDistance: 0,
    totalDistance: 0,
    skin: 'run_default',
    unlockedSkins: ['run_default'],
  }),

  quests: [
    {
      id: 'q_run_distance',
      title: 'Long Legs',
      description: 'Run 1,500 m in total today.',
      scope: 'daily',
      metric: 'run_distance',
      target: 1500,
      reward: { coins: 300, xp: 90 },
      icon: '🏃',
    },
    {
      id: 'q_run_power',
      title: 'Charged',
      description: 'Grab 6 powerups.',
      scope: 'daily',
      metric: 'run_powerups',
      target: 6,
      reward: { coins: 240, items: { mat_circuit: 1 } },
      icon: '⚡',
    },
  ],

  achievements: [
    {
      id: 'ach_run_distance',
      title: 'Marathoner',
      description: 'Total distance sprinted.',
      metric: 'run_distance',
      icon: '🛣️',
      tiers: [
        { target: 5_000, reward: { coins: 500 } },
        { target: 50_000, reward: { coins: 3000, gems: 12, unlocks: ['run_ninja'] } },
        { target: 250_000, reward: { coins: 15000, gems: 50, unlocks: ['run_dragon'] } },
      ],
    },
  ],
};
