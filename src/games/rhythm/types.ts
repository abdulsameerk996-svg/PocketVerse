export type SongScore = { score: number; accuracy: number; combo: number };

export type RhythmSave = {
  best: Record<string, SongScore>;
  cleared: number;
};
