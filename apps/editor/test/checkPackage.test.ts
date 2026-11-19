// @vitest-environment node
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without types
import { checkPackage } from '../../../scripts/check-package.mjs';
import type { Project } from '@ivt/schema';
import { buildScormZip } from '@ivt/scorm';

const project: Project = {
  version: 1, title: 'T', videoId: 'M7lc1UVf-VE', duration: 60,
  settings: { disableForwardScrubbing: true, masteryPercent: 80 },
  interactions: [{ id: 'i1', type: 'image', time: 5, order: 1, promptHtml: '', imageAssetId: 'LmsSample-01.png', alt: 'a' }],
};
const bundle = { js: 'var IVPlayer={};', css: '.x{}', launchJs: 'var IVScorm={};' };

async function good(): Promise<JSZip> {
  const blob = await buildScormZip(project, new Map([['LmsSample-01.png', new Uint8Array([1, 2, 3])]]), bundle);
  return JSZip.loadAsync(await blob.arrayBuffer());
}
const check = async (zip: JSZip): Promise<string[]> => checkPackage(await zip.generateAsync({ type: 'uint8array' }));

describe('checkPackage', () => {
  it('accepts what buildScormZip writes', async () => {
    expect(await check(await good())).toEqual([]);
  });

  it('reports a file that is not in the exact expected list', async () => {
    const zip = await good();
    zip.file('extra.txt', 'x');
    const problems = await check(zip);
    expect(problems.join('\n')).toContain('extra.txt');
  });

  it('reports a missing asset', async () => {
    const zip = await good();
    zip.remove('assets/LmsSample-01.png');
    expect((await check(zip)).join('\n')).toContain('assets/LmsSample-01.png');
  });

  it('reports a manifest that is not well-formed XML', async () => {
    const zip = await good();
    zip.file('imsmanifest.xml', '<manifest><oops></manifest>');
    expect((await check(zip)).join('\n')).toMatch(/well-formed/);
  });

  it('reports a manifest file entry missing from the zip, and a zip file the manifest does not list', async () => {
    const zip = await good();
    const xml = await zip.file('imsmanifest.xml')!.async('string');
    zip.file('imsmanifest.xml', xml.replace('<file href="player.css"/>', '<file href="ghost.css"/>'));
    const text = (await check(zip)).join('\n');
    expect(text).toContain('ghost.css');
    expect(text).toContain('player.css');
  });

  it('reports a wrong schema version and a wrong launch href', async () => {
    const zip = await good();
    const xml = await zip.file('imsmanifest.xml')!.async('string');
    zip.file('imsmanifest.xml', xml.replace('<schemaversion>1.2<', '<schemaversion>2004<').replace('href="index.html">', 'href="player.js">'));
    const text = (await check(zip)).join('\n');
    expect(text).toContain('schemaversion');
    expect(text).toContain('href');
  });

  it('reports an external script, and a project that is not inlined', async () => {
    const zip = await good();
    const html = await zip.file('index.html')!.async('string');
    zip.file('index.html', html.replace('<script src="player.js">', '<script src="https://cdn.example.com/x.js">').replace(/id="ivt-project">.*?<\/script>/s, 'id="ivt-project">{}</script>'));
    const text = (await check(zip)).join('\n');
    expect(text).toContain('external');
    expect(text).toContain('inline');
  });

  describe('referential checks', () => {
    const editManifest = async (zip: JSZip, f: (xml: string) => string) => {
      const xml = await zip.file('imsmanifest.xml')!.async('string');
      const next = f(xml);
      expect(next).not.toBe(xml); // the mutation really applied
      zip.file('imsmanifest.xml', next);
    };
    const editProject = async (zip: JSZip, f: (p: Record<string, unknown>) => unknown) => {
      const p = JSON.parse(await zip.file('project.json')!.async('string'));
      const next = JSON.stringify(f(p), null, 2);
      zip.file('project.json', next);
      const html = await zip.file('index.html')!.async('string');
      zip.file('index.html', html.replace(/(id="ivt-project">).*?(<\/script>)/s, `$1${JSON.stringify(f(p)).replace(/</g, '\\u003c')}$2`));
    };

    it('reports an item identifierref that does not match the resource identifier', async () => {
      const zip = await good();
      await editManifest(zip, (x) => x.replace(/identifierref="[^"]*"/, 'identifierref="nowhere"'));
      expect((await check(zip)).join('\n')).toMatch(/identifierref "nowhere"/);
    });

    it('reports a resource without adlcp:scormtype="sco"', async () => {
      const zip = await good();
      await editManifest(zip, (x) => x.replace(' adlcp:scormtype="sco"', ''));
      expect((await check(zip)).join('\n')).toMatch(/scormtype/);
      const asset = await good();
      await editManifest(asset, (x) => x.replace('adlcp:scormtype="sco"', 'adlcp:scormtype="asset"'));
      expect((await check(asset)).join('\n')).toMatch(/scormtype/);
    });

    it('reports an organizations default that names no organization', async () => {
      const zip = await good();
      await editManifest(zip, (x) => x.replace(/<organizations default="[^"]*"/, '<organizations default="missing-org"'));
      expect((await check(zip)).join('\n')).toMatch(/default "missing-org"/);
    });

    it('reports a project.json that fails validateProject', async () => {
      const zip = await good();
      await editProject(zip, (p) => ({ ...p, version: 2, settings: { masteryPercent: 300 } }));
      const text = (await check(zip)).join('\n');
      expect(text).toContain('project.json is not a valid project');
      expect(text).toContain('version must be 1');
    });

    it('reports a project.json with no interactions readably, without crashing', async () => {
      const zip = await good();
      zip.remove('assets/LmsSample-01.png');
      await editManifest(zip, (x) => x.replace('      <file href="assets/LmsSample-01.png"/>\n', ''));
      await editProject(zip, ({ interactions: _gone, ...rest }) => rest);
      const problems = await check(zip);
      expect(problems.join('\n')).toContain('interactions must be an array');
    });

    it('reports a project.json that is not an object', async () => {
      const zip = await good();
      zip.file('project.json', 'null');
      await expect(check(zip)).resolves.toEqual(expect.arrayContaining([expect.stringContaining('project.json')]));
    });
  });
});

