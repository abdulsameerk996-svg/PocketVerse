/** Persisted save blob for Memory Rush. */
export type MemRushSave = {
  runs: number;
  best: number;
  /** Longest single-run sequence cleared. */
  bestStreak: number;
};
