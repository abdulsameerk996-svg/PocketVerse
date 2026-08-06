import { create } from 'zustand';
import type { Settings } from '../types';
import { metaRepo } from '../db/repositories';
import { markDirty, registerChannel } from '../save/saveService';

const CHANNEL = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  haptics: true,
  sound: true,
  music: true,
  reducedMotion: false,
  highContrast: false,
  showFps: false,
  leftHanded: false,
};

type SettingsStore = {
  settings: Settings;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  toggle: (key: keyof Settings) => void;
  reset: () => void;
};

export const useSettingsStore = create<SettingsStore>((setState, get) => ({
  settings: DEFAULT_SETTINGS,
  hydrated: false,

  hydrate: async () => {
    const saved = await metaRepo.getSettings();
    setState({ settings: { ...DEFAULT_SETTINGS, ...(saved ?? {}) }, hydrated: true });
  },

  persist: async () => {
    await metaRepo.saveSettings(get().settings);
  },

  set: (key, value) => {
    setState((s) => ({ settings: { ...s.settings, [key]: value } }));
    markDirty(CHANNEL);
  },

  toggle: (key) => {
    setState((s) => ({ settings: { ...s.settings, [key]: !s.settings[key] } }));
    markDirty(CHANNEL);
  },

  reset: () => {
    setState({ settings: DEFAULT_SETTINGS });
    markDirty(CHANNEL);
  },
}));

registerChannel(CHANNEL, () => useSettingsStore.getState().persist());

/** Non-reactive read for use inside worklets/imperative helpers. */
export const getSettings = () => useSettingsStore.getState().settings;
