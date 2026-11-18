import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { Interaction, Project } from '@ivt/schema';
import { listBlockers, runExport, zipName } from '../src/export/runExport';

const ASSET = 'Ab3_dE-fGh1J.png';
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

const question = (over: Partial<Interaction> = {}): Interaction => ({
  id: 'q1', type: 'multipleChoice', time: 12, order: 1, promptHtml: '<p>What do plants need?</p>',
  choices: [{ id: 'a', html: 'Light', correct: true }, { id: 'b', html: 'Noise', correct: false }],
  ...over,
});
const image = (over: Partial<Interaction> = {}): Interaction => ({
  id: 'img1', type: 'image', time: 40, order: 2, promptHtml: '', imageAssetId: ASSET, alt: 'A leaf', decorative: false, ...over,
});

const project = (interactions: Interaction[], over: Partial<Project> = {}): Project => ({
  version: 1,
  title: 'My Video!',
  videoId: 'dQw4w9WgXcQ',
  duration: 212,
  settings: { disableForwardScrubbing: true, masteryPercent: 80 },
  interactions,
  ...over,
});
const assets = () => new Map([[ASSET, png()]]);

/** An asset queue double: `left` writes are still queued after the flush. */
const queue = (left: number) => {
  const flush = vi.fn(async () => { /* nothing */ });
  return { flush, pending: vi.fn(() => left > 0) };
};

describe('runExport', () => {
  it('exports a clean project as a SCORM zip named after the title', async () => {
    const r = await runExport(project([question(), image()]), assets());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.filename).toBe('my-video.zip');
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    expect(Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort()).toEqual(
      ['assets/' + ASSET, 'imsmanifest.xml', 'index.html', 'launch.js', 'player.css', 'player.js', 'project.json'].sort(),
    );
    expect(await zip.file('player.js')!.async('string')).toContain('IVPlayer');
    expect(await zip.file('launch.js')!.async('string')).toContain('IVScorm');
    expect(JSON.parse(await zip.file('project.json')!.async('string')).settings.masteryPercent).toBe(80);
  });

  it('leaves out images no checkpoint uses', async () => {
    const r = await runExport(project([question()]), new Map([[ASSET, png()]]));
    if (!r.ok) throw new Error('expected ok');
    const zip = await JSZip.loadAsync(await r.blob.arrayBuffer());
    expect(zip.file(`assets/${ASSET}`)).toBeNull();
  });

  it('blocks an image without alt text, with the schema message and the checkpoint id', async () => {
    const r = await runExport(project([question(), image({ alt: ' ' })]), assets());
    expect(r).toEqual({ ok: false, blockers: [{ message: 'Image at 40s needs alt text or must be marked decorative', interactionId: 'img1' }] });
  });

  it('blocks every exportBlockers message, each with its checkpoint', async () => {
    const r = await runExport(project([
      question({ choices: [{ id: 'a', html: 'Only', correct: false }] }),
      { id: 'l1', type: 'link', time: 30, order: 3, promptHtml: '', url: '' },
    ]), new Map());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.blockers).toEqual([
      { message: 'Question at 12s needs at least 2 choices and one marked correct', interactionId: 'q1' },
      { message: 'Link at 30s needs a web address', interactionId: 'l1' },
    ]);
  });

  it('blocks a checkpoint at or after the end of the video, naming it as the timeline does', async () => {
    const r = await runExport(project([question(), { id: 't1', type: 'text', time: 212, order: 4, promptHtml: '<p>Hi</p>' }]), new Map());
    expect(r).toEqual({
      ok: false,
      blockers: [{ message: 'Text 1 at 3:32 is at or after the end of the video (3:32). Move it earlier.', interactionId: 't1' }],
    });
  });

  it('blocks a project with no checkpoints', async () => {
    const r = await runExport(project([]), new Map());
    expect(r).toEqual({ ok: false, blockers: [{ message: 'Add at least one checkpoint' }] });
  });

  it('blocks an image whose file is missing', async () => {
    const r = await runExport(project([image()]), new Map());
    expect(r).toEqual({
      ok: false,
      blockers: [{ message: "Image 1 at 0:40 has lost its picture. Choose the image again.", interactionId: 'img1' }],
    });
  });

  it('flushes the image queue first and exports when that empties it', async () => {
    const q = queue(0);
    const r = await runExport(project([image()]), assets(), { queue: q });
    expect(q.flush).toHaveBeenCalledOnce();
    expect(q.flush.mock.invocationCallOrder[0]!).toBeLessThan(q.pending.mock.invocationCallOrder[0]!);
    expect(r.ok).toBe(true);
  });

  it('blocks while images are still waiting to be saved after the flush', async () => {
    const q = queue(1);
    const r = await runExport(project([image()]), assets(), { queue: q });
    expect(q.flush).toHaveBeenCalledOnce();
    expect(r).toEqual({
      ok: false,
      blockers: [{ message: "Some images aren't saved in this browser yet. The editor is retrying; try exporting again in a moment." }],
    });
  });

  it('lists every kind of blocker at once', () => {
    const p = project([image({ alt: '' }), { id: 't1', type: 'text', time: 300, order: 5, promptHtml: '' }]);
    expect(listBlockers(p, new Map()).map((b) => b.interactionId)).toEqual(['img1', 't1', 'img1']);
  });
});

describe('zipName', () => {
  it.each([
    ['My Video!', 'my-video.zip'],
    ['  Photosynthesis: Part 2  ', 'photosynthesis-part-2.zip'],
    ['Café crème', 'cafe-creme.zip'],
    ['Straße & Œuvre', 'strasse-oeuvre.zip'],
    ['', 'interactive-video.zip'],
    ['!!! ??? ...', 'interactive-video.zip'],
    ['光合作用の基礎', 'interactive-video.zip'],
    ['Фотосинтез', 'interactive-video.zip'],
    ['../../etc/passwd', 'etc-passwd.zip'],
    ['a\\b:c*?"<>|', 'a-b-c.zip'],
  ])('%j -> %s', (title, name) => {
    expect(zipName(title)).toBe(name);
  });

  it('keeps long titles to a sensible length', () => {
    expect(zipName('x'.repeat(300)).length).toBeLessThanOrEqual(64);
  });
});
