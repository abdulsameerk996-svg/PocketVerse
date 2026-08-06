import { create } from 'zustand';
import type { RewardBundle } from '../types';
import { uid } from '../utils/format';

/**
 * Transient UI state — toasts, floating reward pops, level-up celebrations.
 * Never persisted. Games and services push into it; the root layout renders it.
 */

export type Toast = {
  id: string;
  title: string;
  subtitle?: string;
  glyph?: string;
  tone: 'default' | 'success' | 'warn' | 'reward';
  ttl: number;
};

export type Celebration =
  | { kind: 'levelUp'; level: number; reward?: RewardBundle }
  | { kind: 'achievement'; title: string; tier: number; icon: string; reward?: RewardBundle }
  | { kind: 'reward'; title: string; reward: RewardBundle };

type UiStore = {
  toasts: Toast[];
  celebrations: Celebration[];
  /** Set while a full-screen game surface is mounted (hides tab bar chrome). */
  inGame: boolean;

  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void;
  dismissToast: (id: string) => void;

  celebrate: (c: Celebration) => void;
  popCelebration: () => void;

  setInGame: (v: boolean) => void;
};

export const useUiStore = create<UiStore>((set, get) => ({
  toasts: [],
  celebrations: [],
  inGame: false,

  toast: (t) => {
    const toast: Toast = { id: uid('t_'), ttl: t.ttl ?? 2600, ...t };
    set((s) => ({ toasts: [...s.toasts.slice(-2), toast] }));
    setTimeout(() => get().dismissToast(toast.id), toast.ttl);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  celebrate: (c) => set((s) => ({ celebrations: [...s.celebrations, c] })),

  popCelebration: () => set((s) => ({ celebrations: s.celebrations.slice(1) })),

  setInGame: (v) => set({ inGame: v }),
}));

/** Imperative helpers — safe to call from services, not just components. */
export const toast = (t: Parameters<UiStore['toast']>[0]) => useUiStore.getState().toast(t);
export const celebrate = (c: Celebration) => useUiStore.getState().celebrate(c);
