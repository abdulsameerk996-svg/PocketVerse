/**
 * Keyboard controls — native no-op.
 *
 * Phones have no keyboard, and pulling `window` listeners into a native build
 * would be dead weight. The web build overrides this file; every call site is
 * written so that doing nothing here is correct behaviour, not a missing
 * feature.
 */

export type KeyAxisHandler = (x: number, y: number) => void;
export type KeyPressMap = Record<string, () => void>;

/** WASD / arrow keys as a normalised -1..1 axis. */
export function useKeyAxis(_active: boolean, _onAxis: KeyAxisHandler) {}

/** Discrete key presses, keyed by `KeyboardEvent.key`. */
export function useKeyPress(_active: boolean, _handlers: KeyPressMap) {}

/** True when the player is on a device where keyboard hints make sense. */
export const HAS_KEYBOARD = false;
