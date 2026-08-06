import type { ItemDef } from '@/core/types';
import type { WeaponDef } from './types';
import { palette } from '@/ui/theme/tokens';

export const WEAPONS: WeaponDef[] = [
  {
    id: 'pistol',
    name: 'Sidearm',
    glyph: '🔫',
    damage: 12,
    fireRate: 3.2,
    pellets: 1,
    spread: 0,
    speed: 700,
    price: 0,
    color: palette.textMuted,
  },
  {
    id: 'smg',
    name: 'Buzzsaw SMG',
    glyph: '🧨',
    damage: 8,
    fireRate: 8,
    pellets: 1,
    spread: 0.09,
    speed: 820,
    price: 2200,
    color: palette.amber,
  },
  {
    id: 'shotgun',
    name: 'Breaker',
    glyph: '💥',
    damage: 9,
    fireRate: 1.6,
    pellets: 5,
    spread: 0.42,
    speed: 640,
    price: 4800,
    color: palette.coral,
  },
  {
    id: 'railgun',
    name: 'Railcaster',
    glyph: '⚡',
    damage: 46,
    fireRate: 1.1,
    pellets: 1,
    spread: 0,
    speed: 1400,
    price: 11000,
    color: palette.cyan,
  },
];

export const WEAPON_ITEMS: ItemDef[] = WEAPONS.filter((w) => w.price > 0).map((w) => ({
  id: w.id,
  name: w.name,
  kind: 'weapon',
  rarity: w.price > 8000 ? 'legendary' : w.price > 3000 ? 'epic' : 'rare',
  glyph: w.glyph,
  description: `${w.damage} dmg · ${w.fireRate}/s · ${w.pellets > 1 ? `${w.pellets} pellets` : 'single shot'}`,
  value: Math.round(w.price * 0.3),
  stackable: false,
  source: 'zombie',
  price: { currency: 'coins', amount: w.price },
}));

/** Permanent upgrades — priced in coins and scrap so other games feed this one. */
export const UPGRADES = [
  {
    key: 'damage' as const,
    name: 'Damage',
    glyph: '🗡️',
    desc: '+15% damage per level',
    baseCost: 400,
    scrap: 2,
    max: 10,
  },
  {
    key: 'fireRate' as const,
    name: 'Fire rate',
    glyph: '⏱️',
    desc: '+8% rate per level',
    baseCost: 500,
    scrap: 2,
    max: 10,
  },
  {
    key: 'health' as const,
    name: 'Health',
    glyph: '❤️',
    desc: '+20 HP per level',
    baseCost: 350,
    scrap: 1,
    max: 12,
  },
  {
    key: 'pierce' as const,
    name: 'Pierce',
    glyph: '➰',
    desc: 'Bullets hit +1 target',
    baseCost: 1500,
    scrap: 4,
    max: 4,
  },
];

export function upgradeCost(baseCost: number, level: number) {
  return Math.round(baseCost * Math.pow(1.55, level));
}
