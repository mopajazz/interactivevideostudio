import { test, expect, type Page } from '@playwright/test';

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
const now = (page: Page) => page.evaluate(() => (window as any).__fake.getCurrentTime() as number);
const focusInDialog = (page: Page) =>
  page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement));
const play = (page: Page) => page.getByRole('button', { name: 'Play', exact: true }).click();

test.describe('checkpoint card', () => {
  test('pauses the video and opens a modal dialog with focus inside', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await focusInDialog(page)).toBe(true);
    await advance(page, 2);
    expect(await now(page)).toBe(5);
    await expect(dialog).toHaveAccessibleName('Question');
    await expect(page.locator('.ivp-announcer')).toHaveText(/^Video paused\.\s*$/);
  });

  test('Tab and Shift+Tab never leave the open card', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    await expect(page.getByRole('dialog')).toBeVisible();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await focusInDialog(page)).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusInDialog(page)).toBe(true);
    }
  });

  test('answer shows feedback, Continue closes and returns focus to the play button', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Show hint' }).click();
    await expect(dialog.getByText('Look up.')).toBeVisible();
    await dialog.getByRole('radio', { name: 'Blue' }).check();
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    await expect(dialog.getByText('Yes, blue.')).toBeVisible();
    await expect(page.locator('.ivp-announcer')).toContainText('Correct');
    await expect(dialog.getByRole('radio', { name: 'Blue' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.ivp-play')).toBeFocused();
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause');
    const progress = await page.evaluate(() => (window as any).__progress.at(-1));
    expect(progress.answers).toEqual({ q1: ['a'] });
    expect(progress.submitted).toBe(false);
  });

  test('wrong answer is announced as incorrect with its feedback', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: 'Green' }).check();
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    await expect(dialog.getByText('No, that is grass.')).toBeVisible();
    await expect(page.locator('.ivp-announcer')).toContainText('Incorrect');
  });

  test('multiple-correct question uses checkboxes', async ({ page }) => {
    await open(page, '&fixture=multi');
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('checkbox', { name: '2' }).check();
    await dialog.getByRole('checkbox', { name: '3' }).check();
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    const progress = await page.evaluate(() => (window as any).__progress.at(-1));
    expect(progress.answers).toEqual({ m1: ['a', 'b'] });
  });

  test('card has a 250 ms transition by default', async ({ page }) => {
    await open(page);
    await play(page);
    await advance(page, 5);
    const card = page.locator('.ivp-card');
    await expect(card).toBeVisible();
    expect(await card.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0.25s, 0.25s');
  });

  test('with prefers-reduced-motion the card has no transition', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await play(page);
    await advance(page, 5);
    const card = page.locator('.ivp-card');
    await expect(card).toBeVisible();
    expect(await card.evaluate((e) => getComputedStyle(e).transitionDuration)).toBe('0s');
  });

  test('a checkpoint at time 0 opens when the learner presses Play', async ({ page }) => {
    await open(page, '&fixture=zero');
    await play(page);
    await expect(page.getByRole('dialog')).toContainText('Welcome.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.ivp-play')).toBeFocused();
  });

  test('link card opens in a new tab safely; image card shows alt text', async ({ page }) => {
    await open(page);
    await play(page);
    await page.evaluate(() => (window as any).__fake.seekTo(19));
    await advance(page, 0.5);
    // jumping over checkpoints brings each one up, in time order
    for (const _ of [1, 2]) {
      const d = page.getByRole('dialog');
      await d.getByRole('radio').first().check();
      await d.getByRole('button', { name: 'Check answer' }).click();
      await d.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page.getByRole('dialog')).toContainText('A note for you.');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    expect(await now(page)).toBe(19.5);
    await advance(page, 0.5);
    const link = page.getByRole('dialog').getByRole('link', { name: 'Open link' });
    await expect(link).toHaveAttribute('href', 'https://example.com/more');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    await advance(page, 5);
    await expect(page.getByRole('dialog').getByRole('img', { name: 'A labelled diagram' })).toBeVisible();
  });

  test('author HTML is sanitized', async ({ page }) => {
    await open(page, '&fixture=xss');
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Safe');
    await dialog.getByRole('radio').first().check();
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    expect(await dialog.locator('script, iframe, img, [onclick], [onerror], a[href^="javascript"]').count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  });
});

