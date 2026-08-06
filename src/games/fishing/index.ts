import type { GameModule } from '@/core/registry';
import { FishingSurface } from './FishingSurface';
import { ALL_FISH, FISH_ITEMS } from './content';
import type { FishingSave } from './types';

export const fishingModule: GameModule = {
  id: 'fishing',
  meta: {
    title: 'Still Waters',
    tagline: 'Four spots, twenty species, one patient thumb',
    glyph: '🎣',
    gradient: 'deep',
    accent: '#22D3EE',
    // Ambient modules are entered without a gate, so they must not charge energy.
    energyCost: 0,
    minLevel: 1,
    kind: 'ambient',
    tags: ['cosy', 'collection', 'timing'],
    order: 70,
  },
  Surface: FishingSurface,
  items: FISH_ITEMS,
  defaultSave: (): FishingSave => ({
    location: 'loc_pond',
    unlocked: ['loc_pond'],
    caught: 0,
    species: [],
    biggest: 0,
  }),

  quests: [
    {
      id: 'q_fish_catch',
      title: 'Good Haul',
      description: 'Catch 8 fish.',
      scope: 'daily',
      metric: 'fish_caught',
      target: 8,
      reward: { coins: 320, xp: 95 },
      icon: '🎣',
    },
    {
      id: 'q_fish_rare',
      title: 'The Big One',
      description: 'Land a legendary fish.',
      scope: 'weekly',
      metric: 'fishing_legendary',
      target: 1,
      reward: { gems: 12, coins: 1500 },
      icon: '🐉',
    },
  ],

  achievements: [
    {
      id: 'ach_fish_species',
      title: 'Ichthyologist',
      description: 'Distinct species recorded.',
      metric: 'fish_species',
      icon: '📖',
      tiers: [
        { target: 5, reward: { coins: 400 } },
        { target: 12, reward: { coins: 2600, gems: 10, unlocks: ['bg_reef'] } },
        { target: ALL_FISH.length, reward: { coins: 20000, gems: 75, unlocks: ['deco_aquarium'] } },
      ],
    },
  ],
};
