import { create } from 'zustand';
import type { GameState, GeneratorId } from './types';
import {
  advance,
  applyOffline,
  buyGenerator as engineBuyGenerator,
  buyUpgrade as engineBuyUpgrade,
  claimMilestone as engineClaimMilestone,
  createGame,
  doPrestige,
  prestigeGain,
  tap,
  validateState,
} from './engine';
import { loadSaveBlob, parseBlob, persistSaveBlob, wipeSave } from './save';

export type TycoonSettings = { sound: boolean; haptics: boolean };

type TycoonState = {
  state: GameState;
  hydrated: boolean;
  /** Offline earnings awaiting collection (welcome-back modal). */
  offlineGain: number;
  /** Offline seconds awaited (shown in the welcome-back modal). */
  offlineSeconds: number;
  settings: TycoonSettings;

  hydrate: () => Promise<void>;
  collectOffline: () => void;
  tap: () => void;
  advance: (seconds: number) => void;
  buyGenerator: (id: GeneratorId) => boolean;
  buyUpgrade: (id: string) => boolean;
  claimMilestone: (id: string) => boolean;
  prestige: () => void;
  setSetting: (key: keyof TycoonSettings, value: boolean) => void;
  reset: () => Promise<void>;
  saveNow: () => Promise<void>;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useTycoon = create<TycoonState>((set, get) => ({
  state: createGame(),
  hydrated: false,
  offlineGain: 0,
  offlineSeconds: 0,
  settings: { sound: true, haptics: true },

  hydrate: async () => {
    const blob = parseBlob(await loadSaveBlob());
    const base = blob.state;
    // Offline earnings are credited once on load.
    const { state, earned } = applyOffline(base);
    set((s) => ({
      state,
      settings: blob.settings,
      offlineGain: earned > 0 ? earned : s.offlineGain,
      offlineSeconds: earned > 0 ? Math.min((Date.now() - base.lastSeenAt) / 1000, 8 * 60 * 60) : 0,
      hydrated: true,
    }));
    void get().saveNow();
  },

  collectOffline: () => set({ offlineGain: 0, offlineSeconds: 0 }),

  tap: () => {
    const next = tap(get().state);
    set({ state: next });
    void get().saveNow();
  },

  advance: (seconds) => {
    const { state, earned } = advance(get().state, seconds);
    if (earned > 0) set({ state });
  },

  buyGenerator: (id) => {
    const next = engineBuyGenerator(get().state, id);
    if (!next) return false;
    set({ state: next });
    void get().saveNow();
    return true;
  },

  buyUpgrade: (id) => {
    const next = engineBuyUpgrade(get().state, id);
    if (!next) return false;
    set({ state: next });
    void get().saveNow();
    return true;
  },

  claimMilestone: (id) => {
    const next = engineClaimMilestone(get().state, id);
    if (!next) return false;
    set({ state: next });
    void get().saveNow();
    return true;
  },

  prestige: () => {
    const { state } = get();
    if (prestigeGain(state) <= 0) return;
    set({ state: doPrestige(state) });
    void get().saveNow();
  },

  setSetting: (key, value) => {
    set((s) => ({ settings: { ...s.settings, [key]: value } }));
    void get().saveNow();
  },

  reset: async () => {
    await wipeSave();
    const fresh = validateState(null);
    set({ state: fresh, offlineGain: 0, offlineSeconds: 0, settings: { sound: true, haptics: true } });
    await persistSaveBlob({
      version: fresh.version,
      settings: { sound: true, haptics: true },
      state: fresh,
    });
  },

  saveNow: async () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Debounce hot bursts (rapid tapping) — writes are cheap but no need to spam.
    saveTimer = setTimeout(() => {
      const { state, settings } = get();
      void persistSaveBlob({ version: state.version, settings, state });
    }, 400);
  },
}));

export const selectState = (s: TycoonState) => s.state;
