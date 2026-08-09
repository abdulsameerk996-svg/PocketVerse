import { BALANCE, GENERATOR_MAP, GENERATORS, MILESTONE_MAP, MILESTONES, UPGRADE_MAP, UPGRADES } from './data';
import type { DerivedStats, GameState, GeneratorId } from './types';

/**
 * Donut Tycoon engine — pure and deterministic.
 *
 * Every transition takes a state and returns a new state. No React, no
 * platform APIs, no timers. `tools/tycoon-sim` plays this same code headlessly
 * and the app drives it from the store.
 */

export const SAVE_VERSION = 1;

export function createGame(now = Date.now()): GameState {
  return {
    version: SAVE_VERSION,
    cash: 0,
    lifetimeEarned: 0,
    allTimeEarned: 0,
    taps: 0,
    generators: {
      barista: 0,
      fryer: 0,
      display: 0,
      drive: 0,
      roaster: 0,
      van: 0,
      franchise: 0,
      robo: 0,
    },
    upgrades: [],
    milestonesClaimed: [],
    prestigeTokens: 0,
    prestiges: 0,
    playSeconds: 0,
    lastSeenAt: now,
    startedAt: now,
  };
}

export function costOf(def: { baseCost: number; costGrowth: number }, owned: number): number {
  return def.baseCost * Math.pow(def.costGrowth, owned);
}

/** Combined upgrade multipliers. */
function upgradeMultipliers(state: GameState): { cpsMult: number; tapMult: number } {
  let cpsMult = 1;
  let tapMult = 1;
  for (const id of state.upgrades) {
    const u = UPGRADE_MAP[id];
    if (!u) continue;
    if (u.cpsMult) cpsMult *= u.cpsMult;
    if (u.tapMult) tapMult *= u.tapMult;
  }
  return { cpsMult, tapMult };
}

export function prestigeMultiplier(tokens: number): number {
  return 1 + finite(tokens) * BALANCE.prestigeBonusPerToken;
}

export function derive(state: GameState): DerivedStats {
  const { cpsMult, tapMult } = upgradeMultipliers(state);
  const pMult = prestigeMultiplier(state.prestigeTokens);

  let cps = 0;
  let totalGenerators = 0;
  for (const def of GENERATORS) {
    const owned = typeof state.generators[def.id] === 'number' ? state.generators[def.id] : 0;
    totalGenerators += finite(owned);
    cps += finite(owned) * def.baseCps;
  }
  cps = finite(cps) * cpsMult * pMult;

  return {
    cps,
    tapPower: BALANCE.tapBase * tapMult * pMult,
    cpsMult,
    tapMult,
    prestigeMult: pMult,
    totalGenerators,
    upgradesOwned: state.upgrades.length,
  };
}

export function tap(state: GameState, now = Date.now()): GameState {
  const { tapPower } = derive(state);
  const gain = finite(tapPower);
  return {
    ...state,
    cash: state.cash + gain,
    lifetimeEarned: state.lifetimeEarned + gain,
    allTimeEarned: state.allTimeEarned + gain,
    taps: state.taps + 1,
    lastSeenAt: now,
  };
}

/** Advance the simulation by `seconds` at the current cps. Returns {state, earned}. */
export function advance(state: GameState, seconds: number): { state: GameState; earned: number } {
  const s = finite(seconds);
  if (!Number.isFinite(s) || s <= 0) return { state, earned: 0 };
  const { cps } = derive(state);
  const earned = finite(cps * s);
  return {
    state: {
      ...state,
      cash: state.cash + earned,
      lifetimeEarned: state.lifetimeEarned + earned,
      allTimeEarned: state.allTimeEarned + earned,
      playSeconds: state.playSeconds + s,
      lastSeenAt: Date.now(),
    },
    earned,
  };
}

export function generatorUnlocked(state: GameState, id: GeneratorId): boolean {
  const def = GENERATOR_MAP[id];
  if (!def?.unlockRequires) return true;
  return (state.generators[def.unlockRequires] ?? 0) >= 1;
}

export function buyGenerator(state: GameState, id: GeneratorId): GameState | null {
  const def = GENERATOR_MAP[id];
  if (!def) return null;
  if (!generatorUnlocked(state, id)) return null;
  const owned = state.generators[id] ?? 0;
  const cost = costOf(def, owned);
  if (state.cash < cost) return null;
  return {
    ...state,
    cash: state.cash - cost,
    generators: { ...state.generators, [id]: owned + 1 },
    lastSeenAt: Date.now(),
  };
}

export function upgradeUnlocked(state: GameState, id: string): boolean {
  const u = UPGRADE_MAP[id];
  if (!u) return false;
  if (!u.requires) return true;
  return (state.generators[u.requires.gen] ?? 0) >= u.requires.count;
}

export function buyUpgrade(state: GameState, id: string): GameState | null {
  const u = UPGRADE_MAP[id];
  if (!u || state.upgrades.includes(id) || !upgradeUnlocked(state, id)) return null;
  if (state.cash < u.cost) return null;
  return {
    ...state,
    cash: state.cash - u.cost,
    upgrades: [...state.upgrades, id],
    lastSeenAt: Date.now(),
  };
}

