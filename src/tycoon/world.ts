/**
 * Café world simulation — purely positional, no React.
 *
 * Derives character positions and floating money from the game state + elapsed
 * time. The renderer reads these positions every frame but never mutates them.
 *
 * Characters:
 * - Baristas: walk between their assigned equipment station and the break area
 * - Customers: enter from the right edge, visit a random station, leave left
 *
 * Floating money: equipment produces a floater every N seconds scaled by CPS.
 */

import { GENERATORS } from './data';
import type { Floater, GameState, GeneratorId, WorldCharacter } from './types';

export interface WorldState {
  characters: WorldCharacter[];
  floaters: Floater[];
}

let nextId = 1;

/* ---------- deterministic character colours ---------- */
const BARISTA_HUES = [30, 170, 210, 340, 50, 120, 280, 20];
const CUSTOMER_HUES = [0, 60, 100, 160, 200, 260, 300, 350];

/* ---------- helpers ---------- */

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

function finite(n: unknown, fallback = 0): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

/**
 * Given the game state, return a flat ordered list of (generatorId, floor, slot).
 * Mirrors engine.slotAssignments so the world and engine stay in sync.
 */
function assignments(state: GameState): { id: GeneratorId; floor: number; slot: number }[] {
  const result: { id: GeneratorId; floor: number; slot: number }[] = [];
  let idx = 0;
  const w = Math.max(1, Math.floor(state.floorWidth));
  for (const def of GENERATORS) {
    const owned = state.generators[def.id] ?? 0;
    for (let i = 0; i < owned; i++) {
      result.push({ id: def.id, floor: Math.floor(idx / w), slot: idx % w });
      idx++;
    }
  }
  return result;
}

/** X position (0–1) of a slot within its floor. */
function slotX(slot: number, floorWidth: number): number {
  const w = Math.max(1, floorWidth);
  return (slot + 0.5) / w;
}

/* ---------- public API ---------- */

/**
 * Derive the complete world state from the game state and the previous world
 * state (for smooth character animation). `dt` is seconds since last frame.
 */
