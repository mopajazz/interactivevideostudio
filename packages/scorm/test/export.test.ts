import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import type { Project } from '@ivt/schema';
import { buildManifest } from '../src/manifest';
import { buildScormZip } from '../src/exportZip';

const bundle = { js: 'var IVPlayer={};', css: '.x{}', launchJs: 'var IVScorm={};' };

function project(over: Partial<Project> = {}): Project {
  return {
    version: 1,
    title: 'Safety 101',
    videoId: 'dQw4w9WgXcQ',
    duration: 60,
    settings: { disableForwardScrubbing: false, masteryPercent: 80 },
    interactions: [],
    ...over,
  };
}
const img = (assetId: string): Project =>
  project({
    interactions: [{ id: 'i1', type: 'image', time: 5, order: 0, promptHtml: '<p>x</p>', imageAssetId: assetId, alt: 'a' }],
  });

async function unzip(blob: Blob) {
  const buf = await new Promise<ArrayBuffer>((res, rej) => {
    const r = new FileReader(); // jsdom's Blob has no arrayBuffer()
    r.onload = () => res(r.result as ArrayBuffer);
    r.onerror = () => rej(r.error);
    r.readAsArrayBuffer(blob);
  });
  return JSZip.loadAsync(buf);
}
const parse = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');

describe('buildManifest', () => {
  const files = ['index.html', 'player.js', 'assets/a b&c.png'];
  const xml = buildManifest('A & B <c>', files);
  const doc = parse(xml);

  it('is well-formed XML with SCORM 1.2 metadata', () => {
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('metadata > schema')?.textContent).toBe('ADL SCORM');
    expect(doc.querySelector('metadata > schemaversion')?.textContent).toBe('1.2');
    expect(xml).toContain('imscp_rootv1p1p2');
    expect(xml).toContain('adlcp_rootv1p2');
    expect(xml).toContain('xsi:schemaLocation');
  });

  it('has one organization, one item and one sco resource launching index.html', () => {
    expect(doc.querySelectorAll('organization')).toHaveLength(1);
    expect(doc.querySelectorAll('item')).toHaveLength(1);
    const res = doc.querySelectorAll('resource');
    expect(res).toHaveLength(1);
    expect(res[0]!.getAttribute('href')).toBe('index.html');
    expect(res[0]!.getAttribute('adlcp:scormtype')).toBe('sco');
    expect(doc.querySelector('item')!.getAttribute('identifierref')).toBe(res[0]!.getAttribute('identifier'));
  });

  it('escapes the title and file hrefs', () => {
    expect(doc.querySelector('organization > title')?.textContent).toBe('A & B <c>');
    expect(doc.querySelector('item > title')?.textContent).toBe('A & B <c>');
    expect(Array.from(doc.querySelectorAll('file')).map((f) => f.getAttribute('href'))).toEqual(files);
  });
});

