import type { ItemDef } from '@/core/types';
import type { Difficulty, PenFightSave, PenSkinId, SideId, Table } from './types';

/**
 * PEN FIGHT — content tables.
 *
 * Arena geometry, pen skins and the match rules. Everything a designer would
 * want to retune lives here rather than inside the surface.
 */

/* ------------------------------------------------------------------ arena -- */

/**
 * Table half-extents in simulation units. Deliberately taller than it is wide:
 * the app is portrait, and a long desk gives a flick room to develop.
 */
export const TABLE: Table = { halfW: 3, halfD: 4.5 };

/** Thickness of the desk slab — visual only, the solver is 2D. */
export const TABLE_THICKNESS = 0.45;

/**
 * Where the pens are racked.
 *
 * `angle: π/2` puts both pens **end-on**, nib pointing at the opponent, rather
 * than lying across the desk. That is a balance decision, not a look: a
 * broadside pen presents a 2.2-unit wall that every difficulty of rival hits,
 * so the opening flick converted essentially every time and the match was
 * decided by who went first. End-on, the target is a 0.3-unit needle and aim
 * becomes the thing that separates a casual rival from a ruthless one. See the
 * balance note in `physics.ts`.
 */
export const START_MARKS = {
  player: { x: 0, z: 2.6, angle: Math.PI / 2 },
  rival: { x: 0, z: -2.6, angle: Math.PI / 2 },
} as const;

/** First side to take this many rounds wins the match. */
export const ROUNDS_TO_WIN = 2;

/**
 * A round with no knock-off after this many flicks each is called a stalemate
 * and re-racked, so a match cannot run forever on a cautious pair of players.
 */
export const MAX_TURNS_PER_ROUND = 14;

/* ------------------------------------------------------------ round rules -- */

/**
 * The verdict on a settled round.
 *
 * `decideRound` is the single place round-end outcomes are judged, so the
 * first-turn-out rule lives in a pure module the simulation can exercise — the
 * same logic `PenFightGame` runs on every settle.
 *
 * THE RULE: a complete out landed on the very first flick of a round does not
 * decide the round. Immediate wins are not allowed — the pens re-rack and a
 * tiebreaker is played, the victim flicking first, until someone actually outs
 * the other. Later-turn outs, double outs and stalemates behave exactly as
 * before.
 */
export type RoundDecision =
  | { kind: 'tiebreak'; victim: SideId }
  | { kind: 'roundOver'; loser: SideId | null }
  | { kind: 'continue' };

export function decideRound(
  fell: SideId[],
  turnsUsed: number,
  tiebreak = false,
): RoundDecision {
  if (fell.length === 1 && turnsUsed === 1 && !tiebreak) {
    return { kind: 'tiebreak', victim: fell[0] };
  }
  if (fell.length > 0) {
    return { kind: 'roundOver', loser: fell.length > 1 ? null : fell[0] };
  }
  if (turnsUsed >= MAX_TURNS_PER_ROUND) {
    return { kind: 'roundOver', loser: null };
  }
  return { kind: 'continue' };
}

/** Longest drag, in points, that still counts as more power. */
export const MAX_DRAG_PX = 190;

/* ------------------------------------------------------------------- pens -- */

export type PenSkin = {
  id: PenSkinId;
  name: string;
  glyph: string;
  /** Barrel colour. */
  body: string;
  /** Grip / cap accent. */
  accent: string;
  /** Metallic + roughness pair handed straight to the material. */
  metalness: number;
  roughness: number;
  /** Emissive rim for the exotic skins; '' = none. */
  glow: string;
  price: number;
};

export const PEN_SKINS: PenSkin[] = [
  {
    id: 'pen_classic',
    name: 'School Biro',
    glyph: '🖊️',
    body: '#2F6FE0',
    accent: '#E8ECF5',
    metalness: 0.05,
    roughness: 0.55,
    glow: '',
    price: 0,
  },
  {
    id: 'pen_carbon',
    name: 'Carbon Draft',
    glyph: '🖋️',
    body: '#22242B',
    accent: '#6E7683',
    metalness: 0.45,
    roughness: 0.35,
    glow: '',
    price: 1800,
  },
  {
    id: 'pen_gold',
    name: 'Ledger Gold',
    glyph: '🪙',
    body: '#C8992F',
    accent: '#F3DE9B',
    metalness: 0.9,
    roughness: 0.22,
    glow: '',
    price: 5200,
  },
  {
    id: 'pen_plasma',
    name: 'Plasma Marker',
    glyph: '⚡',
    body: '#1B1140',
    accent: '#C05CFF',
    metalness: 0.3,
    roughness: 0.3,
    glow: '#C05CFF',
    price: 12000,
  },
];

export const RIVAL_SKIN: PenSkin = {
  id: 'pen_classic',
  name: 'Rival',
  glyph: '🖊️',
  body: '#D8494F',
  accent: '#FFD9D9',
  metalness: 0.08,
  roughness: 0.5,
  glow: '',
  price: 0,
};

export function getPenSkin(id: PenSkinId): PenSkin {
  return PEN_SKINS.find((p) => p.id === id) ?? PEN_SKINS[0];
}

/** Purchasable skins join the shared store/inventory like any other cosmetic. */
export const PEN_ITEMS: ItemDef[] = PEN_SKINS.filter((p) => p.price > 0).map((p) => ({
  id: p.id,
  name: p.name,
  kind: 'cosmetic',
  rarity: p.price > 8000 ? 'legendary' : p.price > 3000 ? 'epic' : 'rare',
  glyph: p.glyph,
  description: `A Pen Fight barrel. ${p.price > 8000 ? 'Glows when it lands.' : 'Pure swagger.'}`,
  value: Math.round(p.price * 0.3),
  stackable: false,
  source: 'penfight',
  price: { currency: 'coins', amount: p.price },
}));

/* ------------------------------------------------------------------- save -- */

export function defaultPenFightSave(): PenFightSave {
  return {
    pen: 'pen_classic',
    difficulty: 'normal',
    matches: 0,
    wins: 0,
    knockouts: 0,
    bestStreak: 0,
    streak: 0,
  };
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

/**
 * Coerce a persisted blob into a complete save.
 *
 * The core hands module saves back as opaque JSON and only shallow-merges
 * defaults, so anything nested has to defend itself. The surface reads `pen`
 * and `difficulty` on its first render, before a frame is drawn.
 */
export function normalizePenFightSave(raw: unknown): PenFightSave {
  const base = defaultPenFightSave();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  const s = raw as Partial<PenFightSave>;
  const known = new Set(PEN_SKINS.map((p) => p.id));

  return {
    pen: known.has(s.pen as PenSkinId) ? (s.pen as PenSkinId) : base.pen,
    difficulty: DIFFICULTIES.includes(s.difficulty as Difficulty)
      ? (s.difficulty as Difficulty)
      : base.difficulty,
    matches: Math.max(0, num(s.matches)),
    wins: Math.max(0, num(s.wins)),
    knockouts: Math.max(0, num(s.knockouts)),
    bestStreak: Math.max(0, num(s.bestStreak)),
    streak: Math.max(0, num(s.streak)),
  };
}
