#!/usr/bin/env node
// Builds out/lms-acceptance-sample.zip from examples/lms-acceptance-sample.json using the editor's own import and
// export code (importProjectJson, runExport), so the package is what the editor would export for the same project.
// Run from the repo root: `pnpm run sample:package`. Add `--check` to also validate the zip's contents (exits 1 on a problem).
// `--duration=SECONDS` sets the video length (use the video's real length if the sample's 300 does not match it).
// `--variant=NAME` builds a changed copy for the acceptance script (docs/lms-acceptance.md), written beside the main zip:
//   video-only  the four questions removed (no scored questions: expect "completed", no score)
//   reworded    the first question's wording changed, same checkpoints
//   changed     a fifth checkpoint added (the list of checkpoints differs)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkPackage } from './check-package.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const editor = join(root, 'apps/editor');
const check = process.argv.includes('--check');
const variant = process.argv.find((a) => a.startsWith('--variant='))?.slice('--variant='.length);
const durationArg = process.argv.find((a) => a.startsWith('--duration='))?.slice('--duration='.length);
const duration = durationArg === undefined ? undefined : Number(durationArg);
if (duration !== undefined && !(Number.isFinite(duration) && duration > 0)) {
  console.error('--duration must be a positive number of seconds.');
  process.exit(1);
}
const VARIANTS = {
  'video-only': (p) => ({ ...p, title: `${p.title} (video only)`, interactions: p.interactions.filter((i) => i.type !== 'multipleChoice' && i.type !== 'trueFalse') }),
  reworded: (p) => ({ ...p, interactions: p.interactions.map((i) => (i.id === 'i2' ? { ...i, promptHtml: '<p>Which of these is a colour? (reworded)</p>' } : i)) }),
  changed: (p) => ({ ...p, interactions: [...p.interactions, { id: 'i8', type: 'text', time: 260, order: 8, promptHtml: '<p>One more card, added in the changed package.</p>' }] }),
};
if (variant !== undefined && !VARIANTS[variant]) {
  console.error(`Unknown variant "${variant}". Use one of: ${Object.keys(VARIANTS).join(', ')}.`);
  process.exit(1);
}

// 1. Learner bundles: build them unless they exist and are newer than every source file.
const bundles = ['packages/player/dist/player.js', 'packages/player/dist/player.css', 'packages/scorm/dist/launch.js'].map((p) => join(root, p));
const newest = (dir) => readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
  const p = join(dir, e.name);
  return Math.max(m, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
}, 0);
const sources = ['player', 'scorm', 'schema'].map((n) => join(root, 'packages', n, 'src'));
const stale = bundles.some((b) => !existsSync(b)) || Math.max(...sources.map(newest)) > Math.min(...bundles.map((b) => statSync(b).mtimeMs));
if (stale) {
  console.log('Building the learner bundles...');
  execFileSync('pnpm', ['--silent', '--filter', 'editor', 'bundles'], { cwd: root, stdio: 'inherit' });
}

// 2. Compile the editor's TypeScript (import + export code) to one Node module. `?raw` imports become strings, as in Vite.
const esbuild = createRequire(createRequire(join(editor, 'package.json')).resolve('vite')).resolve('esbuild');
const { build } = await import(pathToFileURL(esbuild).href).then((m) => m.default ?? m);
const work = mkdtempSync(join(tmpdir(), 'ivt-sample-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `export { importProjectJson } from ${JSON.stringify(join(editor, 'src/storage/projectJson.ts'))};
export { runExport } from ${JSON.stringify(join(editor, 'src/export/runExport.ts'))};
`);
const rawPlugin = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: resolve(a.resolveDir, a.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, (a) => ({ contents: readFileSync(a.path, 'utf8'), loader: 'text' }));
  },
};
const outfile = join(work, 'entry.mjs');
await build({ entryPoints: [entry], outfile, bundle: true, format: 'esm', platform: 'node', logLevel: 'error', plugins: [rawPlugin], absWorkingDir: editor });

// The sanitizer in @ivt/schema needs a DOM; the editor has one, Node does not.
const { JSDOM } = createRequire(join(editor, 'package.json'))('jsdom');
globalThis.window = new JSDOM('').window;
const { importProjectJson, runExport } = await import(pathToFileURL(outfile).href);

// 3. Import the sample exactly as the editor's "Open project" does, then export it.
const sample = join(root, 'examples/lms-acceptance-sample.json');
const imported = await importProjectJson(new Blob([readFileSync(sample)]));
const { assets } = imported;
const base = duration === undefined ? imported.project : { ...imported.project, duration };
const project = variant ? VARIANTS[variant](base) : base;
const result = await runExport(project, assets);
rmSync(work, { recursive: true, force: true });
if (!result.ok) {
  console.error('The sample project cannot be exported:\n- ' + result.blockers.map((b) => b.message).join('\n- '));
  process.exit(1);
}
const bytes = new Uint8Array(await result.blob.arrayBuffer());
const outDir = join(root, 'out');
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, variant ? `lms-acceptance-sample-${variant}.zip` : 'lms-acceptance-sample.zip');
writeFileSync(zipPath, bytes);
console.log(`Wrote ${zipPath} (${bytes.length} bytes)`);

if (check) {
  const problems = await checkPackage(bytes);
  if (problems.length) {
    console.error('Package checks failed:\n- ' + problems.join('\n- '));
    process.exit(1);
  }
  console.log('Package checks passed.');
}
