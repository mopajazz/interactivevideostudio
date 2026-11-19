import { test, expect, type Page } from '@playwright/test';

const open = async (page: Page, params = '') => {
  await page.goto(`/e2e/index.html?adapter=fake${params}`);
  await expect(page.locator('.ivp-play')).toBeVisible();
};
const advance = (page: Page, seconds: number) =>
  page.evaluate((s) => {
    const f = (window as any).__fake;
    for (let left = s; left > 1e-9; left -= 0.5) f.advance(Math.min(0.5, left));
  }, seconds);
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true }).click();
const fsButton = (page: Page) => page.getByRole('button', { name: 'Full screen' });

/** Headless Chromium cannot really go full screen: stub the API, recording what was asked of it. */
const stubFullscreen = (page: Page, enabled = true) =>
  page.addInitScript((enabled) => {
    const w = window as any;
    w.__fsEl = null;
    w.__fsCalls = [];
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => enabled });
    Object.defineProperty(Document.prototype, 'fullscreenElement', { configurable: true, get: () => w.__fsEl });
    Element.prototype.requestFullscreen = function (this: Element) {
      w.__fsCalls.push(`request:${this.className}`);
      w.__fsEl = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = function () {
      w.__fsCalls.push('exit');
      w.__fsEl = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
  }, enabled);

test.describe('full screen button', () => {
  test('is labelled, 44 px, reachable by Tab after the speed control, and puts the whole player (cards too) full screen', async ({ page }) => {
    await stubFullscreen(page);
    await open(page);
    const fs = fsButton(page);
    await expect(fs).toBeVisible();
    await expect(fs).toHaveAttribute('aria-pressed', 'false');
    const box = (await fs.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await page.getByLabel('Playback speed').focus();
    await page.keyboard.press('Tab');
    await expect(fs).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => (window as any).__fsCalls)).toEqual(['request:ivp-root']);
    await expect(fs).toHaveAttribute('aria-pressed', 'true');
    await expect(fs).toHaveAccessibleName('Full screen');
    // A checkpoint card opens inside the full-screen element, so it stays visible.
    await play(page);
    await advance(page, 5);
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(() => (window as any).__fsEl.contains(document.querySelector('[role="dialog"]')))).toBe(true);
  });

  test('pressing it again (Space) leaves full screen; leaving by other means (Esc) also updates aria-pressed', async ({ page }) => {
    await stubFullscreen(page);
    await open(page);
    const fs = fsButton(page);
    await fs.click();
    await expect(fs).toHaveAttribute('aria-pressed', 'true');
    await fs.focus();
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as any).__fsCalls)).toEqual(['request:ivp-root', 'exit']);
    await expect(fs).toHaveAttribute('aria-pressed', 'false');
    await fs.click();
    await page.evaluate(() => { (window as any).__fsEl = null; document.dispatchEvent(new Event('fullscreenchange')); });
    await expect(fs).toHaveAttribute('aria-pressed', 'false');
  });

  test('is not shown when the page may not go full screen (e.g. an LMS iframe without allowfullscreen)', async ({ page }) => {
    await stubFullscreen(page, false);
    await open(page);
    await expect(page.locator('.ivp-fs')).toBeHidden();
    await expect(fsButton(page)).toHaveCount(0);
  });
});

test.describe('first play on a device that needs a tap on the video itself', () => {
  const tapMessage = (page: Page) => page.locator('.ivp-tap', { hasText: 'Tap the video to start' });

  test('if the video is not playing about 2 s after Play, the video area becomes tappable and says so; playing restores it', async ({ page }) => {
    await page.clock.install();
    await open(page, '&refusePlay=1&fixture=empty');
    const video = page.locator('.ivp-video');
    await expect(video).toHaveAttribute('inert', '');
    await play(page);
    await page.clock.runFor(1500);
    await expect(tapMessage(page)).toBeHidden();
    await expect(video).toHaveAttribute('inert', '');
    await page.clock.runFor(1000);
    await expect(tapMessage(page)).toBeVisible();
    await expect(video).not.toHaveAttribute('inert', '');
    await expect(page.locator('.ivp-announcer')).toContainText('Tap the video to start');
    // The learner taps the video: YouTube starts playing by itself.
    await page.evaluate(() => (window as any).__fake.forcePlay());
    await expect(tapMessage(page)).toBeHidden();
    await expect(video).toHaveAttribute('inert', '');
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause');
  });

  test('a video that starts normally never shows the message', async ({ page }) => {
    await page.clock.install();
    await open(page, '&fixture=empty');
    await play(page);
    await page.clock.runFor(5000);
    await expect(tapMessage(page)).toBeHidden();
    await expect(page.locator('.ivp-video')).toHaveAttribute('inert', '');
  });

  test('pausing again within 2 s does not show the message', async ({ page }) => {
    await page.clock.install();
    await open(page, '&refusePlay=1&fixture=empty');
    await play(page);
    await page.evaluate(() => (window as any).__fake.forcePlay());
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    await page.clock.runFor(5000);
    await expect(tapMessage(page)).toBeHidden();
  });
});
