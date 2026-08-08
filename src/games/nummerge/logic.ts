/**
 * ============================================================================
 *  NUMBER MERGE — a 3×3 2048-lite, pure and deterministic
 * ============================================================================
 *
 * The board is a flat 9-cell array (0 = empty, otherwise powers of two).
 * Every slide is a pure transform; the only randomness is which free cell a
 * new tile lands on, driven by the caller's rng so the harness can replay a
 * board exactly.
 */

export const GRID = 3;
export const CELLS = 9;

export type MergeState = {
  grid: number[];
  score: number;
  over: boolean;
  moves: number;
  merges: number;
  time: number;
};

export function makeMerge(): MergeState {
  const state: MergeState = {
    grid: Array.from({ length: CELLS }, () => 0),
    score: 0,
    over: false,
    moves: 0,
    merges: 0,
    time: 0,
  };
  spawnTile(state, Math.random);
  spawnTile(state, Math.random);
  return state;
}

/** Slide one row left, merging equal neighbours. Pure. */
export function slideRow(row: number[]): { row: number[]; gained: number } {
  const vals = row.filter((v) => v > 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      const merged = vals[i] * 2;
      out.push(merged);
      gained += merged;
      i += 1;
    } else {
      out.push(vals[i]);
    }
  }
  while (out.length < row.length) out.push(0);
  return { row: out, gained };
}

export type MoveDir = 0 | 1 | 2 | 3; // left, up, right, down

/** Read a line (row or column, with reversal for right/down). */
function readLine(grid: number[], i: number, dir: MoveDir): number[] {
  if (dir === 0) return grid.slice(i * GRID, i * GRID + GRID);
  if (dir === 1) return [grid[i], grid[i + GRID], grid[i + GRID * 2]];
  if (dir === 2) return grid.slice(i * GRID, i * GRID + GRID).reverse();
  return [grid[i + GRID * 2], grid[i + GRID], grid[i]];
}

/** Write a slid line back into a grid copy. */
function writeLine(next: number[], i: number, dir: MoveDir, row: number[]): void {
  for (let j = 0; j < GRID; j++) {
    if (dir === 0) next[i * GRID + j] = row[j];
    else if (dir === 1) next[i + GRID * j] = row[j];
    else if (dir === 2) next[i * GRID + (GRID - 1 - j)] = row[j];
    else next[i + GRID * (GRID - 1 - j)] = row[j];
  }
}

export function moveGrid(
  grid: number[],
  dir: MoveDir,
): { grid: number[]; gained: number; moved: boolean } {
  const next = grid.slice();
  let gained = 0;
  for (let i = 0; i < GRID; i++) {
    const r = slideRow(readLine(grid, i, dir));
    gained += r.gained;
    writeLine(next, i, dir, r.row);
  }
  const moved = next.some((v, i) => v !== grid[i]);
  return { grid: next, gained, moved };
}

/** Drop a 2 (mostly) or 4 into a random free cell. Returns false when full. */
export function spawnTile(state: MergeState, rand: () => number): boolean {
  const empties: number[] = [];
  state.grid.forEach((v, i) => {
    if (v === 0) empties.push(i);
  });
  if (empties.length === 0) return false;
  const cell = empties[Math.floor(rand() * empties.length)];
  state.grid[cell] = rand() < 0.85 ? 2 : 4;
  return true;
}

/** Any legal move left? */
export function canMove(grid: number[]): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (grid[i] === 0) return true;
    const r = i % GRID;
    const c = Math.floor(i / GRID);
    if (r < GRID - 1 && grid[i] === grid[i + 1]) return true;
    if (c < GRID - 1 && grid[i] === grid[i + GRID]) return true;
  }
  return false;
}

/** Apply a player move to the whole state. */
export function applyMove(
  state: MergeState,
  dir: MoveDir,
  rand: () => number,
): { gained: number; merged: boolean; over: boolean } {
  'worklet';
  state.time += 1;
  const res = moveGrid(state.grid, dir);
  if (!res.moved) {
    // A swipe on a locked board ends the run — there is nothing left to do.
    if (!canMove(state.grid)) state.over = true;
    return { gained: 0, merged: false, over: state.over };
  }
  state.grid = res.grid;
  state.moves += 1;
  state.score += res.gained;
  const merged = res.gained > 0;
  if (merged) state.merges += 1;
  spawnTile(state, rand);
  if (!canMove(state.grid)) {
    state.over = true;
    return { gained: res.gained, merged, over: true };
  }
  return { gained: res.gained, merged, over: false };
}
