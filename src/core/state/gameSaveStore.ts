import { create } from 'zustand';
import type { GameId } from '../types';
import { gameStateRepo } from '../db/repositories';
import { markDirty, registerChannel } from '../save/saveService';
import { allGames, getGame } from '../registry';

const CHANNEL = 'gamesave';

/**
 * Per-module persisted state.
 *
 * Each game owns an opaque JSON blob. The core never inspects it — it only
 * stores, hydrates and hands it back. This is what lets a module evolve its own
 * data model without a core migration.
 */

type GameSaveStore = {
  saves: Partial<Record<GameId, unknown>>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  get: <T = unknown>(id: GameId) => T;
  set: (id: GameId, updater: unknown | ((prev: any) => any)) => void;
  reset: () => void;
};

let dirty = new Set<GameId>();

export const useGameSaveStore = create<GameSaveStore>((set, get) => ({
  saves: {},
  hydrated: false,

  hydrate: async () => {
    const stored = (await gameStateRepo.all()) as Partial<Record<GameId, unknown>>;
    const saves: Partial<Record<GameId, unknown>> = {};
    for (const mod of allGames()) {
      const def = mod.defaultSave?.() ?? {};
      const existing = stored[mod.id];
      // Shallow-merge defaults so new fields in a module update are populated.
      saves[mod.id] =
        existing && typeof existing === 'object' && !Array.isArray(existing)
          ? { ...(def as object), ...(existing as object) }
          : (existing ?? def);
    }
    set({ saves, hydrated: true });
  },

  persist: async () => {
    const { saves } = get();
    const ids = [...dirty];
    dirty = new Set();
    await Promise.all(ids.map((id) => gameStateRepo.set(id, saves[id] ?? {})));
  },

  get: <T,>(id: GameId) => {
    const v = get().saves[id];
    if (v !== undefined) return v as T;
    return (getGame(id)?.defaultSave?.() ?? {}) as T;
  },

  set: (id, updater) => {
    set((s) => {
      const prev = s.saves[id] ?? getGame(id)?.defaultSave?.() ?? {};
      const next = typeof updater === 'function' ? (updater as (p: any) => any)(prev) : updater;
      return { saves: { ...s.saves, [id]: next } };
    });
    dirty.add(id);
    markDirty(CHANNEL);
  },

  reset: () => {
    const saves: Partial<Record<GameId, unknown>> = {};
    for (const mod of allGames()) saves[mod.id] = mod.defaultSave?.() ?? {};
    set({ saves });
    dirty = new Set(Object.keys(saves) as GameId[]);
    markDirty(CHANNEL);
  },
}));

registerChannel(CHANNEL, () => useGameSaveStore.getState().persist());
