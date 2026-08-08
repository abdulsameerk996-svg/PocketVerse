import { useEffect, useRef } from 'react';

/**
 * ============================================================================
 *  TWO-PLAYER INPUT — WEB
 * ============================================================================
 *
 * One keyboard, two players, sharing a desk:
 *
 *   Player 1   W A S D      action: Space / Left Shift
 *   Player 2   Arrow keys   action: Enter / Right Shift / Numpad 0
 *
 * The axes live in a ref rather than React state. A game loop reads them every
 * frame; putting them in state would re-render the whole scene sixty times a
 * second and defeat the point of driving three.js imperatively.
 *
 * Details that matter for a shared keyboard:
 *   · `preventDefault` on the arrows and space, or player 2 scrolls the page
 *     and player 1 activates whatever has focus;
 *   · auto-repeat is ignored for actions, so holding a key is not a machine gun;
 *   · `blur` releases everything, or a key held while alt-tabbing sticks down
 *     and a player drifts into a wall forever.
 */

export type Axis = { x: number; z: number };
export type DuelAxes = { p1: Axis; p2: Axis };
export type DuelActions = { p1?: () => void; p2?: () => void };

export type DuelInput = {
  axes: { current: DuelAxes };
};

const P1 = { left: ['a', 'A'], right: ['d', 'D'], up: ['w', 'W'], down: ['s', 'S'] };
const P2 = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
};
const P1_ACTION = [' ', 'Shift_L', 'f', 'F'];
const P2_ACTION = ['Enter', 'Shift_R', '0'];

const ALL_MOVE = new Set([
  ...P1.left, ...P1.right, ...P1.up, ...P1.down,
  ...P2.left, ...P2.right, ...P2.up, ...P2.down,
]);

/** Distinguish the two Shift keys, which is what makes them usable as actions. */
function keyId(e: KeyboardEvent): string {
  if (e.key === 'Shift') return e.location === 2 ? 'Shift_R' : 'Shift_L';
  if (e.code === 'Numpad0') return '0';
  return e.key;
}

export function useDuelInput(active: boolean, actions?: DuelActions): DuelInput {
  const axes = useRef<DuelAxes>({ p1: { x: 0, z: 0 }, p2: { x: 0, z: 0 } });
  const act = useRef(actions);
  useEffect(() => {
    act.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const held = new Set<string>();

    const recompute = () => {
      for (const [key, map] of [['p1', P1], ['p2', P2]] as const) {
        let x = 0;
        let z = 0;
        if (map.left.some((k) => held.has(k))) x -= 1;
        if (map.right.some((k) => held.has(k))) x += 1;
        if (map.up.some((k) => held.has(k))) z -= 1;
        if (map.down.some((k) => held.has(k))) z += 1;
        // Normalise so diagonals are not faster than the cardinals.
        const len = Math.hypot(x, z);
        if (len > 1) {
          x /= len;
          z /= len;
        }
        axes.current[key].x = x;
        axes.current[key].z = z;
      }
    };

    const onDown = (e: KeyboardEvent) => {
      const id = keyId(e);
      const isMove = ALL_MOVE.has(id);
      const isAction = P1_ACTION.includes(id) || P2_ACTION.includes(id);
      if (!isMove && !isAction) return;
      e.preventDefault();
      if (e.repeat) return;

      if (isMove) {
        held.add(id);
        recompute();
        return;
      }
      if (P1_ACTION.includes(id)) act.current?.p1?.();
      else act.current?.p2?.();
    };

    const onUp = (e: KeyboardEvent) => {
      const id = keyId(e);
      if (!ALL_MOVE.has(id)) return;
      held.delete(id);
      recompute();
    };

    const release = () => {
      if (!held.size) return;
      held.clear();
      recompute();
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
      release();
    };
  }, [active]);

  return { axes };
}

export const HAS_KEYBOARD =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

export const KEY_HINT = { p1: 'WASD', p2: 'Arrows' };
