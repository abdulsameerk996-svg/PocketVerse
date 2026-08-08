import { useEffect, useRef } from 'react';

/**
 * ============================================================================
 *  KEYBOARD CONTROLS — WEB
 * ============================================================================
 *
 * PocketVerse's controls were designed for a thumb: a virtual stick in Last
 * Signal, swipes in Neon Sprint. Those still work with a mouse on desktop
 * (react-native-gesture-handler maps pointer events to pans), but holding a
 * mouse button down to steer is genuinely worse than WASD, so the games that
 * want a keyboard get one.
 *
 * Deliberate details:
 *   · Handlers live in refs, so a game can pass an inline arrow function
 *     without re-subscribing the window listener on every render.
 *   · `preventDefault` on the movement and action keys, or arrows and space
 *     scroll the page mid-run.
 *   · Auto-repeat is ignored for discrete presses; a held key must not fire
 *     "jump" sixty times a second.
 *   · Listeners are removed on blur so a key held while tabbing away does not
 *     stay stuck down.
 */

export type KeyAxisHandler = (x: number, y: number) => void;
export type KeyPressMap = Record<string, () => void>;

const LEFT = ['ArrowLeft', 'a', 'A'];
const RIGHT = ['ArrowRight', 'd', 'D'];
const UP = ['ArrowUp', 'w', 'W'];
const DOWN = ['ArrowDown', 's', 'S'];
const AXIS_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN]);

/**
 * WASD / arrow keys as a normalised -1..1 axis, with `y` pointing down to match
 * screen space (and therefore the pan gestures these stand in for).
 *
 * `onAxis` fires only when the vector changes, not per frame.
 */
export function useKeyAxis(active: boolean, onAxis: KeyAxisHandler) {
  const handler = useRef(onAxis);
  useEffect(() => {
    handler.current = onAxis;
  }, [onAxis]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;

    const held = new Set<string>();
    let lastX = 0;
    let lastY = 0;

    const emit = () => {
      let x = 0;
      let y = 0;
      for (const k of held) {
        if (LEFT.includes(k)) x -= 1;
        else if (RIGHT.includes(k)) x += 1;
        else if (UP.includes(k)) y -= 1;
        else if (DOWN.includes(k)) y += 1;
      }
      // Normalise so diagonals are not faster than the cardinals — the pan
      // stick these replace is clamped to a circle for the same reason.
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      if (x === lastX && y === lastY) return;
      lastX = x;
      lastY = y;
      handler.current(x, y);
    };

    const onDown = (e: KeyboardEvent) => {
      if (!AXIS_KEYS.has(e.key)) return;
      e.preventDefault();
      if (e.repeat) return;
      held.add(e.key);
      emit();
    };
    const onUp = (e: KeyboardEvent) => {
      if (!AXIS_KEYS.has(e.key)) return;
      held.delete(e.key);
      emit();
    };
    const release = () => {
      if (!held.size) return;
      held.clear();
      emit();
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
}

/** Discrete key presses, keyed by `KeyboardEvent.key`. Repeats are ignored. */
export function useKeyPress(active: boolean, handlers: KeyPressMap) {
  const map = useRef(handlers);
  useEffect(() => {
    map.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const onDown = (e: KeyboardEvent) => {
      const fn = map.current[e.key];
      if (!fn) return;
      e.preventDefault();
      if (e.repeat) return;
      fn();
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [active]);
}

/**
 * Whether to show keyboard hints. A touchscreen laptop reports both, so this
 * asks "is a mouse the primary pointer" rather than "is this desktop".
 */
export const HAS_KEYBOARD =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;
