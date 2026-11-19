import { test, expect, type Page } from '@playwright/test';
import { completeSetup, openEditor, saved, titleField } from './helpers';

const NOTE = 'Your work is saved only in this browser. Export a project file now and then.';
const note = (page: Page) => page.getByText(NOTE);
const tabWarning = (page: Page) => page.getByText(/also open in another tab/);

test.describe('persistent storage request', () => {
  test('is asked once, on the first save, and a refusal is ignored silently', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.__persistCalls = 0;
      Object.defineProperty(navigator, 'storage', {
        configurable: true,
        value: { ...navigator.storage, persist: () => { w.__persistCalls += 1; return Promise.reject(new Error('refused')); }, persisted: () => Promise.resolve(false), estimate: () => navigator.storage.estimate() },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await openEditor(page);
    expect(await page.evaluate(() => (window as any).__persistCalls)).toBe(0);
    await completeSetup(page);
    await saved(page);
    await titleField(page).fill('Another title');
    await saved(page);
    expect(await page.evaluate(() => (window as any).__persistCalls)).toBe(1);
    await expect(page.getByTestId('notice')).toBeEmpty();
    expect(errors).toEqual([]);
  });
});

test.describe('"saved only in this browser" note', () => {
  test('is shown near the save status in a polite live region, and Dismiss hides it for this session only', async ({ page, browser }) => {
    await openEditor(page);
    await expect(note(page)).toBeVisible();
    const region = page.locator('.project-menu [role="status"]', { hasText: NOTE });
    await expect(region).toHaveCount(1);
    await page.getByRole('button', { name: 'Dismiss the note about saving in this browser' }).click();
    await expect(note(page)).toHaveCount(0);
    // The live region stays in the page (never display:none), empty.
    const live = page.getByTestId('storage-note');
    await expect(live).toBeAttached();
    await expect(live).toHaveAttribute('role', 'status');
    expect(await live.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await page.reload();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    // A new session (another browser context) shows it again.
    const other = await (await browser.newContext()).newPage();
    await openEditor(other);
    await expect(note(other)).toBeVisible();
    await other.context().close();
  });

  test('its text arrives after the page loads, so screen readers announce it', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as any;
      w.__inserted = [];
      new MutationObserver((rs) => {
        for (const r of rs) {
          const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as HTMLElement | null;
          if (el?.closest?.('[data-testid="storage-note"]') && el.textContent) w.__inserted.push(el.textContent);
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await openEditor(page);
    await expect(note(page)).toBeVisible();
    expect((await page.evaluate(() => (window as any).__inserted as string[])).some((t) => t.includes('saved only in this browser'))).toBe(true);
  });
});

test.describe('second tab', () => {
  test('both tabs warn about overwriting each other; the warning clears when the other tab goes', async ({ page, context }) => {
    await openEditor(page);
    await expect(tabWarning(page)).toHaveCount(0);
    const second = await context.newPage();
    await openEditor(second);
    await expect(tabWarning(second)).toBeVisible();
    await expect(tabWarning(page)).toBeVisible();
    await expect(tabWarning(page)).toContainText('overwrite');
    await expect(page.getByRole('alert').filter({ hasText: 'another tab' })).toHaveCount(1);
    // A warning, not a lock: the first tab can still edit.
    await completeSetup(page, 'Still editable');
    await expect(titleField(page)).toHaveValue('Still editable');
    await second.goto('about:blank'); // pagehide in the second tab
    await expect(tabWarning(page)).toHaveCount(0);
    await second.close();
  });
});
