import { createRng } from '../../core/utils/rng';
import { BOSSES, BIOMES, ENEMIES, HALF_W, UPGRADE_MAP } from './content';
import { biomeAt, makeLandmarks } from './world';
import type {
  BiomeId,
  Boss,
  BossId,
  Enemy,
  EnemyKind,
  EventKind,
  FrontierInput,
  FrontierSave,
  Landmark,
  Pickup,
  PickupKind,
  Player,
  Projectile,
  Tele,
  UpgradeId,
  World,
} from './types';

/**
 * ============================================================================
 *  POCKETVERSE FRONTIER — SIMULATION CORE
 * ============================================================================
 *
 * Pure TS, no React, no three.js. `createRun` builds a world from a seed and a
 * save; `step` advances it by a fixed timestep; `applyUpgrade` resolves a
 * level-up choice; `finishRun` converts stats into the reward envelope. The
 * same code runs on the render thread in the app and headlessly in
 * `tools/frontier-sim`, so the harness tests exactly what ships.
 *
 * Guarantees:
 *  - player spawns at 0,0 inside world, inside camera frustum
 *  - guaranteed scenery (see world.ts decorations) and enemies near spawn
 *  - first 10s deterministic: no random events, fast first spawn
 */

export const FIXED_DT = 1 / 60;
export const ENEMY_POOL = 90;
export const PICKUP_POOL = 48;
export const PROJ_POOL = 56;
export const TELE_POOL = 10;

/* -------------------------------------------------------------- helpers -- */

export function makePlayer(save: FrontierSave, armor: number): Player {
  const maxHp = 100 + save.permanent.maxHp + armor * 20;
  return {
    x: 0, z: 0, vx: 0, vz: 0,
    hp: maxHp, maxHp,
    facing: 0,
    level: 1, xp: 0, xpNeed: 10,
    meleeCd: 0, rangedCd: 0.4, dashCd: 0, dashT: 0, invuln: 0, abilityCd: 2,
    stamina: 100, sprinting: false, moving: false, hurtT: 0,
    attackWindup: 0, attackSwing: 0,
  };
}

export function createRun(
  seed: number,
  save: FrontierSave,
  modifiers: { speed: number; armor: number; luck: number },
): World {
  const player = makePlayer(save, modifiers.armor);
  const landmarks = makeLandmarks(seed);
  const bossLandmarks = landmarks.filter((l) => l.kind === 'boss');
  const objective = bossLandmarks[0] ?? landmarks[0];

  const enemies: Enemy[] = Array.from({ length: ENEMY_POOL }, () => ({
    active: false, kind: 'walker', x: 0, z: 0, vx: 0, vz: 0,
    hp: 1, maxHp: 1, r: 0.5, speed: 1, damage: 1, attackCd: 0, fireCd: 0,
    hitFlash: 0, spawnT: 0, elite: false, boss: false, telegraph: 0,
    telegraphKind: 0, kx: 0, kz: 0, dirX: 0, dirZ: 0,
  }));
  const pickups: Pickup[] = Array.from({ length: PICKUP_POOL }, () => ({
    active: false, kind: 'gem', x: 0, z: 0, ttl: 0, bob: 0,
  }));
  const projectiles: Projectile[] = Array.from({ length: PROJ_POOL }, () => ({
    active: false, kind: 'player', x: 0, z: 0, vx: 0, vz: 0, r: 0.2, dmg: 1, ttl: 0,
  }));
  const teles: Tele[] = Array.from({ length: TELE_POOL }, () => ({
    active: false, x: 0, z: 0, r: 1, ttl: 0, phase: 0, color: '#fff', dmg: 0, dmgEnemies: 0,
  }));

  const world: World = {
    seed,
    rand: createRng(seed ^ 0x51ab),
    time: 0,
    over: false,
    choosing: false,
    upgradeChoices: [],
    banner: null,
    shake: 0,
    biome: 'meadow',
    player,
    enemies,
    pickups,
    projectiles,
    teles,
    event: { kind: 'none', ttl: 0, x: 0, z: 0, r: 4 },
    landmarks,
    objective,
    boss: null,
    stats: {
      kills: 0, elites: 0, bosses: 0, landmarks: 0, gems: 0, rares: 0,
      time: 0, bossesDefeated: [], upgradesTaken: [],
    },
    spawnTimer: 0.35,
    eventTimer: 32,
    luck: modifiers.luck,
    mods: {
      damage: 1, attackSpeed: 1, moveSpeed: modifiers.speed, maxHp: 0, crit: 0.05,
      multishot: 1, dashCd: 0, ability: 1,
    },
    permanent: {
      damage: save.permanent.damage,
      maxHp: save.permanent.maxHp,
      moveSpeed: save.permanent.moveSpeed,
    },
    buffT: 0,
    buffKind: 0,
    hurtFlash: 0,
    sfx: [] as string[],
  };

  // No immediate pre-spawned enemies — the fast spawnTimer (0.35s) guarantees
  // an enemy pack within the first second, satisfying "near at least one enemy"
  // without breaking the event harness which expects idle runs to avoid rapid
  // level-ups. Decorations are guaranteed via world.ts, not enemies.

  return world;
}

