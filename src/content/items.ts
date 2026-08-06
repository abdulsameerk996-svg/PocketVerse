import type { ItemDef } from '@/core/types';
import { palette } from '@/ui/theme/tokens';

/**
 * Core catalog — cosmetics, decorations and universal materials.
 *
 * Game-specific items (fish, crops, cars, weapons) are declared by their own
 * module and merged in by `catalog.ts`. This file only holds things that belong
 * to the *player*, not to a game.
 */

const cosmetic = (
  id: string,
  name: string,
  slot: ItemDef['slot'],
  glyph: string,
  rarity: ItemDef['rarity'],
  price: number,
  extras: Partial<ItemDef> = {},
): ItemDef => ({
  id,
  name,
  kind: 'cosmetic',
  rarity,
  glyph,
  description: extras.description ?? '',
  value: Math.round(price * 0.25),
  stackable: false,
  slot,
  source: 'store',
  price: price > 0 ? { currency: 'coins', amount: price } : undefined,
  ...extras,
});

/* ------------------------------------------------------------------ hats */

export const HATS: ItemDef[] = [
  cosmetic('hat_none', 'Bare Head', 'hat', '🚫', 'common', 0, {
    description: 'No hat. Bold choice.',
  }),
  cosmetic('hat_cap', 'Street Cap', 'hat', '🧢', 'common', 240, {
    description: 'Backwards, obviously.',
    modifiers: { coinBonus: 0.02 },
  }),
  cosmetic('hat_beanie', 'Neon Beanie', 'hat', '🎩', 'rare', 700, {
    description: 'Glows faintly in the dark.',
    tint: palette.violet,
    modifiers: { xpBonus: 0.05 },
  }),
  cosmetic('hat_crown', 'Pixel Crown', 'hat', '👑', 'legendary', 4200, {
    description: 'Rules over every mode you enter.',
    tint: palette.gold,
    modifiers: { coinBonus: 0.12, xpBonus: 0.08 },
    minLevel: 8,
  }),
  cosmetic('hat_helmet', 'Racer Helmet', 'hat', '⛑️', 'epic', 1800, {
    description: 'Armour that also looks fast.',
    tint: palette.coral,
    modifiers: { armor: 1, speed: 0.04 },
    minLevel: 5,
  }),
  cosmetic('hat_halo', 'Data Halo', 'hat', '💫', 'mythic', 9000, {
    description: 'Bends luck in your favour, everywhere.',
    tint: palette.cyan,
    modifiers: { luck: 0.15, xpBonus: 0.1 },
    minLevel: 14,
  }),
];

/* ---------------------------------------------------------------- shirts */

export const SHIRTS: ItemDef[] = [
  cosmetic('shirt_basic', 'Standard Issue', 'shirt', '👕', 'common', 0, {
    description: 'Comes with the account.',
    tint: palette.sky,
  }),
  cosmetic('shirt_hoodie', 'Midnight Hoodie', 'shirt', '🧥', 'rare', 850, {
    description: 'Warm enough for the zombie nights.',
    tint: palette.violetDim,
    modifiers: { armor: 1 },
  }),
  cosmetic('shirt_jacket', 'Chrome Jacket', 'shirt', '🥼', 'epic', 2100, {
    description: 'Reflects headlights beautifully.',
    tint: palette.cyan,
    modifiers: { speed: 0.06, coinBonus: 0.04 },
    minLevel: 6,
  }),
  cosmetic('shirt_farmer', 'Field Overalls', 'shirt', '🧵', 'rare', 640, {
    description: 'Crops grow 10% faster while worn.',
    tint: palette.lime,
    modifiers: { luck: 0.05 },
  }),
  cosmetic('shirt_aurora', 'Aurora Weave', 'shirt', '✨', 'legendary', 5200, {
    description: 'Woven from every colour you have unlocked.',
    tint: palette.magenta,
    modifiers: { xpBonus: 0.12, luck: 0.06 },
    minLevel: 11,
  }),
];

/* ----------------------------------------------------------------- shoes */

