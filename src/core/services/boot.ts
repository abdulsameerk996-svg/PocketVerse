import { getDb } from '../db/client';
import { allGames } from '../registry';
import { usePlayerStore } from '../state/playerStore';
import { useInventoryStore } from '../state/inventoryStore';
import { useProgressStore } from '../state/progressStore';
import { useSettingsStore } from '../state/settingsStore';
import { useGameSaveStore } from '../state/gameSaveStore';
import { startAutosave, flush } from '../save/saveService';
import { currentModifiers, grantReward } from './rewards';
import { toast } from '../state/uiStore';

/**
 * Boot sequence.
 *
 * Deterministic, ordered, and the only place that knows the order:
 *   1. open + migrate the database
 *   2. hydrate settings (needed before any haptic/sound fires)
 *   3. hydrate player, inventory, progress in parallel
 *   4. hydrate module saves (requires registry to be populated)
 *   5. run offline simulation for each module
 *   6. regen energy against wall-clock, start autosave
 */

export type BootResult = {
  offlineMs: number;
  notices: { gameId: string; text: string }[];
};

let bootPromise: Promise<BootResult> | null = null;

async function run(): Promise<BootResult> {
  await getDb();

  await useSettingsStore.getState().hydrate();

  await Promise.all([
    usePlayerStore.getState().hydrate(),
    useInventoryStore.getState().hydrate(),
    useProgressStore.getState().hydrate(),
  ]);

  await useGameSaveStore.getState().hydrate();

  const offlineMs = usePlayerStore.getState().offlineElapsedMs;
  const notices: BootResult['notices'] = [];

  // --- offline simulation --------------------------------------------------
  if (offlineMs > 30_000) {
    const saveStore = useGameSaveStore.getState();
    for (const mod of allGames()) {
      if (!mod.simulateOffline) continue;
      try {
        const current = saveStore.get(mod.id);
        const out = mod.simulateOffline(current, offlineMs);
        if (!out) continue;
        saveStore.set(mod.id, out.save);
        if (out.notice) notices.push({ gameId: mod.id, text: out.notice });
        if (out.reward) {
          grantReward(out.reward, {
            silent: true,
            label: `${mod.meta.title} · while you were away`,
            icon: mod.meta.glyph,
            gameId: mod.id,
          });
        }
      } catch (e) {
        if (__DEV__) console.warn(`[boot] offline sim failed for ${mod.id}`, e);
      }
    }
  }

  // --- energy regen --------------------------------------------------------
  usePlayerStore.getState().tickEnergy(1 + currentModifiers().energyRegen);

  startAutosave();
  await flush();

  if (notices.length) {
    toast({
      title: 'While you were away',
      subtitle: notices[0].text,
      glyph: '🌙',
      tone: 'default',
    });
  }

  return { offlineMs, notices };
}

export function bootstrap(): Promise<BootResult> {
  if (!bootPromise) bootPromise = run();
  return bootPromise;
}

/** Full progress wipe — used by Settings ▸ Reset. */
export async function hardReset() {
  const { wipeDatabase } = await import('../db/client');
  await wipeDatabase();
  usePlayerStore.getState().reset();
  useInventoryStore.getState().reset();
  useProgressStore.getState().reset();
  useGameSaveStore.getState().reset();
  useSettingsStore.getState().reset();
  await flush();
  bootPromise = null;
  await bootstrap();
}
