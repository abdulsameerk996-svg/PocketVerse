/**
 * ============================================================================
 *  MEMORY RUSH — Simon-style sequence logic
 * ============================================================================
 *
 * Pure and deterministic given the rng: `extendSeq` appends one pad index, so
 * a seeded rng reproduces the exact same sequence. All timing/scoring curves
 * are pure functions the harness can assert on.
 */

export const PADS = 4;
export const START_LIVES = 3;

export type MemPhase = 'idle' | 'show' | 'input' | 'over';

export type MemState = {
  seq: number[];
  /** How many entries the player has correctly repeated this round. */
  entered: number;
  phase: MemPhase;
  time: number;
  score: number;
  lives: number;
  /** Longest sequence cleared. */
  stage: number;
};

export function makeMem(): MemState {
  return {
    seq: [],
    entered: 0,
    phase: 'idle',
    time: 0,
    score: 0,
    lives: START_LIVES,
    stage: 0,
  };
}

/** Append one random pad (0..PADS-1) to the sequence. Pure given `rand`. */
export function extendSeq(seq: number[], rand: () => number): number[] {
  return [...seq, Math.min(PADS - 1, Math.floor(rand() * PADS))];
}

/** How long one pad glows during the show phase. */
export function showPadMs(stage: number): number {
  return Math.max(220, 520 - stage * 22);
}

/** Seconds the player gets to enter one step of the sequence. */
export function padTimer(stage: number): number {
  return Math.max(1.5, 3.2 - stage * 0.16);
}

/** Score for clearing a stage: sequence length plus a lives premium. */
export function stageScore(stage: number, lives: number): number {
  return Math.max(10, stage * 20 + lives * 15);
}

/** Validate an entry. Returns 'ok' (continue), 'done' (sequence cleared) or 'wrong'. */
export function checkEntry(seq: number[], entered: number): 'ok' | 'done' | 'wrong' {
  if (entered < 0 || entered >= seq.length) return 'wrong';
  if (entered === seq.length - 1) return 'done';
  return 'ok';
}

/** Normalise a persisted blob into a complete save. */
export function normalizeMemSave(raw: unknown): { runs: number; best: number; bestStreak: number } {
  const base = { runs: 0, best: 0, bestStreak: 0 };
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    runs: Math.max(0, Math.floor(num(s.runs))),
    best: Math.max(0, Math.floor(num(s.best))),
    bestStreak: Math.max(0, Math.floor(num(s.bestStreak))),
  };
}
