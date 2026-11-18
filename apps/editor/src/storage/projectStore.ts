import { clear, createStore, del, entries, get, set } from 'idb-keyval';
import { validateProject, type Project } from '@ivt/schema';

// One named database, so nothing else on the origin can collide with it.
const store = createStore('ivt-editor', 'kv');
const ASSET = 'asset:';
/** A saved project that failed validation, kept until the author downloads or discards it. */
const BACKUP = 'project:backup-corrupt';

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

export type Session = { project: Project | null; step: Step; assets: Map<string, Blob>; corrupt: boolean; hasBackup: boolean };

/**
 * Everything saved, for startup. A stored project that is not valid is copied to the backup key first, so the
 * next autosave cannot destroy it. Rejects when IndexedDB is unavailable.
 */
export async function loadSession(): Promise<Session> {
  const raw = await get('project', store);
  const checked = raw === undefined ? null : validateProject(raw);
  const corrupt = checked !== null && !checked.ok;
  if (corrupt) await set(BACKUP, raw, store);
  const [step, assets, backup] = await Promise.all([loadStep(), loadAssets(), get(BACKUP, store)]);
  return { project: checked?.ok ? checked.project : null, step, assets, corrupt, hasBackup: backup !== undefined };
}

export async function loadCorruptBackup(): Promise<unknown> {
  return get(BACKUP, store);
}

export async function discardCorruptBackup(): Promise<void> {
  await del(BACKUP, store);
}

/**
 * Swaps in a whole project (import, start new) in ONE transaction: write the project, step 1 and the new assets,
 * then delete leftover assets. If anything fails, the transaction is aborted and the previous project stays intact.
 * The corrupt-data backup is left alone.
 */
export async function replaceProject(p: Project, assets: Map<string, Blob>): Promise<void> {
  await store('readwrite', (os) => {
    const done = new Promise<void>((resolve, reject) => {
      os.transaction.oncomplete = () => resolve();
      os.transaction.onabort = os.transaction.onerror = () => reject(os.transaction.error ?? new Error('Saving failed'));
    });
    try {
      os.put(p, 'project');
      os.put(1, 'step');
      for (const [id, blob] of assets) os.put(blob, ASSET + id);
      const keys = os.getAllKeys();
      keys.onsuccess = () => {
        try {
          for (const k of keys.result) {
            if (typeof k === 'string' && k.startsWith(ASSET) && !assets.has(k.slice(ASSET.length))) os.delete(k);
          }
        } catch {
          os.transaction.abort();
        }
      };
    } catch (e) {
      os.transaction.abort();
      return done.then(() => Promise.reject(e), () => Promise.reject(e));
    }
    return done;
  });
}

/** Forget everything: project, step, images and any backup. */
export async function clearAll(): Promise<void> {
  await clear(store);
}
