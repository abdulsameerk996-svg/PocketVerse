import { useRef } from 'react';

/**
 * Two-player input — native.
 *
 * Phones have no keyboard, so this only allocates the shared axis record that
 * the touch sticks write into. The web build overrides the file and adds
 * keyboard listeners on top of the same structure, so a game reads one place
 * regardless of platform or input device.
 */

export type Axis = { x: number; z: number };
export type DuelAxes = { p1: Axis; p2: Axis };
export type DuelActions = { p1?: () => void; p2?: () => void };

export type DuelInput = {
  /** Read every frame from the render loop. Never triggers a re-render. */
  axes: { current: DuelAxes };
};

export function useDuelInput(_active: boolean, _actions?: DuelActions): DuelInput {
  const axes = useRef<DuelAxes>({ p1: { x: 0, z: 0 }, p2: { x: 0, z: 0 } });
  return { axes };
}

/** Keyboard hints are only meaningful where there is a keyboard. */
export const HAS_KEYBOARD = false;

export const KEY_HINT = { p1: 'WASD', p2: 'Arrows' };
