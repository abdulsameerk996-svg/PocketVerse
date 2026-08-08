/**
 * Web flush triggers.
 *
 * The save service is write-behind with a 1.2 s debounce — on native that costs
 * at most 1.2 s of progress in a crash, which is the deal it was designed to
 * make. On the web the same debounce is a worse bet: closing a tab is instant,
 * one keystroke away, and something players do constantly. AppState's
 * `visibilitychange` mapping covers tab switches but not a close.
 *
 * `pagehide` is the reliable one. `beforeunload` does not fire on mobile Safari
 * or on a backgrounded tab that gets discarded, and `unload` is being removed
 * from browsers; `pagehide` fires in all of those cases, including bfcache
 * eviction. `visibilitychange → hidden` is the belt to its braces on mobile,
 * where a tab is often killed without ever firing `pagehide` in the foreground.
 *
 * Both fire the same flush, which is idempotent and cheap when nothing is
 * dirty, so double-firing costs nothing.
 */
export function installExtraFlushTriggers(flush: () => void): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const onPageHide = () => flush();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flush();
  };

  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    window.removeEventListener('pagehide', onPageHide);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
