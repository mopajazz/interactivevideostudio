import { test, expect, type Locator, type Page } from '@playwright/test';
import { expectNoAxeViolations, scrollsSideways, settle } from './axe';

const open = async (page: Page, params = '') => {
  await page.goto(`/e2e/index.html?adapter=fake${params}`);
  await expect(page.locator('.ivp-play')).toBeVisible();
};
/** Advance the fake player in small steps (below the 1.5 s scrub tolerance). */
const advance = (page: Page, seconds: number) =>
  page.evaluate((s) => {
    const f = (window as any).__fake;
    for (let left = s; left > 1e-9; left -= 0.5) f.advance(Math.min(0.5, left));
  }, seconds);
const dialog = (page: Page) => page.getByRole('dialog');
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true }).click();

/** Answers the current question card with `choice` and checks it (feedback is then showing). */
const answer = async (page: Page, choice: string) => {
  await dialog(page).getByRole('radio', { name: choice }).check();
  await dialog(page).getByRole('button', { name: 'Check answer' }).click();
};
const ANSWERS: Record<string, string> = { Question: 'Blue', 'True or false': 'False' };
/**
 * From the start of the scored fixture (checkpoints every 5 s), plays on, answering each question correctly and
 * continuing past each card, until the card titled `name` is open.
 */
const reach = async (page: Page, name: string) => {
  await play(page);
  for (let i = 0; i < 7; i++) {
    await advance(page, 5);
    const title = await dialog(page).locator('.ivp-card-title').textContent();
    if (title === name) return;
    if (ANSWERS[title!]) await answer(page, ANSWERS[title!]!);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
  }
  throw new Error(`never reached ${name}`);
};
const toFinal = (page: Page) => reach(page, 'End of video');

/** Presses Tab until `target` has focus (at most `max` presses), so a test proves it is reachable by keyboard. */
async function tabTo(page: Page, target: Locator, max = 15) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** Records every message the player's live announcer speaks, in order. */
const logAnnouncements = (page: Page) =>
  page.addInitScript(() => {
    const w = window as any;
    w.__said = [];
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (el.classList?.contains('ivp-announcer')) w.__said.push(el.textContent?.trim());
      }
    }).observe(document, { childList: true, subtree: true });
  });
const said = (page: Page) => page.evaluate(() => (window as any).__said as string[]);

