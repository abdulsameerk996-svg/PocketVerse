/**
 * ============================================================================
 *  SURVIVE 60 — pure movement/score/tier math
 * ============================================================================
 *
 * The surface runs the arena as one Reanimated worklet; the helpers here are
 * the parts worth testing headlessly (tools/quickgames-sim) and are all
 * worklet-safe. Units are pixels; the arena is the full screen.
 */

export const SURVIVE_SECONDS = 60;
export const PLAYER_R = 16;
export const MAX_HP = 3;

export const ENEMY_POOL = 24;
export const PICKUP_POOL = 8;

/** Enemy behaviour ids stored in the pool's `kind` field. */
export const ENEMY_CHASER = 0;
export const ENEMY_STRAIGHT = 1;
export const ENEMY_ZIGZAG = 2;

/** Pickup kind ids stored in the pool's `data` field. */
export const PICKUP_SHIELD = 0;
export const PICKUP_BOOST = 1;
export const PICKUP_DOUBLE = 2;

/** Difficulty tier: +1 every ten seconds, capped so late runs stay fair. */
export function enemyTier(time: number): number {
  'worklet';
  return Math.min(6, 1 + Math.floor(Math.max(0, time) / 10));
}

/** Enemy cruise speed in px/s for a tier. */
export function enemySpeed(tier: number): number {
  'worklet';
  return 92 + tier * 24;
}

/** Seconds between spawns at a tier. */
export function spawnInterval(tier: number): number {
  'worklet';
  return Math.max(0.3, 1.35 - tier * 0.11);
}

/** Enemy radius in px. */
export function enemyR(tier: number): number {
  'worklet';
  return 13 + Math.min(4, tier) * 1.5;
}

/** Pick a behaviour for a spawn at a tier — more variety later. */
export function pickKind(tier: number, rng: () => number): number {
  'worklet';
  const r = rng();
  if (tier >= 4 && r < 0.2) return ENEMY_ZIGZAG;
  if (tier >= 2 && r < 0.42) return ENEMY_STRAIGHT;
  return ENEMY_CHASER;
}

/** A spawn position on the arena edge (inset so the entry is visible). */
export function spawnEdgePos(rng: () => number, w: number, h: number): { x: number; y: number } {
  'worklet';
  const side = Math.floor(rng() * 4);
  const m = 24;
  if (side === 0) return { x: rng() * w, y: -m };
  if (side === 1) return { x: rng() * w, y: h + m };
  if (side === 2) return { x: -m, y: rng() * h };
  return { x: w + m, y: rng() * h };
}

export type Enemy = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  speed: number;
  kind: number;
};

/**
 * The fixed entity-pool layout the arena worklet uses. Radius lives in `data`,
 * the spawn-tier cruise speed in `data2` — `stepEnemy` reads either shape.
 */
export type PooledEnemy = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  kind: number;
  data: number;
  data2: number;
};

/** Move one enemy for a frame. Finite-guarded; clamped to the arena. */
export function stepEnemy(
  e: Enemy | PooledEnemy,
  px: number,
  py: number,
  dt: number,
  w: number,
  h: number,
): void {
  'worklet';
  if (!Number.isFinite(e.x)) e.x = 0;
  if (!Number.isFinite(e.y)) e.y = 0;
  if (!Number.isFinite(e.vx)) e.vx = 0;
  if (!Number.isFinite(e.vy)) e.vy = 0;

  const pooled = e as unknown as PooledEnemy;
  const r = pooled.data ?? (e as unknown as Enemy).r;
  const sp = pooled.data2 ?? (e as unknown as Enemy).speed;

  if (e.kind === ENEMY_CHASER) {
    const dx = px - e.x;
    const dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.vx = (dx / d) * sp;
    e.vy = (dy / d) * sp;
  } else if (e.kind === ENEMY_ZIGZAG) {
    // Chase, but wobble perpendicularly — reads as darting, never predictable.
    const dx = px - e.x;
    const dy = py - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const wob = Math.sin(e.y * 0.01 + e.x * 0.013) * 0.55;
    const nx = dx / d;
    const ny = dy / d;
    e.vx = (nx - ny * wob) * sp;
    e.vy = (ny + nx * wob) * sp;
  } else {
    // Straight: keep whatever heading it spawned with.
  }

  e.x += e.vx * dt;
  e.y += e.vy * dt;
  e.x = Math.max(r, Math.min(w - r, e.x));
  e.y = Math.max(r, Math.min(h - r, e.y));
}

