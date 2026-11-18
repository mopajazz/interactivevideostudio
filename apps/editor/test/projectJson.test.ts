import { describe, expect, it } from 'vitest';
import { exportProjectJson, importProjectJson } from '../src/storage/projectJson';
import { sampleProject } from './fixtures';

const file = (text: string) => new Blob([text], { type: 'application/json' });
const roundTrip = async (value: unknown) => importProjectJson(file(JSON.stringify(value)));

describe('JSON export / import', () => {
  it('export then import returns an equal project and equal asset bytes', async () => {
    const p = sampleProject();
    const big = new Uint8Array(70_000).map((_, i) => (i * 37) % 256); // larger than one base64 chunk
    const assets = new Map<string, Blob>([
      ['Ab3_dE-fGh1J.webp', new Blob([big], { type: 'image/webp' })],
      ['zz-9_8yXw7Vu.png', new Blob([new Uint8Array([0, 255, 128])], { type: 'image/png' })],
    ]);
    const out = await exportProjectJson(p, assets);
    expect(out.type).toBe('application/json');
    const back = await importProjectJson(out);
    expect(back.project).toEqual(p);
    expect([...back.assets.keys()].sort()).toEqual([...assets.keys()].sort());
    for (const [id, blob] of assets) {
      const got = back.assets.get(id)!;
      expect(got.type).toBe(blob.type);
      expect(new Uint8Array(await got.arrayBuffer())).toEqual(new Uint8Array(await blob.arrayBuffer()));
    }
  });

  it('writes a project object and an assets map of id -> {type, base64}', async () => {
    const out = await exportProjectJson(sampleProject(), new Map([['Ab3_dE-fGh1J.jpg', new Blob(['hi'], { type: 'image/jpeg' })]]));
    const json = JSON.parse(await out.text());
    expect(json.project.title).toBe('Photosynthesis in 5 minutes');
    expect(json.assets).toEqual({ 'Ab3_dE-fGh1J.jpg': { type: 'image/jpeg', base64: 'aGk=' } });
  });

  it('rejects malformed JSON with a readable message', async () => {
    await expect(importProjectJson(file('{"project": '))).rejects.toThrow("This file isn't valid JSON, so it can't be opened as a project.");
  });

  it('rejects JSON that is not a project file', async () => {
    await expect(roundTrip([1, 2])).rejects.toThrow("This file doesn't contain a project.");
    await expect(roundTrip({ hello: 'world' })).rejects.toThrow("This file doesn't contain a project.");
  });

  it('rejects an invalid project and says why', async () => {
    const p: any = sampleProject();
    p.settings.masteryPercent = 500;
    await expect(roundTrip({ project: p, assets: {} })).rejects.toThrow(/^This project file has problems: settings\.masteryPercent/);
  });

  it.each([
    ['an unsafe id', { '../evil.webp': { type: 'image/webp', base64: 'aGk=' } }],
    ['an id without an image extension', { 'Ab3_dE-fGh1J': { type: 'image/webp', base64: 'aGk=' } }],
    ['a non-image type', { 'Ab3_dE-fGh1J.webp': { type: 'text/html', base64: 'aGk=' } }],
    ['broken base64', { 'Ab3_dE-fGh1J.webp': { type: 'image/webp', base64: '***' } }],
    ['a missing entry body', { 'Ab3_dE-fGh1J.webp': null }],
  ])('rejects %s in the assets map', async (_label, assets) => {
    await expect(roundTrip({ project: sampleProject(), assets })).rejects.toThrow(/^This project file has a damaged image/);
  });

  it('accepts a file with no assets map', async () => {
    const back = await roundTrip({ project: sampleProject() });
    expect(back.assets.size).toBe(0);
  });
});
