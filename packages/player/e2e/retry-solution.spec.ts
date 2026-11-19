import { test, expect, type Page } from '@playwright/test';

// Per-question retry (settings.allowRetry, default off) and show-solution (settings.showSolution, default on).
// The test page takes ?retry=1|0 and ?solution=1|0; without them the project leaves both unset (the defaults).

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

const open = async (page: Page, params = '') => {
  await logAnnouncements(page);
  await page.goto(`/e2e/index.html?adapter=fake${params}`);
  await expect(page.locator('.ivp-play')).toBeVisible();
};
/** Advance the fake player in small steps (below the 1.5 s scrub tolerance). */
const advance = (page: Page, seconds: number) =>
  page.evaluate((s) => {
    const f = (window as any).__fake;
    for (let left = s; left > 1e-9; left -= 0.5) f.advance(Math.min(0.5, left));
  }, seconds);
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true }).click();
const dialog = (page: Page) => page.getByRole('dialog');
const tryAgain = (page: Page) => dialog(page).getByRole('button', { name: 'Try again' });
const check = async (page: Page, choice: string, role: 'radio' | 'checkbox' = 'radio') => {
  await dialog(page).getByRole(role, { name: choice }).check();
  await dialog(page).getByRole('button', { name: 'Check answer' }).click();
};
/** The text marker shown inside a correct choice when the solution is revealed. */
const marks = (page: Page) => dialog(page).locator('.ivp-solution-mark');
const toFirstQuestion = async (page: Page) => {
  await play(page);
  await advance(page, 5);
  await expect(dialog(page)).toHaveAccessibleName('Question');
};