/* ---------------------------------------------------------- low level ---- */

function freeEnemy(w: World): Enemy | null {
  for (const e of w.enemies) if (!e.active) return e;
  return null;
}

function spawnEnemy(
  w: World,
  kind: EnemyKind,
  x: number,
  z: number,
  hpMul: number,
  dmgMul: number,
): boolean {
  const slot = freeEnemy(w);
  if (!slot) return false;
  const def = ENEMIES[kind];
  const maxHp = def.hp * hpMul;
  slot.active = true;
  slot.kind = kind;
  slot.x = x; slot.z = z; slot.vx = 0; slot.vz = 0;
  slot.hp = maxHp; slot.maxHp = maxHp;
  slot.r = def.r; slot.speed = def.speed; slot.damage = def.damage * dmgMul;
  slot.attackCd = 0.5; slot.fireCd = def.fireCd * (0.7 + w.rand() * 0.6);
  slot.hitFlash = 0; slot.spawnT = 0.35; slot.elite = kind === 'elite';
  slot.boss = false; slot.telegraph = 0; slot.telegraphKind = 0;
  slot.kx = 0; slot.kz = 0; slot.dirX = 0; slot.dirZ = 0;
  return true;
}

function spawnProjectile(
  w: World,
  kind: Projectile['kind'],
  x: number, z: number,
  dx: number, dz: number,
  speed: number,
  dmg: number,
  r: number,
  ttl = 3,
): void {
  for (const p of w.projectiles) {
    if (p.active) continue;
    const len = Math.hypot(dx, dz) || 1;
    p.active = true;
    p.kind = kind;
    p.x = x; p.z = z;
    p.vx = (dx / len) * speed;
    p.vz = (dz / len) * speed;
    p.r = r; p.dmg = dmg; p.ttl = ttl;
    return;
  }
}

function addTele(
  w: World,
  x: number, z: number, r: number, ttl: number,
  color: string, dmgPlayer: number, dmgEnemies: number,
): void {
  for (const t of w.teles) {
    if (t.active) continue;
    t.active = true; t.x = x; t.z = z; t.r = r; t.ttl = ttl;
    t.phase = 0; t.color = color; t.dmg = dmgPlayer; t.dmgEnemies = dmgEnemies;
    return;
  }
}

function dropPickup(w: World, kind: PickupKind, x: number, z: number): void {
  for (const p of w.pickups) {
    if (p.active) continue;
    p.active = true;
    p.kind = kind;
    p.x = x; p.z = z;
    p.ttl = kind === 'gem' ? 10 : kind === 'rare' ? 14 : 12;
    p.bob = w.rand() * Math.PI * 2;
    return;
  }
}

function banner(w: World, text: string, color: string, ttl = 2.2): void {
  w.banner = { text, ttl, color };
}

function damageEnemy(w: World, e: Enemy, dmg: number, kx: number, kz: number): void {
  if (!e.active) return;
  e.hp -= dmg;
  e.hitFlash = 0.18;
  e.kx += kx;
  e.kz += kz;
  if (e.hp <= 0) {
    e.active = false;
    const elite = e.elite || e.boss;
    w.stats.kills += 1;
    if (elite) w.stats.elites += 1;
    dropPickup(w, 'gem', e.x + (w.rand() - 0.5) * 0.6, e.z + (w.rand() - 0.5) * 0.6);
    if (e.elite) {
      dropPickup(w, 'rare', e.x, e.z);
      w.sfx.push('reward.chest');
    } else if (w.rand() < 0.09 + 0.05 * w.luck) {
      dropPickup(w, 'hp', e.x, e.z);
    }
  }
}

function damagePlayer(w: World, dmg: number, fromX: number, fromZ: number, knock: number): void {
  const p = w.player;
  if (w.over || p.invuln > 0) return;
  p.hp -= dmg;
  p.invuln = 0.5;
  p.hurtT = 0.35;
  w.hurtFlash = 1;
  w.shake = 1;
  const dx = p.x - fromX;
  const dz = p.z - fromZ;
  const len = Math.hypot(dx, dz) || 1;
  p.vx = (dx / len) * knock;
  p.vz = (dz / len) * knock;
  w.sfx.push('game.crash');
  if (p.hp <= 0) {
    p.hp = 0;
    w.over = true;
    w.sfx.push('game.over');
  }
}

function burstEnemies(w: World, x: number, z: number, r: number, dmg: number, knock: number): void {
  for (const e of w.enemies) {
    if (!e.active) continue;
    const dx = e.x - x;
    const dz = e.z - z;
    const d = Math.hypot(dx, dz);
    if (d < r + e.r) {
      const dirX = d > 0.001 ? dx / d : 1;
      const dirZ = d > 0.001 ? dz / d : 0;
      damageEnemy(w, e, dmg, dirX * knock, dirZ * knock);
    }
  }
}

