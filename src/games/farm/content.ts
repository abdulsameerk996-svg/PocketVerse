import type { ItemDef } from '@/core/types';

export type CropDef = {
  id: string;
  name: string;
  seedId: string;
  glyph: string;
  sprout: string;
  /** Minutes to fully grow. */
  minutes: number;
  seedPrice: number;
  sellValue: number;
  xp: number;
  minLevel: number;
};

export const CROPS: CropDef[] = [
  { id: 'crop_wheat', name: 'Wheat', seedId: 'seed_wheat', glyph: '🌾', sprout: '🌱', minutes: 2, seedPrice: 20, sellValue: 45, xp: 8, minLevel: 1 },
  { id: 'crop_carrot', name: 'Carrot', seedId: 'seed_carrot', glyph: '🥕', sprout: '🌱', minutes: 6, seedPrice: 55, sellValue: 130, xp: 18, minLevel: 1 },
  { id: 'crop_corn', name: 'Corn', seedId: 'seed_corn', glyph: '🌽', sprout: '🌿', minutes: 18, seedPrice: 140, sellValue: 360, xp: 42, minLevel: 3 },
  { id: 'crop_pumpkin', name: 'Pumpkin', seedId: 'seed_pumpkin', glyph: '🎃', sprout: '🌿', minutes: 45, seedPrice: 320, sellValue: 900, xp: 95, minLevel: 5 },
  { id: 'crop_grapes', name: 'Grapes', seedId: 'seed_grapes', glyph: '🍇', sprout: '🍃', minutes: 120, seedPrice: 700, sellValue: 2200, xp: 220, minLevel: 8 },
  { id: 'crop_star', name: 'Starbloom', seedId: 'seed_star', glyph: '🌟', sprout: '✨', minutes: 360, seedPrice: 2200, sellValue: 7500, xp: 700, minLevel: 12 },
];

export const FARM_ITEMS: ItemDef[] = [
  ...CROPS.map<ItemDef>((c) => ({
    id: c.seedId,
    name: `${c.name} Seeds`,
    kind: 'seed',
    rarity: c.seedPrice > 1000 ? 'legendary' : c.seedPrice > 300 ? 'epic' : c.seedPrice > 100 ? 'rare' : 'common',
    glyph: '🫘',
    description: `Grows in ${formatMinutes(c.minutes)} · sells for ${c.sellValue} 🪙`,
    value: Math.round(c.seedPrice * 0.4),
    stackable: true,
    source: 'farm',
    price: { currency: 'coins', amount: c.seedPrice },
    minLevel: c.minLevel,
  })),
  ...CROPS.map<ItemDef>((c) => ({
    id: c.id,
    name: c.name,
    kind: 'crop',
    rarity: c.sellValue > 5000 ? 'legendary' : c.sellValue > 800 ? 'epic' : c.sellValue > 120 ? 'rare' : 'common',
    glyph: c.glyph,
    description: 'Harvested produce. Sell it, or feed it to your pet.',
    value: c.sellValue,
    stackable: true,
    source: 'farm',
  })),
];

export function formatMinutes(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export const PLOT_COST = (owned: number) => Math.round(600 * Math.pow(1.7, owned - 6));
export const MAX_PLOTS = 12;
export const START_PLOTS = 6;