test.describe('per-question retry', () => {
  test('off by default: a wrong check locks the choices and offers no "Try again"', async ({ page }) => {
    await open(page);
    await toFirstQuestion(page);
    await check(page, 'Green');
    await expect(dialog(page).getByText('No, that is grass.')).toBeVisible();
    await expect(tryAgain(page)).toHaveCount(0);
    for (const r of await dialog(page).getByRole('radio').all()) await expect(r).toBeDisabled();
    await expect(dialog(page).getByRole('button', { name: 'Continue' })).toBeFocused();
  });

  test('retry=0 behaves the same as the default', async ({ page }) => {
    await open(page, '&retry=0');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await expect(dialog(page).getByText('Incorrect')).toBeVisible();
    await expect(tryAgain(page)).toHaveCount(0);
  });

  test('on: a wrong check shows "Try again" next to Continue; pressing it unlocks the choices for a new answer', async ({ page }) => {
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    await check(page, 'Green');
    const actions = dialog(page).locator('.ivp-actions').getByRole('button');
    await expect(actions).toHaveText(['Try again', 'Continue']);
    await expect(dialog(page).getByRole('button', { name: 'Continue' })).toBeFocused();

    await tryAgain(page).click();
    // The check is cleared: no verdict, no feedback, nothing chosen, choices enabled, "Check answer" back.
    await expect(dialog(page).locator('.ivp-feedback')).toBeHidden();
    await expect(dialog(page).getByText('No, that is grass.')).toHaveCount(0);
    for (const r of await dialog(page).getByRole('radio').all()) {
      await expect(r).toBeEnabled();
      await expect(r).not.toBeChecked();
    }
    await expect(actions).toHaveText(['Check answer']);
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
    expect((await said(page)).at(-1)).toBe('Try again. Choose an answer.');

    await check(page, 'Blue');
    await expect(dialog(page).getByText('Yes, blue.')).toBeVisible();
    await expect(tryAgain(page)).toHaveCount(0); // a correct check never offers another try
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    expect((await page.evaluate(() => (window as any).__progress.at(-1))).answers).toEqual({ q1: ['a'] });
  });

  test('on: a correct first check offers no "Try again"', async ({ page }) => {
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await expect(dialog(page).getByText('Correct', { exact: true })).toBeVisible();
    await expect(tryAgain(page)).toHaveCount(0);
  });

  test('on: the answer scored at Submit is the last one checked, for multiple choice and true/false', async ({ page }) => {
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    // q1: wrong, then right. The held answer follows the last check.
    await check(page, 'Green');
    expect((await page.evaluate(() => (window as any).__progress.at(-1))).answers).toEqual({ q1: ['b'] });
    await tryAgain(page).click();
    await check(page, 'Blue');
    expect((await page.evaluate(() => (window as any).__progress.at(-1))).answers).toEqual({ q1: ['a'] });
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    // q2 (true/false): wrong twice, then Continue. There is no limit on tries.
    await advance(page, 5);
    await expect(dialog(page)).toHaveAccessibleName('True or false');
    await check(page, 'True');
    await tryAgain(page).click();
    await expect(dialog(page).getByRole('radio', { name: 'True' })).toBeFocused();
    await check(page, 'True');
    await expect(tryAgain(page)).toBeVisible();
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    for (let i = 0; i < 3; i++) {
      await advance(page, 5);
      await dialog(page).getByRole('button', { name: 'Continue' }).click();
    }
    await advance(page, 5);
    await dialog(page).getByRole('button', { name: 'Submit answers' }).click();
    await expect(dialog(page)).toContainText('1 of 2 correct');
    expect(await page.evaluate(() => (window as any).__results)).toEqual([
      { raw: 1, max: 2, percent: 50, passed: true, scored: true, status: 'passed' },
    ]);
    // Submission stays final: nothing on the results screen offers another try.
    await expect(tryAgain(page)).toHaveCount(0);
  });

  test('on: keyboard only, "Try again" is reached with Shift+Tab from Continue and puts focus on the first choice', async ({ page }) => {
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    await expect(dialog(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dialog(page).getByRole('radio', { name: 'Green' })).toBeChecked();
    for (let i = 0; i < 5 && !(await dialog(page).getByRole('button', { name: 'Check answer' }).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('button', { name: 'Continue' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(tryAgain(page)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeChecked();
    for (let i = 0; i < 5 && !(await dialog(page).getByRole('button', { name: 'Check answer' }).evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect(dialog(page).getByRole('button', { name: 'Continue' })).toBeFocused();
    await expect(dialog(page)).toContainText('Yes, blue.');
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('.ivp-play')).toBeFocused();
  });

  test('on: Escape still never dismisses a scored question, before or after a wrong check', async ({ page }) => {
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveAccessibleName('Question');
    await tryAgain(page).click();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toHaveAccessibleName('Question');
  });

  test('on: resuming skips a question already answered, even wrongly', async ({ page }) => {
    const initial = encodeURIComponent(JSON.stringify({ furthest: 12, answers: { q1: ['b'] }, submitted: false }));
    await open(page, `&retry=1&lock=1&initial=${initial}`);
    await play(page);
    await page.locator('input[type=range]').fill('11');
    await advance(page, 0.5);
    await expect(dialog(page)).toContainText('Water is dry.');
  });

  test('with reduced motion, "Try again" adds no transition or animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '&retry=1');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await tryAgain(page).click();
    const card = page.locator('.ivp-card');
    expect(await card.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe('show solution', () => {
  test('on by default: after a wrong check the correct choice is labelled in text and named in the feedback', async ({ page }) => {
    await open(page);
    await toFirstQuestion(page);
    await check(page, 'Green');
    await expect(marks(page)).toHaveCount(1);
    await expect(marks(page)).toHaveText('Correct answer');
    // The marker is inside the correct choice's label, so it is part of that choice's name, not color only.
    await expect(dialog(page).locator('.ivp-choice', { hasText: 'Blue' }).locator('.ivp-solution-mark')).toBeVisible();
    await expect(dialog(page).getByRole('radio', { name: 'Blue Correct answer' })).toBeVisible();
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answer: Blue.');
    expect(await said(page)).toEqual(['Video paused.', 'Incorrect. No, that is grass. Correct answer: Blue.']);
  });

  test('on: after a correct check too, said once', async ({ page }) => {
    await open(page, '&solution=1');
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await expect(marks(page)).toHaveCount(1);
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answer: Blue.');
    expect(await said(page)).toEqual(['Video paused.', 'Correct. Yes, blue. Correct answer: Blue.']);
  });

  test('on: a question with several correct choices marks each and lists them', async ({ page }) => {
    await open(page, '&fixture=multi');
    await toFirstQuestion(page);
    await check(page, '4', 'checkbox');
    await expect(marks(page)).toHaveCount(2);
    for (const name of ['2', '3']) {
      await expect(dialog(page).locator('.ivp-choice', { hasText: name }).locator('.ivp-solution-mark')).toBeVisible();
    }
    await expect(dialog(page).locator('.ivp-choice', { hasText: '4' }).locator('.ivp-solution-mark')).toHaveCount(0);
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answers: 2, 3.');
  });

  test('on: a true/false question reveals its answer too', async ({ page }) => {
    await open(page);
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await dialog(page).getByRole('button', { name: 'Continue' }).click();
    await advance(page, 5);
    await check(page, 'True');
    await expect(dialog(page).locator('.ivp-choice', { hasText: 'False' }).locator('.ivp-solution-mark')).toBeVisible();
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answer: False.');
  });

  test('off: only correct or incorrect and the author feedback; the answer is never revealed', async ({ page }) => {
    await open(page, '&solution=0');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await expect(dialog(page).getByText('No, that is grass.')).toBeVisible();
    await expect(marks(page)).toHaveCount(0);
    await expect(dialog(page)).not.toContainText('Correct answer');
    expect(await said(page)).toEqual(['Video paused.', 'Incorrect. No, that is grass.']);
  });

  test('off: a correct check shows no marker either', async ({ page }) => {
    await open(page, '&solution=0');
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await expect(marks(page)).toHaveCount(0);
    await expect(dialog(page)).not.toContainText('Correct answer');
  });

  test('with retry on: no reveal after a wrong check; revealed after the correct one', async ({ page }) => {
    await open(page, '&retry=1&solution=1');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await expect(tryAgain(page)).toBeVisible();
    await expect(marks(page)).toHaveCount(0);
    await expect(dialog(page)).not.toContainText('Correct answer');
    await tryAgain(page).click();
    await check(page, 'Green');
    await expect(marks(page)).toHaveCount(0);
    await tryAgain(page).click();
    await check(page, 'Blue');
    await expect(marks(page)).toHaveCount(1);
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answer: Blue.');
    expect(await said(page)).toEqual([
      'Video paused.',
      'Incorrect. No, that is grass.',
      'Try again. Choose an answer.',
      'Incorrect. No, that is grass.',
      'Try again. Choose an answer.',
      'Correct. Yes, blue. Correct answer: Blue.',
    ]);
  });

  test('the solution text is plain text, never author markup run as HTML', async ({ page }) => {
    await open(page, '&fixture=xss');
    await toFirstQuestion(page);
    await check(page, 'B');
    await expect(dialog(page).locator('.ivp-feedback')).toContainText('Correct answer: A.');
    expect(await dialog(page).locator('script, iframe, img, [onclick], [onerror], a[href^="javascript"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});

test.describe('double activation: a button swapped in under the pointer or focus ignores it for a moment', () => {
  // ?clock=manual stops the card's clock; __tick moves it on, so "after the window" needs no sleep.
  const WINDOW = 400;
  const tick = (page: Page, ms = WINDOW) => page.evaluate((m) => (window as any).__tick(m), ms);
  const checkBtn = (page: Page) => dialog(page).getByRole('button', { name: 'Check answer' });
  const cont = (page: Page) => dialog(page).getByRole('button', { name: 'Continue' });
  const radiosLocked = async (page: Page, locked: boolean) => {
    for (const r of await dialog(page).getByRole('radio').all()) await (locked ? expect(r).toBeDisabled() : expect(r).toBeEnabled());
  };

  test('double-clicking "Check answer" on a wrong answer (retry on) keeps the feedback; "Try again" works later', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await dialog(page).getByRole('radio', { name: 'Green' }).check();
    await checkBtn(page).dblclick();
    await expect(dialog(page).getByText('No, that is grass.')).toBeVisible();
    await radiosLocked(page, true);
    await expect(tryAgain(page)).toBeVisible();
    expect(await said(page)).toEqual(['Video paused.', 'Incorrect. No, that is grass.']);
    await tick(page);
    await tryAgain(page).click();
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
    expect((await said(page)).at(-1)).toBe('Try again. Choose an answer.');
  });

  test('double-clicking "Try again" shows no "Choose an answer first."; the choices are unlocked and focused', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await tick(page);
    await tryAgain(page).dblclick();
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
    await radiosLocked(page, false);
    await expect(dialog(page).getByText('Choose an answer first.')).toHaveCount(0);
    expect(await said(page)).not.toContain('Choose an answer first.');
    // A deliberate check after the window works.
    await tick(page);
    await check(page, 'Blue');
    await expect(dialog(page).getByText('Yes, blue.')).toBeVisible();
  });

  // In this test page the feedback pushes the buttons down, so a real double-click's second press misses the new
  // button. These click the swapped-in button itself, with the clock still inside the window, as the second press of
  // a double-click does when the layout does not move it.
  test('a click on "Try again" or "Continue" just after they replace "Check answer" is ignored', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await tryAgain(page).click();
    await expect(dialog(page).getByText('No, that is grass.')).toBeVisible();
    await radiosLocked(page, true);
    await cont(page).click();
    await expect(dialog(page)).toHaveAccessibleName('Question');
    expect(await said(page)).toEqual(['Video paused.', 'Incorrect. No, that is grass.']);
    await tick(page, WINDOW - 1);
    await cont(page).click();
    await expect(dialog(page)).toHaveAccessibleName('Question');
    await tick(page, 1);
    await tryAgain(page).click();
    await expect(dialog(page).getByRole('radio', { name: 'Blue' })).toBeFocused();
  });

  test('a click on "Check answer" just after it replaces "Try again" is ignored', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await check(page, 'Green');
    await tick(page);
    await tryAgain(page).click();
    await checkBtn(page).click();
    await expect(dialog(page).getByText('Choose an answer first.')).toHaveCount(0);
    expect(await said(page)).not.toContain('Choose an answer first.');
    await tick(page);
    await checkBtn(page).click();
    await expect(dialog(page).getByText('Choose an answer first.')).toBeVisible();
  });

  test('a click on "Continue" just after a correct check (no retry) is ignored, so the feedback is not skipped', async ({ page }) => {
    await open(page, '&clock=manual');
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await cont(page).click();
    await expect(dialog(page).getByText('Yes, blue.')).toBeVisible();
    await tick(page);
    await cont(page).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('a rapid double Enter on "Check answer" does not go through "Continue"', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await dialog(page).getByRole('radio', { name: 'Green' }).check();
    await checkBtn(page).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(cont(page)).toBeFocused();
    await expect(dialog(page).getByText('No, that is grass.')).toBeVisible();
    await expect(tryAgain(page)).toBeVisible();
    await tick(page);
    await page.keyboard.press('Enter');
    await expect(dialog(page)).toHaveCount(0);
  });

  test('double-clicking "Check answer" on a correct answer (no retry) does not skip the feedback via "Continue"', async ({ page }) => {
    await open(page, '&clock=manual');
    await toFirstQuestion(page);
    await dialog(page).getByRole('radio', { name: 'Blue' }).check();
    await checkBtn(page).dblclick();
    await expect(dialog(page)).toHaveAccessibleName('Question');
    await expect(dialog(page).getByText('Yes, blue.')).toBeVisible();
    await tick(page);
    await cont(page).click();
    await expect(dialog(page)).toHaveCount(0);
  });

  test('true/false: a double-click on "Check answer", wrong with retry and right without, never clicks through', async ({ page }) => {
    await open(page, '&retry=1&clock=manual');
    await toFirstQuestion(page);
    await check(page, 'Blue');
    await tick(page);
    await cont(page).click();
    await advance(page, 5);
    await expect(dialog(page)).toHaveAccessibleName('True or false');
    await dialog(page).getByRole('radio', { name: 'True' }).check();
    await checkBtn(page).dblclick();
    await expect(dialog(page).getByText('It is wet.')).toBeVisible();
    await radiosLocked(page, true);
    await tryAgain(page).click(); // still inside the window
    await radiosLocked(page, true);
    expect(await said(page)).not.toContain('Try again. Choose an answer.');
    await tick(page);
    await tryAgain(page).click();
    await dialog(page).getByRole('radio', { name: 'False' }).check();
    await tick(page);
    await checkBtn(page).dblclick();
    await cont(page).click(); // still inside the window
    await expect(dialog(page)).toHaveAccessibleName('True or false');
    await expect(dialog(page).getByText('Right, it is wet.')).toBeVisible();
  });
});
