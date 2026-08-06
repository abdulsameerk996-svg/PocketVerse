export type LevelProgress = {
  cleared: boolean;
  collected: number;
  bestDeaths: number;
};

export type PlatformerSave = {
  levels: Record<string, LevelProgress>;
  totalCollected: number;
};
