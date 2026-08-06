export type CarStats = {
  /** Multiplier on forward speed. */
  speed: number;
  /** How fast the car responds to steering input. */
  handling: number;
  /** How forgiving the off-road penalty is. */
  grip: number;
};

export type DrivingSave = {
  car: string;
  unlockedCars: string[];
  runs: number;
  bestDistance: number;
  totalDistance: number;
  /** Index into MISSIONS of the current objective. */
  missionIndex: number;
  missionProgress: number;
  missionsCompleted: number;
};

export type Mission = {
  id: string;
  title: string;
  description: string;
  /** What the mission counts within a single run. */
  kind: 'distance' | 'nearMiss' | 'coins' | 'noHit';
  target: number;
  reward: { coins: number; xp: number; gems?: number; unlock?: string };
};
