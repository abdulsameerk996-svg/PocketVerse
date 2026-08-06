import { AppState, type AppStateStatus } from 'react-native';

/**
 * Write-behind save scheduler.
 *
 * Stores are the in-memory source of truth during play; SQLite is durable
 * storage. Every mutation marks a channel dirty, and this service flushes at
 * most once per `FLUSH_MS` — plus immediately on background/blur. That keeps
 * frames free of I/O while guaranteeing at-most-1.2s of data loss on a crash.
 */

const FLUSH_MS = 1200;

type Flusher = () => Promise<void>;

const channels = new Map<string, Flusher>();
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let appStateSub: { remove: () => void } | null = null;

export function registerChannel(name: string, flush: Flusher) {
  channels.set(name, flush);
}

export function markDirty(name: string) {
  dirty.add(name);
  schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

export async function flush(): Promise<void> {
  if (flushing) return;
  if (!dirty.size) return;
  flushing = true;
  const pending = [...dirty];
  dirty.clear();
  try {
    await Promise.all(
      pending.map(async (name) => {
        const fn = channels.get(name);
        if (!fn) return;
        try {
          await fn();
        } catch (e) {
          // Re-queue on failure so data is not silently dropped.
          dirty.add(name);
          if (__DEV__) console.warn(`[save] channel "${name}" failed`, e);
        }
      }),
    );
  } finally {
    flushing = false;
    if (dirty.size) schedule();
  }
}

/** Flush immediately when the app is backgrounded or closed. */
export function startAutosave() {
  if (appStateSub) return;
  const onChange = (state: AppStateStatus) => {
    if (state !== 'active') void flush();
  };
  appStateSub = AppState.addEventListener('change', onChange);
}

export function stopAutosave() {
  appStateSub?.remove();
  appStateSub = null;
  if (timer) clearTimeout(timer);
  timer = null;
}
