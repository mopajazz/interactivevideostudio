import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { VIDEOS, completeSetup, currentStep, nextButton, openEditor, saved, stepButton, titleField, urlField } from './helpers';

test.beforeEach(async ({ page }) => openEditor(page));

test('autosaves and restores the project and the step after a reload', async ({ page }) => {
  await completeSetup(page, 'Saved title');
  await nextButton(page).click();
  await saved(page);
  await page.reload();
  await expect(currentStep(page)).toContainText('Interactions');
  await stepButton(page, /Setup/).click();
  await expect(titleField(page)).toHaveValue('Saved title');
  await expect(urlField(page)).toHaveValue(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
  await expect(page.getByText('3:32')).toBeVisible();
  // A restored, already-checked video is not fetched again.
  expect(await page.evaluate(() => (window as any).__infoCalls)).toEqual([]);
});

test('"Start new project" asks first, in a modal dialog, and Cancel keeps everything', async ({ page }) => {
  await completeSetup(page);
  const trigger = page.getByRole('button', { name: 'Start new project' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Start a new project?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(titleField(page)).toHaveValue('Photosynthesis basics');
});

test('"Start new project" clears the project once confirmed, also after a reload', async ({ page }) => {
  await completeSetup(page);
  await nextButton(page).click();
  await saved(page);
  await page.getByRole('button', { name: 'Start new project' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear and start new' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Setup' })).toBeFocused();
  await expect(urlField(page)).toHaveValue('');
  await expect(titleField(page)).toHaveValue('');
  await saved(page);
  await page.reload();
  await expect(currentStep(page)).toContainText('Setup');
  await expect(titleField(page)).toHaveValue('');
});

test('JSON export then import restores the project and its images', async ({ page, browser }, info) => {
  await completeSetup(page, 'Round trip');
  await page.evaluate(async () => {
    const store = (await import('/src/storage/projectStore.ts' as string)) as typeof import('../src/storage/projectStore');
    await store.putAsset('Ab3_dE-fGh1J.png', new Blob([new Uint8Array([137, 80, 78, 71, 1, 2, 3])], { type: 'image/png' }));
  });
  await saved(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('round-trip.ivt.json');
  const path = info.outputPath('export.json');
  await file.saveAs(path);
  const json = JSON.parse(await readFile(path, 'utf8'));
  expect(json.project).toMatchObject({ title: 'Round trip', videoId: VIDEOS.ok, duration: 212 });
  expect(json.assets['Ab3_dE-fGh1J.png']).toEqual({ type: 'image/png', base64: 'iVBORwECAw==' });

  // A fresh browser profile: nothing saved.
  const fresh = await (await browser.newContext()).newPage();
  await openEditor(fresh);
  await expect(titleField(fresh)).toHaveValue('');
  const chooser = fresh.waitForEvent('filechooser');
  await fresh.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles(path);
  await expect(fresh.getByRole('status').filter({ hasText: 'Opened "Round trip".' })).toBeVisible();
  await expect(titleField(fresh)).toHaveValue('Round trip');
  await expect(urlField(fresh)).toHaveValue(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
  const bytes = await fresh.evaluate(async () => {
    const store = (await import('/src/storage/projectStore.ts' as string)) as typeof import('../src/storage/projectStore');
    const b = (await store.loadAssets()).get('Ab3_dE-fGh1J.png');
    return b ? [b.type, Array.from(new Uint8Array(await b.arrayBuffer()))] : null;
  });
  expect(bytes).toEqual(['image/png', [137, 80, 78, 71, 1, 2, 3]]);
});

test('importing over a project asks first', async ({ page }, info) => {
  const path = info.outputPath('other.json');
  const project = { version: 1, title: 'Other', videoId: VIDEOS.other, duration: 95, settings: { disableForwardScrubbing: false, masteryPercent: 80 }, interactions: [] };
  await writeFile(path, JSON.stringify({ project, assets: {} }));
  await completeSetup(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles(path);
  const dialog = page.getByRole('dialog', { name: 'Replace the current project?' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(titleField(page)).toHaveValue('Photosynthesis basics');
  const again = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await again).setFiles(path);
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect(titleField(page)).toHaveValue('Other');
  await expect(page.getByText('1:35')).toBeVisible();
});

test('importing a malformed file shows a readable, announced error and changes nothing', async ({ page }, info) => {
  const path = info.outputPath('broken.json');
  await writeFile(path, '{"project": ');
  await completeSetup(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('status').filter({ hasText: "This file isn't valid JSON, so it can't be opened as a project." })).toBeVisible();
  await expect(titleField(page)).toHaveValue('Photosynthesis basics');
});
