import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useTycoon } from './store';
import { syncSoundMute } from './sound';

/**
 * Drives the idle loop:
 *  - hydrate once on mount (credits offline earnings)
 *  - `advance` on a 250ms tick using real wall-clock deltas, so throttled
 *    timers in background tabs never lose or double-count income
 *  - autosave every 6s + flush on background/hide
 */
export function useTycoonTicker() {
  const hydrate = useTycoon((s) => s.hydrate);
  const advance = useTycoon((s) => s.advance);
  const saveNow = useTycoon((s) => s.saveNow);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    void hydrate();
    syncSoundMute();
  }, [hydrate]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTick.current) / 1000;
      lastTick.current = now;
      if (dt > 0 && dt < 60) advance(dt);
      syncSoundMute();
    }, 250);
    const saveId = setInterval(() => {
      void saveNow();
    }, 6000);

    const onHide = () => {
      lastTick.current = Date.now();
      void saveNow();
    };
    const appSub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') onHide();
      else lastTick.current = Date.now();
    });

    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') onHide();
      else lastTick.current = Date.now();
    };
    let visSub: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
      visSub = () => document.removeEventListener('visibilitychange', onVisibility);
    }

    return () => {
      clearInterval(id);
      clearInterval(saveId);
      appSub.remove();
      visSub?.();
    };
  }, [advance, saveNow]);
}
