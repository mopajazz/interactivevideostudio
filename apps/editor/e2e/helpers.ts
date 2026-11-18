import { expect, type Page } from '@playwright/test';

/** Video ids the fake video-info service treats specially (all 11 chars, like real ids). */
export const VIDEOS = {
  ok: 'dQw4w9WgXcQ', // 212 s, embeddable
  other: 'M7lc1UVf-VE', // 95 s, embeddable
  embedOff: 'embedOff_01',
  gone: 'goneVideo01',
} as const;

/**
 * Opens the editor with a fake fetchVideoInfo (honored only with ?fake=1). It records the ids it was
 * asked about in window.__infoCalls.
 */
export async function openEditor(page: Page) {
  await page.addInitScript((v) => {
    const w = window as any;
    w.__infoCalls = [];
    w.__ivtFakeVideoInfo = async (id: string) => {
      w.__infoCalls.push(id);
      if (id === v.embedOff) return { error: 'embed-disabled' };
      if (id === v.gone) return { error: 'unavailable' };
      return { duration: id === v.other ? 95 : 212, embeddable: true };
    };
  }, VIDEOS);
  await page.goto('/?fake=1');
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
}

export const urlField = (page: Page) => page.getByLabel('YouTube link');
export const titleField = (page: Page) => page.getByLabel('Title', { exact: true });
export const nextButton = (page: Page) => page.getByRole('button', { name: /^Next/ });
/** A step in the step indicator (not the Back/Next buttons, which share words with it). */
export const stepButton = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name });
export const currentStep = (page: Page) => page.locator('[aria-current="step"]');

export async function completeSetup(page: Page, title = 'Photosynthesis basics') {
  await urlField(page).fill(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
  await titleField(page).fill(title);
  await expect(page.getByText('Video found')).toBeVisible();
}

/** Waits until the autosave has written the latest change. */
export const saved = (page: Page) => expect(page.getByTestId('save-status')).toHaveText('All changes saved in this browser');
