import { useEffect } from 'react';

/**
 * The web flavour of the back guard.
 *
 * Two deliberate differences from native:
 *
 * 1. **Escape pauses.** On a desktop browser there is no hardware back button,
 *    and Escape is the key every player already tries. It maps to exactly what
 *    Android's back button does mid-run: open the pause sheet.
 *
 * 2. **The browser's Back button is not intercepted.** It would be easy to
 *    trap it with a sentinel `history.pushState` entry, and it would be wrong:
 *    breaking Back is hostile, it fights Expo Router's own history handling,
 *    and a trapped Back button is a far worse bug than a lost run. Back
 *    navigates, as it does everywhere else on the web. The save service
 *    flushes on `pagehide` (see `flushTriggers.web.ts`), so progress banked
 *    before the run is never at risk — only the current run is.
 *
 * This also replaces the plain `BackHandler` call, which on react-native-web is
 * a stub that logs "BackHandler is not supported on web" to the console every
 * single time a game opens.
 */
export function useBackGuard(active: boolean, onBack: () => boolean) {
  useEffect(() => {
    if (!active) return;
    if (typeof window === 'undefined') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return;
      if (onBack()) e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, onBack]);
}
