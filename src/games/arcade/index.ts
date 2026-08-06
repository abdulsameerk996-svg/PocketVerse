import type { GameModule } from '@/core/registry';
import { ArcadeSurface } from './ArcadeSurface';
import type { ArcadeSave } from './types';

export const arcadeModule: GameModule = {
  id: 'arcade',
  meta: {
    title: 'The Arcade',
    tagline: 'Three rotating challenges, new every day',
    glyph: '🕹️',
    gradient: 'violet',
    accent: '#7C5CFF',
    energyCost: 1,
    minLevel: 1,
    kind: 'session',
    tags: ['minigames', 'daily', 'scores'],
    order: 100,
  },
  Surface: ArcadeSurface,
  defaultSave: (): ArcadeSave => ({ best: {}, rounds: 0, lastRotation: null }),

  quests: [
    {
      id: 'q_arcade_rounds',
      title: 'Coin-Op',
      description: 'Play 4 arcade rounds.',
      scope: 'daily',
      metric: 'arcade_rounds',
      target: 4,
      reward: { coins: 280, xp: 85 },
      icon: '🕹️',
    },
  ],

  achievements: [
    {
      id: 'ach_arcade_rounds',
      title: 'Regular at the Arcade',
      description: 'Arcade rounds played.',
      metric: 'arcade_rounds',
      icon: '👾',
      tiers: [
        { target: 20, reward: { coins: 400 } },
        { target: 150, reward: { coins: 2800, gems: 10, unlocks: ['deco_arcade'] } },
        { target: 600, reward: { coins: 13000, gems: 45 } },
      ],
    },
  ],
};
