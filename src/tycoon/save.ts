import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import type { GameState } from './types';
import { SAVE_VERSION, validateState } from './engine';

/**
 * Save adapter — one JSON blob, `{ version, settings, state }`.
 *
 * Web: localStorage. Native: a single JSON file in the document directory
 * (survives restarts; SQLite is not needed for one game).
 */

export const SAVE_KEY = 'donut-tycoon-save-v1';

export interface SaveBlob {
  version: number;
  settings: { sound: boolean; haptics: boolean };
  state: GameState;
}

function saveFile(): File {
  return new File(Paths.document, 'donut-tycoon-save.json');
}

export async function loadSaveBlob(): Promise<SaveBlob | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null;
      if (!raw) return null;
      return JSON.parse(raw) as SaveBlob;
    }
    const file = saveFile();
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as SaveBlob;
  } catch {
    return null;
  }
}

export async function persistSaveBlob(blob: SaveBlob): Promise<void> {
  try {
    const raw = JSON.stringify(blob);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, raw);
      return;
    }
    const file = saveFile();
    file.write(raw);
  } catch {
    /* best-effort persistence — never crash the game over a write */
  }
}

export async function wipeSave(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(SAVE_KEY);
      return;
    }
    const file = saveFile();
    if (file.exists) file.delete();
  } catch {
    /* best-effort */
  }
}

/** Parse a blob defensively and sanitise the embedded state. */
export function parseBlob(raw: unknown): SaveBlob {
  const fallbackSettings = { sound: true, haptics: true };
  if (!raw || typeof raw !== 'object') {
    return { version: SAVE_VERSION, settings: fallbackSettings, state: validateState(null) };
  }
  const b = raw as Partial<SaveBlob>;
  const settings = { ...fallbackSettings, ...(b.settings ?? {}) };
  settings.sound = !!settings.sound;
  settings.haptics = !!settings.haptics;
  return { version: SAVE_VERSION, settings, state: validateState(b.state) };
}
