/**
 * ============================================================================
 *  TOWER DEFENSE MINI — pure simulation
 * ============================================================================
 *
 * A deliberately small tower defense: one map, one S-curve path, 8 build
 * slots, three towers, five enemy types, eleven waves with a boss finale.
 * The whole thing is a deterministic fixed-step simulation — no randomness —
 * so tools/quickgames-sim can play full runs headlessly and the app's JS
 * interval just calls `stepGame` and paints the result.
 *
 * Coordinates: positions are pixel values for the given playfield (`w`/`h`).
 * Paths and slots are authored in 0..1 space and scaled at construction.
 */

export type EnemyType = 'normal' | 'fast' | 'tank' | 'shielded' | 'boss';

export const ENEMY_DEFS: Record<
  EnemyType,
  { hp: number; speed: number; reward: number; r: number }
> = {
  normal: { hp: 42, speed: 62, reward: 6, r: 9 },
  fast: { hp: 26, speed: 104, reward: 8, r: 8 },
  tank: { hp: 150, speed: 34, reward: 14, r: 12 },
  shielded: { hp: 84, speed: 54, reward: 18, r: 10 },
  boss: { hp: 1250, speed: 26, reward: 150, r: 18 },
};

export type TowerType = 'gun' | 'rapid' | 'frost';

export const TOWER_DEFS: Record<
  TowerType,
  { dmg: number; range: number; rate: number; cost: number; color: string }
> = {
  gun: { dmg: 15, range: 132, rate: 1.1, cost: 50, color: '#4EA8FF' },
  rapid: { dmg: 6, range: 104, rate: 3.4, cost: 70, color: '#FFD166' },
  frost: { dmg: 4, range: 118, rate: 1.6, cost: 90, color: '#22D3EE' },
};

export const TOWER_ORDER: TowerType[] = ['gun', 'rapid', 'frost'];

/** The path, in normalised space. Enemies enter left and exit right. */
export const PATH = [
  { x: -0.08, y: 0.58 },
  { x: 0.22, y: 0.58 },
  { x: 0.38, y: 0.34 },
  { x: 0.6, y: 0.34 },
  { x: 0.76, y: 0.66 },
  { x: 1.08, y: 0.66 },
] as const;

/** Eight build spots alongside the path. */
export const SLOTS = [
  { x: 0.14, y: 0.44 },
  { x: 0.3, y: 0.44 },
  { x: 0.49, y: 0.2 },
  { x: 0.68, y: 0.2 },
  { x: 0.52, y: 0.8 },
  { x: 0.82, y: 0.8 },
  { x: 0.9, y: 0.5 },
  { x: 0.06, y: 0.8 },
] as const;

export const WAVE_COUNT = 11;

/** Wave compositions — [type, count]. The last wave is the boss. */
export const WAVES: [EnemyType, number][][] = [
  [['normal', 6]],
  [['normal', 8], ['fast', 3]],
  [['fast', 9]],
  [['normal', 10], ['tank', 2]],
  [['shielded', 4], ['normal', 8]],
  [['tank', 4], ['fast', 9]],
  [['shielded', 6], ['normal', 12]],
  [['fast', 14], ['tank', 4]],
  [['shielded', 8], ['tank', 6], ['normal', 10]],
  [['normal', 12], ['fast', 14], ['tank', 6], ['shielded', 6]],
  [['boss', 1], ['shielded', 6]],
];

export const ENEMY_POOL = 30;
export const PROJ_POOL = 40;
export const MAX_LEVEL = 3;
export const START_COINS = 130;
export const START_LIVES = 10;
export const INTERMISSION = 2.4;

export type Enemy = {
  active: boolean;
  type: EnemyType;
  hp: number;
  maxHp: number;
  /** Distance travelled along the path, in px. */
  t: number;
  armor: boolean;
  slowT: number;
  r: number;
  reward: number;
};

export type Projectile = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  slow: boolean;
  target: number;
};

export type TowerSlot = {
  type: TowerType | null;
  level: number;
  cd: number;
};

export type GamePhase = 'intermission' | 'spawning' | 'clearing' | 'over' | 'won';

export type Game = {
  w: number;
  h: number;
  path: { x: number; y: number }[];
  pathLen: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  slots: TowerSlot[];
  queue: { type: EnemyType; wait: number }[];
  wave: number;
  phase: GamePhase;
  timer: number;
  coins: number;
  lives: number;
  score: number;
  time: number;
  /** Cosmetic bonuses — luck finds a coin cache, speed oils the guns. */
  luckBonus: number;
  speedBonus: number;
};

