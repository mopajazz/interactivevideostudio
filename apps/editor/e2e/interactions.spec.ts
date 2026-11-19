import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import type { Project } from '@ivt/schema';
import {
  PNG, VIDEOS, addAt, drawer, nodes, openInteractions, playhead, saved, seek, stepButton, timeline, tool, toolGroup, urlField, withStore,
} from './helpers';

test.beforeEach(async ({ page }) => openInteractions(page));

/** Reads the autosaved project from IndexedDB and picks a value from it (undefined until it is saved). */
const stored = <T,>(page: Page, pick: (p: Project) => T) =>
  withStore(page, (s) => s.loadProject()).then((p) => (p ? pick(p) : undefined));
const nodeNames = (page: Page) => nodes(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const fake = (page: Page, js: string) => page.evaluate(`window.__fake.${js}`);
const focusedName = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    const by = el.getAttribute('aria-labelledby');
    const labelled = by ? by.split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ') : '';
    const label = (el as HTMLInputElement).labels?.[0]?.textContent ?? '';
    return (el.getAttribute('aria-label') || labelled || label || el.textContent || '').trim();
  });

/** Exports the project JSON through the real button and returns what was downloaded. */
async function exportJson(page: Page, path: string) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await (await download).saveAs(path);
  return JSON.parse(await readFile(path, 'utf8')) as { project: any; assets: Record<string, unknown> };
}

test.describe('layout', () => {
  test('five tool buttons sit across the top of the video in the order Quiz, True/False, Text, Link, Image', async ({ page }) => {
    await expect(toolGroup(page).getByRole('button')).toHaveText(['Quiz', 'True/False', 'Text', 'Link', 'Image']);
    // Each has an icon as well as its words, so color is never the only cue.
    for (const b of await toolGroup(page).getByRole('button').all()) await expect(b.locator('svg')).toHaveCount(1);
    const tools = (await toolGroup(page).boundingBox())!;
    const video = (await page.getByTestId('author-video').boundingBox())!;
    const line = (await timeline(page).boundingBox())!;
    expect(tools.y + tools.height).toBeLessThanOrEqual(video.y);
    expect(video.y + video.height).toBeLessThanOrEqual(line.y);
  });

  test('shows an empty state until the first checkpoint is added', async ({ page }) => {
    await expect(page.getByText('Add your first checkpoint with a tool above')).toBeVisible();
    await expect(nodes(page)).toHaveCount(0);
    await tool(page, 'Text').click();
    await expect(page.getByText('Add your first checkpoint with a tool above')).toHaveCount(0);
  });

  test('the scrubber is a labelled play button, a slider with the time in words, and a time label', async ({ page }) => {
    const controls = page.getByRole('group', { name: 'Video controls' });
    await expect(controls.getByRole('button', { name: 'Play' })).toBeVisible();
    await expect(playhead(page)).toHaveAttribute('aria-valuetext', '0 seconds of 3 minutes 32 seconds');
    await controls.getByRole('button', { name: 'Play' }).click();
    await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible();
    await fake(page, 'advance(65)');
    await expect(playhead(page)).toHaveAttribute('aria-valuetext', '1 minute 5 seconds of 3 minutes 32 seconds');
    await expect(controls.getByText('1:05 / 3:32')).toBeVisible();
    await controls.getByRole('button', { name: 'Pause' }).click();
    await seek(page, 30);
    expect(await fake(page, 'getCurrentTime()')).toBe(30);
    await expect(controls.getByText('0:30 / 3:32')).toBeVisible();
  });
});

