/**
 * Pure deterministic helpers for Nexus Arena — movement, combat, AI, scoring.
 * Testable without React/Three.
 */
import { createRng } from '@/core/utils/rng';

export function finiteCheck(v: number) { return Number.isFinite(v); }

export function clamp(v: number, lo: number, hi: number) { return v < lo ? lo : v > hi ? hi : v; }

export function approachAngle(current: number, target: number, maxDelta: number): number {
  let diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

export function difficultyAt(time: number, matchDuration: number): number {
  // 0..1, ramps, harder in last 30s
  const t = time / matchDuration;
  return Math.min(1, t * 0.7 + Math.pow(t, 2) * 0.5);
}

export function aiDecision(
  self: { x: number; z: number; hp: number; maxHp: number; ultimateCharge: number },
  opponents: { id: number; x: number; z: number; hp: number; alive: boolean }[],
  pickups: { x: number; z: number; active: boolean }[],
  time: number,
  rng: () => number,
): { moveX: number; moveZ: number; wantAttack: boolean; wantDash: boolean; wantShield: boolean; wantUltimate: boolean; targetId: number | null } {
  // find nearest alive opponent
  let nearest: typeof opponents[0] | null = null;
  let best = Infinity;
  for (const o of opponents) {
    if (!o.alive) continue;
    const d2 = (o.x - self.x) ** 2 + (o.z - self.z) ** 2;
    if (d2 < best) { best = d2; nearest = o; }
  }

  let moveX = 0, moveZ = 0;
  let wantAttack = false, wantDash = false, wantShield = false, wantUltimate = false;
  let targetId: number | null = nearest?.id ?? null;

  if (nearest) {
    const dx = nearest.x - self.x;
    const dz = nearest.z - self.z;
    const dist = Math.hypot(dx, dz) || 1;
    const nx = dx / dist;
    const nz = dz / dist;

    // behavior based on health
    const hpPct = self.hp / self.maxHp;
    const aggressive = hpPct > 0.5 || self.ultimateCharge > 0.9;

    if (aggressive) {
      if (dist > 1.8) {
        moveX = nx * (0.8 + rng() * 0.2);
        moveZ = nz * (0.8 + rng() * 0.2);
      } else {
        // close — strafe
        moveX = -nz * (rng() > 0.5 ? 1 : -1) * 0.5 + nx * 0.2;
        moveZ = nx * (rng() > 0.5 ? 1 : -1) * 0.5 + nz * 0.2;
        wantAttack = rng() < 0.35;
      }
      if (dist < 2.2) wantAttack = true;
      if (dist > 4.5 && rng() < 0.08) wantDash = true;
      if (hpPct < 0.35 && rng() < 0.12) wantShield = true;
      if (self.ultimateCharge >= 1 && dist < 3.5 && rng() < 0.18) wantUltimate = true;
    } else {
      // retreat to pickup or away
      const pickup = pickups.find(p => p.active);
      if (pickup && rng() < 0.7) {
        const dxp = pickup.x - self.x;
        const dzp = pickup.z - self.z;
        const dp = Math.hypot(dxp, dzp) || 1;
        moveX = (dxp / dp) * 0.9;
        moveZ = (dzp / dp) * 0.9;
      } else {
        moveX = -nx * 0.9;
        moveZ = -nz * 0.9;
        if (rng() < 0.1) wantDash = true;
      }
      if (hpPct < 0.25 && rng() < 0.15) wantShield = true;
    }

    // occasional random strafe to avoid being predictable
    if (rng() < 0.08) {
      moveX += (rng() - 0.5) * 0.6;
      moveZ += (rng() - 0.5) * 0.6;
    }
  } else {
    // no opponent — wander to center
    const dx = -self.x;
    const dz = -self.z;
    const d = Math.hypot(dx, dz) || 1;
    moveX = (dx / d) * 0.5;
    moveZ = (dz / d) * 0.5;
  }

  // clamp
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) { moveX /= len; moveZ /= len; }

  return { moveX, moveZ, wantAttack, wantDash, wantShield, wantUltimate, targetId };
}

export function damageForAbility(ability: string, base: number, isCrit = false): number {
  const mult: Record<string, number> = {
    attack: 1,
    dash: 0.6,
    shield: 0,
    ultimate: 2.8,
  };
  return Math.round(base * (mult[ability] ?? 1) * (isCrit ? 1.8 : 1));
}

export function scoreForKO(streak: number): number {
  return 120 + streak * 25;
}

export function isFiniteState(s: { x: number; z: number; vx: number; vz: number; hp: number }): boolean {
  return [s.x, s.z, s.vx, s.vz, s.hp].every(Number.isFinite) && s.hp >= 0;
}
