import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, type Page } from '@playwright/test';
import type { Project } from '@ivt/schema';
import {
  PNG, VIDEOS, addAt, completeSetup, drawer, openEditor, openInteractions, saved, stepButton, timeline, tool, urlField, withStore,
} from './helpers';

const heading = (page: Page) => page.getByRole('heading', { level: 2, name: 'Scoring & export' });
const toStep3 = async (page: Page) => {
  await page.getByRole('button', { name: 'Next: Scoring & export' }).click();
  await expect(heading(page)).toBeFocused();
};
const mastery = (page: Page) => page.getByRole('textbox', { name: 'Mastery score (%)' });
const scrubSwitch = (page: Page) => page.getByRole('switch', { name: 'Disable forward scrubbing' });
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export SCORM package' });
const blockerList = (page: Page) => page.getByRole('list', { name: 'Fix before exporting' });
const stored = (page: Page) => withStore(page, (s) => s.loadProject()) as Promise<Project | null>;

test.describe('Step 3', () => {
  test.beforeEach(async ({ page }) => openInteractions(page));

  test('arriving focuses the heading; the summary counts questions, cards and points', async ({ page }) => {
    await addAt(page, 'Quiz', 10);
    await addAt(page, 'True/False', 20);
    await addAt(page, 'Text', 30);
    await toStep3(page);
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary).toContainText('2 scored questions');
    await expect(summary).toContainText('1 info card');
    await expect(summary).toContainText('2 points possible');
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Scoring', 'Summary', 'Export']);
  });

  test('with no scored questions, the summary says learners see Finish and the LMS records completion', async ({ page }) => {
    await addAt(page, 'Text', 30);
    await toStep3(page);
    const summary = page.getByRole('region', { name: 'Summary' });
    await expect(summary).toContainText('0 scored questions');
    await expect(summary).toContainText('Learners see "Finish" instead of "Submit answers", and the LMS records the video as completed.');
  });

  test('mastery accepts 0-100 whole numbers; anything else shows a live error and is never saved', async ({ page }) => {
    await tool(page, 'Quiz').click();
    await toStep3(page);
    await expect(mastery(page)).toHaveValue('80');
    const describedBy = await mastery(page).getAttribute('aria-describedby');
    const msgId = describedBy!.split(' ').find((id) => id.endsWith('-msg'))!;
    // The message is a live region that is in the DOM (and not display:none) before there is anything to say.
    const msg = page.locator(`[id="${msgId}"]`);
    await expect(msg).toHaveAttribute('role', 'status');
    expect(await msg.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');

    for (const bad of ['101', '-1', '80.5', '', 'abc']) {
      await mastery(page).fill(bad);
      await expect(msg).toHaveText('Enter a whole number from 0 to 100.');
      await expect(mastery(page)).toHaveAttribute('aria-invalid', 'true');
    }
    await saved(page);
    expect((await stored(page))!.settings.masteryPercent).toBe(80);
    await expect(exportButton(page)).toHaveAttribute('aria-disabled', 'true');

    await mastery(page).fill('65');
    await expect(msg).toHaveText('');
    await expect(mastery(page)).not.toHaveAttribute('aria-invalid', 'true');
    await saved(page);
    expect((await stored(page))!.settings.masteryPercent).toBe(65);
    await page.reload();
    await expect(mastery(page)).toHaveValue('65');
  });

  test('the scrubbing switch works from the keyboard and persists across a reload', async ({ page }) => {
    await tool(page, 'Quiz').click();
    await toStep3(page);
    await expect(scrubSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText("Learners can't skip ahead of what they've watched.")).toBeVisible();
    await scrubSwitch(page).focus();
    await page.keyboard.press('Space');
    await expect(scrubSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await saved(page);
    await page.reload();
    await expect(heading(page)).toBeVisible();
    await expect(scrubSwitch(page)).toHaveAttribute('aria-checked', 'true');
    expect((await stored(page))!.settings.disableForwardScrubbing).toBe(true);
    await scrubSwitch(page).focus();
    await page.keyboard.press('Enter');
    await expect(scrubSwitch(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('controls are at least 44 px tall', async ({ page }) => {
    await tool(page, 'Quiz').click();
    await toStep3(page);
    for (const el of [mastery(page), scrubSwitch(page), exportButton(page)]) {
      // Layout size, so the panel's entrance animation can't blur it by a subpixel.
      expect(await el.evaluate((e) => (e as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
    }
  });

  test('the switch does not animate when reduced motion is asked for', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tool(page, 'Quiz').click();
    await toStep3(page);
    const thumb = scrubSwitch(page).locator('.switch-thumb');
    expect(parseFloat(await thumb.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.001);
  });

  test('with no checkpoints, Export is disabled and says to add one', async ({ page }) => {
    await toStep3(page);
    await expect(blockerList(page).getByRole('listitem')).toHaveText(['Add at least one checkpoint']);
    await expect(blockerList(page).getByRole('button')).toHaveCount(0);
    await expect(exportButton(page)).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled keeps it focusable (so its reason is read out); pressing it does nothing.
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await exportButton(page).focus();
    await page.keyboard.press('Enter');
    await expect(exportButton(page)).toBeFocused();
    await expect(page.getByTestId('notice')).toHaveText('');
    expect(downloaded).toBe(false);
  });

  test('blockers are listed with a visible reason on Export, and "Go to checkpoint" opens that checkpoint', async ({ page }) => {
    await addAt(page, 'Quiz', 10);
    await addAt(page, 'Link', 30);
    await addAt(page, 'Image', 45);
    await toStep3(page);

    await expect(blockerList(page).getByRole('listitem')).toHaveText([
      /^Link at 30s needs a web address/,
      /^Image at 45s needs alt text or must be marked decorative/,
    ]);
    const reason = page.getByText('Fix the 2 items below to export.');
    await expect(reason).toBeVisible();
    await expect(exportButton(page)).toHaveAttribute('aria-disabled', 'true');
    const describedBy = (await exportButton(page).getAttribute('aria-describedby'))!;
    expect(describedBy.split(' ')).toContain(await reason.getAttribute('id'));

    await blockerList(page).getByRole('listitem').nth(0).getByRole('button', { name: /Go to checkpoint/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Interactions' })).toBeVisible();
    await expect(drawer(page)).toHaveAccessibleName('Link 1 at 0:30');
    await expect(timeline(page).getByRole('button', { name: /^Link 1 at 0:30/ })).toHaveAttribute('aria-current', 'true');
    await expect.poll(() => drawer(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);

    // Fix both from the editor, then Export is ready.
    await drawer(page).getByLabel('Web address').fill('https://example.com/leaves');
    await timeline(page).getByRole('button', { name: /^Image 1 at 0:45/ }).click();
    await drawer(page).getByRole('checkbox', { name: 'Decorative image' }).check();
    await stepButton(page, /Scoring & export/).click();
    await expect(heading(page)).toBeFocused();
    await expect(blockerList(page)).toHaveCount(0);
    await expect(page.getByText('Ready to export.')).toBeVisible();
    await expect(exportButton(page)).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a checkpoint past the end of a shorter video blocks export, named as on the timeline', async ({ page }) => {
    await addAt(page, 'Text', 150);
    await stepButton(page, /Setup/).click();
    await urlField(page).fill(`https://www.youtube.com/watch?v=${VIDEOS.other}`);
    await page.getByRole('button', { name: 'Change video' }).click();
    await expect(page.getByText('Video found')).toBeVisible();
    await stepButton(page, /Scoring & export/).click();
    await expect(blockerList(page).getByRole('listitem')).toHaveText([
      /^Text 1 at 2:30 is at or after the end of the video \(1:35\)\. Move it earlier\./,
    ]);
    // Keyboard only: the button says which checkpoint it opens.
    await blockerList(page).getByRole('button', { name: 'Go to checkpoint: Text 1 at 2:30' }).focus();
    await page.keyboard.press('Enter');
    await expect(drawer(page)).toHaveAccessibleName('Text 1 at 2:30');
    await expect.poll(() => drawer(page).evaluate((d) => d.contains(document.activeElement))).toBe(true);
  });

  test('Export downloads the package and says so', async ({ page }, info) => {
    await addAt(page, 'Quiz', 10);
    await addAt(page, 'Image', 20);
    await drawer(page).getByLabel('Image file').setInputFiles(PNG);
    await drawer(page).getByLabel('Alt text').fill('A green leaf');
    await toStep3(page);
    const download = page.waitForEvent('download');
    await exportButton(page).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('photosynthesis-basics.zip');
    await expect(page.getByTestId('notice')).toHaveText(
      'Downloaded photosynthesis-basics.zip. Upload it to your LMS as a SCORM 1.2 package.',
    );
    const path = info.outputPath('package.zip');
    await file.saveAs(path);
    const zip = await JSZip.loadAsync(await readFile(path));
    expect(zip.file('imsmanifest.xml')).not.toBeNull();
    const project = JSON.parse(await zip.file('project.json')!.async('string')) as Project;
    expect(project.settings).toEqual({ disableForwardScrubbing: false, masteryPercent: 80 });
  });
});

test('a title with markup is only ever text in the filename and notice', async ({ page }) => {
  await openEditor(page);
  await completeSetup(page, '<img src=x onerror=alert(1)> Leaves');
  await page.getByRole('button', { name: /^Next/ }).click();
  await tool(page, 'Quiz').click();
  await toStep3(page);
  const download = page.waitForEvent('download');
  await exportButton(page).click();
  expect((await download).suggestedFilename()).toBe('img-src-x-onerror-alert-1-leaves.zip');
  await expect(page.getByTestId('notice')).toContainText('Downloaded img-src-x-onerror-alert-1-leaves.zip.');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
});