function arcHit(w: World, range: number, halfAngle: number, dmg: number, knock: number): void {
  const p = w.player;
  const fx = Math.cos(p.facing);
  const fz = Math.sin(p.facing);
  for (const e of w.enemies) {
    if (!e.active) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > range + e.r) continue;
    const dot = (dx / (d || 1)) * fx + (dz / (d || 1)) * fz;
    if (dot < Math.cos(halfAngle)) continue;
    const dirX = d > 0.001 ? dx / d : fx;
    const dirZ = d > 0.001 ? dz / d : fz;
    damageEnemy(w, e, dmg, dirX * knock, dirZ * knock);
  }
}

function nearestEnemy(w: World, maxDist: number): Enemy | null {
  const p = w.player;
  let best: Enemy | null = null;
  let bestD = maxDist * maxDist;
  for (const e of w.enemies) {
    if (!e.active) continue;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/* ------------------------------------------------------------- upgrades -- */

export function rollUpgrades(w: World): void {
  const pool = Object.keys(UPGRADE_MAP) as UpgradeId[];
  const picks: UpgradeId[] = [];
  const taken = new Set<UpgradeId>();
  let guard = 0;
  while (picks.length < 3 && guard < 24) {
    guard += 1;
    const id = pool[Math.floor(w.rand() * pool.length)];
    if (taken.has(id)) continue;
    taken.add(id);
    picks.push(id);
  }
  w.upgradeChoices = picks;
}

export function applyUpgrade(w: World, id: UpgradeId): boolean {
  const def = UPGRADE_MAP[id];
  if (!def) return false;
  const m = w.mods;
  const p = w.player;
  switch (id) {
    case 'damage': m.damage += def.apply; break;
    case 'attackSpeed': m.attackSpeed += def.apply; break;
    case 'moveSpeed': m.moveSpeed += def.apply; break;
    case 'maxHp':
      m.maxHp += def.apply;
      p.maxHp += def.apply;
      p.hp = Math.min(p.maxHp, p.hp + def.apply);
      break;
    case 'crit': m.crit += def.apply; break;
    case 'multishot': m.multishot += def.apply; break;
    case 'dashCd': m.dashCd += def.apply; break;
    case 'ability': m.ability += def.apply; break;
  }
  w.stats.upgradesTaken.push(id);
  w.choosing = false;
  w.upgradeChoices = [];
  w.sfx.push('reward.levelup');
  return true;
}

/* --------------------------------------------------------------- events -- */

const EVENT_WEIGHTS: { kind: EventKind; w: number }[] = [
  { kind: 'swarm', w: 3 },
  { kind: 'treasure', w: 2 },
  { kind: 'healzone', w: 2 },
  { kind: 'meteor', w: 2 },
  { kind: 'elite', w: 1 },
];

function rollEvent(w: World): EventKind {
  let total = 0;
  for (const e of EVENT_WEIGHTS) total += e.w;
  let r = w.rand() * total;
  for (const e of EVENT_WEIGHTS) {
    r -= e.w;
    if (r <= 0) return e.kind;
  }
  return 'swarm';
}

function triggerEvent(w: World, kind: EventKind): void {
  const p = w.player;
  const a = w.rand() * Math.PI * 2;
  const dist = 9 + w.rand() * 8;
  const x = clamp(p.x + Math.cos(a) * dist, -HALF_W + 2, HALF_W - 2);
  const z = clamp(p.z + Math.sin(a) * dist, -HALF_W + 2, HALF_W - 2);
  w.event = { kind, ttl: 14, x, z, r: 5 };
  const labels: Record<string, string> = {
    swarm: 'ENEMY SWARM',
    treasure: 'TREASURE RUSH',
    healzone: 'HEALING ZONE',
    meteor: 'METEOR SHOWER',
    elite: 'ELITE INVASION',
  };
  banner(w, labels[kind], '#FFD166', 2.4);

  if (kind === 'swarm') {
    for (let i = 0; i < 7; i++) {
      spawnEnemy(w, 'swarm', x + (w.rand() - 0.5) * 5, z + (w.rand() - 0.5) * 5, 1, 1);
    }
    spawnEnemy(w, 'chaser', x, z, 1.3, 1);
  } else if (kind === 'treasure') {
    dropPickup(w, 'gem', x, z);
    dropPickup(w, 'gem', x + 1.4, z + 0.6);
    dropPickup(w, 'gem', x - 1.3, z + 0.9);
    dropPickup(w, 'gem', x + 0.5, z - 1.5);
    dropPickup(w, 'hp', x + 1.8, z - 1.2);
    dropPickup(w, 'hp', x - 1.8, z - 0.8);
    if (w.rand() < 0.5) dropPickup(w, 'rare', x, z);
  } else if (kind === 'elite') {
    for (let i = 0; i < 2; i++) {
      spawnEnemy(w, 'elite', x + (w.rand() - 0.5) * 4, z + (w.rand() - 0.5) * 4, 1, 1);
    }
  } else if (kind === 'meteor') {
    for (let i = 0; i < 9; i++) {
      const mx = x + (w.rand() - 0.5) * 14;
      const mz = z + (w.rand() - 0.5) * 14;
      addTele(w, clamp(mx, -HALF_W, HALF_W), clamp(mz, -HALF_W, HALF_W), 1.7, 1 + w.rand() * 1.2, '#FF8A3D', 22, 60);
    }
  }
}

function stepEvent(w: World, dt: number): void {
  const ev = w.event;
  if (ev.kind === 'none') return;
  ev.ttl -= dt;
  if (ev.ttl <= 0) {
    ev.kind = 'none';
    return;
  }
  if (ev.kind === 'healzone') {
    const p = w.player;
    if (Math.hypot(p.x - ev.x, p.z - ev.z) < ev.r) {
      p.hp = Math.min(p.maxHp, p.hp + 6 * dt);
    }
  }
}

/* ------------------------------------------------------------- spawns ---- */

function spawnPack(w: World): void {
  const biome = BIOMES[w.biome];
  const table = biome.enemies;
  const hpMul = 1 + w.time / 120 * 0.35;
  const dmgMul = 1 + w.time / 180 * 0.3;

  let total = 0;
  for (const e of table) total += e.weight;
  let r = w.rand() * total;
  let pick = table[table.length - 1];
  for (const e of table) {
    r -= e.weight;
    if (r <= 0) {
      pick = e;
      break;
    }
  }
  if (w.time > 45 && (w.biome === 'ruins' || w.biome === 'danger') && w.rand() < 0.14) {
    spawnEnemy(w, 'elite', w.player.x + (w.rand() - 0.5) * 8, w.player.z + (w.rand() - 0.5) * 8, hpMul, dmgMul);
    return;
  }

  const count = pick.pack[0] + Math.floor(w.rand() * (pick.pack[1] - pick.pack[0] + 1));
  let placed = 0;
  for (let i = 0; i < count && placed < 8; i++) {
    const a = w.rand() * Math.PI * 2;
    const d = 11 + w.rand() * 6;
    const x = clamp(w.player.x + Math.cos(a) * d, -HALF_W + 1, HALF_W - 1);
    const z = clamp(w.player.z + Math.sin(a) * d, -HALF_W + 1, HALF_W - 1);
    if (spawnEnemy(w, pick.kind, x, z, hpMul, dmgMul)) placed += 1;
  }
}

/* -------------------------------------------------------------- player -- */

function stepPlayer(w: World, input: FrontierInput, dt: number): void {
  const p = w.player;
  if (w.over) return;

  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  w.hurtFlash = Math.max(0, w.hurtFlash - dt * 3);
  w.shake = Math.max(0, w.shake - dt * 4);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.abilityCd = Math.max(0, p.abilityCd - dt);
  p.rangedCd -= dt;
  p.meleeCd -= dt;
  w.buffT = Math.max(0, w.buffT - dt);
  if (w.banner) {
    w.banner.ttl -= dt;
    if (w.banner.ttl <= 0) w.banner = null;
  }

  if (w.choosing) return;

  const speedMul =
    (1 + w.mods.moveSpeed) *
    (1 + w.permanent.moveSpeed) *
    (1 + (w.buffT > 0 && w.buffKind === 1 ? 0.35 : 0));

  const sprintOn = input.sprint && p.stamina > 1 && !w.choosing;
  p.sprinting = sprintOn;
  const speed = 7.4 * speedMul * (sprintOn ? 1.5 : 1) * (p.dashT > 0 ? 3.4 : 1);

  if (input.dash && p.dashCd <= 0 && p.dashT <= 0) {
    p.dashT = 0.22;
    p.dashCd = 2.4 * (1 - w.mods.dashCd);
    p.invuln = 0.32;
    w.sfx.push('game.jump');
  }

  const len = Math.hypot(input.mx, input.mz);
  const moving = len > 0.08;
  p.moving = moving;
  if (p.dashT > 0) {
    const dx = moving ? input.mx / len : Math.cos(p.facing);
    const dz = moving ? input.mz / len : Math.sin(p.facing);
    p.vx = dx * speed;
    p.vz = dz * speed;
    p.dashT -= dt;
  } else if (moving) {
    p.vx = (input.mx / len) * speed;
    p.vz = (input.mz / len) * speed;
    p.facing = Math.atan2(input.mz, input.mx);
    p.stamina = Math.max(0, p.stamina - (sprintOn ? 26 : 8) * dt);
  } else {
    p.vx *= Math.exp(-8 * dt);
    p.vz *= Math.exp(-8 * dt);
    p.stamina = Math.min(100, p.stamina + 14 * dt);
  }

  p.x = clamp(p.x + p.vx * dt, -HALF_W + 0.6, HALF_W - 0.6);
  p.z = clamp(p.z + p.vz * dt, -HALF_W + 0.6, HALF_W - 0.6);

  const dmgBase =
    26 * (1 + w.mods.damage) * (1 + w.permanent.damage) * (w.buffT > 0 && w.buffKind === 0 ? 1.4 : 1);

  if (p.attackWindup > 0) {
    p.attackWindup -= dt;
    if (p.attackWindup <= 0) {
      p.attackSwing = 0.18;
      const crit = w.rand() < w.mods.crit;
      const dmg = dmgBase * (crit ? 2 : 1);
      arcHit(w, 2.4, 0.95, dmg, 4.5);
      if (crit) w.sfx.push('game.hit');
    }
  } else if (p.attackSwing > 0) {
    p.attackSwing -= dt;
  } else if (input.melee && p.meleeCd <= 0) {
    p.attackWindup = 0.14;
    p.meleeCd = 0.5 / w.mods.attackSpeed;
    w.sfx.push('game.hit');
  }

  if (p.rangedCd <= 0) {
    const target = nearestEnemy(w, 15);
    if (target) {
      p.rangedCd = 0.85 / (1 + (w.mods.attackSpeed - 1) * 0.6);
      const shots = Math.max(1, Math.floor(w.mods.multishot));
      for (let s = 0; s < shots; s++) {
        const spread = (s - (shots - 1) / 2) * 0.12;
        const a = Math.atan2(target.z - p.z, target.x - p.x) + spread;
        spawnProjectile(w, 'player', p.x, p.z, Math.cos(a), Math.sin(a), 17, dmgBase * 0.55, 0.18, 2.4);
      }
    }
  }

  if (input.ability && p.abilityCd <= 0) {
    p.abilityCd = 9;
    const dmg = dmgBase * 2.6 * w.mods.ability;
    burstEnemies(w, p.x, p.z, 5.2, dmg, 9);
    w.shake = 1.4;
    w.sfx.push('reward.chest');
  }
}

/* ------------------------------------------------------------- enemies -- */

function stepEnemies(w: World, dt: number): void {
  const p = w.player;
  for (const e of w.enemies) {
    if (!e.active) continue;
    if (e.boss) continue;

    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.spawnT = Math.max(0, e.spawnT - dt);
    e.attackCd = Math.max(0, e.attackCd - dt);
    e.fireCd -= dt;
    e.kx *= Math.exp(-5 * dt);
    e.kz *= Math.exp(-5 * dt);

    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const nx = dx / d;
    const nz = dz / d;

    let moveX = 0;
    let moveZ = 0;
    const def = ENEMIES[e.kind];
    switch (e.kind) {
      case 'walker':
        moveX = nx; moveZ = nz;
        break;
      case 'chaser':
        moveX = nx; moveZ = nz;
        break;
      case 'ranged': {
        if (d < 5.5) { moveX = -nx; moveZ = -nz; }
        else if (d > 9.5) { moveX = nx; moveZ = nz; }
        if (e.fireCd <= 0 && d < 14) {
          e.fireCd = def.fireCd * (0.8 + w.rand() * 0.5);
          spawnProjectile(w, 'enemy', e.x, e.z, nx, nz, 8, def.damage * 0.7, 0.22, 4);
        }
        break;
      }
      case 'tank': {
        moveX = nx; moveZ = nz;
        if (d < 7 && e.attackCd <= 0) {
          e.telegraph = 0.55;
          e.telegraphKind = 0;
          e.attackCd = 2.4;
        }
        break;
      }
      case 'swarm':
        moveX = nx; moveZ = nz;
        break;
      case 'elite': {
        moveX = nx; moveZ = nz;
        if (d < 4.6 && e.attackCd <= 0) {
          e.telegraph = 0.75;
          e.telegraphKind = 1;
          e.attackCd = 2.8;
        }
        break;
      }
    }

    if (e.telegraph > 0) {
      e.telegraph -= dt;
      if (e.telegraphKind === 0) {
        e.vx = nx * e.speed * 3.4;
        e.vz = nz * e.speed * 3.4;
        if (e.telegraph <= 0) e.attackCd = Math.max(e.attackCd, 0.6);
      }
      if (e.telegraph <= 0 && e.telegraphKind === 1) {
        addTele(w, e.x, e.z, 3.6, 0.35, '#FF4D4D', 26, 0);
        e.attackCd = 2.6;
      }
    } else {
      e.vx = moveX * e.speed;
      e.vz = moveZ * e.speed;
    }

    e.x = clamp(e.x + (e.vx + e.kx) * dt, -HALF_W + 0.4, HALF_W - 0.4);
    e.z = clamp(e.z + (e.vz + e.kz) * dt, -HALF_W + 0.4, HALF_W - 0.4);
    e.dirX = nx;
    e.dirZ = nz;

    if (d < e.r + 0.55 + 0.12 && e.attackCd <= 0) {
      damagePlayer(w, def.damage, e.x, e.z, 6);
      e.attackCd = def.attackCd;
      if (e.kind === 'chaser') {
        e.vx += nx * 6;
        e.vz += nz * 6;
      }
    }
  }
}

/* ---------------------------------------------------------------- boss -- */

const BOSS_PHASE_HP = [0.66, 0.33, 0];

export function spawnBoss(w: World, id: BossId): void {
  const def = BOSSES[id];
  const lm = w.landmarks.find((l) => l.boss === id);
  const hpMul = Math.min(2.2, 1 + w.time / 240);
  const maxHp = def.hp * hpMul;
  w.boss = {
    id, active: true, phase: 1,
    x: lm?.x ?? 0, z: lm?.z ?? 0,
    hp: maxHp, maxHp,
    r: def.r, damage: def.damage,
    attackT: 1.6, telegraph: 0, telegraphKind: 0,
    summonT: 0, hitFlash: 0, dead: false, deadT: 0, t: 0, vx: 0, vz: 0,
  };
  banner(w, def.name, def.accent, 2.6);
  w.sfx.push('game.crash');
  w.shake = 1.2;
}

function bossEnrageScale(b: Boss): number {
  return b.phase >= 3 ? 1.35 : b.phase === 2 ? 1.15 : 1;
}

function stepBoss(w: World, dt: number): void {
  const b = w.boss;
  if (!b) return;
  const def = BOSSES[b.id];
  const p = w.player;

  if (b.dead) {
    b.deadT += dt;
    if (b.deadT > 1.6) b.active = false;
    return;
  }

  b.t += dt;
  b.hitFlash = Math.max(0, b.hitFlash - dt);

  const nextPhase = b.hp > b.maxHp * BOSS_PHASE_HP[0] ? 1 : b.hp > b.maxHp * BOSS_PHASE_HP[1] ? 2 : 3;
  if (nextPhase !== b.phase) {
    b.phase = nextPhase;
    banner(w, `${def.name} — PHASE ${b.phase}`, def.accent, 2);
    w.shake = 1;
    if (b.phase === 2 && b.id === 'warden') {
      spawnEnemy(w, 'walker', b.x + 2, b.z, 1.6, 1.2);
      spawnEnemy(w, 'walker', b.x - 2, b.z, 1.6, 1.2);
    }
    if (b.phase === 2 && b.id === 'rootbeast') {
      for (let i = 0; i < 5; i++) spawnEnemy(w, 'swarm', b.x + (w.rand() - 0.5) * 5, b.z + (w.rand() - 0.5) * 5, 1, 1);
    }
    if (b.phase === 2 && b.id === 'voidengine') {
      spawnEnemy(w, 'ranged', b.x + 3, b.z, 1.4, 1.3);
      spawnEnemy(w, 'ranged', b.x - 3, b.z, 1.4, 1.3);
    }
  }

  if (b.telegraph > 0) {
    b.telegraph -= dt;
    b.vx *= Math.exp(-6 * dt);
    b.vz *= Math.exp(-6 * dt);
    if (b.telegraph <= 0) resolveBossTelegraph(w, b);
    b.x = clamp(b.x + b.vx * dt, -HALF_W + b.r, HALF_W - b.r);
    b.z = clamp(b.z + b.vz * dt, -HALF_W + b.r, HALF_W - b.r);
    return;
  }

  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;

  const speed = def.speed * bossEnrageScale(b);
  const want =
    b.id === 'voidengine' ? (d > 10 ? 1 : d < 6 ? -1 : 0)
      : b.id === 'rootbeast' ? (d > 7 ? 1 : d < 4 ? -1 : 0)
        : 1;
  const mv = want * speed;
  b.vx = nx * mv;
  b.vz = nz * mv;
  b.x = clamp(b.x + b.vx * dt, -HALF_W + b.r, HALF_W - b.r);
  b.z = clamp(b.z + b.vz * dt, -HALF_W + b.r, HALF_W - b.r);

  if (d < b.r + 0.7) {
    damagePlayer(w, def.damage * bossEnrageScale(b), b.x, b.z, 8);
  }

  b.attackT -= dt;
  if (b.attackT <= 0) {
    b.attackT = 2.6 - b.phase * 0.45;
    startBossAttack(w, b);
  }
}

function startBossAttack(w: World, b: Boss): void {
  const p = w.player;
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const d = Math.hypot(dx, dz) || 1;
  const nx = dx / d;
  const nz = dz / d;

  if (b.id === 'warden') {
    if (w.rand() < 0.45) {
      b.telegraph = 0.6;
      b.telegraphKind = 0;
    } else {
      b.telegraph = 0.8;
      b.telegraphKind = 1;
    }
  } else if (b.id === 'rootbeast') {
    if (w.rand() < 0.5) {
      b.telegraph = 0.7;
      b.telegraphKind = 2;
    } else {
      b.telegraph = 0.85;
      b.telegraphKind = 1;
    }
  } else {
    if (w.rand() < 0.4) {
      b.telegraph = 0.65;
      b.telegraphKind = 3;
    } else {
      b.telegraph = 0.9;
      b.telegraphKind = 4;
    }
  }
}

function resolveBossTelegraph(w: World, b: Boss): void {
  const p = w.player;
  const def = BOSSES[b.id];
  const scale = bossEnrageScale(b);
  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const base = Math.atan2(dz, dx);

  switch (b.telegraphKind) {
    case 0: {
      b.vx = Math.cos(base) * def.speed * 7.5 * scale;
      b.vz = Math.sin(base) * def.speed * 7.5 * scale;
      break;
    }
    case 1: {
      addTele(w, b.x, b.z, 4.4, 0.4, def.accent, def.damage * 1.5 * scale, 0);
      w.shake = Math.max(w.shake, 1.2);
      break;
    }
    case 2: {
      const shots = 3 + b.phase;
      for (let i = 0; i < shots; i++) {
        const a = base + (i - (shots - 1) / 2) * 0.16;
        spawnProjectile(w, 'enemy', b.x, b.z, Math.cos(a), Math.sin(a), 9, def.damage * 0.8, 0.24, 5);
      }
      break;
    }
    case 3: {
      const shots = 5 + b.phase * 2;
      for (let i = 0; i < shots; i++) {
        const a = w.rand() * Math.PI * 2;
        spawnProjectile(w, 'enemy', b.x, b.z, Math.cos(a), Math.sin(a), 6.5, def.damage * 0.7, 0.3, 6);
      }
      break;
    }
    case 4: {
      const tx = clamp(p.x + (w.rand() - 0.5) * 6, -HALF_W + 3, HALF_W - 3);
      const tz = clamp(p.z + (w.rand() - 0.5) * 6, -HALF_W + 3, HALF_W - 3);
      addTele(w, tx, tz, 3.2, 0.5, def.accent, def.damage * 1.4 * scale, 0);
      b.x = tx;
      b.z = tz;
      break;
    }
  }
}

export function hitBoss(w: World, dmg: number, kx = 0, kz = 0): void {
  const b = w.boss;
  if (!b || b.dead) return;
  b.hp -= dmg;
  b.hitFlash = 0.18;
  b.vx += kx;
  b.vz += kz;
  if (b.hp <= 0) {
    b.hp = 0;
    b.dead = true;
    b.deadT = 0;
    w.stats.bosses += 1;
    w.stats.bossesDefeated.push(b.id);
    const def = BOSSES[b.id];
    w.permanent.damage = Math.min(0.3, w.permanent.damage + def.permanent.damage);
    w.permanent.maxHp = Math.min(60, w.permanent.maxHp + def.permanent.maxHp);
    w.permanent.moveSpeed = Math.min(0.12, w.permanent.moveSpeed + def.permanent.moveSpeed);
    w.player.maxHp += def.permanent.maxHp;
    w.player.hp = Math.min(w.player.maxHp, w.player.hp + def.permanent.maxHp);
    dropPickup(w, 'rare', b.x + 1, b.z);
    dropPickup(w, 'rare', b.x - 1, b.z);
    dropPickup(w, 'hp', b.x, b.z + 1);
    dropPickup(w, 'gem', b.x, b.z - 1);
    banner(w, `${def.name} DOWN`, def.accent, 3);
    w.sfx.push('reward.levelup');
    w.shake = 1.6;
  }
}

/* ------------------------------------------------------------- projectiles -- */

function stepProjectiles(w: World, dt: number): void {
  const p = w.player;
  for (const pr of w.projectiles) {
    if (!pr.active) continue;
    pr.ttl -= dt;
    if (pr.ttl <= 0) {
      pr.active = false;
      continue;
    }
    pr.x += pr.vx * dt;
    pr.z += pr.vz * dt;
    if (pr.x < -HALF_W || pr.x > HALF_W || pr.z < -HALF_W || pr.z > HALF_W) {
      pr.active = false;
      continue;
    }
    if (pr.kind === 'player') {
      for (const e of w.enemies) {
        if (!e.active) continue;
        const dx = e.x - pr.x;
        const dz = e.z - pr.z;
        if (dx * dx + dz * dz < (e.r + pr.r) * (e.r + pr.r)) {
          const len = Math.hypot(pr.vx, pr.vz) || 1;
          damageEnemy(w, e, pr.dmg, (pr.vx / len) * 2, (pr.vz / len) * 2);
          pr.active = false;
          break;
        }
      }
      if (pr.active && w.boss && !w.boss.dead) {
        const b = w.boss;
        const dx = b.x - pr.x;
        const dz = b.z - pr.z;
        if (dx * dx + dz * dz < (b.r + pr.r) * (b.r + pr.r)) {
          hitBoss(w, pr.dmg, 1, 1);
          pr.active = false;
        }
      }
    } else {
      const dx = p.x - pr.x;
      const dz = p.z - pr.z;
      if (dx * dx + dz * dz < (0.55 + pr.r) * (0.55 + pr.r)) {
        damagePlayer(w, pr.dmg, pr.x - pr.vx, pr.z - pr.vz, 4);
        pr.active = false;
      }
    }
  }
}

function stepTelegraphs(w: World, dt: number): void {
  for (const t of w.teles) {
    if (!t.active) continue;
    t.ttl -= dt;
    if (t.ttl <= 0) {
      t.active = false;
      const p = w.player;
      if (t.dmg > 0 && Math.hypot(p.x - t.x, p.z - t.z) < t.r + 0.55) {
        damagePlayer(w, t.dmg, t.x, t.z, 7);
      }
      if (t.dmgEnemies > 0) burstEnemies(w, t.x, t.z, t.r, t.dmgEnemies, 6);
      continue;
    }
    if (t.phase === 0 && t.ttl < 0.3) t.phase = 1;
  }
}

/* -------------------------------------------------------------- pickups -- */

function stepPickups(w: World, dt: number): void {
  const p = w.player;
  for (const pu of w.pickups) {
    if (!pu.active) continue;
    pu.ttl -= dt;
    pu.bob += dt * 4;
    if (pu.ttl <= 0) {
      pu.active = false;
      continue;
    }
    const dx = p.x - pu.x;
    const dz = p.z - pu.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.8) {
      const pull = 9 * dt;
      pu.x += (dx / (d || 1)) * pull;
      pu.z += (dz / (d || 1)) * pull;
    }
    if (d < 0.7) {
      pu.active = false;
      collectPickup(w, pu.kind);
    }
  }
}

function collectPickup(w: World, kind: PickupKind): void {
  const p = w.player;
  w.sfx.push('game.collect');
  switch (kind) {
    case 'gem': {
      p.xp += 2;
      w.stats.gems += 1;
      if (p.xp >= p.xpNeed) {
        p.xp -= p.xpNeed;
        p.xpNeed = Math.round(p.xpNeed * 1.35);
        p.level += 1;
        w.choosing = true;
        rollUpgrades(w);
      }
      break;
    }
    case 'hp':
      if (p.hp >= p.maxHp) p.xp += 1;
      else p.hp = Math.min(p.maxHp, p.hp + 22);
      break;
    case 'buff':
      w.buffT = 12;
      w.buffKind = w.rand() < 0.5 ? 0 : 1;
      break;
    case 'rare':
      w.stats.rares += 1;
      p.hp = p.maxHp;
      p.abilityCd = 0;
      break;
  }
}

/* ---------------------------------------------------------- landmarks -- */

function stepLandmarks(w: World): void {
  const p = w.player;
  for (const lm of w.landmarks) {
    if (lm.discovered) continue;
    if (Math.hypot(p.x - lm.x, p.z - lm.z) < 4.6) {
      lm.discovered = true;
      w.stats.landmarks += 1;
      w.sfx.push('game.collect');
      if (lm.kind === 'sight') {
        banner(w, `${lm.name} discovered`, '#7C5CFF', 2);
      } else if (lm.boss && !w.boss && !w.stats.bossesDefeated.includes(lm.boss)) {
        spawnBoss(w, lm.boss);
      }
    }
  }
  const nextBoss = w.landmarks.find((l) => l.kind === 'boss' && !l.discovered);
  w.objective = nextBoss ?? w.landmarks[0];
}

export function step(
  w: World,
  input: FrontierInput,
  dt: number,
): void {
  if (w.over) return;
  w.time += dt;
  w.stats.time = w.time;

  stepPlayer(w, input, dt);

  const b = biomeAt(w.player.x, w.player.z, w.seed);
  if (b !== w.biome) {
    w.biome = b;
    banner(w, BIOMES[b].name.toUpperCase(), BIOMES[b].accent, 2.2);
  }

  if (!w.choosing && !w.over) {
    stepEnemies(w, dt);
    if (w.boss?.active) stepBoss(w, dt);
    stepProjectiles(w, dt);
    stepTelegraphs(w, dt);
    stepPickups(w, dt);
    stepEvent(w, dt);
    stepLandmarks(w);

    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      const biomeMul = BIOMES[w.biome].spawnMul;
      w.spawnTimer = (2.1 / biomeMul) * Math.max(0.5, 1.15 - w.time / 90);
      spawnPack(w);
    }

    w.eventTimer -= dt;
    if (w.eventTimer <= 0) {
      w.eventTimer = 42 + w.rand() * 26;
      triggerEvent(w, rollEvent(w));
    }

    const ev = w.event;
    if (ev.kind === 'meteor' && w.rand() < dt * 2.2) {
      const mx = ev.x + (w.rand() - 0.5) * 14;
      const mz = ev.z + (w.rand() - 0.5) * 14;
      addTele(w, clamp(mx, -HALF_W, HALF_W), clamp(mz, -HALF_W, HALF_W), 1.7, 1.1, '#FF8A3D', 22, 60);
    }
  }

  if (w.player.hp <= 0 && !w.over) {
    w.over = true;
    w.sfx.push('game.over');
  }
}

export function finishRun(w: World): {
  score: number;
  coins: number;
  xp: number;
  gems: number;
  items: Record<string, number>;
} {
  const s = w.stats;
  const score = Math.round(
    s.kills * 10 + s.elites * 45 + s.bosses * 500 + s.landmarks * 80 + s.time * 4 + s.rares * 25,
  );
  const coins = Math.round(80 + score * 0.55);
  const xp = Math.round(40 + score * 0.16);
  const gems = s.bosses > 0 ? 2 : s.rares >= 2 ? 1 : 0;
  const items: Record<string, number> = {};
  if (s.kills >= 6) items.mat_scrap = Math.min(6, 1 + Math.floor(s.kills / 14));
  if (s.elites >= 1) items.mat_circuit = Math.min(3, s.elites);
  if (s.bosses >= 1) items.mat_core = Math.min(2, s.bosses);
  if (s.rares >= 3) items.mat_starfrag = 1;
  return { score, coins, xp, gems, items };
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function worldBiome(w: World): BiomeId {
  return w.biome;
}
