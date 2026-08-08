/**
 * Audio backend — native.
 *
 * Still silent, exactly as before. `docs/ASSETS.md` describes the intended
 * native implementation (drop files into `assets/audio/`, install `expo-audio`,
 * register a sink); nothing here changes that plan or the current behaviour.
 *
 * The web build overrides this file with a synthesised backend.
 */
export function installSound() {
  /* no-op: see docs/ASSETS.md */
}
