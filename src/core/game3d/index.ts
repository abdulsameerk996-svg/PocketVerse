/**
 * ============================================================================
 *  POCKETVERSE 3D GAME FRAMEWORK
 * ============================================================================
 *
 * The shared parts of a 3D arcade game, so a new one is gameplay plus a scene
 * rather than another copy of the same scaffolding.
 *
 *   Stage         scene shell — canvas, lights, fog, auto-framed camera
 *   Arena         the slab, its glowing boundary, the void beneath it
 *   Character     a stylised low-poly figure with idle animation
 *   Sparks        pooled particle bursts
 *   arena2d       planar physics: bodies, collisions, walls, fixed timestep
 *   useDuelInput  two players on one keyboard, or two thumbs on one phone
 *   TouchSticks   the on-screen half of that
 *   useMatch      countdown → play → point → rematch, and the clock
 *   DuelHud       score, countdown, winner card, rematch button
 *
 * Pen Fight predates this and keeps its own bespoke capsule solver and scene —
 * it is tuned and regression-tested, and porting it would be churn for no gain.
 * It shares `GameCanvas`, which is where the platform split lives.
 */

export { GameCanvas } from './GameCanvas';
export type { GameCanvasProps } from './canvasProps';

export { Stage, useFitCamera } from './Stage';
export type { StageProps, StageFit } from './Stage';

export { Arena, Character, Sparks } from './props3d';
export type { ArenaProps, CharacterProps, CharacterStyle, SparksHandle } from './props3d';

export {
  FIXED_STEP,
  makeBody,
  stepWorld,
  integrate,
  speed,
  clampSpeed,
  push,
  collide,
  bounceRect,
  clampRect,
  radiusFromCentre,
  clamp,
} from './arena2d';
export type { Body, Hit } from './arena2d';

export { useDuelInput, HAS_KEYBOARD, KEY_HINT } from './useDuelInput';
export type { DuelAxes, DuelInput, DuelActions, Axis } from './useDuelInput';

export { TouchSticks } from './TouchSticks';
export { useMatch, useMatchClock } from './useMatch';
export type { Match, MatchOptions, MatchPhase, Side } from './useMatch';

export { DuelHud, P1_COLOR, P2_COLOR } from './DuelHud';
export type { DuelHudProps } from './DuelHud';