test.describe('adding and selecting', () => {
  test('clicking a tool adds a node at the playhead and moves focus to the drawer\'s first field', async ({ page }) => {
    await page.getByRole('group', { name: 'Video controls' }).getByRole('button', { name: 'Play' }).click();
    await fake(page, 'advance(65)');
    await tool(page, 'Quiz').click();
    const node = timeline(page).getByRole('button', { name: 'Quiz question 1 at 1:05' });
    await expect(node).toBeVisible();
    await expect(node).toHaveAttribute('aria-current', 'true');
    await expect(drawer(page)).toHaveAccessibleName('Quiz question 1 at 1:05');
    await expect(drawer(page).getByRole('textbox', { name: 'Question', exact: true })).toBeFocused();
  });

  test('"+" adds a quiz question at the playhead; two may share a time and play in the order added', async ({ page }) => {
    await seek(page, 12);
    await page.getByRole('button', { name: 'Add a quiz question at the playhead' }).click();
    await tool(page, 'Text').click();
    await expect(nodes(page)).toHaveCount(2);
    await expect(nodes(page).nth(0)).toHaveAccessibleName('Quiz question 1 at 0:12');
    await expect(nodes(page).nth(1)).toHaveAccessibleName('Text 1 at 0:12');
    await expect(drawer(page).getByRole('textbox', { name: 'Text', exact: true })).toBeFocused();
  });

  test('a node at the very end is placed half a second before it', async ({ page }) => {
    await seek(page, 212);
    await tool(page, 'Text').click();
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 3:31']);
    await expect(drawer(page).getByLabel('Time', { exact: true })).toHaveValue('3:31');
  });

  test('selecting a node opens the drawer with only that type\'s fields', async ({ page }) => {
    await addAt(page, 'Quiz', 5);
    await addAt(page, 'True/False', 10);
    await addAt(page, 'Text', 15);
    await addAt(page, 'Link', 20);
    await addAt(page, 'Image', 25);
    const d = drawer(page);
    const fields = async () => ({
      question: await d.getByRole('textbox', { name: 'Question', exact: true }).count(),
      choices: await d.getByRole('group', { name: 'Answer choices' }).count(),
      correctAnswer: await d.getByRole('radiogroup', { name: 'Correct answer' }).count(),
      hint: await d.getByRole('textbox', { name: 'Hint (optional)' }).count(),
      text: await d.getByRole('textbox', { name: 'Text', exact: true }).count(),
      linkText: await d.getByRole('textbox', { name: 'Text shown with the link' }).count(),
      url: await d.getByRole('textbox', { name: 'Web address' }).count(),
      file: await d.getByLabel('Image file').count(),
      alt: await d.getByRole('textbox', { name: 'Alt text' }).count(),
      decorative: await d.getByRole('checkbox', { name: 'Decorative image' }).count(),
      caption: await d.getByRole('textbox', { name: 'Caption (optional)' }).count(),
      time: await d.getByLabel('Time', { exact: true }).count(),
    });
    const none = { question: 0, choices: 0, correctAnswer: 0, hint: 0, text: 0, linkText: 0, url: 0, file: 0, alt: 0, decorative: 0, caption: 0, time: 1 };

    await timeline(page).getByRole('button', { name: 'Quiz question 1 at 0:05' }).click();
    await expect(d).toHaveAccessibleName('Quiz question 1 at 0:05');
    expect(await fields()).toEqual({ ...none, question: 1, choices: 1, hint: 1 });
    await expect(d.getByRole('checkbox', { name: /^Correct/ })).toHaveCount(2);

    await timeline(page).getByRole('button', { name: 'True/False question 1 at 0:10' }).click();
    expect(await fields()).toEqual({ ...none, question: 1, choices: 1, correctAnswer: 1, hint: 1 });
    await expect(d.getByRole('radio')).toHaveCount(2);
    await expect(d.getByRole('radio', { name: 'True' })).toBeChecked();

    await timeline(page).getByRole('button', { name: 'Text 1 at 0:15' }).click();
    expect(await fields()).toEqual({ ...none, text: 1 });

    await timeline(page).getByRole('button', { name: 'Link 1 at 0:20' }).click();
    expect(await fields()).toEqual({ ...none, linkText: 1, url: 1 });

    await timeline(page).getByRole('button', { name: 'Image 1 at 0:25' }).click();
    expect(await fields()).toEqual({ ...none, file: 1, alt: 1, decorative: 1, caption: 1 });
    await expect(timeline(page).getByRole('button', { name: 'Image 1 at 0:25' })).toHaveAttribute('aria-current', 'true');
    await expect(nodes(page).and(page.locator('[aria-current="true"]'))).toHaveCount(1);
  });
});

