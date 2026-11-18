import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import {
  VIDEOS, breakStorageWrites, completeSetup, nextButton, openEditor, resolveLookup, saved, titleField, urlField, withStore,
} from './helpers';

const notice = (page: import('@playwright/test').Page) => page.getByTestId('notice');

test('a slower, older video lookup never overwrites a newer one', async ({ page }) => {
  await openEditor(page);
  await urlField(page).fill(`https://youtu.be/${VIDEOS.slowA}`);
  await expect(page.getByText('Checking the video…')).toBeVisible();
  await urlField(page).fill(`https://youtu.be/${VIDEOS.slowB}`);
  await titleField(page).fill('Race');
  await resolveLookup(page, VIDEOS.slowB, { duration: 95, embeddable: true });
  await expect(page.getByText('1:35')).toBeVisible();
  await resolveLookup(page, VIDEOS.slowA, { error: 'embed-disabled' });
  await resolveLookup(page, VIDEOS.slowA, { duration: 212, embeddable: true }); // no-op: already settled
  await saved(page);
  await expect(page.getByText('1:35')).toBeVisible();
  await expect(page.getByText(/owner doesn't allow/)).toHaveCount(0);
  await expect(nextButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  expect(await withStore(page, async (s) => (await s.loadProject())?.duration)).toBe(95);
});

test('a failed save is shown to the author in a live region', async ({ page }) => {
  await openEditor(page);
  await breakStorageWrites(page);
  await titleField(page).fill('Will not save');
  const live = page.getByRole('status').filter({ hasText: "Couldn't save in this browser. Export JSON to keep a copy." });
  await expect(live).toBeVisible();
});

test('a corrupt saved project starts empty, says so, and keeps the old record as a backup', async ({ page }) => {
  await openEditor(page);
  await withStore(page, (s) => s.saveProject({ version: 1, title: 'Old work', broken: true } as never));
  await page.reload();
  await expect(notice(page)).toHaveText(/Your saved project couldn't be read, so a new one was started\. The damaged data is kept in this browser\./);
  await expect(titleField(page)).toHaveValue('');
  await titleField(page).fill('Fresh start');
  await saved(page);
  await page.reload();
  await expect(titleField(page)).toHaveValue('Fresh start');
  expect(await withStore(page, (s) => s.loadCorruptBackup())).toEqual({ version: 1, title: 'Old work', broken: true });
  // The author decides: download it, or discard it.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download damaged data' }).click();
  expect((await download).suggestedFilename()).toBe('damaged-project.json');
  await page.getByRole('button', { name: 'Discard damaged data' }).click();
  await expect(page.getByRole('button', { name: 'Download damaged data' })).toHaveCount(0);
  expect(await withStore(page, (s) => s.loadCorruptBackup())).toBeUndefined();
});

test('with IndexedDB unavailable the editor still loads, says so, and keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('Storage is blocked', 'SecurityError'); };
  });
  await openEditor(page);
  await expect(notice(page)).toHaveText('Saving is unavailable in this browser; export your project to keep it');
  await completeSetup(page, 'No storage');
  await nextButton(page).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Interactions' })).toBeFocused();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await download).suggestedFilename()).toBe('no-storage.ivt.json');
});

test('an import that fails to save keeps the previous project intact', async ({ page }, info) => {
  const path = info.outputPath('other.json');
  const project = { version: 1, title: 'Other', videoId: VIDEOS.other, duration: 95, settings: { disableForwardScrubbing: false, masteryPercent: 80 }, interactions: [] };
  await writeFile(path, JSON.stringify({ project, assets: { 'Ab3_dE-fGh1J.png': { type: 'image/png', base64: 'iVBORw==' } } }));
  await openEditor(page);
  await completeSetup(page, 'Keep me');
  await withStore(page, (s) => s.putAsset('Old0_image01.png', new Blob([new Uint8Array([1])], { type: 'image/png' })));
  await saved(page);
  await breakStorageWrites(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles(path);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
  await expect(notice(page)).toHaveText(/^Couldn't open "Other": it could not be saved in this browser\./);
  await expect(titleField(page)).toHaveValue('Keep me');
  await page.reload();
  await expect(titleField(page)).toHaveValue('Keep me');
  expect(await withStore(page, async (s) => [...(await s.loadAssets()).keys()])).toEqual(['Old0_image01.png']);
});

test('a successful import replaces the old images with the new ones', async ({ page }, info) => {
  const path = info.outputPath('other.json');
  const project = { version: 1, title: 'Other', videoId: VIDEOS.other, duration: 95, settings: { disableForwardScrubbing: false, masteryPercent: 80 }, interactions: [] };
  await writeFile(path, JSON.stringify({ project, assets: { 'Ab3_dE-fGh1J.png': { type: 'image/png', base64: 'iVBORw==' } } }));
  await openEditor(page);
  await completeSetup(page, 'Old');
  await withStore(page, (s) => s.putAsset('Old0_image01.png', new Blob([new Uint8Array([1])], { type: 'image/png' })));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles(path);
  await page.getByRole('dialog').getByRole('button', { name: 'Replace' }).click();
  await expect(titleField(page)).toHaveValue('Other');
  await page.reload();
  await expect(titleField(page)).toHaveValue('Other');
  expect(await withStore(page, async (s) => [...(await s.loadAssets()).keys()])).toEqual(['Ab3_dE-fGh1J.png']);
});
