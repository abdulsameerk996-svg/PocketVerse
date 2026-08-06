import type { GameModule } from '@/core/registry';
import { PuzzleSurface } from './PuzzleSurface';
import type { PuzzleSave } from './types';

export const puzzleModule: GameModule = {
  id: 'puzzle',
  meta: {
    title: 'Logic Deck',
    tagline: 'Three modes and a daily that never repeats',
    glyph: '🧩',
    gradient: 'candy',
    accent: '#C05CFF',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['puzzle', 'daily', 'brain'],
    order: 40,
  },
  Surface: PuzzleSurface,
  defaultSave: (): PuzzleSave => ({
    bestMoves: {},
    bestMemory: 0,
    solved: 0,
    lastDaily: null,
    dailyStreak: 0,
  }),

  quests: [
    {
      id: 'q_puzzle_solve',
      title: 'Clear Head',
      description: 'Solve 2 puzzles.',
      scope: 'daily',
      metric: 'puzzles_solved',
      target: 2,
      reward: { coins: 260, xp: 80 },
      icon: '🧩',
    },
    {
      id: 'q_puzzle_daily',
      title: 'Today’s Board',
      description: 'Complete the daily puzzle.',
      scope: 'daily',
      metric: 'daily_puzzle_solved',
      target: 1,
      reward: { gems: 4, coins: 300 },
      icon: '📅',
    },
  ],

  achievements: [
    {
      id: 'ach_puzzle_solved',
      title: 'Cryptographer',
      description: 'Solve puzzles of any kind.',
      metric: 'puzzles_solved',
      icon: '🔓',
      tiers: [
        { target: 10, reward: { coins: 400 } },
        { target: 75, reward: { coins: 2400, gems: 10 } },
        { target: 300, reward: { coins: 11000, gems: 40, unlocks: ['aura_static'] } },
      ],
    },
    {
      id: 'ach_puzzle_daily',
      title: 'Never Misses',
      description: 'Complete daily puzzles.',
      metric: 'daily_puzzle_solved',
      icon: '🗓️',
      tiers: [
        { target: 7, reward: { coins: 900, gems: 6 } },
        { target: 30, reward: { coins: 4500, gems: 25 } },
        { target: 120, reward: { coins: 20000, gems: 90, unlocks: ['hat_halo'] } },
      ],
    },
  ],
};
