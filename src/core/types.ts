/**
 * PocketVerse shared domain types.
 *
 * Everything in this file is game-agnostic. A game module may extend these with
 * its own local types, but it may never invent a second currency, a second XP
 * ledger or a second inventory — those concepts live here, once.
 */

import type { Rarity } from '@/ui/theme/tokens';

export type { Rarity };

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export type GameId =
  | 'pet'
  | 'driving'
  | 'runner'
  | 'puzzle'
  | 'zombie'
  | 'farm'
  | 'fishing'
  | 'platformer'
  | 'rhythm'
  | 'arcade'
  | 'penfight'
  // two-player, local
  | 'airhockey'
  | 'sumo'
  | 'tankduel'
  | 'colorclash'
  | 'dodgeduel'
  // flagship adventure
  | 'frontier'
  // quick-play collection (Phase 7)
  | 'stackrush'
  | 'colorsnap'
  | 'survive60'
  | 'hookrun'
  | 'towerdef';

/* ------------------------------------------------------------------ */
/* Currency & rewards                                                  */
/* ------------------------------------------------------------------ */

export type CurrencyId = 'coins' | 'gems';

/**
 * The universal reward envelope. Every game returns one of these and the
 * economy service is the only thing allowed to apply it. This is what makes
 * "one interconnected game" true rather than aspirational.
 */
export type RewardBundle = {
  xp?: number;
  coins?: number;
  gems?: number;
  /** itemId -> quantity */
  items?: Record<string, number>;
  /** Cosmetic/equipment unlocks granted outright. */
  unlocks?: string[];
  /** Energy refunded (e.g. a perfect run). */
  energy?: number;
};

export const EMPTY_REWARD: RewardBundle = {};

/* ------------------------------------------------------------------ */
/* Items, cosmetics, inventory                                         */
/* ------------------------------------------------------------------ */

export type ItemKind =
  | 'currency'
  | 'material'
  | 'consumable'
  | 'seed'
  | 'crop'
  | 'fish'
  | 'trophy'
  | 'cosmetic'
  | 'vehicle'
  | 'pet'
  | 'decoration'
  | 'weapon';

export type CosmeticSlot =
  | 'hat'
  | 'shirt'
  | 'shoes'
  | 'face'
  | 'aura'
  | 'car'
  | 'pet'
  | 'background'
  | 'trail';

export type ItemDef = {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  /** Emoji glyph — swapped for sprite atlases when art lands, see docs/ASSETS.md */
  glyph: string;
  description: string;
  /** Base coin value when sold; 0 = unsellable. */
  value: number;
  stackable: boolean;
  /** Cosmetic-only fields. */
  slot?: CosmeticSlot;
  /** Tint applied to the avatar/vehicle when equipped. */
  tint?: string;
  /** Flat stat modifiers applied globally while equipped. */
  modifiers?: StatModifiers;
  /** Game this item originates from (for filtering + provenance UI). */
  source?: GameId | 'store' | 'quest' | 'daily';
  /** Store availability. */
  price?: { currency: CurrencyId; amount: number };
  /** Minimum account level required to equip/buy. */
  minLevel?: number;
};

/**
 * Cross-game stat modifiers. A hat bought with fishing money can make the
 * runner faster — this is the single mechanism that does it.
 */
export type StatModifiers = {
  /** Multiplier on all coin rewards, 0.10 = +10%. */
  coinBonus?: number;
  xpBonus?: number;
  /** Multiplier on run speed / drive speed. */
  speed?: number;
  /** Extra hit points in combat-like games. */
  armor?: number;
  /** Energy regeneration multiplier. */
  energyRegen?: number;
  /** Luck: shifts rare-drop rolls. */
  luck?: number;
};

export type InventoryEntry = {
  itemId: string;
  qty: number;
  acquiredAt: number;
  /** true once the player has seen it in the inventory (drives NEW badges). */
  seen: boolean;
};

/* ------------------------------------------------------------------ */
/* Player                                                              */
/* ------------------------------------------------------------------ */

export type AvatarConfig = {
  /** Player-supplied image (file:// URI from their own library). Never uploaded. */
  photoUri: string | null;
  /** Procedural fallback avatar. */
  bodyColor: string;
  skinTone: string;
  faceId: string;
  /** slot -> itemId */
  equipped: Partial<Record<CosmeticSlot, string>>;
};

export type PlayerState = {
  name: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  energy: number;
  energyMax: number;
  /** ms epoch of last energy tick — offline regen is computed from this. */
  energyUpdatedAt: number;
  createdAt: number;
  lastSeenAt: number;
  avatar: AvatarConfig;
  /** Consecutive days opened. */
  streak: number;
  lastClaimDay: string | null;
};

/* ------------------------------------------------------------------ */
/* Quests & achievements                                               */
/* ------------------------------------------------------------------ */

export type QuestScope = 'daily' | 'weekly' | 'story';

/**
 * Quests listen to the global event bus. A quest defined by the fishing module
 * can require driving distance — the definition is data, not code.
 */
