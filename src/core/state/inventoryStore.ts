import { create } from 'zustand';
import type { InventoryEntry } from '../types';
import { inventoryRepo, unlockRepo } from '../db/repositories';
import { markDirty, registerChannel } from '../save/saveService';
import { STARTER_UNLOCKS } from '@/content/items';
import { getItem } from '@/content/catalog';

const CHANNEL = 'inventory';

type InventoryStore = {
  entries: Record<string, InventoryEntry>;
  /** Cosmetics/vehicles the player owns (non-stacking permanent unlocks). */
  unlocks: Record<string, true>;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  persist: () => Promise<void>;

  add: (itemId: string, qty?: number) => void;
  addMany: (items: Record<string, number>) => void;
  remove: (itemId: string, qty?: number) => boolean;
  count: (itemId: string) => number;
  has: (itemId: string, qty?: number) => boolean;

  unlock: (itemId: string) => void;
  unlockMany: (ids: string[]) => void;
  isUnlocked: (itemId: string) => boolean;

  markSeen: (itemId: string) => void;
  markAllSeen: () => void;
  newCount: () => number;

  reset: () => void;
};

/** Ids touched since last flush — keeps writes proportional to change, not size. */
let dirtyItems = new Set<string>();
let dirtyUnlocks = new Set<string>();

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  entries: {},
  unlocks: {},
  hydrated: false,

  hydrate: async () => {
    const [list, unlocked] = await Promise.all([inventoryRepo.all(), unlockRepo.all()]);
    const entries: Record<string, InventoryEntry> = {};
    for (const e of list) entries[e.itemId] = e;
    const unlocks: Record<string, true> = {};
    for (const id of unlocked) unlocks[id] = true;

    // Grant starter cosmetics exactly once.
    let changed = false;
    for (const id of STARTER_UNLOCKS) {
      if (!unlocks[id]) {
        unlocks[id] = true;
        dirtyUnlocks.add(id);
        changed = true;
      }
    }
    set({ entries, unlocks, hydrated: true });
    if (changed) markDirty(CHANNEL);
  },

  persist: async () => {
    const { entries } = get();
    const items = [...dirtyItems].map((id) => entries[id]).filter(Boolean) as InventoryEntry[];
    const unlocks = [...dirtyUnlocks];
    if (!items.length && !unlocks.length) return;

    await inventoryRepo.upsertMany(items);
    await unlockRepo.addMany(unlocks);

    // Clear only what was actually written, and only once it *is* written.
    // Clearing up front looks harmless and is not: if the write fails, the save
    // service re-queues this channel but the ids are gone, so the retry writes
    // an empty array and reports success. That is how a reward can vanish with
    // no error anywhere. Deleting per id also preserves anything marked dirty
    // while the await was in flight.
    for (const e of items) dirtyItems.delete(e.itemId);
    for (const id of unlocks) dirtyUnlocks.delete(id);
  },

  add: (itemId, qty = 1) => {
    if (qty === 0) return;
    const def = getItem(itemId);
    // Non-stackable items behave as unlocks, never as inventory piles.
    if (!def.stackable) {
      get().unlock(itemId);
      return;
    }
    set((s) => {
      const prev = s.entries[itemId];
      const next: InventoryEntry = prev
        ? { ...prev, qty: Math.max(0, prev.qty + qty), seen: prev.seen && qty <= 0 }
        : { itemId, qty: Math.max(0, qty), acquiredAt: Date.now(), seen: false };
      return { entries: { ...s.entries, [itemId]: next } };
    });
    dirtyItems.add(itemId);
    markDirty(CHANNEL);
  },

  addMany: (items) => {
    for (const [id, qty] of Object.entries(items)) get().add(id, qty);
  },

  remove: (itemId, qty = 1) => {
    const entry = get().entries[itemId];
    if (!entry || entry.qty < qty) return false;
    set((s) => ({
      entries: { ...s.entries, [itemId]: { ...entry, qty: entry.qty - qty } },
    }));
    dirtyItems.add(itemId);
    markDirty(CHANNEL);
    return true;
  },

  count: (itemId) => get().entries[itemId]?.qty ?? 0,
  has: (itemId, qty = 1) => (get().entries[itemId]?.qty ?? 0) >= qty,

  unlock: (itemId) => {
    if (get().unlocks[itemId]) return;
    set((s) => ({ unlocks: { ...s.unlocks, [itemId]: true } }));
    dirtyUnlocks.add(itemId);
    markDirty(CHANNEL);
  },

  unlockMany: (ids) => {
    for (const id of ids) get().unlock(id);
  },

  isUnlocked: (itemId) => !!get().unlocks[itemId],

  markSeen: (itemId) => {
    const e = get().entries[itemId];
    if (!e || e.seen) return;
    set((s) => ({ entries: { ...s.entries, [itemId]: { ...e, seen: true } } }));
    dirtyItems.add(itemId);
    markDirty(CHANNEL);
  },

  markAllSeen: () => {
    const entries = { ...get().entries };
    let changed = false;
    for (const [id, e] of Object.entries(entries)) {
      if (!e.seen) {
        entries[id] = { ...e, seen: true };
        dirtyItems.add(id);
        changed = true;
      }
    }
    if (changed) {
      set({ entries });
      markDirty(CHANNEL);
    }
  },

  newCount: () =>
    Object.values(get().entries).filter((e) => !e.seen && e.qty > 0).length,

  reset: () => {
    set({ entries: {}, unlocks: {} });
    dirtyItems = new Set();
    dirtyUnlocks = new Set();
  },
}));

registerChannel(CHANNEL, () => useInventoryStore.getState().persist());
