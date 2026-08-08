/** Persisted save blob for Stack Rush. */
export type StackRushSave = {
  runs: number;
  best: number;
  /** Lifetime perfect drops — feeds the achievement. */
  perfects: number;
  /** Best perfect streak in a single run. */
  bestStreak: number;
};
