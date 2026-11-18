import { test, expect } from '@playwright/test';
import { VIDEOS, completeSetup, currentStep, nextButton, openEditor, stepButton, titleField, urlField } from './helpers';

const BAD = "That doesn't look like a YouTube link";

test.beforeEach(async ({ page }) => openEditor(page));

test.describe('page structure', () => {
  test('has one h1, header and main landmarks, and a skip link to main', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('shows the three steps as an ordered list with the current one marked', async ({ page }) => {
    const steps = page.getByRole('navigation', { name: 'Steps' }).getByRole('listitem');
    await expect(steps).toHaveText([/1\s*Setup/, /2\s*Interactions/, /3\s*Scoring & export/]);
    await expect(page.getByRole('navigation', { name: 'Steps' }).locator('ol')).toHaveCount(1);
    await expect(currentStep(page)).toHaveCount(1);
    await expect(currentStep(page)).toContainText('Setup');
  });
});

test.describe('Step 1: Setup', () => {
  test('has exactly two inputs: the YouTube link and the title', async ({ page }) => {
    await expect(page.locator('input:visible, textarea:visible, select:visible, [contenteditable]:visible')).toHaveCount(2);
    await expect(page.getByRole('textbox')).toHaveCount(2);
    await expect(urlField(page)).toBeVisible();
    await expect(titleField(page)).toBeVisible();
  });

  test('a bad URL shows a described, announced error and keeps Next disabled', async ({ page }) => {
    // The live region must already be in the accessibility tree before the message arrives.
    const region = page.getByTestId('url-status');
    await expect(region).toBeAttached();
    await expect(region).toHaveAttribute('role', 'status');
    expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await expect(region).toBeEmpty();
    await urlField(page).fill('https://vimeo.com/76979871');
    await titleField(page).fill('A title');
    const error = page.getByText(BAD);
    await expect(error).toBeVisible();
    await expect(urlField(page)).toHaveAttribute('aria-invalid', 'true');
    const describedBy = (await urlField(page).getAttribute('aria-describedby')) ?? '';
    const errorId = await error.getAttribute('id');
    expect(describedBy.split(' ')).toContain(errorId);
    await expect(region.locator(`#${errorId}`)).toBeVisible();
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('next-reason')).toHaveText('To continue, add a YouTube link.');
    await nextButton(page).click({ force: true }); // aria-disabled: still focusable and clickable, but inert
    await expect(currentStep(page)).toContainText('Setup');
    await expect(stepButton(page, /Interactions/)).toHaveAttribute('aria-disabled', 'true');
  });

  test('pasting a bad URL shows the error straight away', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(() => navigator.clipboard.writeText('not a link at all'));
    await urlField(page).focus();
    await page.keyboard.press('ControlOrMeta+V');
    await expect(urlField(page)).toBeFocused();
    await expect(page.getByText(BAD)).toBeVisible();
  });

  test('does not nag while a link is still being typed, then checks it on leaving the field', async ({ page }) => {
    await urlField(page).pressSequentially('https://you');
    await expect(page.getByText(BAD)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(page.getByText(BAD)).toBeVisible();
    await urlField(page).fill(`youtu.be/${VIDEOS.ok}`);
    await expect(page.getByText(BAD)).toHaveCount(0);
    await expect(urlField(page)).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a good URL plus a title enables Next and learns the duration', async ({ page }) => {
    await urlField(page).fill(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
    await expect(page.getByText('Video found')).toBeVisible();
    await expect(page.getByText('3:32')).toBeVisible();
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('next-reason')).toHaveText('To continue, add a title.');
    await titleField(page).fill('   ');
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    await titleField(page).fill('Photosynthesis basics');
    await expect(nextButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('next-reason')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__infoCalls)).toEqual([VIDEOS.ok]);
  });

  test('an embed-disabled video explains itself and keeps Next disabled', async ({ page }) => {
    await urlField(page).fill(`https://youtu.be/${VIDEOS.embedOff}`);
    await titleField(page).fill('A title');
    await expect(page.getByText("This video's owner doesn't allow it to be played on other sites. Choose a different video.")).toBeVisible();
    await expect(urlField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('next-reason')).toHaveText('To continue, choose a video that can be embedded.');
  });

  test('an unavailable video explains itself, keeps Next disabled, and can be re-checked', async ({ page }) => {
    await urlField(page).fill(`https://youtu.be/${VIDEOS.gone}`);
    await titleField(page).fill('A title');
    await expect(page.getByText("We couldn't load this video. It may be private or removed, or YouTube may be unreachable.")).toBeVisible();
    await expect(nextButton(page)).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__infoCalls.length)).toBe(2);
  });

  test('Next moves focus to the Interactions heading; steps 2 and 3 are reachable placeholders', async ({ page }) => {
    await completeSetup(page);
    await nextButton(page).click();
    const h2 = page.getByRole('heading', { level: 2, name: 'Interactions' });
    await expect(h2).toBeFocused();
    await expect(currentStep(page)).toContainText('Interactions');
    await expect(page.getByText('Coming next')).toBeVisible();
    await stepButton(page, /Scoring & export/).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Scoring & export' })).toBeFocused();
    await stepButton(page, /Setup/).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Setup' })).toBeFocused();
    await expect(urlField(page)).toHaveValue(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
  });

  test('can be completed with the keyboard alone', async ({ page }) => {
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(urlField(page)).toBeFocused();
    await page.keyboard.type(`https://youtu.be/${VIDEOS.ok}`);
    await page.keyboard.press('Tab');
    await expect(titleField(page)).toBeFocused();
    await page.keyboard.type('Keyboard only');
    await expect(nextButton(page)).not.toHaveAttribute('aria-disabled', 'true');
    while (!(await nextButton(page).evaluate((el) => el === document.activeElement))) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Interactions' })).toBeFocused();
  });
});
