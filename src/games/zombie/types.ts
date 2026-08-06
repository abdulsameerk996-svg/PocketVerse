export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'railgun';

export type ZombieSave = {
  weapon: WeaponId;
  unlockedWeapons: WeaponId[];
  /** Permanent upgrade levels, bought with scrap + coins. */
  upgrades: { damage: number; fireRate: number; health: number; pierce: number };
  bestWave: number;
  totalKills: number;
  runs: number;
};

export type WeaponDef = {
  id: WeaponId;
  name: string;
  glyph: string;
  /** Base damage per projectile. */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** Projectiles per shot. */
  pellets: number;
  /** Spread in radians when pellets > 1. */
  spread: number;
  speed: number;
  price: number;
  color: string;
};
