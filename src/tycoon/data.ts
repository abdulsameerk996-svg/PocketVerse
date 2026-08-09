import type { GeneratorDef, GeneratorId, MilestoneDef, UpgradeDef } from './types';

/** Balance tuning lives here, in one place. */
export const BALANCE = {
  tapBase: 1,
  /** Lifetime (per-run) cash needed for the first prestige token. */
  prestigeDivisor: 1_000_000,
  /** Each token grants +10% permanent income. */
  prestigeBonusPerToken: 0.1,
  /** Offline income rate (50% of live cps). */
  offlineRate: 0.5,
  /** Offline earnings are capped at 8h. */
  offlineCapSeconds: 8 * 60 * 60,
  /** Below this gap no offline income is granted. */
  offlineMinSeconds: 60,
} as const;

export const GENERATORS: GeneratorDef[] = [
  { id: 'barista', name: 'Barista', tagline: 'Hands pour every cup', baseCost: 15, baseCps: 0.1, costGrowth: 1.15 },
  { id: 'fryer', name: 'Donut Fryer', tagline: 'Golden rings, non-stop', baseCost: 120, baseCps: 1, costGrowth: 1.15, unlockRequires: 'barista' },
  { id: 'display', name: 'Display Case', tagline: 'Glaze catches every eye', baseCost: 1_100, baseCps: 8, costGrowth: 1.15, unlockRequires: 'fryer' },
  { id: 'drive', name: 'Drive-Thru', tagline: 'Cars queue around the block', baseCost: 12_000, baseCps: 47, costGrowth: 1.15, unlockRequires: 'display' },
  { id: 'roaster', name: 'Coffee Roaster', tagline: 'Fresh beans, big margins', baseCost: 130_000, baseCps: 260, costGrowth: 1.15, unlockRequires: 'drive' },
  { id: 'van', name: 'Delivery Van', tagline: 'Café on every corner', baseCost: 1_400_000, baseCps: 1_400, costGrowth: 1.15, unlockRequires: 'roaster' },
  { id: 'franchise', name: 'Second Store', tagline: 'Your empire spreads', baseCost: 20_000_000, baseCps: 7_800, costGrowth: 1.15, unlockRequires: 'van' },
  { id: 'robo', name: 'Robo-Barista', tagline: 'Never sleeps, never spills', baseCost: 330_000_000, baseCps: 44_000, costGrowth: 1.15, unlockRequires: 'franchise' },
];

export const GENERATOR_MAP: Record<GeneratorId, GeneratorDef> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
) as Record<GeneratorId, GeneratorDef>;

export const UPGRADES: UpgradeDef[] = [
  { id: 'u_fresh', name: 'Fresh Beans', tagline: 'Tap power ×2', cost: 500, tapMult: 2 },
  { id: 'u_glaze', name: 'Golden Glaze', tagline: 'All income ×2', cost: 2_500, cpsMult: 2 },
  { id: 'u_espresso', name: 'Double Espresso', tagline: 'Tap power ×2', cost: 25_000, tapMult: 2, requires: { gen: 'display', count: 1 } },
  { id: 'u_barista', name: 'Master Barista', tagline: 'All income ×2', cost: 150_000, cpsMult: 2, requires: { gen: 'fryer', count: 5 } },
  { id: 'u_loyalty', name: 'Loyalty Card', tagline: 'All income ×2', cost: 1_500_000, cpsMult: 2, requires: { gen: 'drive', count: 1 } },
  { id: 'u_cinnamon', name: 'Cinnamon Rush', tagline: 'Tap power ×3', cost: 15_000_000, tapMult: 3, requires: { gen: 'roaster', count: 1 } },
  { id: 'u_franchise', name: 'Franchise Manual', tagline: 'All income ×2', cost: 120_000_000, cpsMult: 2, requires: { gen: 'franchise', count: 3 } },
  { id: 'u_organic', name: 'Organic Beans', tagline: 'All income ×2', cost: 1_200_000_000, cpsMult: 2, requires: { gen: 'van', count: 10 } },
  { id: 'u_drone', name: 'Drone Delivery', tagline: 'All income ×3', cost: 12_000_000_000, cpsMult: 3, requires: { gen: 'franchise', count: 10 } },
  { id: 'u_robo', name: 'Robo-Barista v2', tagline: 'All income ×2', cost: 150_000_000_000, cpsMult: 2, requires: { gen: 'robo', count: 5 } },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(
  UPGRADES.map((u) => [u.id, u]),
) as Record<string, UpgradeDef>;

export const MILESTONES: MilestoneDef[] = [
  { id: 'm_tap_100', name: 'Warming Up', tagline: '100 taps', metric: 'taps', target: 100, reward: 500 },
  { id: 'm_earn_1k', name: 'First $1,000', tagline: 'Lifetime earnings', metric: 'lifetimeEarned', target: 1_000, reward: 1_000 },
  { id: 'm_first_gen', name: 'First Hire', tagline: 'Own any generator', metric: 'totalGenerators', target: 1, reward: 250 },
  { id: 'm_gen_10', name: 'Staff of Ten', tagline: '10 units total', metric: 'totalGenerators', target: 10, reward: 5_000 },
  { id: 'm_upgrade_5', name: 'Recipe Book', tagline: '5 upgrades owned', metric: 'upgradesOwned', target: 5, reward: 10_000 },
  { id: 'm_tap_5k', name: 'Finger Workout', tagline: '5,000 taps', metric: 'taps', target: 5_000, reward: 250_000 },
  { id: 'm_earn_1m', name: 'Millionaire Baker', tagline: 'Lifetime $1M', metric: 'lifetimeEarned', target: 1_000_000, reward: 100_000 },
  { id: 'm_prestige_1', name: 'Second Location', tagline: 'Prestige once', metric: 'prestiges', target: 1, reward: 50_000 },
  { id: 'm_earn_1b', name: 'Donut Baron', tagline: 'Lifetime $1B', metric: 'lifetimeEarned', target: 1_000_000_000, reward: 50_000_000 },
];

export const MILESTONE_MAP: Record<string, MilestoneDef> = Object.fromEntries(
  MILESTONES.map((m) => [m.id, m]),
) as Record<string, MilestoneDef>;
