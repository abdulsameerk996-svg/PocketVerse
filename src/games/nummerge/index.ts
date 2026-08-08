import type { GameModule } from '@/core/registry';
import { NumMergeSurface } from './NumMergeSurface';
import type { NumMergeSave } from './types';

export const numMergeModule: GameModule = {
  id: 'nummerge',
  meta: {
    title: 'Number Merge',
    tagline: 'Slide, fuse, climb. A pocket 2048.',
    glyph: 'merge',
    gradient: 'violet',
    accent: '#8B5CFF',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'puzzle', 'scores'],
    order: 39,
    difficulty: 'medium',
    session: '2 min',
  },
  Surface: NumMergeSurface,
  defaultSave: (): NumMergeSave => ({ runs: 0, best: 0, bestMerges: 0 }),

  quests: [
    {
      id: 'q_nummerge_merges',
      title: 'Fusion Fiddler',
      description: 'Fuse 60 tiles in one Number Merge run.',
      scope: 'daily',
      metric: 'nummerge_merges',
      target: 60,
      reward: { coins: 240, xp: 65 },
      icon: 'merge',
    },
  ],

  achievements: [
    {
      id: 'ach_nummerge_score',
      title: 'Mathematician',
      description: 'Best single-run Number Merge score.',
      metric: 'nummerge_score',
      icon: 'merge',
      tiers: [
        { target: 800, reward: { coins: 250 } },
        { target: 3000, reward: { coins: 2200, gems: 7 } },
        { target: 9000, reward: { coins: 11000, gems: 35 } },
      ],
    },
  ],
};
