export type ChallengeId = 'reflex' | 'taprush' | 'stroop' | 'dodge';

export type ArcadeSave = {
  best: Record<string, number>;
  rounds: number;
  /** dayKey of the last day the rotation was seen — used for the NEW badge. */
  lastRotation: string | null;
};

export type ChallengeProps = {
  onEnd: (score: number, extra?: { label: string; value: string }[]) => void;
  luck: number;
  speed: number;
};
