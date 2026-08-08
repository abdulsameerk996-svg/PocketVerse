/**
 * POCKETVERSE FRONTIER — shared types.
 *
 * The simulation is pure TS and runs in two places: on the render thread in
 * the app (stepped from R3F's `useFrame`) and headlessly in
 * `tools/frontier-sim`. Everything here is plain data so both can share it.
 * Coordinates are world XZ, Y up; the world is square, ±HALF_W from the origin.
 */

export type BiomeId = 'meadow' | 'forest' | 'ruins' | 'danger';

export type EnemyKind = 'walker' | 'chaser' | 'ranged' | 'tank' | 'swarm' | 'elite';

export type BossId = 'warden' | 'rootbeast' | 'voidengine';

export type UpgradeId =
  | 'damage'
  | 'attackSpeed'
  | 'moveSpeed'
  | 'maxHp'
  | 'crit'
  | 'multishot'
  | 'dashCd'
  | 'ability';

export type PickupKind = 'gem' | 'hp' | 'buff' | 'rare';
export type ProjKind = 'player' | 'enemy';
export type EventKind = 'none' | 'swarm' | 'treasure' | 'healzone' | 'meteor' | 'elite';

/* ------------------------------------------------------------- entities -- */

export type Enemy = {
  active: boolean;
  kind: EnemyKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  damage: number;
  /** Seconds until this enemy may damage the player again (contact attacks). */
  attackCd: number;
  /** Seconds until a ranged enemy fires again. */
  fireCd: number;
  /** >0 while the hit-flash overlay should show. */
  hitFlash: number;
  /** >0 spawn-in scale timer. */
  spawnT: number;
  /** Elite and boss instances are worth more and drop better loot. */
  elite: boolean;
  boss: boolean;
  /** Wind-up remaining for a telegraphed attack; 0 = none. */
  telegraph: number;
  telegraphKind: number;
  /** Knockback impulse, decays over time. */
  kx: number;
  kz: number;
  /** Movement direction for the idle bob / facing. */
  dirX: number;
  dirZ: number;
};

export type Pickup = {
  active: boolean;
  kind: PickupKind;
  x: number;
  z: number;
  ttl: number;
  bob: number;
};

export type Projectile = {
  active: boolean;
  kind: ProjKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  r: number;
  dmg: number;
  ttl: number;
};

/** Telegraphed area — shown as a ring, then resolves (meteors, boss slams). */
export type Tele = {
  active: boolean;
  x: number;
  z: number;
  r: number;
  ttl: number;
  /** 0 = incoming strike, 1 = impact flash. */
  phase: number;
  color: string;
  /** Damage applied to the player on resolve (0 = harmless to the player). */
  dmg: number;
  /** Damage applied to enemies on resolve (0 = harmless to enemies). */
  dmgEnemies: number;
};

export type ActiveEvent = {
  kind: EventKind;
  ttl: number;
  x: number;
  z: number;
  r: number;
};

/* ---------------------------------------------------------------- bosses -- */

export type Boss = {
  id: BossId;
  active: boolean;
  phase: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  r: number;
  damage: number;
  /** Seconds until the next attack. */
  attackT: number;
  /** Wind-up before a telegraphed attack resolves. */
  telegraph: number;
  telegraphKind: number;
  /** Remaining summons before the phase decides enough is enough. */
  summonT: number;
  hitFlash: number;
  dead: boolean;
  deadT: number;
  t: number;
  vx: number;
  vz: number;
};

/* --------------------------------------------------------------- player -- */

export type Player = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  facing: number;
  level: number;
  xp: number;
  xpNeed: number;
  meleeCd: number;
  rangedCd: number;
  dashCd: number;
  dashT: number;
  invuln: number;
  abilityCd: number;
  stamina: number;
  sprinting: boolean;
  moving: boolean;
  hurtT: number;
  attackWindup: number;
  attackSwing: number;
};

/* ---------------------------------------------------------------- world -- */

export type Landmark = {
  id: string;
  name: string;
  biome: BiomeId;
  x: number;
  z: number;
  kind: 'boss' | 'sight';
  boss?: BossId;
  discovered: boolean;
};

export type RunStats = {
  kills: number;
  elites: number;
  bosses: number;
  landmarks: number;
  gems: number;
  rares: number;
  time: number;
  bossesDefeated: BossId[];
  upgradesTaken: UpgradeId[];
};

export type Banner = { text: string; ttl: number; color: string } | null;

export type FrontierInput = {
  mx: number;
  mz: number;
  sprint: boolean;
  melee: boolean;
  dash: boolean;
  ability: boolean;
};

export type World = {
  seed: number;
  /** Per-run deterministic RNG — every dice roll in the sim comes from here. */
  rand: () => number;
  time: number;
  over: boolean;
  choosing: boolean;
  upgradeChoices: UpgradeId[];
  banner: Banner;
  shake: number;
  biome: BiomeId;
  player: Player;
  enemies: Enemy[];
  pickups: Pickup[];
  projectiles: Projectile[];
  teles: Tele[];
  event: ActiveEvent;
  landmarks: Landmark[];
  objective: Landmark;
  boss: Boss | null;
  stats: RunStats;
  spawnTimer: number;
  eventTimer: number;
  /** Cosmetic luck — shifts rare drop rolls. */
  luck: number;
  /** Composite in-run multipliers (base 1) after upgrades + buffs. */
  mods: {
    damage: number;
    attackSpeed: number;
    moveSpeed: number;
    maxHp: number;
    crit: number;
    multishot: number;
    dashCd: number;
    ability: number;
  };
  /** Permanent bonuses carried in from the module save. */
  permanent: { damage: number; maxHp: number; moveSpeed: number };
  buffT: number;
  buffKind: number;
  hurtFlash: number;
  /** Sound cues queued by the sim this frame; drained by the shell. */
  sfx: string[];
};

/* ------------------------------------------------------------------ save -- */

export type FrontierSave = {
  bestScore: number;
  bestTime: number;
  runs: number;
  totalKills: number;
  totalBosses: number;
  totalElites: number;
  totalLandmarks: number;
  bossesDefeated: BossId[];
  permanent: { damage: number; maxHp: number; moveSpeed: number };
};
