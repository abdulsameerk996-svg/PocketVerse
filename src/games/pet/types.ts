export type PetSave = {
  name: string;
  /** 0..100 — decay while away, restored by care actions. */
  hunger: number;
  happiness: number;
  energy: number;
  hygiene: number;
  /** Pet's own level, separate from the account. Grows with care. */
  bond: number;
  bondXp: number;
  sleeping: boolean;
  /** ms epoch of the last simulated tick. */
  lastTick: number;
  /** Owned toy item ids. */
  toys: string[];
  /** Care actions performed today, used for the daily care streak. */
  careToday: number;
  careDay: string;
};

export const PET_STAT_KEYS = ['hunger', 'happiness', 'energy', 'hygiene'] as const;
export type PetStatKey = (typeof PET_STAT_KEYS)[number];

/** Decay per real-world hour, awake. Sleeping halves everything but hunger. */
export const DECAY_PER_HOUR: Record<PetStatKey, number> = {
  hunger: 7.5,
  happiness: 5.5,
  energy: 6,
  hygiene: 4,
};

export const MOODS = [
  { min: 85, label: 'Thriving', face: '◕‿◕', color: '#34E2A8' },
  { min: 65, label: 'Happy', face: '•ᴗ•', color: '#A3E635' },
  { min: 45, label: 'Okay', face: '•_•', color: '#FFC53D' },
  { min: 25, label: 'Unhappy', face: '·︿·', color: '#FF9F1C' },
  { min: 0, label: 'Neglected', face: '×_×', color: '#FF6B6B' },
] as const;

export function moodFor(score: number) {
  return MOODS.find((m) => score >= m.min) ?? MOODS[MOODS.length - 1];
}

export function wellbeing(s: PetSave) {
  return (s.hunger + s.happiness + s.energy + s.hygiene) / 4;
}
