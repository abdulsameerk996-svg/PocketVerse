export type NexusSave = {
  matches: number;
  wins: number;
  bestScore: number;
  totalKOs: number;
  unlockedChars: string[];
  selectedChar: string;
  trophies: number;
};

export type CharId = 'nova' | 'bolt' | 'guard' | 'spectre';
export type AbilityId = 'attack' | 'dash' | 'shield' | 'ultimate';

export type PlayerState = {
  id: number;
  charId: CharId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  score: number;
  kos: number;
  facing: number;
  abilityCd: Record<AbilityId, number>;
  ultimateCharge: number;
  isBot: boolean;
  targetId: number | null;
};

export type PickupType = 'health' | 'energy' | 'score';

export type Pickup = {
  id: number;
  x: number;
  z: number;
  type: PickupType;
  active: boolean;
  respawnAt: number;
};
