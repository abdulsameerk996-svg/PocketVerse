import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

/**
 * Neon Rings save — just best score + best level reached. One tiny blob,
 * separate from the tycoon's save so neither game can corrupt the other.
 */

export const RINGS_SAVE_KEY = 'neon-rings-save-v1';

export interface RingsSaveBlob {
  version: number;
  best: number;
  bestLevel: number;
}

function saveFile(): File {
  return new File(Paths.document, 'neon-rings-save.json');
}

export async function loadRingsSave(): Promise<RingsSaveBlob | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RINGS_SAVE_KEY) : null;
      if (!raw) return null;
      return JSON.parse(raw) as RingsSaveBlob;
    }
    const file = saveFile();
    if (!file.exists) return null;
    return JSON.parse(file.textSync()) as RingsSaveBlob;
  } catch {
    return null;
  }
}

export async function persistRingsSave(blob: RingsSaveBlob): Promise<void> {
  try {
    const raw = JSON.stringify(blob);
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(RINGS_SAVE_KEY, raw);
      return;
    }
    const file = saveFile();
    file.write(raw);
  } catch {
    /* best-effort */
  }
}
