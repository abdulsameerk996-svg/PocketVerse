/**
 * NEON RINGS — pure simulation.
 *
 * A ball bounces at the base of a vertical pole. Tap to launch it straight up.
 * Circular discs (rings) slide up and down the pole; each ring has an open gap
 * that rotates. The ball only passes through a ring when the gap is open
 * toward the incoming ball at the moment of crossing — pure timing.
 *
 * Nothing here imports React or React Native, so tools/rings-sim plays the
 * same code headlessly. All randomness is seeded per level: identical levels
 * are byte-for-byte reproducible.
 */

export type RingStatus = 'idle' | 'flying' | 'over';

export interface Ring {
  id: number;
  /** Rest position of the ring along the pole, 0 (bottom) .. 1 (top). */
  baseY: number;
  /** Slide amplitude along the pole. */
  slideAmp: number;
  /** Slide angular speed (rad/s). */
  slideSpeed: number;
  /** Slide phase (rad). */
  slidePhase: number;
  /** Gap rotation speed (rad/s). */
  rotSpeed: number;
  /** Gap rotation phase (rad); 0 = gap open straight down (toward ball). */
  rotPhase: number;
  /** Half-angle of the open gap, in radians. */
  gapHalf: number;
  /** Radius of the ring, as a fraction of field width (render only). */
  radius: number;
  /** >0 → hunter ring: actively tracks the ball's altitude (pole-lengths/s). */
  chase: number;
  /** Current Y of a hunter ring (stateful, updated by the sim). */
  cur: number;
}

export interface RingsState {
  version: number;
  status: RingStatus;
  level: number;
  /** Score = rings passed. */
  score: number;
  /** Consecutive perfect passes this run. */
  combo: number;
  best: number;
  bestLevel: number;
  /** Ball position along the pole, 0..1. */
  ballY: number;
  launched: boolean;
  rings: Ring[];
  /** Next ring index the ball must pass. */
  nextRing: number;
  time: number;
  lastPassAt: number;
  /** Set on the frame the level is completed (for the banner). */
  levelUpFlash: number;
  overFlash: number;
}

export const BALANCE = {
  /** Ball launch speed, pole-lengths per second. */
  launchSpeed: 0.95,
  /** Bounce height while idle, as fraction of pole. */
  idleBounce: 0.035,
  idleBounceSpeed: 6,
  /** Base rings on level 1; +1 per level. */
  baseRingCount: 3,
  maxRingCount: 11,
  /** Base gap half-angle at level 1, and shrink per level (rad). */
  baseGapHalf: (50 * Math.PI) / 180,
  gapShrinkPerLevel: (2.6 * Math.PI) / 180,
  minGapHalf: (18 * Math.PI) / 180,
  /** Extra rotation speed per level (rad/s). */
  rotSpeedPerLevel: 0.05,
  /** Extra gap rotation for hunters (rad/s) — they spin faster too. */
  chaseRotBonus: 0.5,
  /** Combo window — passes closer than this chain a combo. */
  comboWindow: 0.9,
  /** Hunters appear from this level; count ramps to a cap. */
  chaseMinLevel: 3,
  chaseMaxCount: 3,
  chaseSpeedBase: 0.4,
  chaseSpeedPerLevel: 0.03,
  chaseSpeedCap: 0.7,
  /** How fast a hunter settles back to rest when the ball is not flying. */
  chaseReturnSpeed: 0.25,
  /** Simulation step for collision accuracy (s). */
  step: 1 / 120,
} as const;

export const SAVE_VERSION = 1;