export type GameEvent =
  | 'hit'
  | 'kill'
  | 'leak'
  | 'waveStart'
  | 'waveClear'
  | 'win'
  | 'lose'
  | 'build'
  | 'upgrade'
  | 'denied';

export function pathTotal(path: readonly { x: number; y: number }[], w: number, h: number): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += Math.hypot((path[i].x - path[i - 1].x) * w, (path[i].y - path[i - 1].y) * h);
  }
  return total;
}

export function pointAt(
  path: readonly { x: number; y: number }[],
  w: number,
  h: number,
  t: number,
): { x: number; y: number } {
  let rem = t;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot((path[i].x - path[i - 1].x) * w, (path[i].y - path[i - 1].y) * h);
    if (rem <= seg) {
      const f = seg > 0 ? rem / seg : 0;
      return {
        x: (path[i - 1].x + (path[i].x - path[i - 1].x) * f) * w,
        y: (path[i - 1].y + (path[i].y - path[i - 1].y) * f) * h,
      };
    }
    rem -= seg;
  }
  const last = path[path.length - 1];
  return { x: last.x * w, y: last.y * h };
}

export function createGame(w: number, h: number, opts?: { luck?: number; speed?: number }): Game {
  const luck = opts?.luck ?? 0;
  const speed = opts?.speed ?? 0;
  return {
    w,
    h,
    path: PATH.map((p) => ({ x: p.x, y: p.y })),
    pathLen: pathTotal(PATH, w, h),
    enemies: Array.from({ length: ENEMY_POOL }, () => ({
      active: false,
      type: 'normal' as EnemyType,
      hp: 0,
      maxHp: 1,
      t: 0,
      armor: false,
      slowT: 0,
      r: 9,
      reward: 6,
    })),
    projectiles: Array.from({ length: PROJ_POOL }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      dmg: 1,
      slow: false,
      target: -1,
    })),
    slots: Array.from({ length: SLOTS.length }, () => ({ type: null, level: 0, cd: 0 })),
    queue: [],
    wave: 1,
    phase: 'intermission',
    timer: 1.4,
    coins: START_COINS + Math.round(40 * Math.max(0, luck)),
    lives: START_LIVES,
    score: 0,
    time: 0,
    luckBonus: Math.max(0, luck),
    speedBonus: Math.max(0, speed),
  };
}

export function slotPos(i: number, w: number, h: number): { x: number; y: number } {
  return { x: SLOTS[i].x * w, y: SLOTS[i].y * h };
}

export function towerDamage(type: TowerType, level: number): number {
  return TOWER_DEFS[type].dmg * (1 + 0.6 * (level - 1));
}

export function upgradeCost(type: TowerType, level: number): number {
  // level 1→2 costs base×1, 2→3 costs base×2
  return TOWER_DEFS[type].cost * level;
}

function buildQueue(wave: number): { type: EnemyType; wait: number }[] {
  const comp = WAVES[wave - 1];
  const q: { type: EnemyType; wait: number }[] = [];
  for (const [type, count] of comp) {
    for (let i = 0; i < count; i++) q.push({ type, wait: 0 });
  }
  let wait = 0.7;
  for (const item of q) {
    item.wait = wait;
    wait = Math.max(0.34, 0.75 - wave * 0.035);
  }
  return q;
}

export function startWave(g: Game): void {
  if (g.phase !== 'intermission') return;
  g.phase = 'spawning';
  g.queue = buildQueue(g.wave);
}

