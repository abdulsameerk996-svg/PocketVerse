import * as FileSystem from 'expo-file-system/legacy';
import { uid } from '../utils/format';

/**
 * Persist a picked image and return a URI the app can render later.
 *
 * Native: copy it out of the picker's cache into the app's own document
 * directory, so the avatar survives the OS clearing that cache. Nothing is
 * uploaded and no network permission is used.
 */
export async function persistPickedPhoto(sourceUri: string): Promise<string> {
  const dir = `${FileSystem.documentDirectory}avatars/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${uid('av_')}.jpg`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}