test.describe('final screen', () => {
  const answerAll = async (page: Page) => {
    await play(page);
    await advance(page, 5);
    let d = page.getByRole('dialog');
    await d.getByRole('radio', { name: 'Blue' }).check();
    await d.getByRole('button', { name: 'Check answer' }).click();
    await d.getByRole('button', { name: 'Continue' }).click();
    await advance(page, 5);
    d = page.getByRole('dialog');
    await d.getByRole('radio', { name: 'True' }).check();
    await d.getByRole('button', { name: 'Check answer' }).click();
    await d.getByRole('button', { name: 'Continue' }).click();
    for (const t of [15, 20, 25]) {
      await advance(page, 5);
      await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
      expect(await now(page)).toBe(t);
    }
    await advance(page, 5);
  };

  test('Submit answers is large, shows the score once, and is final', async ({ page }) => {
    await open(page);
    await answerAll(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(await focusInDialog(page)).toBe(true);
    const submit = dialog.getByRole('button', { name: 'Submit answers' });
    const box = (await submit.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await submit.click();
    await expect(dialog).toContainText('50%');
    await expect(dialog).toContainText('1 of 2');
    await expect(dialog).toContainText('Passed');
    await expect(dialog.getByRole('button', { name: 'Submit answers' })).toHaveCount(0);
    await expect(page.locator('.ivp-announcer')).toContainText('50%');
    const results = await page.evaluate(() => (window as any).__results);
    expect(results).toEqual([{ raw: 1, max: 2, percent: 50, passed: true, scored: true, status: 'passed' }]);
    const progress = await page.evaluate(() => (window as any).__progress.at(-1));
    expect(progress).toEqual({ furthest: 30, answers: { q1: ['a'], q2: ['t'] }, submitted: true });
  });

  test('a video with no scored questions shows Finish', async ({ page }) => {
    await open(page, '&fixture=unscored');
    await play(page);
    await advance(page, 5);
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    await advance(page, 25);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: 'Submit answers' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Finish' }).click();
    const results = await page.evaluate(() => (window as any).__results);
    expect(results).toEqual([{ raw: 0, max: 0, percent: 0, passed: true, scored: false, status: 'completed' }]);
  });

  test('resume after submission opens the stored result at once, not Submit, without replaying to the end', async ({ page }) => {
    const initial = encodeURIComponent(JSON.stringify({ furthest: 30, answers: { q1: ['a'], q2: ['f'] }, submitted: true }));
    await open(page, `&lock=1&initial=${initial}`);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('100%');
    await expect(dialog).toHaveAccessibleName('End of video');
    await expect(dialog.getByRole('button', { name: 'Submit answers' })).toHaveCount(0);
    expect(await now(page)).toBe(0);
    expect(await page.evaluate(() => (window as any).__results)).toEqual([]);
    // Watching again is free (the lock was released by the earlier submission) and nothing is re-scored.
    await dialog.getByRole('button', { name: 'Watch again' }).click();
    await expect(dialog).toHaveCount(0);
    await page.locator('input[type=range]').fill('25');
    expect(await now(page)).toBe(25);
  });
});

test('progress reports say why: tick for new progress, pause, answer, submit', async ({ page }) => {
  await open(page, '&fixture=unscored');
  await play(page);
  await advance(page, 3);
  expect(await page.evaluate(() => (window as any).__reasons)).toEqual(['tick', 'tick', 'tick']);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__reasons.at(-1))).toBe('pause');
  await open(page);
  await play(page);
  await advance(page, 5);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: 'Blue' }).check();
  await dialog.getByRole('button', { name: 'Check answer' }).click();
  const reasons: string[] = await page.evaluate(() => (window as any).__reasons);
  expect(reasons.indexOf('pause')).toBeGreaterThan(-1); // the card paused the video
  expect(reasons.at(-1)).toBe('answer');
});