/** Smallest angle between `a` and `b`, in [-π, π]. */
export function wrapAngle(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Tiny deterministic PRNG (mulberry32) — self-contained so the pure logic compiles headlessly. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic rings for a level. Seed is a function of level only. */
export function buildLevel(level: number, now = 0): Ring[] {
  const rng = createRng(0x5eed ^ (level * 7919));
  const count = Math.min(BALANCE.baseRingCount + level - 1, BALANCE.maxRingCount);
  const gapHalf = Math.max(BALANCE.baseGapHalf - (level - 1) * BALANCE.gapShrinkPerLevel, BALANCE.minGapHalf);
  // From level 3 the highest rings become hunters: 1, then 2 at 5, 3 at 7+.
  const chaseCount =
    level >= BALANCE.chaseMinLevel
      ? Math.min(1 + Math.floor((level - BALANCE.chaseMinLevel) / 2), BALANCE.chaseMaxCount)
      : 0;
  const chaseSpeed = Math.min(
    BALANCE.chaseSpeedBase + (level - BALANCE.chaseMinLevel) * BALANCE.chaseSpeedPerLevel,
    BALANCE.chaseSpeedCap,
  );
  const rings: Ring[] = [];
  for (let i = 0; i < count; i++) {
    const baseY = ((i + 1) / (count + 1)) * 0.92 + 0.04;
    const isChaser = i >= count - chaseCount;
    const rotSpeed = 0.5 + rng() * 0.7 + (level - 1) * BALANCE.rotSpeedPerLevel + (isChaser ? BALANCE.chaseRotBonus : 0);
    rings.push({
      id: i,
      baseY,
      slideAmp: isChaser ? 0 : 0.045 + rng() * 0.06,
      slideSpeed: isChaser ? 0 : 0.7 + rng() * 0.8 + (level - 1) * 0.06,
      slidePhase: isChaser ? 0 : rng() * Math.PI * 2,
      rotSpeed,
      rotPhase: rng() * Math.PI * 2,
      gapHalf,
      radius: 0.2,
      chase: isChaser ? chaseSpeed : 0,
      cur: baseY,
    });
  }
  // Ring 0 always starts with a passable gap straight down (fair first gate).
  if (rings[0]) {
    rings[0].rotPhase = 0;
    rings[0].slidePhase = Math.PI / 2; // start at rest position
  }
  return rings;
}

/** Current ring position along the pole. Hunters report their tracked Y. */
export function ringY(ring: Ring, time: number): number {
  if (ring.chase > 0) {
    const c = Number.isFinite(ring.cur) ? ring.cur : ring.baseY;
    return Math.min(0.98, Math.max(0.02, c));
  }
  return ring.baseY + Math.sin(time * ring.slideSpeed + ring.slidePhase) * ring.slideAmp;
}

/** Current gap rotation, 0 = gap open straight down (toward the incoming ball). */
export function ringRot(ring: Ring, time: number): number {
  return wrapAngle(ring.rotPhase + time * ring.rotSpeed, 0);
}

export function createRun(level = 1, best = 0, bestLevel = 1, now = 0): RingsState {
  return {
    version: SAVE_VERSION,
    status: 'idle',
    level,
    score: 0,
    combo: 0,
    best,
    bestLevel,
    ballY: 0,
    launched: false,
    rings: buildLevel(level, now),
    nextRing: 0,
    time: now,
    lastPassAt: -1,
    levelUpFlash: 0,
    overFlash: 0,
  };
}

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/** Idle ball height (the "bounce" while waiting for a tap). */
export function idleBallY(state: RingsState): number {
  return Math.abs(Math.sin(state.time * BALANCE.idleBounceSpeed)) * BALANCE.idleBounce;
}

/** Launch the ball. Only valid while idle. */
export function tap(state: RingsState): RingsState {
  if (state.status !== 'idle') return state;
  return { ...state, status: 'flying', launched: true, ballY: idleBallY(state), nextRing: 0 };
}

/** Advance the sim by `seconds`. Returns the next state. */
export function step(state: RingsState, seconds: number): RingsState {
  const dt = Math.max(0, Math.min(finite(seconds), 0.5));
  if (dt === 0 || state.status === 'over') return state;

  const time = state.time + dt;
  let s: RingsState = { ...state, time };

  if (s.status !== 'flying') {
    // Idle: the ball just bounces; hunters settle back to their rest height.
    const rings = settleChasers(s.rings, dt);
    return {
      ...s,
      rings,
      overFlash: Math.max(0, s.overFlash - dt),
      levelUpFlash: Math.max(0, s.levelUpFlash - dt),
    };
  }

  // Integrate in small fixed steps for accurate crossing detection.
  let remaining = dt;
  while (remaining > 0 && s.status === 'flying') {
    const h = Math.min(BALANCE.step, remaining);
    remaining -= h;
    s = integrate(s, h);
  }

  return {
    ...s,
    overFlash: Math.max(0, s.overFlash - dt),
    levelUpFlash: Math.max(0, s.levelUpFlash - dt),
  };
}

/** Pull every hunter ring toward its rest height by at most `speed*dt`. */
function settleChasers(rings: Ring[], dt: number): Ring[] {
  let changed = false;
  const out = rings.map((ring) => {
    if (ring.chase <= 0) return ring;
    const d = ring.baseY - ring.cur;
    const maxMove = BALANCE.chaseReturnSpeed * dt;
    const move = Math.abs(d) <= maxMove ? d : Math.sign(d) * maxMove;
    if (move === 0) return ring;
    changed = true;
    return { ...ring, cur: Math.min(0.98, Math.max(0.02, ring.cur + move)) };
  });
  return changed ? out : rings;
}

function integrate(s: RingsState, dt: number): RingsState {
  const prevY = s.ballY;
  const nextY = prevY + BALANCE.launchSpeed * dt;

  // Hunters move first: rings still ahead chase the ball's altitude; rings the
  // ball has already passed settle back to rest so they don't linger mid-pole.
  let changed = false;
  const rings = s.rings.map((ring) => {
    if (ring.chase <= 0) return ring;
    const ahead = s.nextRing <= ring.id;
    const target = ahead ? s.ballY : ring.baseY;
    const speed = ahead ? ring.chase : BALANCE.chaseReturnSpeed;
    const d = target - ring.cur;
    const maxMove = speed * dt;
    const move = Math.abs(d) <= maxMove ? d : Math.sign(d) * maxMove;
    if (move === 0) return ring;
    changed = true;
    return { ...ring, cur: Math.min(0.98, Math.max(0.02, ring.cur + move)) };
  });
  s = changed ? { ...s, rings } : s;

  // Check each ring the ball may have crossed this step.
  for (let i = s.nextRing; i < s.rings.length; i++) {
    const ring = s.rings[i];
    const ry = ringY(ring, s.time);
    const crossed = prevY <= ry && nextY >= ry;
    if (!crossed) continue;

    const rot = ringRot(ring, s.time);
    const alignment = Math.abs(rot); // rot is already wrapped to [-π, π] around 0
    const open = alignment <= ring.gapHalf;
    const perfect = alignment <= ring.gapHalf * 0.4;

    if (!open) {
      // Hit the ring body.
      return { ...s, ballY: prevY, status: 'over', overFlash: 0.4 };
    }

    const combo = s.time - s.lastPassAt < BALANCE.comboWindow ? s.combo + 1 : 1;
    s = {
      ...s,
      score: s.score + (perfect ? 2 : 1),
      combo,
      lastPassAt: s.time,
      nextRing: i + 1,
    };
    if (perfect) s.best = Math.max(s.best, s.score);
    break;
  }

  s = { ...s, ballY: nextY };

  // Reached the top → level complete.
  if (s.ballY >= 1) {
    const nextLevel = s.level + 1;
    s = {
      ...s,
      status: 'idle',
      launched: false,
      ballY: 0,
      level: nextLevel,
      bestLevel: Math.max(s.bestLevel, nextLevel),
      rings: buildLevel(nextLevel, s.time),
      nextRing: 0,
      levelUpFlash: 1.2,
    };
  }

  return s;
}

/**
 * Combo meter 0..1 — the fraction of the combo window remaining. 1 right after
 * a pass, draining to 0 where the combo breaks. 0 when no combo is active.
 */
export function comboMeter(state: RingsState): number {
  if (state.combo <= 0 || state.lastPassAt < 0) return 0;
  const since = state.time - state.lastPassAt;
  if (since < 0) return 1;
  return Math.max(0, Math.min(1, 1 - since / BALANCE.comboWindow));
}

/** Sanitise a loaded save. */
export function validateState(raw: unknown): Pick<RingsState, 'best' | 'bestLevel'> {
  const best = raw && typeof raw === 'object' ? (raw as { best?: unknown }).best : undefined;
  const bestLevel = raw && typeof raw === 'object' ? (raw as { bestLevel?: unknown }).bestLevel : undefined;
  return {
    best: typeof best === 'number' && Number.isFinite(best) && best >= 0 ? Math.floor(best) : 0,
    bestLevel: typeof bestLevel === 'number' && Number.isFinite(bestLevel) && bestLevel >= 1 ? Math.floor(bestLevel) : 1,
  };
}
