import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, type Locator, type Page } from '@playwright/test';
import type { Project } from '@ivt/schema';
import { expectNoAxeViolations, scrollsSideways, settle } from './axe';
import {
  VIDEOS, addAt, completeSetup, drawer, nextButton, nodes, openEditor, openInteractions, saved, stepButton, titleField, tool,
  toolGroup, urlField, withStore,
} from './helpers';

const fake = (page: Page, js: string) => page.evaluate(`window.__fake.${js}`);
const notice = (page: Page) => page.getByTestId('notice');
const step3Heading = (page: Page) => page.getByRole('heading', { level: 2, name: 'Scoring & export' });
const toStep3 = async (page: Page) => {
  await page.getByRole('button', { name: 'Next: Scoring & export' }).click();
  await expect(step3Heading(page)).toBeFocused();
};
const mastery = (page: Page) => page.getByRole('textbox', { name: 'Mastery score (%)' });
const exportButton = (page: Page) => page.getByRole('button', { name: 'Export SCORM package' });
const previewButton = (page: Page) => page.getByRole('button', { name: 'Preview as learner' });
const preview = (page: Page) => page.getByRole('dialog', { name: 'Preview as learner' });

/** Presses Tab until `target` has focus (at most `max` presses): proves it is reachable by keyboard alone. */
async function tabTo(page: Page, target: Locator, max = 60) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

/** A saved project that no longer validates, so startup keeps it as "damaged data" and shows the recovery bar. */
async function openWithDamagedData(page: Page) {
  await openEditor(page);
  await withStore(page, (s) => s.saveProject({ version: 1, title: 'Old work', broken: true } as never));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Discard damaged data' })).toBeVisible();
}

/** Opens the preview with a True/False question card showing. */
async function previewWithCard(page: Page) {
  await addAt(page, 'True/False', 5);
  await page.keyboard.type('Leaves are green.');
  await previewButton(page).click();
  await preview(page).getByRole('button', { name: 'Play', exact: true }).click();
  await fake(page, 'advance(6)');
  const card = preview(page).getByRole('dialog', { name: 'True or false' });
  await expect(card).toBeVisible();
  return card;
}

const MODES = [
  { name: 'light', colorScheme: 'light', reducedMotion: 'no-preference' },
  { name: 'dark', colorScheme: 'dark', reducedMotion: 'no-preference' },
  { name: 'reduced motion', colorScheme: 'light', reducedMotion: 'reduce' },
] as const;