export const SHOES: ItemDef[] = [
  cosmetic('shoes_basic', 'Worn Sneakers', 'shoes', '👟', 'common', 0, {
    description: 'They have seen things.',
  }),
  cosmetic('shoes_runner', 'Velocity Runners', 'shoes', '🥾', 'rare', 900, {
    description: '+8% speed in every moving game.',
    tint: palette.mint,
    modifiers: { speed: 0.08 },
  }),
  cosmetic('shoes_boots', 'Grav Boots', 'shoes', '🩴', 'epic', 2400, {
    description: 'Higher jumps, softer landings.',
    tint: palette.amber,
    modifiers: { speed: 0.05, armor: 1 },
    minLevel: 7,
  }),
  cosmetic('shoes_flame', 'Emberstep', 'shoes', '🔥', 'legendary', 6100, {
    description: 'Leaves a trail of sparks across every track.',
    tint: palette.coral,
    modifiers: { speed: 0.14, coinBonus: 0.06 },
    minLevel: 12,
  }),
];

/* ------------------------------------------------------------------ aura */

export const AURAS: ItemDef[] = [
  cosmetic('aura_none', 'No Aura', 'aura', '⚪', 'common', 0, { description: 'Subtle.' }),
  cosmetic('aura_pulse', 'Violet Pulse', 'aura', '🟣', 'rare', 1100, {
    description: 'A soft ring that follows you everywhere.',
    tint: palette.violet,
    modifiers: { xpBonus: 0.04 },
  }),
  cosmetic('aura_static', 'Static Field', 'aura', '⚡', 'epic', 2800, {
    description: 'Crackles when you score.',
    tint: palette.cyan,
    modifiers: { luck: 0.08 },
    minLevel: 9,
  }),
  cosmetic('aura_solar', 'Solar Flare', 'aura', '🌟', 'mythic', 12000, {
    description: 'The whole hub lights up around you.',
    tint: palette.gold,
    modifiers: { coinBonus: 0.2, xpBonus: 0.15, luck: 0.1 },
    minLevel: 18,
  }),
];

/* ------------------------------------------------------------ backgrounds */

export const BACKGROUNDS: ItemDef[] = [
  cosmetic('bg_night', 'Night Loft', 'background', '🌃', 'common', 0, {
    description: 'Where it all starts.',
    tint: '#12061F',
  }),
  cosmetic('bg_neon', 'Neon Alley', 'background', '🏙️', 'rare', 1200, {
    description: 'Rain, signage, reflections.',
    tint: '#1A0B2E',
  }),
  cosmetic('bg_reef', 'Coral Deep', 'background', '🐠', 'rare', 1200, {
    description: 'Unlocked by anglers.',
    tint: '#052A3A',
  }),
  cosmetic('bg_meadow', 'Golden Meadow', 'background', '🌾', 'epic', 2600, {
    description: 'Smells faintly of harvest.',
    tint: '#22200A',
    minLevel: 6,
  }),
  cosmetic('bg_void', 'Event Horizon', 'background', '🌌', 'legendary', 7400, {
    description: 'Stars drift behind your avatar.',
    tint: '#05030F',
    minLevel: 13,
  }),
];

/* ----------------------------------------------------------- decorations */

const decoration = (
  id: string,
  name: string,
  glyph: string,
  rarity: ItemDef['rarity'],
  price: number,
  description: string,
): ItemDef => ({
  id,
  name,
  kind: 'decoration',
  rarity,
  glyph,
  description,
  value: Math.round(price * 0.3),
  stackable: true,
  source: 'store',
  price: { currency: 'coins', amount: price },
});

export const DECORATIONS: ItemDef[] = [
  decoration('deco_lamp', 'Arc Lamp', '🪔', 'common', 180, 'Warm pool of light.'),
  decoration('deco_plant', 'Monstera', '🪴', 'common', 220, 'Low maintenance. Unlike the pet.'),
  decoration('deco_rug', 'Woven Rug', '🧶', 'common', 260, 'Ties the loft together.'),
  decoration('deco_arcade', 'Arcade Cabinet', '🕹️', 'rare', 1400, 'Plays a game inside your game.'),
  decoration('deco_poster', 'Tour Poster', '🖼️', 'rare', 640, 'From the rhythm stage.'),
  decoration('deco_aquarium', 'Reef Tank', '🐟', 'epic', 3000, 'Displays your rarest catch.'),
  decoration('deco_trophy', 'Trophy Shelf', '🏆', 'epic', 3600, 'Shows your best score.'),
  decoration('deco_neonsign', 'Neon Sign', '🔆', 'legendary', 6800, 'Spells your name. Softly.'),
  decoration('deco_console', 'Holo Console', '🖥️', 'legendary', 8200, 'Purely decorative. Mostly.'),
];

