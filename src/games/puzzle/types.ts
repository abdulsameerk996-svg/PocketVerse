export type PuzzleMode = 'lights' | 'slide' | 'memory';

export type PuzzleSave = {
  /** Best (lowest) move count per mode. */
  bestMoves: Partial<Record<PuzzleMode, number>>;
  /** Highest sequence length reached in memory mode. */
  bestMemory: number;
  solved: number;
  /** dayKey of the last completed daily puzzle. */
  lastDaily: string | null;
  dailyStreak: number;
};

export const MODE_META: Record<
  PuzzleMode,
  { title: string; glyph: string; blurb: string; accent: string }
> = {
  lights: {
    title: 'Blackout',
    glyph: '💡',
    blurb: 'Tap to flip a cell and its neighbours. Turn every light off.',
    accent: '#FFC53D',
  },
  slide: {
    title: 'Shuffle',
    glyph: '🔢',
    blurb: 'Slide tiles into the empty space until they are in order.',
    accent: '#4EA8FF',
  },
  memory: {
    title: 'Echo',
    glyph: '🧠',
    blurb: 'Watch the sequence, then repeat it. It grows every round.',
    accent: '#C05CFF',
  },
};

export const MODES: PuzzleMode[] = ['lights', 'slide', 'memory'];
