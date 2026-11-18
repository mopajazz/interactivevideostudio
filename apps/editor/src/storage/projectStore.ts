import { clear, createStore, del, entries, get, set } from 'idb-keyval';
import { validateProject, type Project } from '@ivt/schema';

// One named database, so nothing else on the origin can collide with it.
const store = createStore('ivt-editor', 'kv');
const ASSET = 'asset:';

export type Step = 1 | 2 | 3;

export async function saveProject(p: Project): Promise<void> {
  await set('project', p, store);
}

/** The saved project, or null when there is none or it is not a valid project. */
export async function loadProject(): Promise<Project | null> {
  const raw = await get('project', store);
  if (raw === undefined) return null;
  const r = validateProject(raw);
  return r.ok ? r.project : null;
}

export async function saveStep(step: Step): Promise<void> {
  await set('step', step, store);
}

export async function loadStep(): Promise<Step> {
  const s = await get('step', store);
  return s === 2 || s === 3 ? s : 1;
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  await set(ASSET + id, blob, store);
}

export async function deleteAsset(id: string): Promise<void> {
  await del(ASSET + id, store);
}

export async function loadAssets(): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>();
  for (const [k, v] of await entries(store)) {
    if (typeof k === 'string' && k.startsWith(ASSET) && v instanceof Blob) out.set(k.slice(ASSET.length), v);
  }
  return out;
}

/** Forget everything: project, step and images. */
export async function clearAll(): Promise<void> {
  await clear(store);
}
