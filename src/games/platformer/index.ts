import type { GameModule } from '@/core/registry';
import { PlatformerSurface } from './PlatformerSurface';
import { LEVELS } from './levels';
import type { PlatformerSave } from './types';

export const platformerModule: GameModule = {
  id: 'platformer',
  meta: {
    title: 'Skyward',
    tagline: 'Five levels, gems hidden in all of them',
    glyph: '🧗',
    gradient: 'sunset',
    accent: '#FF8A3D',
    energyCost: 2,
    minLevel: 2,
    kind: 'session',
    tags: ['platformer', 'levels', 'exploration'],
    order: 80,
  },
  Surface: PlatformerSurface,
  defaultSave: (): PlatformerSave => ({ levels: {}, totalCollected: 0 }),

  quests: [
    {
      id: 'q_plat_collect',
      title: 'Sticky Fingers',
      description: 'Find 20 collectibles.',
      scope: 'daily',
      metric: 'collectibles_found',
      target: 20,
      reward: { coins: 340, xp: 100 },
      icon: '⭐',
    },
    {
      id: 'q_plat_clear',
      title: 'To the Flag',
      description: 'Clear any level.',
      scope: 'daily',
      metric: 'levels_completed',
      target: 1,
      reward: { coins: 400, gems: 2 },
      icon: '🏁',
    },
  ],

  achievements: [
    {
      id: 'ach_plat_levels',
      title: 'Trailblazer',
      description: 'Levels cleared.',
      metric: 'levels_completed',
      icon: '🧗',
      tiers: [
        { target: LEVELS.length, reward: { coins: 2000, gems: 10 } },
        { target: 25, reward: { coins: 6000, gems: 25, unlocks: ['shoes_boots'] } },
        { target: 100, reward: { coins: 22000, gems: 80, unlocks: ['shoes_flame'] } },
      ],
    },
  ],
};