test.describe('axe: no WCAG 2.2 A/AA violations', () => {
  test('playing, with the playbar controls', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 2);
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause');
    await expectNoAxeViolations(page);
  });

  test('multiple-choice card open (with its hint shown)', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    await expect(dialog(page)).toHaveAccessibleName('Question');
    await expectNoAxeViolations(page);
    await dialog(page).getByRole('button', { name: 'Show hint' }).click();
    await expectNoAxeViolations(page);
  });

  test('true/false card open, and the empty-answer message', async ({ page }) => {
    await open(page);
    await reach(page, 'True or false');
    await expect(dialog(page)).toHaveAccessibleName('True or false');
    await expectNoAxeViolations(page);
    await dialog(page).getByRole('button', { name: 'Check answer' }).click();
    await expect(dialog(page).getByText('Choose an answer first.')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('feedback shown (correct and incorrect)', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    await answer(page, 'Blue');
    await expect(dialog(page).getByText('Yes, blue.')).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 5);
    await answer(page, 'True');
    await expect(dialog(page).getByText('It is wet.')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('info cards: text, link and image', async ({ page }) => {
    await open(page);
    await reach(page, 'Note');
    for (const name of ['Note', 'Link', 'Image']) {
      await expect(dialog(page)).toHaveAccessibleName(name);
      await expectNoAxeViolations(page);
      await dialog(page).getByRole('button', { name: 'Continue' }).click();
      await advance(page, 5);
    }
  });

  test('final "Submit answers" screen, then the results after submitting', async ({ page }) => {
    await open(page);
    await toFinal(page);
    await expect(dialog(page).getByRole('button', { name: 'Submit answers' })).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog(page).getByRole('button', { name: 'Submit answers' }).click();
    await expect(dialog(page)).toContainText('Your score: 100%');
    await expectNoAxeViolations(page);
  });

  test('final "Finish" screen (no scored questions)', async ({ page }) => {
    await open(page, '&fixture=unscored');
    await play(page);
    await advance(page, 5);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 25);
    await expect(dialog(page).getByRole('button', { name: 'Finish' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('fatal error panel (embed disabled)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__fake.emitError(150));
    await expect(page.getByRole('alert')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('inside the LMS-style iframe host page, playbar and an open card', async ({ page }) => {
    await page.goto('/e2e/host.html?adapter=fake');
    const frame = page.frame({ url: /index\.html/ })!;
    await expect(frame.locator('.ivp-play')).toBeVisible();
    await expectNoAxeViolations(page);
    await frame.locator('.ivp-play').click();
    await frame.evaluate(() => { const f = (window as any).__fake; for (let i = 0; i < 10; i++) f.advance(0.5); });
    await expect(frame.getByRole('dialog')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});

for (const colorScheme of ['light', 'dark'] as const) {
  // The player has one color theme; it is scanned with both system settings so neither can break it.
  test.describe(`axe, retry and show-solution states (system ${colorScheme})`, () => {
    test.use({ colorScheme });

    test('a question card with "Try again" showing, and after pressing it', async ({ page }) => {
      await open(page, '&retry=1');
      await play(page);
      await advance(page, 5);
      await answer(page, 'Green');
      await expect(dialog(page).getByRole('button', { name: 'Try again' })).toBeVisible();
      await expectNoAxeViolations(page);
      await dialog(page).getByRole('button', { name: 'Try again' }).click();
      await expect(dialog(page).getByRole('button', { name: 'Check answer' })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('a card with the solution revealed, after a wrong and after a correct check', async ({ page }) => {
      await open(page, '&solution=1');
      await play(page);
      await advance(page, 5);
      await answer(page, 'Green');
      await expect(dialog(page).locator('.ivp-solution-mark')).toHaveText('Correct answer');
      await expectNoAxeViolations(page);
      await dialog(page).getByRole('button', { name: 'Continue' }).click();
      await advance(page, 5);
      await answer(page, 'False');
      await expect(dialog(page).locator('.ivp-solution-mark')).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
}

test.describe('reflow at 320 CSS px (the same as 1280 px at 400% zoom)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('no sideways scrolling while playing, on a card, on the final screen and on the error panel', async ({ page }) => {
    await open(page);
    expect(await scrollsSideways(page), 'playbar').toBe(false);
    await play(page);
    await advance(page, 5);
    await expect(dialog(page)).toBeVisible();
    await settle(page);
    expect(await scrollsSideways(page), 'question card').toBe(false);
    await dialog(page).getByRole('button', { name: 'Show hint' }).click();
    await answer(page, 'Green');
    expect(await scrollsSideways(page), 'feedback').toBe(false);
    await page.goto('/e2e/index.html?adapter=fake&fixture=unscored');
    await play(page);
    await advance(page, 5);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 25);
    await expect(dialog(page).getByRole('button', { name: 'Finish' })).toBeVisible();
    expect(await scrollsSideways(page), 'final screen').toBe(false);
    await page.evaluate(() => (window as any).__fake.emitError(101));
    expect(await scrollsSideways(page), 'error panel').toBe(false);
  });
});

test.describe('forced colors (Windows High Contrast)', () => {
  test.use({ forcedColors: 'active' });

  const edge = (l: Locator, side: 'border' | 'outline') =>
    l.evaluate((el, side) => {
      const s = getComputedStyle(el);
      const style = side === 'border' ? s.borderTopStyle : s.outlineStyle;
      const width = parseFloat(side === 'border' ? s.borderTopWidth : s.outlineWidth);
      const color = side === 'border' ? s.borderTopColor : s.outlineColor;
      return { visible: style !== 'none' && width >= 1 && !/rgba\(.*,\s*0\)$|transparent/.test(color), style, width, color };
    }, side);

  test('the Submit answers button and the focus ring keep a visible edge', async ({ page }) => {
    await open(page);
    expect((await edge(page.locator('.ivp-play'), 'border')).visible, 'play button border').toBe(true);
    await page.keyboard.press('Tab');
    await expect(page.locator('.ivp-play')).toBeFocused();
    expect((await edge(page.locator('.ivp-play'), 'outline')).visible, 'focus ring').toBe(true);
    await toFinal(page);
    const submit = dialog(page).getByRole('button', { name: 'Submit answers' });
    expect((await edge(submit, 'border')).visible, 'Submit border').toBe(true);
    await submit.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(submit).toBeFocused();
    expect((await edge(submit, 'outline')).visible, 'Submit focus ring').toBe(true);
  });
});

test.describe('forced colors: the solution marker', () => {
  test.use({ forcedColors: 'active' });

  test('"Correct answer" stays visible as text with its own edge, so it does not rely on color', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    await answer(page, 'Green');
    const mark = dialog(page).locator('.ivp-choice', { hasText: 'Blue' }).locator('.ivp-solution-mark');
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText('Correct answer');
    const s = await mark.evaluate((el) => {
      const c = getComputedStyle(el);
      return { border: c.borderTopStyle, width: parseFloat(c.borderTopWidth), color: c.color, borderColor: c.borderTopColor, bg: c.backgroundColor };
    });
    expect(s.border).toBe('solid');
    expect(s.width).toBeGreaterThanOrEqual(1);
    // In forced colors the text and its border take the system text color, which differs from the background.
    expect(s.color).toBe(s.borderColor);
    expect(s.color).not.toBe(s.bg);
    // Only the correct choice carries it.
    await expect(dialog(page).locator('.ivp-choice', { hasText: 'Green' }).locator('.ivp-solution-mark')).toHaveCount(0);
  });
});

test.describe('keyboard only', () => {
  test('Tab to Play, play, answer, continue, reach the end, Submit answers, hear and see the result', async ({ page }) => {
    await open(page);
    const playBtn = page.locator('.ivp-play');
    await tabTo(page, playBtn);
    await page.keyboard.press('Enter');
    await expect(playBtn).toHaveAccessibleName('Pause');
    await expect(playBtn).toBeFocused();

    // Question 1: focus moves into the card; arrow keys choose; Check answer; Continue returns to the playbar.
    await advance(page, 5);
    const card = dialog(page);
    await expect(card).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(card.getByRole('radio', { name: 'Blue' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(card.getByRole('radio', { name: 'Blue' })).toBeChecked();
    await tabTo(page, card.getByRole('button', { name: 'Check answer' }));
    await page.keyboard.press('Enter');
    await expect(card.getByRole('button', { name: 'Continue' })).toBeFocused();
    await expect(card).toContainText('Yes, blue.');
    await page.keyboard.press('Enter');
    await expect(card).toHaveCount(0);
    await expect(playBtn).toBeFocused();

    // Question 2 (true/false), answered with the arrow keys.
    await advance(page, 5);
    await expect(card).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(card.getByRole('radio', { name: 'True' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(card.getByRole('radio', { name: 'False' })).toBeChecked();
    await tabTo(page, card.getByRole('button', { name: 'Check answer' }));
    await page.keyboard.press('Enter');
    await expect(card.getByRole('button', { name: 'Continue' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(playBtn).toBeFocused();

    // Text, link and image cards: Continue is reachable by Tab.
    for (const name of ['Note', 'Link', 'Image']) {
      await advance(page, 5);
      await expect(card).toHaveAccessibleName(name);
      await expect(card).toBeFocused();
      if (name === 'Link') {
        await page.keyboard.press('Tab');
        await expect(card.getByRole('link', { name: 'Open link' })).toBeFocused();
      }
      await tabTo(page, card.getByRole('button', { name: 'Continue' }));
      await page.keyboard.press('Enter');
      await expect(playBtn).toBeFocused();
    }

    // The end: the final screen takes focus; Submit answers; focus moves to the result.
    await advance(page, 5);
    await expect(card).toHaveAccessibleName('End of video');
    await expect(card).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(card.getByRole('button', { name: 'Submit answers' })).toBeFocused();
    await page.keyboard.press('Enter');
    const result = card.locator('.ivp-result');
    await expect(result).toBeFocused();
    await expect(result).toContainText('Your score: 100%');
    await expect(result).toContainText('2 of 2 correct');
    await expect(page.locator('.ivp-announcer')).toContainText('Your score: 100%');
    expect(await page.evaluate(() => (window as any).__results)).toEqual([
      { raw: 2, max: 2, percent: 100, passed: true, scored: true, status: 'passed' },
    ]);
  });
});

test.describe('Ruling 12 fixes', () => {
  test('(1) Escape calls onEscape for any open card; the player itself never dismisses a scored question', async ({ page }) => {
    await open(page, '&escape=1');
    await play(page);
    await advance(page, 5);
    await expect(dialog(page)).toHaveAccessibleName('Question');
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => (window as any).__escapes)).toBe(1);
    await expect(dialog(page)).toHaveAccessibleName('Question');
    // An info card: Escape still closes it, and the host hears about it too.
    await page.goto('/e2e/index.html?adapter=fake&escape=1');
    await reach(page, 'Note');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__escapes)).toBe(1);
    // The final screen is a card too: the host hears Escape, the screen stays.
    await page.goto('/e2e/index.html?adapter=fake&escape=1&fixture=unscored');
    await play(page);
    await advance(page, 5);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 25);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveAccessibleName('End of video');
    expect(await page.evaluate(() => (window as any).__escapes)).toBe(1);
  });

  test('(1) without onEscape, Escape on a scored question does nothing', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveAccessibleName('Question');
  });

  test('(3) opening a card announces only "Video paused." (the dialog name says what it is)', async ({ page }) => {
    await logAnnouncements(page);
    await open(page);
    await play(page);
    await advance(page, 5);
    await expect(dialog(page)).toHaveAccessibleName('Question');
    expect(await said(page)).toEqual(['Video paused.']);
  });

  test('(3) the final screen adds no announcement its dialog title already gives', async ({ page }) => {
    await logAnnouncements(page);
    await open(page, '&fixture=unscored');
    await play(page);
    await advance(page, 5);
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 25);
    await expect(dialog(page)).toHaveAccessibleName('End of video');
    expect(await said(page)).toEqual(['Video paused.']);
    await dialog(page).getByRole('button', { name: 'Finish' }).click();
    expect((await said(page)).at(-1)).toBe('Finished. Thanks for watching.');
  });

  test('(4) after a fatal error the playbar controls are disabled and out of the Tab order', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__fake.emitError(101));
    await expect(page.getByRole('alert')).toBeVisible();
    const bar = page.locator('.ivp-bar');
    await expect(bar).toHaveAttribute('inert', '');
    for (const control of await bar.locator('button, input, select').all()) await expect(control).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('alert').getByRole('link', { name: 'Watch on YouTube' })).toBeFocused();
    await page.locator('.ivp-play').click({ force: true });
    expect(await page.evaluate(() => (window as any).__fake.getCurrentTime())).toBe(0);
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Play');
  });
});