describe('buildScormZip', () => {
  it('contains exactly the expected files', async () => {
    const zip = await unzip(await buildScormZip(img('p1.png'), new Map([['p1.png', new Uint8Array([1, 2, 3])]]), bundle));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual(
      ['assets/p1.png', 'imsmanifest.xml', 'index.html', 'launch.js', 'player.css', 'player.js', 'project.json'].sort(),
    );
    expect([...(await zip.file('assets/p1.png')!.async('uint8array'))]).toEqual([1, 2, 3]);
    expect(await zip.file('player.js')!.async('string')).toBe(bundle.js);
    expect(await zip.file('launch.js')!.async('string')).toBe(bundle.launchJs);
    expect(JSON.parse(await zip.file('project.json')!.async('string')).title).toBe('Safety 101');
  });

  it('manifest lists every file and references them all', async () => {
    const zip = await unzip(await buildScormZip(img('p1.png'), new Map([['p1.png', new Uint8Array([1])]]), bundle));
    const doc = parse(await zip.file('imsmanifest.xml')!.async('string'));
    expect(doc.querySelector('parsererror')).toBeNull();
    const listed = Array.from(doc.querySelectorAll('file')).map((f) => f.getAttribute('href')!);
    expect(listed).toContain('index.html');
    expect(listed).toContain('assets/p1.png');
    expect(doc.querySelector('schemaversion')?.textContent).toBe('1.2');
    for (const f of listed) expect(zip.file(f), f).not.toBeNull();
    for (const n of ['index.html', 'player.js', 'player.css', 'launch.js', 'project.json']) expect(listed).toContain(n);
  });

  it('escapes the manifest title', async () => {
    const zip = await unzip(await buildScormZip(project({ title: 'A & B <c>' }), new Map(), bundle));
    const xml = await zip.file('imsmanifest.xml')!.async('string');
    const doc = parse(xml);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('organization > title')?.textContent).toBe('A & B <c>');
  });

  describe('index.html', () => {
    const title = 'T </script><b>&"x"';
    const prompt = '</script><script>alert(1)</script>  ';
    const p = project({
      title,
      interactions: [{ id: 'q', type: 'text', time: 1, order: 0, promptHtml: prompt }],
    });
    it('is a safe, self-contained launch page', async () => {
      const zip = await unzip(await buildScormZip(p, new Map(), bundle));
      const html = await zip.file('index.html')!.async('string');
      expect(html).toMatch(/^<!doctype html>/i);
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<div id="ivt-root"></div>');
      expect(html).toContain('<link rel="stylesheet" href="player.css">');
      expect([...html.matchAll(/<script[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1])).toEqual(['player.js', 'launch.js']);
      expect(html.indexOf('src="player.js"')).toBeLessThan(html.indexOf('src="launch.js"'));
      expect(html).toContain('IVScorm.start(window, document, project, IVPlayer.mount)');
      expect(html).not.toMatch(/https?:\/\//);

      const d = new DOMParser().parseFromString(html, 'text/html');
      expect(d.title).toBe(title);
      expect(d.querySelectorAll('script[type="application/json"]')).toHaveLength(1);
      const json = d.getElementById('ivt-project')!.textContent!;
      expect(JSON.parse(json)).toEqual(p);
      expect(json).not.toContain('<');
      expect(json).not.toContain(' ');
      expect(json).not.toContain(' ');
      // title was HTML-escaped in the source
      expect(html).toContain('<title>T &lt;/script&gt;&lt;b&gt;&amp;&quot;x&quot;</title>');
    });
  });

  describe('bootstrap script', () => {
    const run = async (html: string, g: Record<string, unknown>) => {
      const d = new DOMParser().parseFromString(html, 'text/html');
      const code = Array.from(d.querySelectorAll('script:not([src]):not([type])')).map((e) => e.textContent).join('\n');
      new Function('document', 'window', ...Object.keys(g), code)(d, {}, ...Object.values(g));
      return d.getElementById('ivt-root')!;
    };
    const page = async () => (await unzip(await buildScormZip(project(), new Map(), bundle))).file('index.html')!.async('string');

    it('shows a readable alert when the bundles did not load', async () => {
      const root = await run(await page(), {});
      expect(root.getAttribute('role')).toBe('alert');
      expect(root.textContent).toMatch(/could not start/i);
    });
    it('shows the alert when the project JSON is broken', async () => {
      const html = (await page()).replace(/(id="ivt-project">)[^<]*/, '$1{broken');
      const root = await run(html, { IVScorm: { start() {} }, IVPlayer: { mount() {} } });
      expect(root.getAttribute('role')).toBe('alert');
    });
    it('starts normally when everything loaded', async () => {
      const start = vi.fn();
      const mountFn = () => {};
      const root = await run(await page(), { IVScorm: { start }, IVPlayer: { mount: mountFn } });
      expect(start).toHaveBeenCalledTimes(1);
      expect(start.mock.calls[0]![3]).toBe(mountFn);
      expect(root.textContent).toBe('');
    });
  });

  describe('validation', () => {
    it.each(['../x.png', 'a/b.png', 'x.svg', 'x', '.png', 'a b.png', ''])('rejects asset id %j', async (id) => {
      await expect(buildScormZip(project(), new Map([[id, new Uint8Array()]]), bundle)).rejects.toThrow(/asset/i);
    });
    it('rejects an image interaction whose asset is missing', async () => {
      await expect(buildScormZip(img('gone.png'), new Map(), bundle)).rejects.toThrow(/gone\.png/);
    });
    it('accepts valid ids', async () => {
      const ids = ['a-b_C1.jpg', 'x.webp', 'y.gif'];
      await expect(buildScormZip(project(), new Map(ids.map((i) => [i, new Uint8Array()])), bundle)).resolves.toBeInstanceOf(Blob);
    });
  });
});
