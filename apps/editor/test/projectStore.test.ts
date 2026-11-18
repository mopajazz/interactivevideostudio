import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clear } from 'idb-keyval';
import { clearAll, loadAssets, loadProject, loadStep, putAsset, saveProject, saveStep } from '../src/storage/projectStore';
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
