import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Intercept "go back" while a run is in progress.
 *
 * `onBack` returns true if it handled the gesture (and the app should stay
 * put), false to let the default happen.
 *
 * Native: the Android hardware/gesture back button.
 * Web: see `useBackGuard.web.ts` — the browser's back button is deliberately
 * *not* hijacked there, so the two platforms differ on purpose.
 */
export function useBackGuard(active: boolean, onBack: () => boolean) {
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [active, onBack]);
}
