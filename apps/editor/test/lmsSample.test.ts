import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportBlockers } from '@ivt/schema';
import { isScored } from '../src/scoring';
import { importProjectJson } from '../src/storage/projectJson';

const root = resolve(__dirname, '../../..');
const SAMPLE = resolve(root, 'examples/lms-acceptance-sample.json');

describe('examples/lms-acceptance-sample.json', () => {
  it('imports through the editor import function with 4 scored questions, in play order, and nothing blocking export', async () => {
    const { project, assets } = await importProjectJson(new Blob([readFileSync(SAMPLE)]));
    expect(project.videoId).toBe('M7lc1UVf-VE');
    expect(project.settings.masteryPercent).toBe(80);
    expect(project.duration).toBeGreaterThan(0);

    const played = [...project.interactions].sort((a, b) => a.time - b.time || a.order - b.order);
    expect(played.map((i) => i.type)).toEqual(['text', 'multipleChoice', 'image', 'trueFalse', 'multipleChoice', 'link', 'trueFalse']);
    expect(project.interactions.filter((i) => isScored(i.type))).toHaveLength(4);
    expect(project.interactions.filter((i) => i.type === 'text')).toHaveLength(1);
    expect(project.interactions.filter((i) => i.type === 'link')).toHaveLength(1);
    expect(project.interactions.filter((i) => i.type === 'image')).toHaveLength(1);
    expect(played.every((i) => i.time < project.duration)).toBe(true);

    const questions = project.interactions.filter((i) => isScored(i.type));
    expect(questions.some((q) => q.type === 'trueFalse')).toBe(true);
    expect(questions.some((q) => q.choices!.filter((c) => c.correct).length === 2)).toBe(true);
    expect(questions.every((q) => q.choices!.every((c) => c.feedbackHtml))).toBe(true);

    const image = project.interactions.find((i) => i.type === 'image')!;
    expect(image.alt).toBeTruthy();
    expect(assets.get(image.imageAssetId!)!.type).toBe('image/png');
    expect(exportBlockers(project)).toEqual([]);
  });
});

describe('pnpm run sample:package --check', () => {
  it('builds the sample package and validates its contents', () => {
    const out = execFileSync('node', ['scripts/build-sample-package.mjs', '--check'], { cwd: root, encoding: 'utf8' });
    expect(out).toContain('Package checks passed');
    const zip = resolve(root, 'out/lms-acceptance-sample.zip');
    expect(existsSync(zip)).toBe(true);
  }, 120_000);

  it.each(['video-only', 'reworded', 'changed'])('builds and validates the %s variant', (variant) => {
    const out = execFileSync('node', ['scripts/build-sample-package.mjs', '--check', `--variant=${variant}`], { cwd: root, encoding: 'utf8' });
    expect(out).toContain('Package checks passed');
    expect(existsSync(resolve(root, `out/lms-acceptance-sample-${variant}.zip`))).toBe(true);
  }, 120_000);

  it('rejects an unknown variant', () => {
    expect(() => execFileSync('node', ['scripts/build-sample-package.mjs', '--variant=nope'], { cwd: root, stdio: 'pipe' })).toThrow();
  });

  it('the written zip holds the project inline and the sample image', async () => {
    const zip = await JSZip.loadAsync(readFileSync(resolve(root, 'out/lms-acceptance-sample.zip')));
    expect(Object.keys(zip.files).filter((n) => n.startsWith('assets/') && !zip.files[n]!.dir)).toEqual(['assets/LmsSample-01.png']);
    expect(await zip.file('index.html')!.async('string')).toContain('M7lc1UVf-VE');
  });
});