export type QuestDef = {
  id: string;
  title: string;
  description: string;
  scope: QuestScope;
  /** Event name the quest counts. */
  metric: MetricKey;
  target: number;
  reward: RewardBundle;
  /** Optional: only count events from this game. */
  game?: GameId;
  minLevel?: number;
  icon: string;
};

export type QuestProgress = {
  questId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  /** Period key — 'YYYY-MM-DD' for daily, 'YYYY-Www' for weekly, 'story' otherwise. */
  period: string;
};

export type AchievementDef = {
  id: string;
  title: string;
  description: string;
  metric: MetricKey;
  /** Ascending thresholds; each tier grants its own reward. */
  tiers: { target: number; reward: RewardBundle }[];
  icon: string;
  game?: GameId;
};

export type AchievementProgress = {
  achievementId: string;
  value: number;
  tier: number;
};

/* ------------------------------------------------------------------ */
/* Metrics — the shared vocabulary of "what the player did"             */
/* ------------------------------------------------------------------ */

/**
 * Every game emits metrics through `track()`. Quests, achievements and stats
 * all read from this one stream, which is why a new game automatically works
 * with the existing progression systems.
 */
export type MetricKey =
  // universal
  | 'sessions_played'
  | 'coins_earned'
  | 'xp_earned'
  | 'items_collected'
  | 'games_distinct_played'
  | 'levels_gained'
  | 'store_purchases'
  | 'cosmetics_equipped'
  // pet
  | 'pet_fed'
  | 'pet_cleaned'
  | 'pet_played'
  | 'pet_slept'
  | 'pet_care_actions'
  // driving
  | 'drive_distance'
  | 'drive_near_miss'
  | 'drive_missions'
  // runner
  | 'run_distance'
  | 'run_powerups'
  | 'run_best_score'
  // puzzle
  | 'puzzles_solved'
  | 'daily_puzzle_solved'
  | 'puzzle_perfect'
  // zombie
  | 'zombies_killed'
  | 'waves_cleared'
  | 'weapon_upgrades'
  // farm
  | 'crops_planted'
  | 'crops_harvested'
  | 'farm_decorations'
  // fishing
  | 'fish_caught'
  | 'fish_species'
  | 'fishing_legendary'
  // platformer
  | 'levels_completed'
  | 'collectibles_found'
  | 'platform_deaths'
  // rhythm
  | 'notes_hit'
  | 'max_combo'
  | 'songs_cleared'
  // arcade
  | 'arcade_rounds'
  | 'arcade_high_score'
  // pen fight
  | 'penfight_matches'
  | 'penfight_wins'
  | 'penfight_knockouts'
  | 'penfight_flicks'
  // shared across the local two-player collection, so a quest can say
  // "win 2 two-player matches" without naming a game
  | 'versus_matches'
  | 'versus_wins'
  | 'versus_rounds'
  // frontier
  | 'frontier_kills'
  | 'frontier_bosses'
  | 'frontier_elites'
  | 'frontier_landmarks'
  | 'frontier_time'
  | 'frontier_runs'
  // quick-play collection
  | 'stackrush_perfects'
  | 'stackrush_score'
  | 'colorsnap_score'
  | 'colorsnap_streak'
  | 'survive60_time'
  | 'survive60_kills'
  | 'hookrun_distance'
  | 'hookrun_grapples'
  | 'towerdef_wave'
  | 'towerdef_kills';

export type MetricDelta = Partial<Record<MetricKey, number>>;

/** How a metric aggregates when tracked repeatedly. */
export const METRIC_MODE: Partial<Record<MetricKey, 'sum' | 'max'>> = {
  run_best_score: 'max',
  arcade_high_score: 'max',
  max_combo: 'max',
  fish_species: 'max',
  games_distinct_played: 'max',
  frontier_time: 'max',
  stackrush_score: 'max',
  colorsnap_score: 'max',
  colorsnap_streak: 'max',
  survive60_time: 'max',
  hookrun_distance: 'max',
  towerdef_wave: 'max',
};

/* ------------------------------------------------------------------ */
/* Game session contract                                               */
/* ------------------------------------------------------------------ */

export type SessionResult = {
  gameId: GameId;
  /** Raw in-game score, meaning is game-specific. */
  score: number;
  durationMs: number;
  /** Metrics to fold into the global stream. */
  metrics: MetricDelta;
  /** Reward computed by the module (pre-modifier). */
  reward: RewardBundle;
  /** Free-form summary rows for the results screen. */
  breakdown?: { label: string; value: string }[];
  outcome?: 'win' | 'lose' | 'quit';
};

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export type Settings = {
  haptics: boolean;
  sound: boolean;
  music: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  /** Renders an FPS + entity counter over game surfaces. */
  showFps: boolean;
  leftHanded: boolean;
};

/* ------------------------------------------------------------------ */
/* Room / home customisation                                           */
/* ------------------------------------------------------------------ */

export type RoomPlacement = {
  /** Unique instance id (an item can be placed multiple times). */
  id: string;
  itemId: string;
  /** Normalised 0..1 coordinates inside the room frame. */
  x: number;
  y: number;
  scale: number;
  flipped: boolean;
};

export type RoomState = {
  wallpaperId: string;
  floorId: string;
  placements: RoomPlacement[];
};
