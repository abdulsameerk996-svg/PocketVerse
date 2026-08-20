/**
 * Café Tycoon — pure domain types.
 *
 * Nothing in this module imports React, React Native or any platform API,
 * so the whole simulation compiles to plain CommonJS and runs headlessly
 * in tools/tycoon-sim.
 */

export type GeneratorId =
  | 'barista'
  | 'fryer'
  | 'display'
  | 'drive'
  | 'roaster'
  | 'van'
  | 'franchise'
  | 'robo';

export interface GeneratorDef {
  id: GeneratorId;
  name: string;
  tagline: string;
  /** Cost of the first unit. */
  baseCost: number;
  /** Income per second per owned unit. */
  baseCps: number;
  /** Cost multiplier per owned unit (classic 1.15). */
  costGrowth: number;
  /** Must own ≥1 of this generator before this tier unlocks. */
  unlockRequires?: GeneratorId;
  /** Emoji glyph for the café world (purely cosmetic). */
  glyph: string;
}

export interface UpgradeDef {
  id: string;
  name: string;
  tagline: string;
  cost: number;
  /** Multiplier applied to tap power (2 = double). */
  tapMult?: number;
  /** Multiplier applied to every generator's cps (2 = double). */
  cpsMult?: number;
  /** Purchase gate: own this many of a generator. */
  requires?: { gen: GeneratorId; count: number };
}

export interface MilestoneDef {
  id: string;
  name: string;
  tagline: string;
  metric: 'taps' | 'lifetimeEarned' | 'totalGenerators' | 'upgradesOwned' | 'prestiges';
  target: number;
  /** One-time cash reward when claimed. */
  reward: number;
}

export interface GameState {
  version: number;
  cash: number;
  /** Earned since the last prestige (drives prestige gains + some milestones). */
  lifetimeEarned: number;
  /** Never reset — total cash ever earned. */
  allTimeEarned: number;
  taps: number;
  generators: Record<GeneratorId, number>;
  upgrades: string[];
  milestonesClaimed: string[];
  prestigeTokens: number;
  prestiges: number;
  playSeconds: number;
  /** Epoch ms of the last time the save was touched (offline math). */
  lastSeenAt: number;
  startedAt: number;
  /** Number of building floors (vertical tower expansion). Starts at 1. */
  floors: number;
  /** Equipment slots per floor (horizontal room expansion). Starts at 3. */
  floorWidth: number;
}

export interface DerivedStats {
  /** Total income per second. */
  cps: number;
  /** Cash per tap. */
  tapPower: number;
  /** Combined × from upgrades (generator income). */
  cpsMult: number;
  /** Combined × from upgrades (tap power). */
  tapMult: number;
  /** Permanent × from prestige tokens. */
  prestigeMult: number;
  /** Total units owned across all generators. */
  totalGenerators: number;
  /** Total one-time upgrades owned. */
  upgradesOwned: number;
}

/* ---- World types (positional, not React) ---- */

export interface WorldCharacter {
  id: string;
  type: 'barista' | 'customer';
  floor: number;
  /** X position in 0–1 space within the floor. */
  x: number;
  targetX: number;
  /** Movement speed in 0–1 per second. */
  speed: number;
  state: 'walking' | 'working' | 'idle' | 'entering' | 'leaving';
  /** Assigned equipment slot index (baristas only). */
  slot: number;
  /** Visual color hue for this character. */
  hue: number;
}

export interface Floater {
  id: number;
  amount: number;
  /** Floor index where the money appears. */
  floor: number;
  /** X position within the floor (0–1). */
  x: number;
  /** Timestamp for expiry tracking. */
  born: number;
}
