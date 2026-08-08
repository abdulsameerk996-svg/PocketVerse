import type { BiomeId, BossId, EnemyKind, FrontierSave, UpgradeId } from './types';

/**
 * FRONTIER TABLES
 *
 * Everything that makes Frontier *tunable* lives here: enemy archetypes, boss
 * archetypes, upgrade effects, biome flavour. The sim reads these tables and
 * nothing else hard-codes balance numbers.
 */

/* ---------------------------------------------------------------- world -- */

export const HALF_W = 50;

export const BIOMES: Record<
  BiomeId,
  {
    name: string;
    ground: string;
    accent: string;
    enemies: { kind: EnemyKind; weight: number; pack: [number, number] }[];
    /** Hazard chance modifier — danger spawns spawn faster. */
    spawnMul: number;
  }
> = {
  meadow: {
    name: 'Meadow Outskirts',
    ground: '#1B3126',
    accent: '#4ADE80',
    enemies: [
      { kind: 'walker', weight: 5, pack: [1, 2] },
      { kind: 'chaser', weight: 2, pack: [1, 2] },
    ],
    spawnMul: 1,
  },
  forest: {
    name: 'The Deepwood',
    ground: '#0F2B1C',
    accent: '#34E2A8',
    enemies: [
      { kind: 'chaser', weight: 4, pack: [1, 2] },
      { kind: 'ranged', weight: 3, pack: [1, 1] },
      { kind: 'swarm', weight: 3, pack: [3, 5] },
    ],
    spawnMul: 1.15,
  },
  ruins: {
    name: 'The Sunken Ruins',
    ground: '#241D33',
    accent: '#7C5CFF',
    enemies: [
      { kind: 'ranged', weight: 3, pack: [1, 2] },
      { kind: 'tank', weight: 2, pack: [1, 1] },
      { kind: 'elite', weight: 0.5, pack: [1, 1] },
    ],
    spawnMul: 1.3,
  },
  danger: {
    name: 'The Danger Zone',
    ground: '#2B1220',
    accent: '#FF4D8D',
    enemies: [
      { kind: 'walker', weight: 2, pack: [2, 3] },
      { kind: 'chaser', weight: 3, pack: [2, 3] },
      { kind: 'ranged', weight: 2, pack: [1, 2] },
      { kind: 'tank', weight: 2, pack: [1, 2] },
      { kind: 'swarm', weight: 2, pack: [4, 6] },
      { kind: 'elite', weight: 1, pack: [1, 1] },
    ],
    spawnMul: 1.55,
  },
};

export const BIOME_ORDER: BiomeId[] = ['meadow', 'forest', 'ruins', 'danger'];

/* -------------------------------------------------------------- enemies -- */

export type EnemyDef = {
  kind: EnemyKind;
  hp: number;
  speed: number;
  r: number;
  damage: number;
  attackCd: number;
  fireCd: number;
  ranged: boolean;
  budget: number;
  xp: number;
  color: string;
  /** Telegraphed slam (kind 0) — elites/bosses use telegraphs. */
  telegraphs: boolean;
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  walker: {
    kind: 'walker', hp: 34, speed: 3.4, r: 0.55, damage: 10, attackCd: 1.2,
    fireCd: 0, ranged: false, budget: 1, xp: 2, color: '#7EC850', telegraphs: false,
  },
  chaser: {
    kind: 'chaser', hp: 16, speed: 6.6, r: 0.42, damage: 8, attackCd: 0.75,
    fireCd: 0, ranged: false, budget: 1, xp: 2, color: '#4ED6D6', telegraphs: false,
  },
  ranged: {
    kind: 'ranged', hp: 26, speed: 4, r: 0.5, damage: 9, attackCd: 0,
    fireCd: 2.4, ranged: true, budget: 2, xp: 3, color: '#C05CFF', telegraphs: false,
  },
  tank: {
    kind: 'tank', hp: 150, speed: 2.2, r: 0.85, damage: 22, attackCd: 1.6,
    fireCd: 0, ranged: false, budget: 4, xp: 6, color: '#FFB443', telegraphs: false,
  },
  swarm: {
    kind: 'swarm', hp: 9, speed: 5.2, r: 0.3, damage: 5, attackCd: 1,
    fireCd: 0, ranged: false, budget: 0.4, xp: 1, color: '#A3E635', telegraphs: false,
  },
  elite: {
    kind: 'elite', hp: 320, speed: 3.6, r: 1.05, damage: 26, attackCd: 1.5,
    fireCd: 0, ranged: false, budget: 6, xp: 14, color: '#FF4D4D', telegraphs: true,
  },
};

export const ENEMY_KINDS = Object.keys(ENEMIES) as EnemyKind[];

/* --------------------------------------------------------------- bosses -- */

export type BossDef = {
  id: BossId;
  name: string;
  biome: BiomeId;
  hp: number;
  speed: number;
  r: number;
  damage: number;
  color: string;
  accent: string;
  /** First-kill permanent bonus (+damage%, +maxHp, +moveSpeed%). */
  permanent: { damage: number; maxHp: number; moveSpeed: number };
};

