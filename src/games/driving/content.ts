import type { ItemDef } from '@/core/types';
import type { CarStats, Mission } from './types';
import { palette } from '@/ui/theme/tokens';

export const CARS: {
  id: string;
  name: string;
  glyph: string;
  color: string;
  price: number;
  stats: CarStats;
}[] = [
  {
    id: 'car_hatch',
    name: 'City Hatch',
    glyph: '🚗',
    color: palette.sky,
    price: 0,
    stats: { speed: 1, handling: 1, grip: 1 },
  },
  {
    id: 'car_van',
    name: 'Cargo Van',
    glyph: '🚐',
    color: palette.amber,
    price: 1200,
    stats: { speed: 0.92, handling: 0.85, grip: 1.35 },
  },
  {
    id: 'car_sport',
    name: 'Sprint GT',
    glyph: '🏎️',
    color: palette.coral,
    price: 3600,
    stats: { speed: 1.22, handling: 1.18, grip: 0.9 },
  },
  {
    id: 'car_truck',
    name: 'Hauler',
    glyph: '🚚',
    color: palette.lime,
    price: 6400,
    stats: { speed: 0.88, handling: 0.75, grip: 1.7 },
  },
  {
    id: 'car_hyper',
    name: 'Vantablack',
    glyph: '🚙',
    color: palette.violet,
    price: 14000,
    stats: { speed: 1.45, handling: 1.35, grip: 1.1 },
  },
];

export const CAR_ITEMS: ItemDef[] = CARS.filter((c) => c.price > 0).map((c) => ({
  id: c.id,
  name: c.name,
  kind: 'vehicle',
  rarity: c.price > 10000 ? 'legendary' : c.price > 3000 ? 'epic' : 'rare',
  glyph: c.glyph,
  description: `Speed ${c.stats.speed.toFixed(2)}× · Handling ${c.stats.handling.toFixed(2)}× · Grip ${c.stats.grip.toFixed(2)}×`,
  value: Math.round(c.price * 0.3),
  stackable: false,
  slot: 'car',
  tint: c.color,
  source: 'driving',
  price: { currency: 'coins', amount: c.price },
}));

/**
 * Missions run in sequence and persist between runs — the reason to come back
 * to driving rather than treating it as a pure score chase.
 */
export const MISSIONS: Mission[] = [
  {
    id: 'm_first_km',
    title: 'Shakedown',
    description: 'Drive 800 m in one run.',
    kind: 'distance',
    target: 800,
    reward: { coins: 350, xp: 90 },
  },
  {
    id: 'm_near_miss',
    title: 'Close Shave',
    description: 'Get 8 near misses in one run.',
    kind: 'nearMiss',
    target: 8,
    reward: { coins: 480, xp: 130 },
  },
  {
    id: 'm_collector',
    title: 'Toll Money',
    description: 'Collect 20 coins in one run.',
    kind: 'coins',
    target: 20,
    reward: { coins: 600, xp: 150, unlock: 'car_van' },
  },
  {
    id: 'm_clean',
    title: 'Not a Scratch',
    description: 'Drive 1,200 m without hitting traffic.',
    kind: 'noHit',
    target: 1200,
    reward: { coins: 900, xp: 220, gems: 5 },
  },
  {
    id: 'm_long_haul',
    title: 'Long Haul',
    description: 'Drive 3,000 m in one run.',
    kind: 'distance',
    target: 3000,
    reward: { coins: 1500, xp: 400, gems: 8, unlock: 'car_sport' },
  },
  {
    id: 'm_ghost',
    title: 'Ghost Driver',
    description: 'Get 25 near misses in one run.',
    kind: 'nearMiss',
    target: 25,
    reward: { coins: 2400, xp: 600, gems: 12 },
  },
];
