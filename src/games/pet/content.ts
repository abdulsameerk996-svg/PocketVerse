import type { ItemDef } from '@/core/types';

export type FoodDef = {
  id: string;
  name: string;
  glyph: string;
  cost: number;
  hunger: number;
  happiness: number;
  energy?: number;
  minBond: number;
};

export const FOODS: FoodDef[] = [
  { id: 'food_kibble', name: 'Kibble', glyph: '🥣', cost: 0, hunger: 18, happiness: 2, minBond: 0 },
  { id: 'food_apple', name: 'Apple', glyph: '🍎', cost: 30, hunger: 26, happiness: 6, minBond: 0 },
  { id: 'food_fish', name: 'Fish', glyph: '🐟', cost: 90, hunger: 42, happiness: 10, minBond: 2 },
  { id: 'food_cake', name: 'Cake', glyph: '🍰', cost: 220, hunger: 55, happiness: 22, energy: 8, minBond: 4 },
  { id: 'food_star', name: 'Starfruit', glyph: '⭐', cost: 600, hunger: 100, happiness: 40, energy: 25, minBond: 8 },
];

export type ToyDef = {
  id: string;
  name: string;
  glyph: string;
  price: number;
  happiness: number;
  energyCost: number;
};

export const TOYS: ToyDef[] = [
  { id: 'toy_ball', name: 'Ball', glyph: '🏐', price: 0, happiness: 14, energyCost: 8 },
  { id: 'toy_laser', name: 'Laser', glyph: '🔦', price: 350, happiness: 24, energyCost: 14 },
  { id: 'toy_puzzle', name: 'Puzzle', glyph: '🧩', price: 800, happiness: 32, energyCost: 10 },
  { id: 'toy_drone', name: 'Drone', glyph: '🛸', price: 1900, happiness: 46, energyCost: 18 },
];

/** Toys are real catalog items so they appear in the shared inventory too. */
export const PET_ITEMS: ItemDef[] = TOYS.filter((t) => t.price > 0).map((t) => ({
  id: t.id,
  name: t.name,
  kind: 'cosmetic',
  rarity: t.price > 1000 ? 'epic' : t.price > 500 ? 'rare' : 'common',
  glyph: t.glyph,
  description: `Pet toy · +${t.happiness} happiness`,
  value: Math.round(t.price * 0.3),
  stackable: false,
  source: 'pet',
  price: { currency: 'coins', amount: t.price },
}));
