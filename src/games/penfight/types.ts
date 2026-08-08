/**
 * PEN FIGHT — domain types.
 *
 * The simulation is deliberately described in its own vocabulary and knows
 * nothing about React or three.js. `physics.ts` operates on these structures,
 * `ai.ts` reads them, and only `scene/` translates them into meshes.
 */

export type PenSkinId = 'pen_classic' | 'pen_carbon' | 'pen_gold' | 'pen_plasma';

export type Difficulty = 'easy' | 'normal' | 'hard';

/**
 * Who drives a side.
 *
 * The turn controller only ever asks "what does this seat want to do", which is
 * what makes local 2-player and tournament seats additive rather than a rewrite:
 * a new mode supplies different seats, not a different game.
 */
export type Seat =
  | { kind: 'human' }
  | { kind: 'ai'; difficulty: Difficulty };

/** Declared now so modes can be added without reshaping the module. */
export type PenFightMode = 'ai' | 'local' | 'challenge' | 'tournament';

export type SideId = 'player' | 'rival';

/**
 * A pen as the solver sees it: a capsule lying on the table, moving in the XZ
 * plane. `angle` is the heading of its long axis; `omega` its spin about the
 * table normal. Y only exists once a pen has been knocked off and is falling.
 */
export type PenBody = {
  side: SideId;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Heading of the long axis, radians, CCW in the (x, z) plane. */
  angle: number;
  /** Spin about the table normal, rad/s. */
  omega: number;
  /** Capsule radius. */
  radius: number;
  /** Half-length of the capsule's inner segment (total length = 2*(half+radius)). */
  half: number;
  mass: number;
  inertia: number;
  /** True once speed and spin have decayed below the rest thresholds. */
  resting: boolean;
  /** Knocked off the table — the round is decided. */
  fallen: boolean;
  /** Height above the table while falling (0 = on the surface). */
  y: number;
  vy: number;
  /** Tumble applied purely for the fall animation. */
  tumble: number;
};

export type Table = {
  /** Half-extent along x. */
  halfW: number;
  /** Half-extent along z. */
  halfD: number;
};

export type Launch = {
  /** Unit direction in the (x, z) plane. */
  dirX: number;
  dirZ: number;
  /** 0..1 — mapped onto the launch speed range. */
  power: number;
  /** -1..1 — sideways english; spins the pen as it leaves. */
  spin: number;
};

export type SimPhase =
  /** A human seat is aiming; controls are live. */
  | 'aim'
  /** An AI seat is deciding; controls are locked. */
  | 'thinking'
  /** Pens are moving; controls are locked. */
  | 'resolving'
  /** A pen went off the table. */
  | 'roundEnd'
  /** The match is decided. */
  | 'matchEnd';

/**
 * Note what is *not* here: which pens the player owns. Ownership lives in the
 * shared inventory like every other cosmetic, so a pen bought in the store is
 * usable here without this module storing a second copy of the truth.
 */
export type PenFightSave = {
  pen: PenSkinId;
  difficulty: Difficulty;
  matches: number;
  wins: number;
  knockouts: number;
  bestStreak: number;
  streak: number;
};