test.describe('playbar', () => {
  test('forward seek snaps back when scrubbing is disabled', async ({ page }) => {
    await open(page, '&lock=1');
    await play(page);
    await advance(page, 3);
    await page.locator('input[type=range]').fill('20');
    expect(await now(page)).toBe(3);
    await page.locator('input[type=range]').fill('1');
    expect(await now(page)).toBe(1);
  });

  test('forward seek is allowed when scrubbing is enabled', async ({ page }) => {
    await open(page, '&fixture=empty');
    await play(page);
    await advance(page, 3);
    await page.locator('input[type=range]').fill('20');
    expect(await now(page)).toBe(20);
  });

  test('resume seeks to two seconds before the furthest point, presets the lock, and skips answered questions', async ({ page }) => {
    const initial = encodeURIComponent(JSON.stringify({ furthest: 12, answers: { q1: ['a'] }, submitted: false }));
    await open(page, `&lock=1&initial=${initial}`);
    expect(await now(page)).toBe(10);
    await expect(page.locator('input[type=range]')).toHaveValue('10');
    // The question left unanswered at 10 s opens on Play; the answered one at 5 s never does.
    await play(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Water is dry.');
    await dialog.getByRole('radio', { name: 'False' }).check();
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    await dialog.getByRole('button', { name: 'Continue' }).click();
    // The lock still holds at the saved furthest point.
    await page.locator('input[type=range]').fill('20');
    expect(await now(page)).toBeLessThanOrEqual(12);
    await page.locator('input[type=range]').fill('2');
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause'); // Continue resumed playback
    await advance(page, 4);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('resume near the start seeks to 0, and a fresh start does not seek', async ({ page }) => {
    const initial = encodeURIComponent(JSON.stringify({ furthest: 1, answers: {}, submitted: false }));
    await open(page, `&fixture=empty&initial=${initial}`);
    expect(await now(page)).toBe(0);
    await open(page, '&fixture=empty');
    expect(await page.evaluate(() => (window as any).__fake.seeks)).toEqual([]);
  });

  test('progress slider has time in words', async ({ page }) => {
    await open(page, '&fixture=empty&duration=180');
    await play(page);
    await advance(page, 65);
    await expect(page.getByRole('slider', { name: 'Video progress' })).toHaveAttribute('aria-valuetext', '1 minute 5 seconds of 3 minutes');
  });

  test('captions button has a static label and toggles aria-pressed', async ({ page }) => {
    await open(page, '&fixture=empty');
    const cc = page.getByRole('button', { name: 'Captions' });
    await expect(cc).toHaveAttribute('aria-pressed', 'false');
    await cc.click();
    await expect(cc).toHaveAttribute('aria-pressed', 'true');
    await expect(cc).toHaveAccessibleName('Captions');
    expect(await page.evaluate(() => (window as any).__fake.captions)).toBe(true);
    await cc.click();
    expect(await page.evaluate(() => (window as any).__fake.captions)).toBe(false);
  });

  test('speed control sets the playback rate', async ({ page }) => {
    await open(page, '&fixture=empty');
    await page.getByLabel('Playback speed').selectOption('1.5');
    expect(await page.evaluate(() => (window as any).__fake.rate)).toBe(1.5);
  });

  test('keyboard-only: Tab reaches play, progress, captions, speed; Enter plays', async ({ page }) => {
    await open(page, '&fixture=empty');
    const stops = [
      page.getByRole('button', { name: 'Play', exact: true }),
      page.getByRole('slider', { name: 'Video progress' }),
      page.getByRole('button', { name: 'Captions' }),
      page.getByLabel('Playback speed'),
    ];
    for (const stop of stops) {
      await page.keyboard.press('Tab');
      await expect(stop).toBeFocused();
    }
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab');
    await expect(stops[0]!).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause');
  });

  test('buffering is shown as a status', async ({ page }) => {
    await open(page, '&fixture=empty');
    await play(page);
    await page.evaluate(() => (window as any).__fake.emitState('buffering'));
    await expect(page.getByRole('status')).toContainText('Loading');
    await page.evaluate(() => (window as any).__fake.emitState('playing'));
    await expect(page.getByRole('status')).toHaveText('');
  });
});

test.describe('errors', () => {
  for (const code of [101, 150]) {
    test(`embed disabled (${code}) shows a message and a Watch on YouTube link`, async ({ page }) => {
      await open(page);
      await page.evaluate((c) => (window as any).__fake.emitError(c), code);
      const alert = page.getByRole('alert');
      await expect(alert).toContainText("doesn't allow it to be played here");
      const link = alert.getByRole('link', { name: 'Watch on YouTube' });
      await expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=M7lc1UVf-VE');
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  }

  test('unavailable video (100) shows its own message', async ({ page }) => {
    await open(page);
    await page.evaluate(() => (window as any).__fake.emitError(100));
    await expect(page.getByRole('alert')).toContainText('unavailable');
  });
});

test.describe('YouTubeAdapter in the page (IFrame API intercepted; youtube.com is never reached)', () => {
  test('API script failing to load shows a message and a Watch on YouTube link', async ({ page }) => {
    await page.route('https://www.youtube.com/iframe_api', (r) => r.abort());
    await page.goto('/e2e/index.html');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText("couldn't load");
    await expect(alert.getByRole('link', { name: 'Watch on YouTube' })).toBeVisible();
  });

  test('a stubbed IFrame API drives the playbar with native controls hidden', async ({ page }) => {
    // Minimal stand-in for the IFrame API, as in spike/index.html ?stub=1. Not the real player.
    const stub = `window.YT = { Player: function (el, o) {
      var st = window.__yt = { t: 0, state: -1, calls: [], vars: o.playerVars }, me = this;
      function set(s) { st.state = s; o.events.onStateChange({ data: s }); }
      me.playVideo = function () { st.calls.push('play'); set(1); };
      me.pauseVideo = function () { st.calls.push('pause'); set(2); };
      me.seekTo = function (s) { st.calls.push('seekTo:' + s); st.t = s; };
      me.getCurrentTime = function () { return st.t; };
      me.getDuration = function () { return 30; };
      me.setPlaybackRate = function () {}; me.loadModule = function () {}; me.unloadModule = function () {};
      me.setOption = function () {}; me.destroy = function () {};
      setTimeout(o.events.onReady, 0);
    } }; window.onYouTubeIframeAPIReady();`;
    await page.route('https://www.youtube.com/iframe_api', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
    await page.goto('/e2e/index.html');
    await page.waitForFunction(() => (window as any).__yt?.calls !== undefined);
    expect(await page.evaluate(() => (window as any).__yt.vars)).toMatchObject({ controls: 0, disablekb: 1 });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.locator('.ivp-play')).toHaveAccessibleName('Pause');
    await page.evaluate(() => { (window as any).__yt.t = 5; });
    await expect(page.getByRole('dialog')).toContainText('Which colour');
    expect(await page.evaluate(() => (window as any).__yt.calls)).toEqual(['play', 'pause']);
  });
});

test.describe('review fixes', () => {
  test.describe('focus trap inside an LMS-style iframe', () => {
    const setup = async (page: Page, fixture: string) => {
      await page.goto(`/e2e/host.html?adapter=fake&fixture=${fixture}`);
      const frame = page.frame({ url: /index\.html/ })!;
      await frame.locator('.ivp-play').click();
      await frame.evaluate(() => { const f = (window as any).__fake; for (let i = 0; i < 10; i++) f.advance(0.5); });
      await expect(frame.getByRole('dialog')).toBeVisible();
      return frame;
    };
    const stillInside = async (page: Page, frame: import('@playwright/test').Frame, where: string) => {
      expect(await page.evaluate(() => document.activeElement?.id), `host focus after ${where}`).toBe('sco');
      expect(await frame.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement)), `frame focus after ${where}`).toBe(true);
    };

    test('Tab and Shift+Tab from every radio, unchecked and checked, stay in the card', async ({ page }) => {
      const frame = await setup(page, 'three');
      const names = ['Alpha', 'Bravo', 'Charlie'];
      for (const checked of [false, true]) {
        for (const name of names) {
          for (const key of ['Shift+Tab', 'Tab']) {
            const radio = frame.getByRole('radio', { name });
            if (checked) await radio.check(); else await radio.focus();
            await page.keyboard.press(key);
            await stillInside(page, frame, `${key} from ${checked ? 'checked' : 'unchecked'} ${name}`);
          }
        }
      }
      // Entering the group backwards lands on the checked radio; one more Shift+Tab must wrap, not leave.
      await frame.getByRole('button', { name: 'Check answer' }).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Shift+Tab');
      await stillInside(page, frame, 'Shift+Tab twice from Check answer');
    });

    test('Tab and Shift+Tab from every checkbox stay in the card', async ({ page }) => {
      const frame = await setup(page, 'multi');
      for (const name of ['2', '3', '4']) {
        for (const key of ['Shift+Tab', 'Tab']) {
          await frame.getByRole('checkbox', { name }).focus();
          await page.keyboard.press(key);
          await stillInside(page, frame, `${key} from checkbox ${name}`);
        }
      }
    });

    test('Tab cycling never leaves the iframe document', async ({ page }) => {
      const frame = await setup(page, 'scored');
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await stillInside(page, frame, `Tab ${i}`); }
      for (let i = 0; i < 8; i++) { await page.keyboard.press('Shift+Tab'); await stillInside(page, frame, `Shift+Tab ${i}`); }
    });
  });

  test('a lagging snap-back never opens checkpoints beyond the furthest point', async ({ page }) => {
    await open(page, '&lock=1&seekLag=2');
    await play(page);
    await advance(page, 3);
    await page.locator('input[type=range]').fill('20');
    // While the snap is pending the player keeps reporting a time ahead of furthest (3 s).
    const steps = await page.evaluate(() => {
      const f = (window as any).__fake;
      const slider = document.querySelector<HTMLInputElement>('input[type=range]')!;
      const out: { reported: number; dialog: boolean; slider: number }[] = [];
      for (let i = 0; i < 6; i++) {
        f.advance(0.25);
        out.push({ reported: f.lastReported, dialog: !!document.querySelector('[role="dialog"]'), slider: Number(slider.value) });
      }
      return out;
    });
    expect(steps.some((s) => s.reported > 10)).toBe(true); // the lag really happened
    for (const s of steps) {
      expect(s.dialog).toBe(false);
      expect(s.slider).toBeLessThanOrEqual(4);
    }
    await advance(page, 1.5);
    await expect(page.getByRole('dialog')).toContainText('Which colour');
  });

  test('the video area is inert at all times, so Tab never reaches the embed', async ({ page }) => {
    await open(page, '&fixture=empty&duration=30');
    await expect(page.locator('.ivp-video')).toHaveAttribute('inert', '');
    await page.keyboard.press('Tab');
    await expect(page.locator('.ivp-play')).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      await expect(page.locator('.standin-embed-link')).not.toBeFocused();
    }
    await play(page);
    await advance(page, 30);
    await page.getByRole('dialog').getByRole('button', { name: 'Watch again' }).click();
    await expect(page.locator('.ivp-video')).toHaveAttribute('inert', '');
  });

  test('Check answer with nothing selected shows a visible message tied to the choices', async ({ page }) => {
    await open(page, '&fixture=three');
    await play(page);
    await advance(page, 5);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Check answer' }).click();
    const msg = dialog.getByText('Choose an answer first.');
    await expect(msg).toBeVisible();
    await expect(dialog.getByRole('group')).toHaveAccessibleDescription('Choose an answer first.');
    await expect(page.locator('.ivp-announcer')).toHaveText(/^\s*Choose an answer first\.\s*$/);
    await dialog.getByRole('radio', { name: 'Bravo' }).check();
    await expect(msg).toHaveCount(0);
    await expect(dialog.getByRole('group')).toHaveAccessibleDescription('');
  });
});
