/**
 * Extra "write now" triggers beyond the AppState listener in `saveService`.
 *
 * Native needs none: AppState's background transition already covers every way
 * an app leaves the foreground. The web build overrides this file.
 */
export function installExtraFlushTriggers(_flush: () => void): () => void {
  return () => {};
}
