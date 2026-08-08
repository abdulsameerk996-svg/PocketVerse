import type { ItemDef } from '@/core/types';
import type { WeaponDef, WeaponId, ZombieSave } from './types';
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

/* ------------------------------------------------------------------ save -- */

export function defaultZombieSave(): ZombieSave {
  return {
    weapon: 'pistol',
    unlockedWeapons: ['pistol'],
    upgrades: { damage: 0, fireRate: 0, health: 0, pierce: 0 },
    bestWave: 0,
    totalKills: 0,
    runs: 0,
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

/**
 * Coerce a persisted blob into a complete, finite `ZombieSave`.
 *
 * The core stores each module's save opaquely and only shallow-merges defaults
 * on hydrate, so a blob written by an older build can arrive with a missing or
 * partial `upgrades` object. The surface derives HP, damage and fire rate from
 * those numbers on its first render, so a hole here is a crash or a NaN arena
 * rather than a cosmetic glitch. Normalising is cheap; trusting it is not.
 */
export function normalizeZombieSave(raw: unknown): ZombieSave {
  const base = defaultZombieSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const s = raw as Partial<ZombieSave>;
  const up = (s.upgrades ?? {}) as Partial<ZombieSave['upgrades']>;
  const known = new Set(WEAPONS.map((w) => w.id));
  const unlocked = Array.isArray(s.unlockedWeapons)
    ? s.unlockedWeapons.filter((id): id is WeaponId => known.has(id as WeaponId))
    : [];
  if (!unlocked.includes('pistol')) unlocked.unshift('pistol');

  return {
    weapon: known.has(s.weapon as WeaponId) ? (s.weapon as WeaponId) : base.weapon,
    unlockedWeapons: unlocked,
    upgrades: {
      damage: Math.max(0, num(up.damage)),
      fireRate: Math.max(0, num(up.fireRate)),
      health: Math.max(0, num(up.health)),
      pierce: Math.max(0, num(up.pierce)),
    },
    bestWave: Math.max(0, num(s.bestWave)),
    totalKills: Math.max(0, num(s.totalKills)),
    runs: Math.max(0, num(s.runs)),
  };
}