/** Dash pops an enemy — score for one kill. */
export function killPoints(score: number, doubled: boolean): number {
  'worklet';
  return Math.round(25 * (doubled ? 2 : 1));
}

/** Run score at the end: time dominates, kills sweeten. */
export function runScore(seconds: number, kills: number, doubledKills: number): number {
  return Math.round(seconds * 10 + kills * 25 + doubledKills * 12);
}

/** Player speed: base plus equipped speed cosmetics. */
export function playerSpeed(speedMod: number): number {
  'worklet';
  return 340 * (1 + speedMod * 0.5);
}

export function clamp(v: number, lo: number, hi: number): number {
  'worklet';
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Fill one free enemy slot from the arena edge. Pure-ish (uses Math.random)
 * but the invariants — inside bounds, correct fields, one slot only — are
 * property-tested by the harness.
 */
export function spawnOne(
  pool: { active: boolean; x: number; y: number; vx: number; vy: number; w: number; h: number; kind: number; data: number; data2: number }[],
  tier: number,
  w: number,
  h: number,
): void {
  'worklet';
  for (let i = 0; i < ENEMY_POOL; i++) {
    const e = pool[i];
    if (e.active) continue;
    const p = spawnEdgePos(Math.random, w, h);
    const speed = enemySpeed(tier);
    const r = enemyR(tier);
    e.active = true;
    e.x = p.x;
    e.y = p.y;
    e.w = r * 2;
    e.h = r * 2;
    e.data = r;
    e.data2 = speed; // cruise speed for chaser/zigzag steering
    e.kind = pickKind(tier, Math.random);
    if (e.kind === ENEMY_STRAIGHT) {
      // A straight needs a heading; aim roughly at the arena centre so it
      // actually crosses the playfield.
      const ang = Math.atan2(h / 2 - p.y, w / 2 - p.x) + (Math.random() - 0.5) * 0.9;
      e.vx = Math.cos(ang) * speed;
      e.vy = Math.sin(ang) * speed;
    } else {
      e.vx = 0;
      e.vy = 0;
    }
    return;
  }
}

/** Drop one pickup somewhere away from the player. */
export function spawnPickup(
  pool: { active: boolean; x: number; y: number; vx: number; vy: number; w: number; h: number; kind: number; data: number; data2: number }[],
  w: number,
  h: number,
  px: number,
  py: number,
): void {
  'worklet';
  for (let i = ENEMY_POOL; i < ENEMY_POOL + PICKUP_POOL; i++) {
    const p = pool[i];
    if (p.active) continue;
    for (let tries = 0; tries < 8; tries++) {
      const x = 40 + Math.random() * (w - 80);
      const y = 40 + Math.random() * (h - 80);
      if (Math.hypot(x - px, y - py) > 140 || tries === 7) {
        const r = Math.random();
        p.active = true;
        p.x = x;
        p.y = y;
        p.vy = y; // base Y — the render adds the bob
        p.w = 24;
        p.h = 24;
        p.kind = 10;
        p.data = r < 0.3 ? PICKUP_SHIELD : r < 0.65 ? PICKUP_BOOST : PICKUP_DOUBLE;
        p.data2 = 12; // seconds to live
        return;
      }
    }
  }
}

/** Dash burst speed and its duration. */
export const DASH_SPEED = 3.1;
export const DASH_SECONDS = 0.22;
export const DASH_COOLDOWN = 1.9;