/** One fixed step (dt ≈ 1/30). Returns events the surface turns into sound. */
export function stepGame(g: Game, dt: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (g.phase === 'over' || g.phase === 'won') return events;
  g.time += dt;

  if (g.phase === 'intermission') {
    g.timer -= dt;
    if (g.timer <= 0) {
      startWave(g);
      events.push('waveStart');
    }
    return events;
  }

  if (g.phase === 'spawning') {
    for (const item of g.queue) {
      if (item.wait === Infinity) continue; // already consumed — keep scanning
      item.wait -= dt;
      if (item.wait > 0) break;
      // spawn this one now
      const e = g.enemies.find((x) => !x.active);
      if (e) {
        const def = ENEMY_DEFS[item.type];
        e.active = true;
        e.type = item.type;
        e.hp = def.hp;
        e.maxHp = def.hp;
        e.t = 0;
        e.armor = item.type === 'shielded';
        e.slowT = 0;
        e.r = def.r;
        e.reward = def.reward;
      }
      item.wait = Infinity; // consumed
    }
    if (g.queue.every((q) => q.wait === Infinity)) {
      g.queue = [];
      g.phase = 'clearing';
    }
  }

  // ── enemies move ──
  for (const e of g.enemies) {
    if (!e.active) continue;
    if (e.slowT > 0) {
      e.slowT -= dt;
      e.t += ENEMY_DEFS[e.type].speed * 0.55 * dt;
    } else {
      e.t += ENEMY_DEFS[e.type].speed * dt;
    }
    if (e.t >= g.pathLen) {
      e.active = false;
      g.lives -= 1;
      events.push('leak');
      if (g.lives <= 0) {
        g.phase = 'over';
        events.push('lose');
        return events;
      }
    }
  }

  // ── towers acquire + fire ──
  for (const slot of g.slots) {
    if (!slot.type) continue;
    slot.cd -= dt;
    if (slot.cd > 0) continue;
    const def = TOWER_DEFS[slot.type];
    const pos = slotPos(g.slots.indexOf(slot), g.w, g.h);
    // Most dangerous first: the enemy closest to the exit within range.
    let target = -1;
    let bestT = -Infinity;
    for (let i = 0; i < g.enemies.length; i++) {
      const e = g.enemies[i];
      if (!e.active) continue;
      const p = pointAt(g.path, g.w, g.h, e.t);
      if (Math.hypot(p.x - pos.x, p.y - pos.y) <= def.range && e.t > bestT) {
        bestT = e.t;
        target = i;
      }
    }
    if (target < 0) continue;
    slot.cd = 1 / def.rate;
    const proj = g.projectiles.find((p) => !p.active);
    if (!proj) continue;
    const tp = pointAt(g.path, g.w, g.h, g.enemies[target].t);
    const dx = tp.x - pos.x;
    const dy = tp.y - pos.y;
    const d = Math.hypot(dx, dy) || 1;
    proj.active = true;
    proj.x = pos.x;
    proj.y = pos.y;
    proj.dmg = towerDamage(slot.type, slot.level) * (1 + g.speedBonus * 0.15);
    proj.slow = slot.type === 'frost';
    proj.target = target;
    const speed = 340;
    proj.vx = (dx / d) * speed;
    proj.vy = (dy / d) * speed;
  }

  // ── projectiles fly + hit ──
  for (const p of g.projectiles) {
    if (!p.active) continue;
    const e = g.enemies[p.target];
    if (!e || !e.active) {
      p.active = false;
      continue;
    }
    const ep = pointAt(g.path, g.w, g.h, e.t);
    const dx = ep.x - p.x;
    const dy = ep.y - p.y;
    const d = Math.hypot(dx, dy);
    // Homing-lite: steer a little, then advance.
    if (d > 1) {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      p.vx = (p.vx * 0.6 + (dx / d) * sp * 1.4) * 0.6;
      p.vy = (p.vy * 0.6 + (dy / d) * sp * 1.4) * 0.6;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (d < e.r + 6) {
      p.active = false;
      if (e.armor) {
        e.armor = false; // the shield eats the whole hit
        events.push('hit');
        continue;
      }
      e.hp -= p.dmg;
      if (p.slow) e.slowT = 1.6;
      events.push('hit');
      if (e.hp <= 0) {
        e.active = false;
        g.coins += e.reward + Math.round(e.reward * g.luckBonus);
        g.score += e.reward * 12;
        events.push('kill');
      }
    }
  }

  // ── wave clear ──
  if (g.phase === 'clearing' && !g.enemies.some((e) => e.active)) {
    g.score += 120 + g.wave * 40;
    if (g.wave >= WAVE_COUNT) {
      g.phase = 'won';
      events.push('win');
      return events;
    }
    g.wave += 1;
    g.phase = 'intermission';
    g.timer = INTERMISSION;
    events.push('waveClear');
  }

  return events;
}

export function placeTower(g: Game, slot: number, type: TowerType): GameEvent {
  const s = g.slots[slot];
  if (!s || s.type) return 'denied';
  if (g.coins < TOWER_DEFS[type].cost) return 'denied';
  g.coins -= TOWER_DEFS[type].cost;
  s.type = type;
  s.level = 1;
  s.cd = 0;
  return 'build';
}

export function upgradeTower(g: Game, slot: number): GameEvent {
  const s = g.slots[slot];
  if (!s || !s.type) return 'denied';
  if (s.level >= MAX_LEVEL) return 'denied';
  const cost = upgradeCost(s.type, s.level);
  if (g.coins < cost) return 'denied';
  g.coins -= cost;
  s.level += 1;
  return 'upgrade';
}

/** Run score: waves dominate, kills and leftover lives sweeten. */
export function runScore(g: Game): number {
  return g.score + g.lives * 25 + (g.phase === 'won' ? 1500 : 0);
}
