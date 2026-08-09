/**
 * Donut Tycoon — pure domain types.
 *
 * Nothing in this module (or data.ts / engine.ts / format.ts) imports React,
 * React Native or any platform API, so the whole simulation compiles to plain
 * CommonJS and runs headlessly in tools/tycoon-sim.
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