for (const mode of MODES) {
  test.describe(`axe, ${mode.name}`, () => {
    test.use({ colorScheme: mode.colorScheme, reducedMotion: mode.reducedMotion });

    test('Step 1: a valid video and title', async ({ page }) => {
      await openEditor(page);
      await completeSetup(page);
      await expectNoAxeViolations(page);
    });

    test('Step 1: a link that is not a YouTube link, with its error', async ({ page }) => {
      await openEditor(page);
      await urlField(page).fill('not a link');
      await page.keyboard.press('Tab');
      await expect(page.getByText("That doesn't look like a YouTube link")).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('Step 1: a video whose owner does not allow embedding', async ({ page }) => {
      await openEditor(page);
      await urlField(page).fill(`https://youtu.be/${VIDEOS.embedOff}`);
      await expect(page.getByText(/owner doesn't allow it/)).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('the confirm dialog ("Start new project")', async ({ page }) => {
      await openEditor(page);
      await completeSetup(page);
      await page.getByRole('button', { name: 'Start new project' }).click();
      await expect(page.getByRole('dialog', { name: 'Start a new project?' })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('the damaged-data recovery bar', async ({ page }) => {
      await openWithDamagedData(page);
      await expect(notice(page)).toContainText("couldn't be read");
      // A named region, so it is not stray content outside every landmark (axe best-practice "region").
      await expect(page.getByRole('region', { name: 'Damaged project data' })).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('the storage-unavailable notice', async ({ page }) => {
      await page.addInitScript(() => {
        IDBFactory.prototype.open = () => { throw new DOMException('Storage is blocked', 'SecurityError'); };
      });
      await openEditor(page);
      await expect(notice(page)).toHaveText('Saving is unavailable in this browser; export your project to keep it');
      await expectNoAxeViolations(page);
    });

    test('Step 2: empty state', async ({ page }) => {
      await openInteractions(page);
      await expect(page.getByText('Add your first checkpoint with a tool above')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    for (const name of ['Quiz', 'True/False', 'Text', 'Link', 'Image']) {
      test(`Step 2: the ${name} drawer`, async ({ page }) => {
        await openInteractions(page);
        await addAt(page, name, 10);
        await expect(drawer(page)).toBeVisible();
        if (name === 'Image') await expect(drawer(page).getByText('Add alt text or mark decorative')).toBeVisible();
        if (name === 'Link') await expect(drawer(page).getByText('Add a web address')).toBeVisible();
        await expectNoAxeViolations(page);
      });
    }

    test('Step 2: a checkpoint past the end of the video, flagged', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'Text', 150);
      await stepButton(page, /Setup/).click();
      await urlField(page).fill(`https://www.youtube.com/watch?v=${VIDEOS.other}`);
      await page.getByRole('button', { name: 'Change video' }).click();
      await expect(page.getByText('Video found')).toBeVisible();
      await stepButton(page, /Interactions/).click();
      await expect(drawer(page).getByText(/after the end of the video/)).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('Step 2: "Preview as learner" open with a question card showing', async ({ page }) => {
      await openInteractions(page);
      await previewWithCard(page);
      await expectNoAxeViolations(page);
    });

    test('Step 3: ready to export', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'Quiz', 10);
      await toStep3(page);
      await expect(page.getByText('Ready to export.')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('Step 3: with blockers', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'Link', 30);
      await addAt(page, 'Image', 45);
      await toStep3(page);
      await expect(page.getByText('Fix the 2 items below to export.')).toBeVisible();
      await expectNoAxeViolations(page);
    });

    test('Step 3: the retry, show-solution and captions controls, each away from its default', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'Quiz', 10);
      await toStep3(page);
      await page.getByRole('switch', { name: 'Let learners try a question again' }).click();
      await page.getByRole('switch', { name: 'Show the correct answer after checking' }).click();
      await page.getByRole('checkbox', { name: "I've checked that this video has captions" }).check();
      await expect(page.getByRole('switch', { name: 'Show the correct answer after checking' })).toHaveAttribute('aria-checked', 'false');
      await expectNoAxeViolations(page);
    });

    test('Step 2: preview with "Try again" showing, then with the solution revealed', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'True/False', 5);
      await page.keyboard.type('Leaves are green.');
      await toStep3(page);
      await page.getByRole('switch', { name: 'Let learners try a question again' }).click();
      await page.getByRole('button', { name: 'Back: Interactions' }).click();
      await previewButton(page).click();
      await preview(page).getByRole('button', { name: 'Play', exact: true }).click();
      await fake(page, 'advance(6)');
      const card = preview(page).getByRole('dialog', { name: 'True or false' });
      await card.getByRole('radio', { name: 'False' }).check();
      await card.getByRole('button', { name: 'Check answer' }).click();
      await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
      await expectNoAxeViolations(page);
      await card.getByRole('button', { name: 'Try again' }).click();
      await card.getByRole('radio', { name: 'True' }).check();
      await card.getByRole('button', { name: 'Check answer' }).click();
      await expect(card.locator('.ivp-solution-mark')).toHaveText('Correct answer');
      await expectNoAxeViolations(page);
    });

    test('Step 3: with an invalid mastery score', async ({ page }) => {
      await openInteractions(page);
      await addAt(page, 'Quiz', 10);
      await toStep3(page);
      await mastery(page).fill('abc');
      await expect(page.locator('#mastery-msg')).toHaveText('Enter a whole number from 0 to 100.');
      await expectNoAxeViolations(page);
    });
  });
}

test.describe('reflow at 320 CSS px (the same as 1280 px at 400% zoom)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test('no sideways scrolling on any step, in any drawer, in dialogs or in the preview', async ({ page }) => {
    await openWithDamagedData(page);
    expect(await scrollsSideways(page), 'Step 1 with the recovery bar').toBe(false);
    await completeSetup(page);
    expect(await scrollsSideways(page), 'Step 1').toBe(false);
    await page.getByRole('button', { name: 'Start new project' }).click();
    await settle(page);
    expect(await scrollsSideways(page), 'confirm dialog').toBe(false);
    await page.keyboard.press('Escape');
    await nextButton(page).click();
    expect(await scrollsSideways(page), 'Step 2 empty').toBe(false);
    for (const [i, name] of ['Quiz', 'True/False', 'Text', 'Link', 'Image'].entries()) {
      await addAt(page, name, 10 + i * 10);
      await expect(drawer(page)).toBeVisible();
      await settle(page);
      expect(await scrollsSideways(page), `${name} drawer`).toBe(false);
    }
    await previewButton(page).click();
    await preview(page).getByRole('button', { name: 'Play', exact: true }).click();
    await fake(page, 'advance(11)');
    await expect(preview(page).getByRole('dialog', { name: 'Question' })).toBeVisible();
    await settle(page);
    expect(await scrollsSideways(page), 'preview with a card').toBe(false);
    await preview(page).getByRole('button', { name: 'Close preview' }).click();
    await toStep3(page);
    expect(await scrollsSideways(page), 'Step 3 with blockers').toBe(false);
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
      return { visible: style !== 'none' && width >= 1 && !/rgba\(.*,\s*0\)$|transparent/.test(color), color };
    }, side);

  test('tool buttons, checkpoint nodes, the focus ring and Export keep visible edges', async ({ page }) => {
    await openInteractions(page);
    for (const b of await toolGroup(page).getByRole('button').all()) {
      expect((await edge(b, 'border')).visible, `${await b.textContent()} tool border`).toBe(true);
    }
    await addAt(page, 'Text', 10);
    await addAt(page, 'Quiz', 20);
    for (const n of await nodes(page).all()) expect((await edge(n, 'border')).visible, 'node border').toBe(true);
    // The selected node has an extra ring, so it is told apart without color.
    const selected = nodes(page).and(page.locator('[aria-current="true"]'));
    expect((await edge(selected, 'outline')).visible, 'selected node ring').toBe(true);
    expect((await edge(nodes(page).first(), 'outline')).visible, 'unselected node has no ring').toBe(false);
    // The keyboard focus ring.
    await tabTo(page, tool(page, 'Quiz'));
    expect((await edge(tool(page, 'Quiz'), 'outline')).visible, 'focus ring').toBe(true);
    await toStep3(page);
    expect((await edge(exportButton(page), 'border')).visible, 'Export border').toBe(true);
  });

  test('the learner Submit answers button in the preview keeps a visible edge', async ({ page }) => {
    await openInteractions(page);
    await addAt(page, 'Text', 5);
    await previewButton(page).click();
    await preview(page).getByRole('button', { name: 'Play', exact: true }).click();
    await fake(page, 'advance(6)');
    await preview(page).getByRole('dialog', { name: 'Note' }).getByRole('button', { name: 'Continue' }).click();
    await fake(page, 'advance(300)');
    const finish = preview(page).getByRole('button', { name: 'Finish' });
    expect((await edge(finish, 'border')).visible, 'Finish border').toBe(true);
  });
});

test('keyboard only: link, title, a quiz question, its time, mastery and Export', async ({ page }) => {
  await openEditor(page);
  // Step 1
  await tabTo(page, urlField(page));
  await page.keyboard.insertText(`https://www.youtube.com/watch?v=${VIDEOS.ok}`);
  await expect(page.getByText('Video found')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(titleField(page)).toBeFocused();
  await page.keyboard.type('Leaves');
  await tabTo(page, nextButton(page));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Interactions' })).toBeFocused();

  // Step 2: add a Quiz with its tool button; focus lands in the question field.
  await tabTo(page, tool(page, 'Quiz'));
  await page.keyboard.press('Enter');
  const question = drawer(page).getByRole('textbox', { name: 'Question', exact: true });
  await expect(question).toBeFocused();
  await page.keyboard.type('What do leaves need?');
  const choice1 = drawer(page).getByRole('textbox', { name: 'Choice 1', exact: true });
  await tabTo(page, choice1);
  await page.keyboard.type('Sunlight');
  const choice2 = drawer(page).getByRole('textbox', { name: 'Choice 2', exact: true });
  await tabTo(page, choice2);
  await page.keyboard.type('Water');
  const correct2 = drawer(page).getByRole('checkbox', { name: 'Correct answer: choice 2' });
  await tabTo(page, correct2);
  await page.keyboard.press('Space');
  await expect(correct2).toBeChecked();
  const time = drawer(page).getByRole('textbox', { name: 'Time', exact: true });
  await tabTo(page, time);
  await page.keyboard.type('0:30');
  await page.keyboard.press('Enter');
  await expect(time).toHaveValue('0:30');
  await expect(time).toBeFocused();
  await expect(nodes(page)).toHaveAccessibleName('Quiz question 1 at 0:30');

  // Step 3
  await tabTo(page, page.getByRole('button', { name: 'Next: Scoring & export' }));
  await page.keyboard.press('Enter');
  await expect(step3Heading(page)).toBeFocused();
  await tabTo(page, mastery(page));
  await page.keyboard.type('70');
  await expect(mastery(page)).toHaveValue('70');
  const retry = page.getByRole('switch', { name: 'Let learners try a question again' });
  await tabTo(page, retry);
  await page.keyboard.press('Space');
  await expect(retry).toHaveAttribute('aria-checked', 'true');
  const captions = page.getByRole('checkbox', { name: "I've checked that this video has captions" });
  await tabTo(page, captions);
  await page.keyboard.press('Space');
  await expect(captions).toBeChecked();
  await tabTo(page, exportButton(page));
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const file = await download;
  expect(file.suggestedFilename()).toBe('leaves.zip');
  await expect(exportButton(page)).toBeFocused();
  const zip = await JSZip.loadAsync(await readFile(await file.path()));
  const project = JSON.parse(await zip.file('project.json')!.async('string')) as Project;
  expect(project.settings).toMatchObject({ masteryPercent: 70, allowRetry: true, captionsConfirmed: true });
  expect(project.interactions).toMatchObject([{
    type: 'multipleChoice', time: 30, promptHtml: '<p>What do leaves need?</p>',
    choices: [{ html: 'Sunlight', correct: true }, { html: 'Water', correct: true }],
  }]);
});

test.describe('Ruling 12 fixes', () => {
  test('(1) Escape closes the preview while a scored question is open, and focus returns to "Preview as learner"', async ({ page }) => {
    await openInteractions(page);
    const card = await previewWithCard(page);
    await expect(card).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(preview(page)).toBeHidden();
    await expect(page.locator('.ivp-root')).toHaveCount(0);
    await expect(previewButton(page)).toBeFocused();
  });

  test('(1) Escape on an info card in the preview closes the preview too', async ({ page }) => {
    await openInteractions(page);
    await addAt(page, 'Text', 5);
    await previewButton(page).click();
    await preview(page).getByRole('button', { name: 'Play', exact: true }).click();
    await fake(page, 'advance(6)');
    await expect(preview(page).getByRole('dialog', { name: 'Note' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview(page)).toBeHidden();
    await expect(previewButton(page)).toBeFocused();
  });

  test('(2) after "Discard damaged data" focus moves to the main content, not the page body', async ({ page }) => {
    await openWithDamagedData(page);
    await tabTo(page, page.getByRole('button', { name: 'Discard damaged data' }));
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Discard damaged data' })).toHaveCount(0);
    await expect(notice(page)).toHaveText('Discarded the damaged data.');
    await expect(page.locator('#main')).toBeFocused();
  });

  test('(5) the author scrubber shows and announces a message when its video player fails', async ({ page }) => {
    await openInteractions(page);
    const region = page.getByTestId('scrubber-status');
    await expect(region).toHaveAttribute('role', 'status');
    expect(await region.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await expect(region).toBeEmpty();
    await fake(page, "emitError('api-load-failed')");
    await expect(region).toHaveText(/The YouTube player couldn't load/);
    await expect(region).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('(6) the Step 3 export reason is an always-present polite live region that updates in place', async ({ page }) => {
    await openInteractions(page);
    await addAt(page, 'Quiz', 10);
    await toStep3(page);
    const reason = page.locator('#export-reason');
    await expect(reason).toHaveAttribute('role', 'status');
    await expect(reason).toHaveText('Ready to export.');
    await reason.evaluate((el) => { (el as any).__same = true; });
    await mastery(page).fill('abc');
    await expect(reason).toHaveText('Fix the item below to export.');
    await mastery(page).fill('70');
    await expect(reason).toHaveText('Ready to export.');
    expect(await reason.evaluate((el) => (el as any).__same)).toBe(true); // the same element: never remounted
    expect(await reason.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    await saved(page);
  });
});
