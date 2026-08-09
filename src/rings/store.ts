import { create } from 'zustand';
import { createRun, step, tap, validateState, type RingsState } from './logic';
import { loadRingsSave, persistRingsSave, type RingsSaveBlob } from './save';

type RingsStore = {
  state: RingsState;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  tap: () => void;
  advance: (seconds: number) => void;
  retry: () => void;
  backToHub: () => void;
};

export const useRings = create<RingsStore>((set, get) => ({
  state: createRun(1, 0, 1),
  hydrated: false,

  hydrate: async () => {
    const saved = await loadRingsSave();
    const best = saved && typeof saved === 'object' ? validateState(saved) : { best: 0, bestLevel: 1 };
    set((s) => ({
      state: { ...s.state, best: best.best, bestLevel: best.bestLevel },
      hydrated: true,
    }));
  },

  tap: () => {
    set((s) => ({ state: tap(s.state) }));
  },

  advance: (seconds) => {
    set((s) => ({ state: step(s.state, seconds) }));
  },

  retry: () => {
    const { best, bestLevel } = get().state;
    set({ state: createRun(1, best, bestLevel) });
  },

  backToHub: () => {
    // Called from the game-over overlay; navigation lives in the screen.
  },
}));

/** Persist best score/level whenever the run ends or improves. */
export function persistRingsIfNeeded(state: RingsState) {
  const blob: RingsSaveBlob = { version: state.version, best: state.best, bestLevel: state.bestLevel };
  void persistRingsSave(blob);
}