/* -------------------------------------------------------- pets & trails */

export const PET_SKINS: ItemDef[] = [
  cosmetic('pet_blob', 'Blob', 'pet', '🟣', 'common', 0, { description: 'Your first companion.' }),
  cosmetic('pet_cat', 'Static Cat', 'pet', '🐱', 'rare', 1500, {
    description: 'Judges your combo streaks.',
    modifiers: { luck: 0.04 },
  }),
  cosmetic('pet_dragon', 'Ember Whelp', 'pet', '🐉', 'legendary', 7800, {
    description: 'Follows you into every game.',
    modifiers: { coinBonus: 0.1, armor: 1 },
    minLevel: 15,
  }),
  cosmetic('pet_ghost', 'Pixel Ghost', 'pet', '👻', 'epic', 3200, {
    description: 'Phases through obstacles. You do not.',
    modifiers: { luck: 0.07 },
    minLevel: 8,
  }),
];

export const TRAILS: ItemDef[] = [
  cosmetic('trail_none', 'No Trail', 'trail', '·', 'common', 0, { description: 'Clean.' }),
  cosmetic('trail_spark', 'Sparks', 'trail', '✨', 'rare', 800, {
    description: 'Particles behind every dash.',
    tint: palette.amber,
  }),
  cosmetic('trail_neon', 'Neon Ribbon', 'trail', '🎗️', 'epic', 2200, {
    description: 'A ribbon of light in motion games.',
    tint: palette.cyan,
    minLevel: 7,
  }),
];

/* ------------------------------------------------------------- materials */

const material = (
  id: string,
  name: string,
  glyph: string,
  rarity: ItemDef['rarity'],
  value: number,
  description: string,
): ItemDef => ({
  id,
  name,
  kind: 'material',
  rarity,
  glyph,
  description,
  value,
  stackable: true,
});

export const MATERIALS: ItemDef[] = [
  material('mat_scrap', 'Scrap', '🔩', 'common', 12, 'Salvaged from wrecks and waves.'),
  material('mat_circuit', 'Circuit', '🧿', 'rare', 45, 'Powers weapon and car upgrades.'),
  material('mat_core', 'Power Core', '🔋', 'epic', 160, 'Rare. Every workshop wants one.'),
  material('mat_starfrag', 'Star Fragment', '⭐', 'legendary', 600, 'Dropped by perfect runs.'),
];

export const CONSUMABLES: ItemDef[] = [
  {
    id: 'con_energy_s',
    name: 'Energy Snack',
    kind: 'consumable',
    rarity: 'common',
    glyph: '🍬',
    description: 'Restores 5 energy instantly.',
    value: 40,
    stackable: true,
    source: 'store',
    price: { currency: 'coins', amount: 300 },
  },
  {
    id: 'con_energy_l',
    name: 'Energy Cell',
    kind: 'consumable',
    rarity: 'rare',
    glyph: '🔌',
    description: 'Fully refills your energy bar.',
    value: 200,
    stackable: true,
    source: 'store',
    price: { currency: 'gems', amount: 12 },
  },
  {
    id: 'con_xp_boost',
    name: 'XP Surge',
    kind: 'consumable',
    rarity: 'rare',
    glyph: '📈',
    description: 'Doubles XP from your next session.',
    value: 150,
    stackable: true,
    source: 'store',
    price: { currency: 'coins', amount: 900 },
  },
  {
    id: 'con_luck',
    name: 'Lucky Charm',
    kind: 'consumable',
    rarity: 'epic',
    glyph: '🍀',
    description: 'Boosts rare drops in your next session.',
    value: 260,
    stackable: true,
    source: 'store',
    price: { currency: 'gems', amount: 20 },
  },
];

export const CORE_ITEMS: ItemDef[] = [
  ...HATS,
  ...SHIRTS,
  ...SHOES,
  ...AURAS,
  ...BACKGROUNDS,
  ...DECORATIONS,
  ...PET_SKINS,
  ...TRAILS,
  ...MATERIALS,
  ...CONSUMABLES,
];

/** Items every new account starts with (and which cost nothing). */
export const STARTER_UNLOCKS = [
  'hat_none',
  'shirt_basic',
  'shoes_basic',
  'aura_none',
  'bg_night',
  'pet_blob',
  'trail_none',
];
