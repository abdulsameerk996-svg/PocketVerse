export type RunnerSave = {
  runs: number;
  bestDistance: number;
  totalDistance: number;
  /** Equipped runner skin id (module-local cosmetic). */
  skin: string;
  unlockedSkins: string[];
};