export function buildWorld(
  state: GameState,
  prev: WorldState | null,
  dt: number,
  now: number,
): WorldState {
  const clampedDt = clamp(finite(dt, 0.016), 0, 0.5);
  const w = Math.max(1, Math.floor(state.floorWidth));
  const assigns = assignments(state);

  /* ---- baristas ---- */
  const baristaCount = state.generators.barista ?? 0;
  const prevBaristas = prev?.characters.filter((c) => c.type === 'barista') ?? [];
  const baristas: WorldCharacter[] = [];

  for (let i = 0; i < baristaCount; i++) {
    const prevChar = prevBaristas[i];
    const assignedSlot = assigns[i];
    const floorIdx = assignedSlot ? assignedSlot.floor : 0;
    const slotIdx = assignedSlot ? assignedSlot.slot : 0;
    const targetX = assignedSlot ? slotX(slotIdx, w) : 0.5;

    if (prevChar && prevChar.floor === floorIdx) {
      // continue existing character
      const speed = 0.4; // 0–1 per second
      const newX = lerp(prevChar.x, targetX, clampedDt * speed * 3);
      const dist = Math.abs(newX - targetX);
      baristas.push({
        ...prevChar,
        floor: floorIdx,
        slot: slotIdx,
        x: dist < 0.02 ? targetX : newX,
        targetX,
        state: dist < 0.02 ? 'working' : 'walking',
      });
    } else {
      // new or reassigned character
      baristas.push({
        id: `b${i}`,
        type: 'barista',
        floor: floorIdx,
        x: targetX,
        targetX,
        speed: 0.4,
        state: 'working',
        slot: slotIdx,
        hue: BARISTA_HUES[i % BARISTA_HUES.length],
      });
    }
  }

  /* ---- customers ---- */
  // Customer count scales with CPS (1 per $10/s, max 6)
  const cps = deriveQuick(state);
  const targetCustomers = Math.min(6, Math.floor(cps / 10));
  const prevCustomers = prev?.characters.filter((c) => c.type === 'customer') ?? [];
  const customers: WorldCharacter[] = [];

  // Keep existing customers, advance them, remove those that have left
  for (const pc of prevCustomers) {
    if (pc.state === 'leaving') {
      const newX = pc.x - clampedDt * 0.3;
      if (newX > -0.1) {
        customers.push({ ...pc, x: newX, state: 'leaving' });
      }
      // else: customer left the building, don't re-add
      continue;
    }
    if (pc.state === 'entering') {
      const newX = pc.x + clampedDt * 0.25;
      if (newX >= pc.targetX) {
        customers.push({ ...pc, x: pc.targetX, state: 'working' });
      } else {
        customers.push({ ...pc, x: newX, state: 'entering' });
      }
      continue;
    }
    // working — stay for a while, then leave
    const age = (now - ((pc as any).born ?? 0)) / 1000;
    if (age > 4) {
      customers.push({ ...pc, state: 'leaving', targetX: -0.1 });
    } else {
      customers.push(pc);
    }
  }

  // Spawn new customers if needed
  while (customers.length < targetCustomers) {
    const floor = Math.floor(Math.random() * Math.max(1, occupiedFloorsQuick(state)));
    const floorIdx = clamp(floor, 0, BUILDING_MAX_FLOORS - 1);
    customers.push({
      id: `c${nextId++}`,
      type: 'customer',
      floor: floorIdx,
      x: 1.05, // off-screen right
      targetX: 0.2 + Math.random() * 0.6,
      speed: 0.25,
      state: 'entering',
      slot: -1,
      hue: CUSTOMER_HUES[(nextId) % CUSTOMER_HUES.length],
      born: now,
    } as WorldCharacter & { born: number });
  }

  /* ---- floaters ---- */
  const prevFloaters = prev?.floaters ?? [];
  const newFloaters: Floater[] = [];
  const FLOATER_INTERVAL = 2; // seconds between floaters per piece of equipment
  const totalEquip = assigns.length;

  for (const prevF of prevFloaters) {
    const age = (now - prevF.born) / 1000;
    if (age < 1.2) {
      newFloaters.push(prevF);
    }
    // expired floaters are dropped
  }

  // Spawn new floater every FLOATER_INTERVAL / totalEquip seconds
  if (totalEquip > 0 && prevFloaters.length < totalEquip) {
    const slotIdx = Math.floor(Math.random() * totalEquip);
    const a = assigns[slotIdx];
    if (a) {
      const interval = Math.max(0.5, FLOATER_INTERVAL / totalEquip);
      const lastOnFloor = newFloaters.filter((f) => f.floor === a.floor).pop();
      const shouldSpawn = !lastOnFloor || (now - lastOnFloor.born) / 1000 > interval;
      if (shouldSpawn) {
        const d = GENERATORS.find((g) => g.id === a.id);
        const amount = d ? finite(d.baseCps) * cps / Math.max(1, totalEquip) : 0;
        if (amount > 0) {
          newFloaters.push({
            id: nextId++,
            amount,
            floor: a.floor,
            x: slotX(a.slot, w),
            born: now,
          });
        }
      }
    }
  }

  return { characters: [...baristas, ...customers], floaters: newFloaters };
}

const BUILDING_MAX_FLOORS = 8;

/* quick CPS derivation without importing engine (avoid circular) */
function deriveQuick(state: GameState): number {
  let cps = 0;
  for (const def of GENERATORS) {
    const owned = finite(state.generators[def.id]);
    cps += owned * def.baseCps;
  }
  return cps;
}

function occupiedFloorsQuick(state: GameState): number {
  let total = 0;
  for (const def of GENERATORS) {
    total += finite(state.generators[def.id]);
  }
  if (total === 0) return 1;
  return Math.min(BUILDING_MAX_FLOORS, Math.ceil(total / Math.max(1, state.floorWidth)));
}

/** Create a fresh empty world state. */
export function createWorld(): WorldState {
  return { characters: [], floaters: [] };
}
