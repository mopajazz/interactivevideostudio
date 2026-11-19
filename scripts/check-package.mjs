// Validates an exported SCORM 1.2 package (the bytes of the .zip). Returns a list of problems; empty means it passed.
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The repo root has no dependencies of its own; borrow the editor's (jszip, jsdom, and esbuild via vite).
const editorPkg = fileURLToPath(new URL('../apps/editor/package.json', import.meta.url));
const require = createRequire(editorPkg);
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');

const ADLCP = 'http://www.adlnet.org/xsd/adlcp_rootv1p2';

let validator = null;
/**
 * The schema's own validateProject, compiled from TypeScript with esbuild as the sample build script does. Only
 * validate.ts is bundled: it needs no DOM, so no jsdom window is needed (the sanitizer is not involved).
 */
async function loadValidateProject() {
  if (validator) return validator;
  const esbuild = createRequire(require.resolve('vite')).resolve('esbuild');
  const { build } = await import(pathToFileURL(esbuild).href).then((m) => m.default ?? m);
  const work = mkdtempSync(join(tmpdir(), 'ivt-check-'));
  try {
    const outfile = join(work, 'validate.mjs');
    await build({
      entryPoints: [fileURLToPath(new URL('../packages/schema/src/validate.ts', import.meta.url))],
      outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'error',
    });
    validator = (await import(pathToFileURL(outfile).href)).validateProject;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return validator;
}

const FIXED = ['imsmanifest.xml', 'index.html', 'launch.js', 'player.css', 'player.js', 'project.json'];
const LOCAL_SCRIPTS = new Set(['player.js', 'launch.js']);

export async function checkPackage(bytes) {
  const problems = [];
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  const text = (n) => zip.file(n).async('string');

  // 1. The exact file list: the fixed files plus one asset per image the project uses.
  let project; // undefined: missing or not JSON
  if (zip.file('project.json')) {
    try {
      project = JSON.parse(await text('project.json'));
    } catch {
      problems.push('project.json is not valid JSON');
    }
  }
  if (zip.file('project.json') && project !== undefined) {
    const checked = (await loadValidateProject())(project);
    if (!checked.ok) problems.push(`project.json is not a valid project: ${checked.errors.join('; ')}`);
  }
  const interactions = Array.isArray(project?.interactions) ? project.interactions : [];
  const assets = [...new Set(interactions.map((i) => i?.imageAssetId).filter((id) => typeof id === 'string' && id))].map((id) => `assets/${id}`);
  const expected = [...FIXED, ...assets].sort();
  for (const n of expected) if (!names.includes(n)) problems.push(`missing file: ${n}`);
  for (const n of names) if (!expected.includes(n)) problems.push(`unexpected file: ${n}`);

  // 2. The manifest.
  if (zip.file('imsmanifest.xml')) {
    const xml = await text('imsmanifest.xml');
    let doc = null;
    try {
      doc = new JSDOM(xml, { contentType: 'application/xml' }).window.document; // throws on malformed XML
    } catch {
      /* reported below */
    }
    if (!doc) {
      problems.push('imsmanifest.xml is not well-formed XML');
    } else {
      const version = doc.getElementsByTagName('schemaversion')[0]?.textContent?.trim();
      if (version !== '1.2') problems.push(`manifest schemaversion is "${version}", expected 1.2`);
      const resources = doc.getElementsByTagName('resource');
      if (resources.length !== 1) problems.push(`manifest has ${resources.length} resources, expected 1`);
      const res = resources[0];
      // The organization the manifest names as default must exist, and its item must launch this resource.
      const orgs = doc.getElementsByTagName('organizations')[0];
      const def = orgs?.getAttribute('default');
      const organizations = [...doc.getElementsByTagName('organization')];
      if (!organizations.some((o) => o.getAttribute('identifier') === def)) problems.push(`organizations default "${def}" names no organization in the manifest`);
      const resourceIds = [...resources].map((r) => r.getAttribute('identifier'));
      for (const item of doc.getElementsByTagName('item')) {
        const ref = item.getAttribute('identifierref');
        if (ref !== null && !resourceIds.includes(ref)) problems.push(`item identifierref "${ref}" matches no resource identifier`);
      }
      if (res) {
        const type = res.getAttributeNS(ADLCP, 'scormtype') ?? res.getAttribute('adlcp:scormtype');
        if (type !== 'sco') problems.push(`resource adlcp:scormtype is "${type}", expected sco`);
        if (res.getAttribute('href') !== 'index.html') problems.push(`resource href is "${res.getAttribute('href')}", expected index.html`);
        const listed = [...res.getElementsByTagName('file')].map((f) => f.getAttribute('href'));
        for (const f of listed) if (!names.includes(f)) problems.push(`manifest lists ${f}, which is not in the zip`);
        for (const n of names) if (n !== 'imsmanifest.xml' && !listed.includes(n)) problems.push(`${n} is in the zip but not listed in the manifest`);
      }
    }
  }

  // 3. The launch page: project inlined, nothing loaded from elsewhere.
  if (zip.file('index.html')) {
    const doc = new JSDOM(await text('index.html')).window.document;
    const inline = doc.getElementById('ivt-project');
    try {
      if (project === undefined || JSON.stringify(JSON.parse(inline.textContent)) !== JSON.stringify(project)) problems.push('index.html does not inline the same project as project.json');
    } catch {
      problems.push('index.html does not inline the project (missing or invalid #ivt-project)');
    }
    for (const s of doc.querySelectorAll('script[src]')) {
      const src = s.getAttribute('src');
      if (!LOCAL_SCRIPTS.has(src)) problems.push(`index.html loads an external script: ${src}`);
    }
    for (const l of doc.querySelectorAll('link[href]')) {
      if (l.getAttribute('href') !== 'player.css') problems.push(`index.html loads an external stylesheet: ${l.getAttribute('href')}`);
    }
  }
  return problems;
}
