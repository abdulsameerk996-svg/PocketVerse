import type { ItemDef, Rarity } from '@/core/types';

export type FishDef = {
  id: string;
  name: string;
  glyph: string;
  rarity: Rarity;
  value: number;
  xp: number;
  /** Relative spawn weight in its location. */
  weight: number;
  /** 0..1 — how erratically it moves during the reel. */
  fight: number;
};

export type LocationDef = {
  id: string;
  name: string;
  glyph: string;
  blurb: string;
  minLevel: number;
  unlockCost: number;
  tint: string;
  fish: FishDef[];
};

const f = (
  id: string,
  name: string,
  glyph: string,
  rarity: Rarity,
  value: number,
  weight: number,
  fight: number,
): FishDef => ({ id, name, glyph, rarity, value, xp: Math.round(value * 0.35), weight, fight });

export const LOCATIONS: LocationDef[] = [
  {
    id: 'loc_pond',
    name: 'Willow Pond',
    glyph: '🪷',
    blurb: 'Calm water. Forgiving fish.',
    minLevel: 1,
    unlockCost: 0,
    tint: '#1B3A2E',
    fish: [
      f('fish_minnow', 'Minnow', '🐟', 'common', 30, 40, 0.15),
      f('fish_perch', 'Perch', '🐠', 'common', 60, 30, 0.25),
      f('fish_carp', 'Carp', '🐡', 'rare', 180, 16, 0.4),
      f('fish_frog', 'Bull Frog', '🐸', 'rare', 240, 10, 0.45),
      f('fish_golden', 'Golden Koi', '🎏', 'epic', 900, 4, 0.62),
    ],
  },
  {
    id: 'loc_river',
    name: 'Rapids',
    glyph: '🏞️',
    blurb: 'Fast current, faster fish.',
    minLevel: 4,
    unlockCost: 1500,
    tint: '#173447',
    fish: [
      f('fish_trout', 'Trout', '🐟', 'common', 110, 34, 0.35),
      f('fish_salmon', 'Salmon', '🍣', 'rare', 320, 26, 0.5),
      f('fish_eel', 'River Eel', '🪱', 'rare', 420, 18, 0.6),
      f('fish_sturgeon', 'Sturgeon', '🐋', 'epic', 1400, 8, 0.72),
      f('fish_prism', 'Prism Trout', '🌈', 'legendary', 4800, 2, 0.85),
    ],
  },
  {
    id: 'loc_reef',
    name: 'Neon Reef',
    glyph: '🪸',
    blurb: 'Bioluminescent and expensive.',
    minLevel: 8,
    unlockCost: 6000,
    tint: '#12313F',
    fish: [
      f('fish_clown', 'Clownfish', '🐠', 'common', 220, 30, 0.4),
      f('fish_ray', 'Manta Ray', '🦈', 'rare', 700, 24, 0.55),
      f('fish_octo', 'Octopus', '🐙', 'epic', 1800, 14, 0.7),
      f('fish_jelly', 'Void Jelly', '🎐', 'epic', 2400, 8, 0.78),
      f('fish_leviathan', 'Leviathan', '🐉', 'legendary', 9000, 2, 0.92),
    ],
  },
  {
    id: 'loc_void',
    name: 'The Drop',
    glyph: '🌑',
    blurb: 'Nothing down here should exist.',
    minLevel: 14,
    unlockCost: 25000,
    tint: '#161226',
    fish: [
      f('fish_lantern', 'Lanternfish', '🏮', 'rare', 900, 30, 0.55),
      f('fish_angler', 'Angler', '🎣', 'epic', 2600, 24, 0.72),
      f('fish_kraken', 'Kraken Spawn', '🦑', 'legendary', 7200, 12, 0.85),
      f('fish_star', 'Starwhale', '🐳', 'legendary', 12000, 5, 0.9),
      f('fish_null', 'NULL', '⬛', 'mythic', 30000, 1, 0.98),
    ],
  },
];

export const ALL_FISH: FishDef[] = LOCATIONS.flatMap((l) => l.fish);

export const FISH_ITEMS: ItemDef[] = ALL_FISH.map((fish) => ({
  id: fish.id,
  name: fish.name,
  kind: 'fish',
  rarity: fish.rarity,
  glyph: fish.glyph,
  description: 'A catch. Sell it, or mount it in your room.',
  value: fish.value,
  stackable: true,
  source: 'fishing',
}));