test.describe('questions', () => {
  test('a quiz question can add and remove choices and have several correct answers', async ({ page }) => {
    await tool(page, 'Quiz').click();
    const d = drawer(page);
    await expect(d.getByRole('textbox', { name: /^Choice \d$/ })).toHaveCount(2);
    await expect(d.getByRole('checkbox', { name: /^Correct/ })).toHaveCount(2);
    await expect(d.getByRole('checkbox', { name: /^Correct/ }).nth(0)).toBeChecked();
    await expect(d.getByRole('button', { name: /^Remove choice/ })).toHaveCount(0); // two is the minimum
    await d.getByRole('button', { name: 'Add choice' }).click();
    await expect(d.getByRole('textbox', { name: 'Choice 3', exact: true })).toBeFocused();
    await page.keyboard.type('Sunlight');
    await d.getByRole('checkbox', { name: 'Correct answer: choice 3' }).check();
    await d.getByRole('checkbox', { name: 'Correct answer: choice 1' }).uncheck();
    await expect(d.getByRole('checkbox', { name: /^Correct/ })).toHaveCount(3);
    await d.getByRole('button', { name: 'Remove choice 2' }).click();
    await expect(d.getByRole('textbox', { name: /^Choice \d$/ })).toHaveCount(2);
    await expect(d.getByRole('textbox', { name: 'Choice 2', exact: true })).toHaveValue('Sunlight');
    await expect(d.getByRole('textbox', { name: 'Choice 2', exact: true })).toBeFocused();
    // No correct answer is allowed while editing, but it is called out.
    await d.getByRole('checkbox', { name: 'Correct answer: choice 2' }).uncheck();
    const msg = d.getByText('Mark at least one choice as correct');
    await expect(msg).toBeVisible();
    await expect(d.getByRole('group', { name: 'Answer choices' })).toHaveAttribute('aria-describedby', await msg.getAttribute('id') as string);
  });

  test('a true/false question has two fixed choices and exactly one correct, which the author can change', async ({ page }) => {
    await tool(page, 'True/False').click();
    const d = drawer(page);
    await expect(d.getByRole('button', { name: 'Add choice' })).toHaveCount(0);
    await d.getByRole('radio', { name: 'False' }).check();
    await expect(d.getByRole('radio', { name: 'True' })).not.toBeChecked();
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.choices!.map((c) => [c.html, c.correct])))
      .toEqual([['True', false], ['False', true]]);
  });
});

