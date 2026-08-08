import type { GameModule } from '@/core/registry';
import { OneTapSurface } from './OneTapSurface';
import type { OneTapSave } from './types';

export const oneTapModule: GameModule = {
  id: 'onetap',
  meta: {
    title: 'One-Tap Flight',
    tagline: 'One button. One bird. No mercy.',
    glyph: 'wing',
    gradient: 'mint',
    accent: '#34E2A8',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 38,
    difficulty: 'hard',
    session: '1 min',
  },
  Surface: OneTapSurface,
  defaultSave: (): OneTapSave => ({ runs: 0, best: 0, bestPasses: 0 }),

  quests: [
    {
      id: 'q_onetap_pipes',
      title: 'Pipe Dreams',
      description: 'Clear 25 pipes in one One-Tap Flight run.',
      scope: 'daily',
      metric: 'onetap_passes',
      target: 25,
      reward: { coins: 240, xp: 65 },
      icon: 'wing',
    },
  ],

  achievements: [
    {
      id: 'ach_onetap_distance',
      title: 'Feathered',
      description: 'Total One-Tap Flight distance flown.',
      metric: 'onetap_distance',
      icon: 'wing',
      tiers: [
        { target: 300, reward: { coins: 250 } },
        { target: 2000, reward: { coins: 2200, gems: 7 } },
        { target: 8000, reward: { coins: 11000, gems: 35 } },
      ],
    },
  ],
};
