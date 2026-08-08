/**
 * Persist a picked image — web.
 *
 * There is no document directory in a browser, so `expo-file-system` has
 * nothing to copy into and its legacy API is unavailable here. The picker hands
 * back either a `blob:` or a `data:` URL:
 *
 *   · `blob:` is scoped to the page session. Storing one would give an avatar
 *     that looks fine until the tab reloads and then renders as a broken image
 *     — the worst kind of bug, because the save looks successful.
 *   · `data:` is self-contained and survives, because the avatar URI is written
 *     into SQLite like any other player field.
 *
 * So a blob is read once and inlined. The picker is already asked for
 * `quality: 0.75` on a 1:1 crop, which keeps a typical result well inside the
 * size a row in `meta` should hold; anything larger than the cap below is
 * rejected rather than silently bloating every future save write.
 */

/** Refuse anything that would make the player row unreasonably large. */
const MAX_DATA_URL_BYTES = 1_500_000;

export async function persistPickedPhoto(sourceUri: string): Promise<string> {
  if (sourceUri.startsWith('data:')) {
    if (sourceUri.length > MAX_DATA_URL_BYTES) {
      throw new Error('Image too large');
    }
    return sourceUri;
  }

  const response = await fetch(sourceUri);
  const blob = await response.blob();
  if (blob.size > MAX_DATA_URL_BYTES) {
    throw new Error('Image too large');
  }

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read image'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}
