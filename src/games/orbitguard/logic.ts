/**
 * ============================================================================
 *  ORBIT GUARD — polished logic
 * ============================================================================
 *
 * Friend feedback: "put the orbs to see on orbit guard and make it a bit hard"
 *
 * Changes:
 *  - visible types: normal, fast, tank, splitter, elite, boss
 *  - glowing, distinct colors, trails via history
 *  - orbit rings at 0.46, 0.3, 0.15 for depth
 *  - spacing: min angular separation on spawn
 *  - harder: faster escalation, mixed types, elite/boss waves, shorter windows
 */

export const ORB_POOL = 26;
export const START_LIVES = 3;
export type OrbKind = 'normal' | 'fast' | 'tank' | 'splitter' | 'elite' | 'boss';

export type Orb = {
  active: boolean;
  angle: number;
  dist: number;
  speed: number;
  r: number;
  kind: OrbKind;
  hp: number;
  trail: { angle: number; dist: number }[];
};

export type OrbitState = {
  time: number;
  over: boolean;
  hp: number;
  score: number;
  blocks: number;
  nextSpawn: number;
  shieldA: number;
  orbs: Orb[];
  wave: number;
  eliteTimer: number;
};

export function makeOrbit(): OrbitState {
  return {
    time: 0,
    over: false,
    hp: START_LIVES,
    score: 0,
    blocks: 0,
    nextSpawn: 0.7,
    shieldA: 0,
    wave: 0,
    eliteTimer: 18,
    orbs: Array.from({ length: ORB_POOL }, () => ({
      active: false,
      angle: 0,
      dist: 0.46,
      speed: 0,
      r: 0.028,
      kind: 'normal' as OrbKind,
      hp: 1,
      trail: [],
    })),
  };
}

export function orbSpeed(time: number, kind: OrbKind = 'normal'): number {
  const base = 0.15 + time * 0.018;
  const mult: Record<OrbKind, number> = {
    normal: 1,
    fast: 1.55,
    tank: 0.72,
    splitter: 1.15,
    elite: 1.35,
    boss: 0.9,
  };
  return Math.min(kind === 'boss' ? 0.38 : kind === 'elite' ? 0.68 : 0.74, base * (mult[kind] ?? 1));
}

export function orbInterval(time: number): number {
  // faster escalation than before: 0.85 -> 0.22
  return Math.max(0.22, 0.85 - time / 38);
}

export function shieldHalf(time: number): number {
  // starts wider for visibility, then shrinks harder
  return Math.max(0.24, 0.62 - time * 0.006);
}

export function orbitScore(time: number, blocks: number, hp: number): number {
  return Math.round(time * 10 + blocks * 16 + hp * 28);
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function kindForTime(time: number, rand: () => number): OrbKind {
  const d = Math.min(1, time / 120);
  const r = rand();
  if (time < 25) {
    if (r < 0.75) return 'normal';
    return 'fast';
  }
  if (time < 55) {
    if (r < 0.35) return 'normal';
    if (r < 0.62) return 'fast';
    if (r < 0.82) return 'tank';
    return 'splitter';
  }
  if (time < 90) {
    if (r < 0.22) return 'normal';
    if (r < 0.45) return 'fast';
    if (r < 0.65) return 'tank';
    if (r < 0.84) return 'splitter';
    return 'elite';
  }
  if (r < 0.15) return 'normal';
  if (r < 0.32) return 'fast';
  if (r < 0.52) return 'tank';
  if (r < 0.72) return 'splitter';
  if (r < 0.92) return 'elite';
  return 'boss';
}

export function spawnOrb(state: OrbitState, rand: () => number, forcedKind?: OrbKind): boolean {
  const kind = forcedKind ?? kindForTime(state.time, rand);
  // find least crowded angle: try up to 6 attempts to maintain spacing
  let angle = rand() * Math.PI * 2;
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? angle : rand() * Math.PI * 2;
    let ok = true;
    for (const o of state.orbs) {
      if (!o.active) continue;
      if (o.dist > 0.38 && Math.abs(angleDiff(o.angle, candidate)) < 0.22) {
        ok = false;
        break;
      }
    }
    if (ok) {
      angle = candidate;
      break;
    }
  }
  for (const o of state.orbs) {
    if (o.active) continue;
    o.active = true;
    o.angle = angle;
    o.dist = 0.46;
    o.kind = kind;
    o.speed = orbSpeed(state.time, kind);
    o.hp = kind === 'tank' ? 2 : kind === 'boss' ? 3 : kind === 'elite' ? 2 : 1;
    o.r = kind === 'tank' ? 0.038 : kind === 'boss' ? 0.05 : kind === 'fast' ? 0.022 : kind === 'elite' ? 0.034 : 0.028;
    o.trail = [];
    return true;
  }
  return false;
}

export function stepOrbit(state: OrbitState, rand: () => number, dt: number, shieldA: number): number {
  'worklet';
  if (state.over) return 0;
  state.time += dt;
  state.shieldA = shieldA;
  const half = shieldHalf(state.time);

  state.nextSpawn -= dt;
  if (state.nextSpawn <= 0) {
    state.nextSpawn = orbInterval(state.time);
    // boss wave: every 45s spawn ring of 8
    if (state.time > 30 && state.wave * 45 < state.time) {
      state.wave += 1;
      for (let k = 0; k < 8; k++) {
        const forced: OrbKind = k % 2 === 0 ? 'elite' : 'normal';
        spawnOrb(state, rand, forced);
      }
    } else {
      // normal spawn: 1-2 at once after 60s
      spawnOrb(state, rand);
      if (state.time > 60 && rand() < 0.45) spawnOrb(state, rand);
      if (state.time > 100 && rand() < 0.32) spawnOrb(state, rand);
    }
  }

  // elite timer: occasional elite swarm
  state.eliteTimer -= dt;
  if (state.eliteTimer <= 0) {
    state.eliteTimer = 22 + rand() * 10;
    for (let i = 0; i < 3; i++) spawnOrb(state, rand, 'elite');
  }

  let hits = 0;
  const toSplit: { angle: number; dist: number }[] = [];
  for (const o of state.orbs) {
    if (!o.active) continue;
    // trail history (keep 4)
    if (o.trail.length > 4) o.trail.shift();
    o.trail.push({ angle: o.angle, dist: o.dist });

    o.dist -= o.speed * dt;
    if (o.dist < 0.03) {
      o.active = false;
      state.hp -= o.kind === 'boss' ? 2 : 1;
      hits += o.kind === 'boss' ? 2 : 1;
      if (state.hp <= 0) {
        state.over = true;
        break;
      }
      continue;
    }
    if (o.dist < 0.42 && Math.abs(angleDiff(o.angle, shieldA)) < half) {
      o.hp -= 1;
      if (o.hp <= 0) {
        if (o.kind === 'splitter') {
          toSplit.push({ angle: o.angle - 0.18, dist: o.dist });
          toSplit.push({ angle: o.angle + 0.18, dist: o.dist });
        }
        o.active = false;
        state.blocks += 1;
      } else {
        // tank/boss needs second hit — bounce back a bit
        o.dist += 0.06;
      }
      continue;
    }
  }

  for (const sp of toSplit) {
    for (const o of state.orbs) {
      if (o.active) continue;
      o.active = true;
      o.angle = sp.angle;
      o.dist = Math.max(0.12, sp.dist);
      o.kind = 'fast';
      o.speed = orbSpeed(state.time, 'fast') * 1.1;
      o.hp = 1;
      o.r = 0.02;
      o.trail = [];
      break;
    }
  }

  state.score = orbitScore(state.time, state.blocks, state.hp);
  return hits;
}
