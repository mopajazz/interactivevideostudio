import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import { test, expect } from '@playwright/test';
import { expectNoAxeViolations } from './axe';
import { PNG, addAt, drawer, openInteractions } from './helpers';
import { serve } from './serve';

test('an exported package unzips, loads in a fake LMS and starts the player without errors', async ({ page, context }, info) => {
  await openInteractions(page);
  await addAt(page, 'Quiz', 10);
  await addAt(page, 'Image', 20);
  await drawer(page).getByLabel('Image file').setInputFiles(PNG);
  await drawer(page).getByLabel('Alt text').fill('A green leaf');
  await page.getByRole('button', { name: 'Next: Scoring & export' }).click();
  // Every new setting away from its default, so the package must carry what the author chose.
  await page.getByRole('checkbox', { name: "I've checked that this video has captions" }).check();
  await page.getByRole('switch', { name: 'Let learners try a question again' }).click();
  await page.getByRole('switch', { name: 'Show the correct answer after checking' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export SCORM package' }).click();
  const zip = await JSZip.loadAsync(await readFile(await (await download).path()));

  // Exactly the package files, plus one asset per image.
  const project = JSON.parse(await zip.file('project.json')!.async('string'));
  const settings = { disableForwardScrubbing: false, masteryPercent: 80, captionsConfirmed: true, allowRetry: true, showSolution: false };
  expect(project.settings).toEqual(settings);
  // The launch page's inlined copy (what the player actually reads) carries them too.
  const inlined = (await zip.file('index.html')!.async('string')).match(/<script type="application\/json" id="ivt-project">(.*?)<\/script>/s)![1]!;
  expect(JSON.parse(inlined).settings).toEqual(settings);
  const assetId: string = project.interactions.find((i: { type: string }) => i.type === 'image').imageAssetId;
  const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
  expect(names).toEqual(['assets/' + assetId, 'imsmanifest.xml', 'index.html', 'launch.js', 'player.css', 'player.js', 'project.json'].sort());

  const root = info.outputPath('package');
  for (const name of names) {
    const target = join(root, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await zip.file(name)!.async('uint8array'));
  }
  const { url, server } = await serve(root);
  try {
    const lms = await context.newPage();
    const errors: string[] = [];
    lms.on('pageerror', (e) => errors.push(e.message));
    // YouTube is unreachable here: fail its API script at once, so the player shows its load-error panel.
    await lms.route(/youtube\.com|ytimg\.com|googlevideo\.com/, (r) => r.abort());
    await lms.addInitScript(() => {
      const w = window as unknown as { API: Record<string, (...a: string[]) => string>; __lmsCalls: string[] };
      const data: Record<string, string> = {};
      w.__lmsCalls = [];
      const call = (name: string, fn: (...a: string[]) => string) => (...a: string[]) => { w.__lmsCalls.push(name); return fn(...a); };
      w.API = {
        LMSInitialize: call('LMSInitialize', () => 'true'),
        LMSFinish: call('LMSFinish', () => 'true'),
        LMSGetValue: call('LMSGetValue', (k) => data[k!] ?? ''),
        LMSSetValue: call('LMSSetValue', (k, v) => { data[k!] = v!; return 'true'; }),
        LMSCommit: call('LMSCommit', () => 'true'),
        LMSGetLastError: call('LMSGetLastError', () => '0'),
        LMSGetErrorString: call('LMSGetErrorString', () => ''),
        LMSGetDiagnostic: call('LMSGetDiagnostic', () => ''),
      };
    });
    await lms.goto(url + 'index.html');

    await expect(lms.locator('#ivt-root')).not.toBeEmpty();
    await expect(lms.getByRole('alert')).toContainText("The YouTube player couldn't load.");
    await expect(lms.getByText('This activity could not start')).toHaveCount(0);
    expect(await lms.evaluate(() => (window as unknown as { __lmsCalls: string[] }).__lmsCalls)).toContain('LMSInitialize');
    await expect(lms.locator('link[rel="stylesheet"][href="player.css"]')).toHaveCount(1);
    expect(await lms.evaluate(() => [...document.styleSheets].some((s) => s.href?.endsWith('player.css') && s.cssRules.length > 0))).toBe(true);
    expect(errors).toEqual([]);
    // The launch page as exported (title, language, the player's load-error state) passes the same axe scan, and the
    // playbar, which can do nothing now, is out of the Tab order.
    await expectNoAxeViolations(lms);
    await lms.keyboard.press('Tab');
    await expect(lms.getByRole('alert').getByRole('link', { name: 'Watch on YouTube' })).toBeFocused();
    await lms.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
