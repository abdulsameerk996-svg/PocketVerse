import type { GameModule } from '@/core/registry';
import { OrbitGuardSurface } from './OrbitGuardSurface';
import type { OrbitGuardSave } from './types';

export const orbitGuardModule: GameModule = {
  id: 'orbitguard',
  meta: {
    title: 'Orbit Guard',
    tagline: 'Swing the shield. Save the core.',
    glyph: 'orbit',
    gradient: 'candy',
    accent: '#C05CFF',
    energyCost: 2,
    minLevel: 1,
    kind: 'session',
    category: 'quick',
    tags: ['quick', 'reflex', 'scores'],
    order: 42,
    difficulty: 'medium',
    session: '2 min',
  },
  Surface: OrbitGuardSurface,
  defaultSave: (): OrbitGuardSave => ({ runs: 0, best: 0, bestBlocks: 0 }),

  quests: [
    {
      id: 'q_orbitguard_blocks',
      title: 'Human Bulwark',
      description: 'Deflect 60 orbs in one Orbit Guard run.',
      scope: 'daily',
      metric: 'orbitguard_blocks',
      target: 60,
      reward: { coins: 240, xp: 65 },
      icon: 'orbit',
    },
  ],

  achievements: [
    {
      id: 'ach_orbitguard_blocks',
      title: 'Core Keeper',
      description: 'Orbs deflected, lifetime.',
      metric: 'orbitguard_blocks',
      icon: 'orbit',
      tiers: [
        { target: 150, reward: { coins: 250 } },
        { target: 1000, reward: { coins: 2200, gems: 7 } },
        { target: 4000, reward: { coins: 11000, gems: 35 } },
      ],
    },
  ],
};
