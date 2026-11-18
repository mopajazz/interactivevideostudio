import { validateProject, type Project } from '@ivt/schema';
import { IMAGE_EXT, idMatchesType } from './assetIds';

/** File format: `{ format, project, assets: { [id]: { type, base64 } } }`. Images travel inside the JSON. */
const FORMAT = 'ivt-project';

const CHUNK = 0x8000;
function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64); // throws on invalid input
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function exportProjectJson(p: Project, assets: Map<string, Blob>): Promise<Blob> {
  const out: Record<string, { type: string; base64: string }> = {};
  for (const [id, blob] of assets) out[id] = { type: blob.type, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) };
  return new Blob([JSON.stringify({ format: FORMAT, project: p, assets: out }, null, 2)], { type: 'application/json' });
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a file written by exportProjectJson. Rejects with a message fit to show the author. */
export async function importProjectJson(file: Blob): Promise<{ project: Project; assets: Map<string, Blob> }> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error("This file isn't valid JSON, so it can't be opened as a project.");
  }
  if (!isRec(json) || !isRec(json.project)) throw new Error("This file doesn't contain a project.");

  const r = validateProject(json.project);
  if (!r.ok) {
    const more = r.errors.length > 3 ? ` (and ${r.errors.length - 3} more)` : '';
    throw new Error(`This project file has problems: ${r.errors.slice(0, 3).join('; ')}${more}.`);
  }

  const assets = new Map<string, Blob>();
  const raw = json.assets ?? {};
  if (!isRec(raw)) throw new Error('This project file has a damaged image list.');
  for (const [id, entry] of Object.entries(raw)) {
    const damaged = () => new Error(`This project file has a damaged image ("${id.slice(0, 40)}").`);
    if (!isRec(entry) || typeof entry.type !== 'string' || typeof entry.base64 !== 'string') throw damaged();
    if (!IMAGE_EXT[entry.type] || !idMatchesType(id, entry.type)) throw damaged();
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      bytes = fromBase64(entry.base64);
    } catch {
      throw damaged();
    }
    assets.set(id, new Blob([bytes], { type: entry.type }));
  }
  return { project: r.project, assets };
}
