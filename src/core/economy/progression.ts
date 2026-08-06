import type { RewardBundle, StatModifiers } from '../types';

/**
 * Progression maths. Pure functions only — no state, no side effects, trivially
 * unit-testable, and identical for every game.
 */

/** XP required to go from `level` to `level + 1`. Gentle quadratic curve. */
export function xpForLevel(level: number): number {
  return Math.round(80 + Math.pow(level, 1.62) * 42);
}

/** Total XP required to reach `level` from 1. */
export function cumulativeXp(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpForLevel(l);
  return total;
}

export type LevelUpResult = {
  level: number;
  xp: number;
  levelsGained: number;
  /** Rewards granted purely by levelling (coins + energy cap bumps). */
  bonus: RewardBundle;
  newEnergyMax: number;
};

export const BASE_ENERGY_MAX = 20;

export function energyMaxForLevel(level: number): number {
  // +1 max energy every 3 levels, capped so the game never becomes idle-free.
  return Math.min(BASE_ENERGY_MAX + Math.floor((level - 1) / 3), 40);
}

/** Fold XP into level, handling multi-level-ups in one call. */
export function applyXp(level: number, xp: number, gained: number): LevelUpResult {
  let lvl = level;
  let cur = xp + Math.max(0, Math.round(gained));
  let levelsGained = 0;

  while (cur >= xpForLevel(lvl) && lvl < 999) {
    cur -= xpForLevel(lvl);
    lvl += 1;
    levelsGained += 1;
  }

  const bonus: RewardBundle = levelsGained
    ? { coins: levelsGained * 120, gems: Math.floor(levelsGained / 2) + (lvl % 5 === 0 ? 3 : 0) }
    : {};

  return { level: lvl, xp: cur, levelsGained, bonus, newEnergyMax: energyMaxForLevel(lvl) };
}

/* ------------------------------------------------------------- energy -- */

/** One energy pip every 6 minutes at base rate. */
export const ENERGY_REGEN_MS = 6 * 60 * 1000;

export type EnergyTick = { energy: number; energyUpdatedAt: number };

/**
 * Offline-first energy regeneration: we never run a timer to add energy, we
 * compute it from wall-clock delta whenever the app looks at it. Works while
 * the app is killed, which is the whole point.
 */
export function regenEnergy(
  energy: number,
  energyMax: number,
  energyUpdatedAt: number,
  now: number,
  regenMultiplier = 1,
): EnergyTick {
  if (energy >= energyMax) return { energy, energyUpdatedAt: now };
  const rate = ENERGY_REGEN_MS / Math.max(0.25, regenMultiplier);
  const elapsed = Math.max(0, now - energyUpdatedAt);
  const gained = Math.floor(elapsed / rate);
  if (gained <= 0) return { energy, energyUpdatedAt };
  const next = Math.min(energyMax, energy + gained);
  // Carry the remainder so partial progress is never lost.
  const consumed = (next - energy) * rate;
  return { energy: next, energyUpdatedAt: energyUpdatedAt + consumed };
}

export function msUntilNextEnergy(
  energy: number,
  energyMax: number,
  energyUpdatedAt: number,
  now: number,
  regenMultiplier = 1,
): number {
  if (energy >= energyMax) return 0;
  const rate = ENERGY_REGEN_MS / Math.max(0.25, regenMultiplier);
  return Math.max(0, energyUpdatedAt + rate - now);
}

/* ---------------------------------------------------------- modifiers -- */

export const NO_MODIFIERS: Required<StatModifiers> = {
  coinBonus: 0,
  xpBonus: 0,
  speed: 0,
  armor: 0,
  energyRegen: 0,
  luck: 0,
};

export function mergeModifiers(list: (StatModifiers | undefined)[]): Required<StatModifiers> {
  const out = { ...NO_MODIFIERS };
  for (const m of list) {
    if (!m) continue;
    out.coinBonus += m.coinBonus ?? 0;
    out.xpBonus += m.xpBonus ?? 0;
    out.speed += m.speed ?? 0;
    out.armor += m.armor ?? 0;
    out.energyRegen += m.energyRegen ?? 0;
    out.luck += m.luck ?? 0;
  }
  return out;
}

/**
 * Apply equipped-cosmetic bonuses to a raw reward bundle. Called once, centrally,
 * so no game can accidentally double-dip or forget to honour a bonus.
 */
export function boostReward(
  reward: RewardBundle,
  mods: Required<StatModifiers>,
): RewardBundle {
  const out: RewardBundle = { ...reward };
  if (out.coins) out.coins = Math.round(out.coins * (1 + mods.coinBonus));
  if (out.xp) out.xp = Math.round(out.xp * (1 + mods.xpBonus));
  return out;
}

export function isRewardEmpty(r: RewardBundle): boolean {
  return (
    !r.xp &&
    !r.coins &&
    !r.gems &&
    !r.energy &&
    !r.unlocks?.length &&
    !(r.items && Object.keys(r.items).length)
  );
}

export function mergeRewards(a: RewardBundle, b: RewardBundle): RewardBundle {
  const items = { ...(a.items ?? {}) };
  for (const [k, v] of Object.entries(b.items ?? {})) items[k] = (items[k] ?? 0) + v;
  return {
    xp: (a.xp ?? 0) + (b.xp ?? 0) || undefined,
    coins: (a.coins ?? 0) + (b.coins ?? 0) || undefined,
    gems: (a.gems ?? 0) + (b.gems ?? 0) || undefined,
    energy: (a.energy ?? 0) + (b.energy ?? 0) || undefined,
    items: Object.keys(items).length ? items : undefined,
    unlocks: [...(a.unlocks ?? []), ...(b.unlocks ?? [])].filter(
      (v, i, arr) => arr.indexOf(v) === i,
    ),
  };
}