export function milestoneProgress(state: GameState, id: string): number {
  const m = MILESTONE_MAP[id];
  if (!m) return 0;
  const d = derive(state);
  const value =
    m.metric === 'taps'
      ? state.taps
      : m.metric === 'lifetimeEarned'
        ? state.lifetimeEarned
        : m.metric === 'totalGenerators'
          ? d.totalGenerators
          : m.metric === 'upgradesOwned'
            ? d.upgradesOwned
            : state.prestiges;
  return value;
}

export function canClaimMilestone(state: GameState, id: string): boolean {
  const m = MILESTONE_MAP[id];
  if (!m || state.milestonesClaimed.includes(id)) return false;
  return milestoneProgress(state, id) >= m.target;
}

export function claimMilestone(state: GameState, id: string): GameState | null {
  const m = MILESTONE_MAP[id];
  if (!m || !canClaimMilestone(state, id)) return null;
  const reward = finite(m.reward);
  return {
    ...state,
    cash: state.cash + reward,
    lifetimeEarned: state.lifetimeEarned + reward,
    allTimeEarned: state.allTimeEarned + reward,
    milestonesClaimed: [...state.milestonesClaimed, id],
    lastSeenAt: Date.now(),
  };
}

/** Prestige tokens the current run would yield: sqrt(lifetime / divisor). */
export function prestigeGain(state: GameState): number {
  if (state.lifetimeEarned < BALANCE.prestigeDivisor) return 0;
  return Math.floor(Math.sqrt(state.lifetimeEarned / BALANCE.prestigeDivisor));
}

export function doPrestige(state: GameState, now = Date.now()): GameState {
  const gained = prestigeGain(state);
  if (gained <= 0) return state;
  const fresh = createGame(now);
  return {
    ...fresh,
    upgrades: state.upgrades,
    milestonesClaimed: state.milestonesClaimed,
    prestigeTokens: state.prestigeTokens + gained,
    prestiges: state.prestiges + 1,
    allTimeEarned: state.allTimeEarned,
    taps: state.taps,
    playSeconds: state.playSeconds,
    startedAt: state.startedAt,
    lastSeenAt: now,
  };
}

/**
 * Offline earnings since `state.lastSeenAt`. 50% of live cps, capped at 8h,
 * only granted after 60s away. Returns { seconds, earned }.
 */
export function offlineEarnings(state: GameState, now = Date.now()): { seconds: number; earned: number } {
  const elapsedMs = Math.max(0, now - state.lastSeenAt);
  const seconds = Math.min(elapsedMs / 1000, BALANCE.offlineCapSeconds);
  if (seconds < BALANCE.offlineMinSeconds) return { seconds: 0, earned: 0 };
  const { cps } = derive(state);
  return { seconds, earned: finite(cps * seconds * BALANCE.offlineRate) };
}

export function applyOffline(state: GameState, now = Date.now()): { state: GameState; earned: number } {
  const { seconds, earned } = offlineEarnings(state, now);
  if (earned <= 0) {
    return { state: { ...state, lastSeenAt: now }, earned: 0 };
  }
  return {
    state: {
      ...state,
      cash: state.cash + earned,
      lifetimeEarned: state.lifetimeEarned + earned,
      allTimeEarned: state.allTimeEarned + earned,
      lastSeenAt: now,
    },
    earned,
  };
}

/** Guard: coerce NaN/Infinity/undefined to a sane default so a poisoned value can never propagate. */
function finite(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * Sanitise a loaded save: guarantee finite numbers, complete generator map and
 * valid id lists. Never throws — a corrupt save becomes a fresh one.
 */
export function validateState(raw: unknown): GameState {
  const fresh = createGame();
  if (!raw || typeof raw !== 'object') return fresh;
  const s = raw as Partial<GameState>;

  const gens = { ...fresh.generators };
  if (s.generators && typeof s.generators === 'object') {
    for (const def of GENERATORS) {
      const v = (s.generators as Record<string, unknown>)[def.id];
      gens[def.id] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
    }
  }

  const upgrades = Array.isArray(s.upgrades) ? s.upgrades.filter((u) => typeof u === 'string' && !!UPGRADE_MAP[u]) : [];
  const milestones = Array.isArray(s.milestonesClaimed)
    ? s.milestonesClaimed.filter((m) => typeof m === 'string' && !!MILESTONE_MAP[m])
    : [];

  return {
    version: SAVE_VERSION,
    cash: finite(s.cash),
    lifetimeEarned: finite(s.lifetimeEarned),
    allTimeEarned: finite(s.allTimeEarned),
    taps: Math.max(0, Math.floor(finite(s.taps))),
    generators: gens,
    upgrades,
    milestonesClaimed: milestones,
    prestigeTokens: Math.max(0, Math.floor(finite(s.prestigeTokens))),
    prestiges: Math.max(0, Math.floor(finite(s.prestiges))),
    playSeconds: Math.max(0, finite(s.playSeconds)),
    lastSeenAt: typeof s.lastSeenAt === 'number' && Number.isFinite(s.lastSeenAt) ? s.lastSeenAt : Date.now(),
    startedAt: typeof s.startedAt === 'number' && Number.isFinite(s.startedAt) ? s.startedAt : Date.now(),
  };
}
