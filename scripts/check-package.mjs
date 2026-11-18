// Validates an exported SCORM 1.2 package (the bytes of the .zip). Returns a list of problems; empty means it passed.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// The repo root has no dependencies of its own; borrow the editor's (jszip, jsdom).
const require = createRequire(fileURLToPath(new URL('../apps/editor/package.json', import.meta.url)));
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');

const FIXED = ['imsmanifest.xml', 'index.html', 'launch.js', 'player.css', 'player.js', 'project.json'];
const LOCAL_SCRIPTS = new Set(['player.js', 'launch.js']);

export async function checkPackage(bytes) {
  const problems = [];
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir).sort();
  const text = (n) => zip.file(n).async('string');

  // 1. The exact file list: the fixed files plus one asset per image the project uses.
  let project = null;
  if (zip.file('project.json')) {
    try {
      project = JSON.parse(await text('project.json'));
    } catch {
      problems.push('project.json is not valid JSON');
    }
  }
  const assets = project ? [...new Set(project.interactions.map((i) => i.imageAssetId).filter(Boolean))].map((id) => `assets/${id}`) : [];
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
      if (res) {
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
      if (!project || JSON.stringify(JSON.parse(inline.textContent)) !== JSON.stringify(project)) problems.push('index.html does not inline the same project as project.json');
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
