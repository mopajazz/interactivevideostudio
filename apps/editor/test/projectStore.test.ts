import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clear } from 'idb-keyval';
import {
  clearAll, discardCorruptBackup, loadAssets, loadCorruptBackup, loadProject, loadSession, loadStep, putAsset, replaceProject, saveProject, saveStep,
} from '../src/storage/projectStore';
import { bytes, sampleProject } from './fixtures';

beforeEach(async () => {
  await clearAll();
});

describe('projectStore (IndexedDB via idb-keyval)', () => {
  it('returns null when nothing has been saved', async () => {
    expect(await loadProject()).toBeNull();
    expect(await loadStep()).toBe(1);
  });

  it('save then load returns an equal project', async () => {
    const p = sampleProject();
    await saveProject(p);
    const back = await loadProject();
    expect(back).toEqual(p);
    expect(back).not.toBe(p);
  });

  it('remembers the current step', async () => {
    await saveStep(3);
    expect(await loadStep()).toBe(3);
  });

  it('ignores a stored value that is not a valid project', async () => {
    await saveProject({ nope: true } as never);
    expect(await loadProject()).toBeNull();
  });

  it('stores image assets and returns them with equal bytes and type', async () => {
    await putAsset('Ab3_dE-fGh1J.webp', new Blob([bytes(1, 2, 3)], { type: 'image/webp' }));
    const assets = await loadAssets();
    expect([...assets.keys()]).toEqual(['Ab3_dE-fGh1J.webp']);
    const b = assets.get('Ab3_dE-fGh1J.webp')!;
    expect(b.type).toBe('image/webp');
    expect(new Uint8Array(await b.arrayBuffer())).toEqual(bytes(1, 2, 3));
  });

  it('clearAll forgets the project, the step and the assets', async () => {
    await saveProject(sampleProject());
    await saveStep(2);
    await putAsset('Ab3_dE-fGh1J.png', new Blob([bytes(9)], { type: 'image/png' }));
    await clearAll();
    expect(await loadProject()).toBeNull();
    expect(await loadStep()).toBe(1);
    expect((await loadAssets()).size).toBe(0);
  });

  it('does not touch the default idb-keyval store', async () => {
    await saveProject(sampleProject());
    await clear(); // default store
    expect(await loadProject()).not.toBeNull();
  });
});

describe('loadSession', () => {
  it('returns the saved project, step and assets', async () => {
    await saveProject(sampleProject());
    await saveStep(2);
    await putAsset('Ab3_dE-fGh1J.png', new Blob([bytes(7)], { type: 'image/png' }));
    const s = await loadSession();
    expect(s.project).toEqual(sampleProject());
    expect(s.step).toBe(2);
    expect(s.corrupt).toBe(false);
    expect(s.hasBackup).toBe(false);
    expect([...s.assets.keys()]).toEqual(['Ab3_dE-fGh1J.png']);
  });

  it('keeps a corrupt record under project:backup-corrupt, even after the next save', async () => {
    const bad = { version: 1, title: 'Old work', broken: true };
    await saveProject(bad as never);
    const s = await loadSession();
    expect(s).toMatchObject({ project: null, corrupt: true, hasBackup: true });
    await saveProject(sampleProject());
    expect(await loadCorruptBackup()).toEqual(bad);
    const again = await loadSession();
    expect(again).toMatchObject({ corrupt: false, hasBackup: true });
    await discardCorruptBackup();
    expect(await loadCorruptBackup()).toBeUndefined();
    expect((await loadSession()).hasBackup).toBe(false);
  });
});

describe('replaceProject', () => {
  it('writes the new project at step 1 with its assets, then drops leftover assets, keeping any backup', async () => {
    await saveProject({ broken: true } as never);
    await loadSession(); // creates the backup
    await saveProject(sampleProject());
    await saveStep(3);
    await putAsset('Old0_image01.png', new Blob([bytes(1)], { type: 'image/png' }));
    const next = { ...sampleProject(), title: 'Next' };
    await replaceProject(next, new Map([['New0_image01.webp', new Blob([bytes(2, 3)], { type: 'image/webp' })]]));
    expect(await loadProject()).toEqual(next);
    expect(await loadStep()).toBe(1);
    const assets = await loadAssets();
    expect([...assets.keys()]).toEqual(['New0_image01.webp']);
    expect(new Uint8Array(await assets.get('New0_image01.webp')!.arrayBuffer())).toEqual(bytes(2, 3));
    expect(await loadCorruptBackup()).toEqual({ broken: true });
  });

  it('changes nothing when any write fails part-way', async () => {
    await saveProject(sampleProject());
    await saveStep(2);
    await putAsset('Old0_image01.png', new Blob([bytes(1)], { type: 'image/png' }));
    const assets = new Map<string, Blob>([
      ['New0_image01.png', new Blob([bytes(2)], { type: 'image/png' })],
      ['New0_image02.png', (() => {}) as unknown as Blob], // cannot be stored: DataCloneError mid-way
    ]);
    await expect(replaceProject({ ...sampleProject(), title: 'Next' }, assets)).rejects.toThrow();
    expect(await loadProject()).toEqual(sampleProject());
    expect(await loadStep()).toBe(2);
    expect([...(await loadAssets()).keys()]).toEqual(['Old0_image01.png']);
  });
});