test.describe('rich text', () => {
  test('toolbar buttons are labelled, show their state with aria-pressed, and keyboard shortcuts work', async ({ page }) => {
    await tool(page, 'Text').click();
    const d = drawer(page);
    const bar = d.getByRole('toolbar', { name: 'Formatting for Text' });
    await expect(bar.getByRole('button')).toHaveText(['Bold', 'Italic', 'Bulleted list', 'Numbered list', 'Link']);
    await expect(d.getByText(/Shortcuts: (Ctrl|⌘)\+B bold/)).toBeVisible();
    const bold = bar.getByRole('button', { name: 'Bold' });
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.type('Strong');
    await expect(bold).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ControlOrMeta+B');
    await page.keyboard.type(' plain');
    await expect(bold).toHaveAttribute('aria-pressed', 'false');
    await bar.getByRole('button', { name: 'Bulleted list' }).click();
    await expect(bar.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true');
    await expect(d.getByRole('textbox', { name: 'Text', exact: true })).toBeFocused();
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.promptHtml)).toBe('<ul><li><p><strong>Strong</strong> plain</p></li></ul>');
  });

  test('the toolbar is one Tab stop; arrow keys move between its buttons', async ({ page }) => {
    await tool(page, 'Text').click();
    const bar = drawer(page).getByRole('toolbar', { name: 'Formatting for Text' });
    await page.keyboard.press('Shift+Tab');
    await expect(bar.getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(bar.getByRole('button', { name: 'Italic' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(bar.getByRole('button', { name: 'Link' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(bar.getByRole('button', { name: 'Bold' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(drawer(page).getByRole('textbox', { name: 'Text', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(bar.getByRole('button', { name: 'Bold' })).toBeFocused(); // back to the last button used
  });

  test('pasted scripts, images and Word markup are reduced to the allowed tags', async ({ page }) => {
    await tool(page, 'Text').click();
    const box = drawer(page).getByRole('textbox', { name: 'Text', exact: true });
    await box.evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text/html', '<p class=MsoNormal style="color:red"><b><span style="font-family:Calibri">Hi</span></b><o:p></o:p><script>window.__pwned=1</script><img src=x onerror="window.__pwned=2"></p><table><tr><td>cell</td></tr></table>');
      data.setData('text/plain', 'Hi cell');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.promptHtml)).toContain('Hi');
    const html = (await stored(page, (p) => p.interactions[0]!.promptHtml))!;
    expect(html).toContain('<strong>Hi</strong>');
    expect(html).toContain('cell');
    expect(html).not.toMatch(/script|<img|onerror|style|class|<span|<table|o:p/i);
    expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  });

  test('a link needs an http, https or mailto address', async ({ page }) => {
    await tool(page, 'Text').click();
    const d = drawer(page);
    await page.keyboard.type('Read more');
    await page.keyboard.press('ControlOrMeta+A'); // ProseMirror's own select-all, so its selection is in sync
    await page.keyboard.press('ControlOrMeta+K');
    const address = d.getByRole('textbox', { name: 'Link address' });
    await expect(address).toBeFocused();
    await address.fill('javascript:alert(1)');
    await page.keyboard.press('Enter');
    const error = d.getByText('Use a web address that starts with https://, http:// or mailto:');
    await expect(error).toBeVisible();
    await expect(address).toHaveAttribute('aria-invalid', 'true');
    await address.fill('https://example.com/more');
    await d.getByRole('button', { name: 'Apply link' }).click();
    await expect(address).toHaveCount(0);
    await expect(d.getByRole('textbox', { name: 'Text', exact: true })).toBeFocused();
    await expect.poll(() => withStore(page, (s) => s.loadProject().then((p) => p?.interactions[0]?.promptHtml)))
      .toBe('<p><a href="https://example.com/more" rel="noopener noreferrer" target="_blank">Read more</a></p>');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight'); // the cursor inside the link: the Link button shows it
    await expect(d.getByRole('toolbar').getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('link and image', () => {
  test('a link with no web address says so inline; an unsafe address is refused', async ({ page }) => {
    await tool(page, 'Link').click();
    const d = drawer(page);
    const url = d.getByRole('textbox', { name: 'Web address' });
    const status = d.getByTestId('url-message');
    await expect(status).toHaveAttribute('role', 'status');
    await expect(d.getByText('Add a web address')).toBeVisible();
    await expect(url).toHaveAccessibleDescription(/Add a web address/);
    await url.fill('javascript:alert(1)');
    await expect(d.getByText('Use a web address that starts with https://, http:// or mailto:')).toBeVisible();
    await expect(url).toHaveAttribute('aria-invalid', 'true');
    await url.fill('https://example.com');
    await expect(status).toBeEmpty();
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.url)).toBe('https://example.com');
  });

  test('an image with no alt text shows "Add alt text or mark decorative"; decorative disables and clears alt', async ({ page }) => {
    await tool(page, 'Image').click();
    const d = drawer(page);
    await expect(d.getByLabel('Image file')).toBeFocused();
    const alt = d.getByRole('textbox', { name: 'Alt text' });
    const error = d.getByText('Add alt text or mark decorative');
    await expect(error).toBeVisible();
    await expect(alt).toHaveAttribute('aria-invalid', 'true');
    await expect(alt).toHaveAccessibleDescription(/Add alt text or mark decorative/);
    await alt.fill('A green leaf');
    await expect(error).toHaveCount(0);
    await d.getByRole('checkbox', { name: 'Decorative image' }).check();
    await expect(alt).toBeDisabled();
    await expect(alt).toHaveValue('');
    await expect(error).toHaveCount(0);
    await d.getByRole('checkbox', { name: 'Decorative image' }).uncheck();
    await expect(alt).toBeEnabled();
    await expect(error).toBeVisible();
  });

  test('an added image is in memory and in storage at once, and deleting or replacing it drops the old file', async ({ page }, info) => {
    await tool(page, 'Image').click();
    const d = drawer(page);
    await d.getByLabel('Image file').setInputFiles(PNG);
    await expect(d.getByRole('img', { name: 'Preview of the chosen image' })).toBeVisible();
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.imageAssetId)).toBeTruthy();
    const first = (await stored(page, (p) => p.interactions[0]!.imageAssetId))!;
    expect(first).toMatch(/^[A-Za-z0-9_-]{12}\.png$/);
    expect([...(await withStore(page, (s) => s.loadAssets().then((m) => [...m.keys()])))]).toEqual([first]);
    // Without a reload: the export (which reads the in-memory assets) already has it.
    expect(Object.keys((await exportJson(page, info.outputPath('a.json'))).assets)).toEqual([first]);

    await d.getByLabel('Image file').setInputFiles({ ...PNG, name: 'other.png' });
    await expect.poll(() => withStore(page, (s) => s.loadProject().then((p) => p!.interactions[0]!.imageAssetId))).not.toBe(first);
    const second = (await withStore(page, (s) => s.loadProject()))!.interactions[0]!.imageAssetId!;
    expect(await withStore(page, (s) => s.loadAssets().then((m) => [...m.keys()]))).toEqual([second]);
    expect(Object.keys((await exportJson(page, info.outputPath('b.json'))).assets)).toEqual([second]);

    await d.getByRole('button', { name: 'Delete checkpoint' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(nodes(page)).toHaveCount(0);
    await expect.poll(() => withStore(page, (s) => s.loadAssets().then((m) => m.size))).toBe(0);
    expect((await exportJson(page, info.outputPath('c.json'))).assets).toEqual({});
  });

  test('a file that is not an image shows a readable error', async ({ page }) => {
    await tool(page, 'Image').click();
    await drawer(page).getByLabel('Image file').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('hello') });
    await expect(drawer(page).getByText("This file couldn't be read as an image. Try a JPEG, PNG, WebP or GIF file.")).toBeVisible();
  });
});

test.describe('time', () => {
  test('the time field takes m:ss, refuses nonsense and clamps to the end', async ({ page }) => {
    await addAt(page, 'Text', 10);
    const d = drawer(page);
    const time = d.getByLabel('Time', { exact: true });
    await expect(time).toHaveValue('0:10');
    await time.fill('abc');
    await time.press('Enter');
    await expect(d.getByText('Enter a time like 1:05')).toBeVisible();
    await expect(time).toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 0:10']);
    await time.fill('1:30');
    await time.press('Tab');
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 1:30']);
    await expect(time).not.toHaveAttribute('aria-invalid', 'true');
    await time.fill('9:00');
    await time.press('Enter');
    await expect(time).toHaveValue('3:31');
    await expect(d.getByText('Moved to 3:31, the latest time a checkpoint can use.')).toBeVisible();
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 3:31']);
  });

  test('"Move to playhead" moves the checkpoint to the current time', async ({ page }) => {
    await addAt(page, 'Text', 10);
    await seek(page, 42);
    await drawer(page).getByRole('button', { name: 'Move to playhead' }).click();
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 0:42']);
    await expect(drawer(page).getByLabel('Time', { exact: true })).toHaveValue('0:42');
  });
});

test.describe('keyboard', () => {
  test('nodes are one Tab stop with arrow keys, Home and End between them (roving tabindex)', async ({ page }) => {
    await addAt(page, 'Text', 30);
    await addAt(page, 'Quiz', 10);
    await addAt(page, 'Link', 20);
    await expect.poll(() => nodeNames(page)).toEqual(['Quiz question 1 at 0:10', 'Link 1 at 0:20', 'Text 1 at 0:30']);
    await expect(nodes(page).and(page.locator('[tabindex="0"]'))).toHaveCount(1);
    await nodes(page).nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(nodes(page).nth(1)).toBeFocused();
    await expect(nodes(page).nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(drawer(page)).toHaveAccessibleName('Link 1 at 0:20');
    await page.keyboard.press('End');
    await expect(nodes(page).nth(2)).toBeFocused();
    await page.keyboard.press('ArrowRight'); // stays at the end
    await expect(nodes(page).nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(nodes(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(nodes(page).nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(nodes(page).nth(0)).toBeFocused();
    await expect(nodes(page).and(page.locator('[tabindex="0"]'))).toHaveCount(1);
    await expect(nodes(page).nth(0)).toHaveAttribute('tabindex', '0');
  });

  test('every control is reachable with Tab, in a sensible order', async ({ page }) => {
    await addAt(page, 'Text', 10);
    await page.getByRole('heading', { level: 2, name: 'Interactions' }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      const name = await focusedName(page);
      seen.push(name);
      if (/^Next/.test(name)) break;
    }
    const expected = [
      'Quiz', 'True/False', 'Text', 'Link', 'Image',
      'Play', 'Playhead', 'Preview as learner',
      'Text 1 at 0:10', 'Add a quiz question at the playhead',
      'Bold', 'Text', 'Time', 'Move to playhead', 'Delete checkpoint',
    ];
    expect(seen.filter((n) => expected.includes(n))).toEqual(expected);
    expect(seen.at(-2)).toMatch(/^Back/);
    expect(seen.at(-1)).toMatch(/^Next/);
  });

  test('Delete asks first; Cancel keeps the node and returns focus to it; confirming moves focus to the timeline', async ({ page }) => {
    await addAt(page, 'Text', 10);
    await addAt(page, 'Link', 20);
    await nodes(page).nth(1).focus();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('dialog', { name: 'Delete this checkpoint?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Link 1 at 0:20');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(nodes(page)).toHaveCount(2);
    await expect(nodes(page).nth(1)).toBeFocused();
    await page.keyboard.press('Delete');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => nodeNames(page)).toEqual(['Text 1 at 0:10']);
    await expect(nodes(page).nth(0)).toBeFocused();
    await expect(nodes(page).nth(0)).toHaveAttribute('aria-current', 'true');
    // The drawer's Delete button too; with no nodes left, focus goes to the timeline itself.
    await drawer(page).getByRole('button', { name: 'Delete checkpoint' }).click();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(nodes(page)).toHaveCount(0);
    await expect(timeline(page)).toBeFocused();
    await expect(page.getByText('Add your first checkpoint with a tool above')).toBeVisible();
  });
});

test.describe('preview as learner', () => {
  test('opens the real player in a modal; a checkpoint appears at its time; closing returns focus', async ({ page }) => {
    await addAt(page, 'Text', 10);
    await page.keyboard.type('Look at the leaves');
    await seek(page, 0);
    const open = page.getByRole('button', { name: 'Preview as learner' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: 'Preview as learner' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.ivp-root')).toHaveCount(1);
    await dialog.getByRole('button', { name: 'Play' }).click();
    await fake(page, 'advance(11)');
    const card = dialog.getByRole('dialog', { name: 'Note' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Look at the leaves');
    await card.getByRole('button', { name: 'Continue' }).click();
    await expect(card).toBeHidden();
    await dialog.getByRole('button', { name: 'Close preview' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.ivp-root')).toHaveCount(0);
    await expect(open).toBeFocused();
    // The author's scrubber is back in control of window.__fake.
    await seek(page, 50);
    expect(await fake(page, 'getCurrentTime()')).toBe(50);
  });

  test('Escape closes the preview when no question is open', async ({ page }) => {
    await page.getByRole('button', { name: 'Preview as learner' }).click();
    await expect(page.getByRole('dialog', { name: 'Preview as learner' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Preview as learner' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Preview as learner' })).toBeFocused();
  });
});

test.describe('changing the video in Step 1', () => {
  test('asks first when there are checkpoints; Cancel keeps the old video, confirming keeps the checkpoints', async ({ page }) => {
    await addAt(page, 'Text', 30);
    await stepButton(page, /Setup/).click();
    const oldUrl = `https://www.youtube.com/watch?v=${VIDEOS.ok}`;
    await urlField(page).fill(`https://youtu.be/${VIDEOS.other}`);
    const dialog = page.getByRole('dialog', { name: 'Change the video?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Your 1 checkpoint stays at its time in the new video');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(urlField(page)).toBeFocused();
    await expect(urlField(page)).toHaveValue(oldUrl);
    await expect(page.getByText('3:32')).toBeVisible();
    await saved(page);
    expect(await stored(page, (p) => p.videoId)).toBe(VIDEOS.ok);

    // Typing a half-finished link does not drop the video either.
    await urlField(page).fill('https://youtu');
    await expect(dialog).toHaveCount(0);
    await urlField(page).fill(`https://youtu.be/${VIDEOS.other}`);
    await dialog.getByRole('button', { name: 'Change video' }).click();
    await expect(urlField(page)).toBeFocused();
    await expect(page.getByText('1:35')).toBeVisible();
    await expect.poll(() => withStore(page, (s) => s.loadProject().then((p) => [p?.videoId, p?.duration, p?.interactions.map((i) => i.time)])))
      .toEqual([VIDEOS.other, 95, [30]]);
  });

  test('a project with no checkpoints changes video without asking', async ({ page }) => {
    await stepButton(page, /Setup/).click();
    await urlField(page).fill(`https://youtu.be/${VIDEOS.other}`);
    await expect(page.getByText('1:35')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('checkpoints past the end of a shorter video', () => {
  test('are flagged on the node and in the drawer until moved earlier', async ({ page }) => {
    await addAt(page, 'Text', 120);
    await addAt(page, 'Link', 30);
    await stepButton(page, /Setup/).click();
    await urlField(page).fill(`https://youtu.be/${VIDEOS.other}`); // 95 s
    await page.getByRole('dialog').getByRole('button', { name: 'Change video' }).click();
    await expect(page.getByText('1:35')).toBeVisible();
    await stepButton(page, /Interactions/).click();

    await expect.poll(() => nodeNames(page)).toEqual(['Link 1 at 0:30', 'Text 1 at 2:00, past the end of the video']);
    const late = nodes(page).nth(1);
    await expect(late.locator('.node-warning svg')).toHaveCount(1); // a shape, not only a color
    await expect(nodes(page).nth(0).locator('.node-warning')).toHaveCount(0);

    await late.click();
    const time = drawer(page).getByLabel('Time', { exact: true });
    await expect(time).toHaveValue('2:00'); // not silently clamped
    const error = drawer(page).getByText('This checkpoint is after the end of the video (1:35). Move it earlier.');
    await expect(error).toBeVisible();
    await expect(time).toHaveAttribute('aria-invalid', 'true');
    await expect(time).toHaveAccessibleDescription(/This checkpoint is after the end of the video \(1:35\)\. Move it earlier\./);
    expect(await error.evaluate((el) => el.closest('[role="status"]') !== null)).toBe(true);

    await time.fill('1:00');
    await time.press('Enter');
    await expect(error).toHaveCount(0);
    await expect(time).not.toHaveAttribute('aria-invalid', 'true');
    await expect.poll(() => nodeNames(page)).toEqual(['Link 1 at 0:30', 'Text 1 at 1:00']);
    await expect(nodes(page).nth(1).locator('.node-warning')).toHaveCount(0);
  });
});

/** Makes IndexedDB writes of image blobs (puts) or image deletes fail while the flag is on; project writes still work. */
const failImageWrites = (page: Page, which: 'put' | 'delete', on: boolean) =>
  page.evaluate(([which, on]) => {
    const w = window as any;
    if (!w.__origPut) {
      w.__origPut = IDBObjectStore.prototype.put;
      w.__origDelete = IDBObjectStore.prototype.delete;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
        if (w.__failPut && v instanceof Blob) throw new DOMException('Storage is full', 'QuotaExceededError');
        return w.__origPut.call(this, v, k);
      };
      IDBObjectStore.prototype.delete = function (this: IDBObjectStore, k: IDBValidKey | IDBKeyRange) {
        if (w.__failDelete && typeof k === 'string' && k.startsWith('asset:')) throw new DOMException('Storage is broken', 'UnknownError');
        return w.__origDelete.call(this, k);
      };
    }
    w[which === 'put' ? '__failPut' : '__failDelete'] = on;
  }, [which, on] as const);

test.describe('image writes that fail', () => {
  const IMAGE_ERROR = "Couldn't save an image. Retrying…";
  const assetKeys = (page: Page) => withStore(page, (s) => s.loadAssets().then((m) => [...m.keys()]));
  const exportBlocked = async (page: Page) => {
    let downloaded = false;
    page.once('download', () => { downloaded = true; });
    await page.getByRole('button', { name: 'Export JSON' }).click();
    await expect(page.getByTestId('notice')).toHaveText(/Export is paused until every image is saved in this browser/);
    expect(downloaded).toBe(false);
  };

  test('a failed image save stays reported after the project saves, blocks export, and is retried', async ({ page }, info) => {
    await failImageWrites(page, 'put', true);
    await tool(page, 'Image').click();
    await drawer(page).getByLabel('Image file').setInputFiles(PNG);
    await expect(drawer(page).getByRole('img', { name: 'Preview of the chosen image' })).toBeVisible();
    const status = page.getByRole('banner').getByRole('status').filter({ hasText: IMAGE_ERROR });
    await expect(status).toBeVisible();
    // The project itself saves fine; that must not hide the image failure.
    await expect.poll(() => stored(page, (p) => p.interactions[0]!.imageAssetId)).toBeTruthy();
    await expect(page.getByText('All changes saved in this browser')).toHaveCount(0);
    await expect(status).toBeVisible();
    expect(await assetKeys(page)).toEqual([]);
    await exportBlocked(page);

    await failImageWrites(page, 'put', false);
    await drawer(page).getByRole('textbox', { name: 'Alt text' }).fill('A leaf'); // any edit autosaves, and retries
    await expect(page.getByText(IMAGE_ERROR)).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved in this browser');
    const id = (await stored(page, (p) => p.interactions[0]!.imageAssetId))!;
    expect(await assetKeys(page)).toEqual([id]);
    expect(Object.keys((await exportJson(page, info.outputPath('ok.json'))).assets)).toEqual([id]);
  });

  test('a failed image removal is reported and retried, so no orphan is left in storage', async ({ page }) => {
    await tool(page, 'Image').click();
    await drawer(page).getByLabel('Image file').setInputFiles(PNG);
    await expect.poll(() => assetKeys(page).then((k) => k.length)).toBe(1);
    await failImageWrites(page, 'delete', true);
    await drawer(page).getByRole('button', { name: 'Delete checkpoint' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(nodes(page)).toHaveCount(0);
    await expect(page.getByText(IMAGE_ERROR)).toBeVisible();
    await expect.poll(() => stored(page, (p) => p.interactions.length)).toBe(0);
    await expect(page.getByText(IMAGE_ERROR)).toBeVisible();
    expect((await assetKeys(page)).length).toBe(1);
    await exportBlocked(page);

    await failImageWrites(page, 'delete', false);
    await tool(page, 'Text').click(); // an edit: autosave retries the removal
    await expect(page.getByText(IMAGE_ERROR)).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveText('All changes saved in this browser');
    expect(await assetKeys(page)).toEqual([]);
  });
});