export const BOSSES: Record<BossId, BossDef> = {
  warden: {
    id: 'warden',
    name: 'THE WARDEN',
    biome: 'meadow',
    hp: 900,
    speed: 4.4,
    r: 1.5,
    damage: 18,
    color: '#4EA8FF',
    accent: '#A9E7FF',
    permanent: { damage: 0.04, maxHp: 8, moveSpeed: 0.02 },
  },
  rootbeast: {
    id: 'rootbeast',
    name: 'THE ROOTBEAST',
    biome: 'forest',
    hp: 1500,
    speed: 3.2,
    r: 1.8,
    damage: 22,
    color: '#34E2A8',
    accent: '#B8FFE0',
    permanent: { damage: 0.05, maxHp: 10, moveSpeed: 0.025 },
  },
  voidengine: {
    id: 'voidengine',
    name: 'THE VOID ENGINE',
    biome: 'danger',
    hp: 2300,
    speed: 4.8,
    r: 1.7,
    damage: 26,
    color: '#C05CFF',
    accent: '#FFD166',
    permanent: { damage: 0.06, maxHp: 12, moveSpeed: 0.03 },
  },
};

export const BOSS_ORDER = ['warden', 'rootbeast', 'voidengine'] as const;

/* ------------------------------------------------------------- upgrades -- */

export type UpgradeDef = {
  id: UpgradeId;
  name: string;
  glyph: string;
  desc: string;
  apply: number;
};

export const UPGRADES: UpgradeDef[] = [
  { id: 'damage', name: 'Might', glyph: '🗡️', desc: '+22% damage', apply: 0.22 },
  { id: 'attackSpeed', name: 'Haste', glyph: '⏱️', desc: '+18% attack speed', apply: 0.18 },
  { id: 'moveSpeed', name: 'Swiftness', glyph: '💨', desc: '+10% move speed', apply: 0.1 },
  { id: 'maxHp', name: 'Vitality', glyph: '❤️', desc: '+25 max HP and heal 25', apply: 25 },
  { id: 'crit', name: 'Precision', glyph: '🎯', desc: '+15% critical chance', apply: 0.15 },
  { id: 'multishot', name: 'Volley', glyph: '➰', desc: '+1 projectile', apply: 1 },
  { id: 'dashCd', name: 'Phase', glyph: '🌀', desc: '-25% dash cooldown', apply: 0.25 },
  { id: 'ability', name: 'Nova', glyph: '💥', desc: '+45% ability power', apply: 0.45 },
];

export const UPGRADE_MAP = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<
  UpgradeId,
  UpgradeDef
>;

/* ------------------------------------------------------------------ save -- */

export function defaultFrontierSave(): FrontierSave {
  return {
    bestScore: 0,
    bestTime: 0,
    runs: 0,
    totalKills: 0,
    totalBosses: 0,
    totalElites: 0,
    totalLandmarks: 0,
    bossesDefeated: [],
    permanent: { damage: 0, maxHp: 0, moveSpeed: 0 },
  };
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Coerce a persisted blob into a complete, finite FrontierSave. */
export function normalizeFrontierSave(raw: unknown): FrontierSave {
  const base = defaultFrontierSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const s = raw as Partial<FrontierSave>;
  const perm = (s.permanent ?? {}) as Partial<FrontierSave['permanent']>;
  const known = new Set<string>(BOSS_ORDER);
  const bosses = Array.isArray(s.bossesDefeated)
    ? s.bossesDefeated.filter((id): id is BossId => known.has(id as BossId))
    : [];
  return {
    bestScore: Math.max(0, num(s.bestScore)),
    bestTime: Math.max(0, num(s.bestTime)),
    runs: Math.max(0, Math.floor(num(s.runs))),
    totalKills: Math.max(0, Math.floor(num(s.totalKills))),
    totalBosses: Math.max(0, Math.floor(num(s.totalBosses))),
    totalElites: Math.max(0, Math.floor(num(s.totalElites))),
    totalLandmarks: Math.max(0, Math.floor(num(s.totalLandmarks))),
    bossesDefeated: bosses,
    permanent: {
      damage: Math.max(0, num(perm.damage)),
      maxHp: Math.max(0, num(perm.maxHp)),
      moveSpeed: Math.max(0, num(perm.moveSpeed)),
    },
  };
}

/* --------------------------------------------------------------- rewards -- */

/** End-of-run reward, computed from the run stats. Not a new economy. */
export function rewardForRun(stats: {
  kills: number;
  elites: number;
  bosses: number;
  landmarks: number;
  rares: number;
  time: number;
}): { score: number; coins: number; xp: number; gems: number; items: Record<string, number> } {
  const score = Math.round(
    stats.kills * 10 +
      stats.elites * 45 +
      stats.bosses * 500 +
      stats.landmarks * 80 +
      stats.time * 4 +
      stats.rares * 25,
  );
  const coins = Math.round(80 + score * 0.55);
  const xp = Math.round(40 + score * 0.16);
  const gems = stats.bosses > 0 ? 2 : stats.rares >= 2 ? 1 : 0;
  const items: Record<string, number> = {};
  if (stats.kills >= 6) items.mat_scrap = Math.min(6, 1 + Math.floor(stats.kills / 14));
  if (stats.elites >= 1) items.mat_circuit = Math.min(3, stats.elites);
  if (stats.bosses >= 1) items.mat_core = Math.min(2, stats.bosses);
  if (stats.rares >= 3) items.mat_starfrag = 1;
  return { score, coins, xp, gems, items };
}
