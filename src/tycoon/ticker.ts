import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useTycoon } from './store';

const TICK_MS = 16; // ~60 fps
const SAVE_INTERVAL_MS = 5_000;

/**
 * Drives the tycoon simulation and world at ~60fps while the app is in the
 * foreground. Pauses on background, catches up on resume (capped by the
 * offline guard in the engine).
 */
export function useTycoonTicker() {
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(performance.now());
  const saveRef = useRef(0);

  useEffect(() => {
    let running = true;

    const tick = (now: number) => {
      if (!running) return;

      const dt = Math.min((now - lastRef.current) / 1000, 0.5);
      lastRef.current = now;

      useTycoon.getState().advance(dt);
      useTycoon.getState().tickWorld(dt);

      saveRef.current += dt * 1000;
      if (saveRef.current > SAVE_INTERVAL_MS) {
        saveRef.current = 0;
        void useTycoon.getState().saveNow();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    const onApp = (s: AppStateStatus) => {
      if (s === 'active') {
        lastRef.current = performance.now();
      } else {
        void useTycoon.getState().saveNow();
      }
    };

    const sub = AppState.addEventListener('change', onApp);

    return () => {
      running = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      sub.remove();
      void useTycoon.getState().saveNow();
    };
  }, []);
}
