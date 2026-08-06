export type FishingSave = {
  location: string;
  unlocked: string[];
  caught: number;
  /** Distinct species ids ever caught — drives the collection screen. */
  species: string[];
  biggest: number;
};
