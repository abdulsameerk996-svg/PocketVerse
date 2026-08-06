import type { GameModule } from '@/core/registry';
import { FarmSurface } from './FarmSurface';
import { CROPS, FARM_ITEMS, MAX_PLOTS, START_PLOTS } from './content';
import { emptyPlot, growthOf, type FarmSave } from './types';

export const farmModule: GameModule = {
  id: 'farm',
  meta: {
    title: 'Homestead',
    tagline: 'Plant it, forget it, come back rich',
    glyph: '🌾',
    gradient: 'toxic',
    accent: '#A3E635',
    energyCost: 0,
    minLevel: 2,
    kind: 'ambient',
    tags: ['idle', 'cosy', 'economy'],
    order: 60,
  },
  Surface: FarmSurface,
  items: FARM_ITEMS,
  defaultSave: (): FarmSave => ({
    plots: Array.from({ length: MAX_PLOTS }, emptyPlot),
    plotCount: START_PLOTS,
    harvested: 0,
    planted: 0,
    decorations: [],
  }),

  quests: [
    {
      id: 'q_farm_harvest',
      title: 'Good Yield',
      description: 'Harvest 6 crops.',
      scope: 'daily',
      metric: 'crops_harvested',
      target: 6,
      reward: { coins: 300, xp: 90 },
      icon: '🧺',
    },
    {
      id: 'q_farm_plant',
      title: 'Sow',
      description: 'Plant 8 seeds.',
      scope: 'daily',
      metric: 'crops_planted',
      target: 8,
      reward: { coins: 220, items: { seed_carrot: 2 } },
      icon: '🫘',
    },
  ],

  achievements: [
    {
      id: 'ach_farm_harvest',
      title: 'Green Thumb',
      description: 'Crops harvested over all time.',
      metric: 'crops_harvested',
      icon: '🌿',
      tiers: [
        { target: 50, reward: { coins: 500 } },
        { target: 500, reward: { coins: 3500, gems: 12, unlocks: ['shirt_farmer'] } },
        { target: 3000, reward: { coins: 16000, gems: 55, unlocks: ['bg_meadow'] } },
      ],
    },
  ],

  /**
   * Nothing to advance — growth is derived from `plantedAt`. The hook only
   * exists to tell the player what changed while they were gone.
   */
  simulateOffline: (save: FarmSave, elapsedMs) => {
    if (elapsedMs < 60_000) return null;
    const now = Date.now();
    let ready = 0;
    for (let i = 0; i < save.plotCount; i++) {
      const plot = save.plots[i];
      if (!plot?.cropId) continue;
      const crop = CROPS.find((c) => c.id === plot.cropId);
      if (crop && growthOf(plot, crop.minutes, now) >= 1) ready += 1;
    }
    if (!ready) return null;
    return { save, notice: `${ready} crop${ready > 1 ? 's are' : ' is'} ready to harvest.` };
  },
};
