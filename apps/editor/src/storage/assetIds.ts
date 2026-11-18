/** Image types the editor stores, and the lowercase extension each asset id ends in. */
export const IMAGE_EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** `<12 url-safe chars>.<ext>`: safe as a file name inside the export (`assets/<id>`). */
export const ASSET_ID = /^[A-Za-z0-9_-]{12}\.(webp|jpg|png)$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function newAssetId(type: string): string {
  const ext = IMAGE_EXT[type];
  if (!ext) throw new Error(`Unsupported image type "${type}"`);
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let id = '';
  for (const b of bytes) id += ALPHABET[b & 63];
  return `${id}.${ext}`;
}

/** True when the id's extension matches its blob type (what the exporter relies on). */
export const idMatchesType = (id: string, type: string) => ASSET_ID.test(id) && id.endsWith(`.${IMAGE_EXT[type] ?? '\0'}`);
