import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { persistRingsIfNeeded, useRings } from './store';

/**
 * Drives the rings sim at ~60fps using real wall-clock deltas (clamped), so
 * backgrounded tabs never fast-forward the ball. Persists best score on
 * background/hide and whenever the run ends.
 */
export function useRingsTicker() {
  const hydrate = useRings((s) => s.hydrate);
  const advance = useRings((s) => s.advance);
  const lastTick = useRef(Date.now());
  const lastSaved = useRef(0);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      if (dt > 0 && dt < 1) advance(dt);

      const st = useRings.getState().state;
      if (st.status === 'over' || st.levelUpFlash > 0) {
        if (now - lastSaved.current > 2000) {
          lastSaved.current = now;
          persistRingsIfNeeded(st);
        }
      }
    }, 16);

    const onHide = () => {
      lastTick.current = Date.now();
      persistRingsIfNeeded(useRings.getState().state);
    };
    const appSub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') onHide();
      else lastTick.current = Date.now();
    });

    return () => {
      clearInterval(id);
      appSub.remove();
    };
  }, [advance]);
}
