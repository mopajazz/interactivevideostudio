// The exported package, end to end, in a stand-in LMS: the unzipped package is served over HTTP, `window.YT` is a
// stub of the YouTube IFrame API (modelled on spike/verify.cjs and the player's FakeAdapter: it plays at 10x real
// time, pauses, seeks and ends), and `window.API` is a recording fake of the SCORM 1.2 API, both injected before the
// page loads. Nothing here touches youtube.com. What this proves is the package's own wiring, not any real LMS or
// the real YouTube player.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { test, expect, type Page } from '@playwright/test';
import type { Project } from '@ivt/schema';
import { buildScormZip, decodeProjectSuspend, encodeProjectSuspend } from '@ivt/scorm';
import { serve } from './serve';

const DURATION = 60;
const project: Project = {
  version: 1,
  title: 'LMS run-through',
  videoId: 'M7lc1UVf-VE',
  duration: DURATION,
  settings: { disableForwardScrubbing: false, masteryPercent: 80 },
  interactions: [
    {
      id: 'iq7k2m9xa', type: 'multipleChoice', time: 10, order: 1, promptHtml: '<p>What colour is the sky?</p>',
      choices: [
        { id: 'cb3k9w2qz', html: 'Blue', correct: true, feedbackHtml: '<p>Yes.</p>' },
        { id: 'cg8p1n4rt', html: 'Green', correct: false, feedbackHtml: '<p>No.</p>' },
      ],
    },
    {
      id: 'itf5h3j8w', type: 'trueFalse', time: 20, order: 2, promptHtml: '<p>Water is wet.</p>',
      choices: [{ id: 'true', html: 'True', correct: true }, { id: 'false', html: 'False', correct: false }],
    },
  ],
};
const [Q1, TF] = project.interactions as [Project['interactions'][number], Project['interactions'][number]];

const dist = (p: string) => fileURLToPath(new URL(`../../../packages/${p}`, import.meta.url));

type Call = { fn: string; args: string[]; out: string };
type Lms = { calls: Call[]; data: Record<string, string> };

/** Before load: the recording SCORM API (seeded with `data`) and the YouTube API stub. */
async function prepare(page: Page, data: Record<string, string>) {
  await page.route(/youtube\.com|ytimg\.com|googlevideo\.com/, (r) => r.abort());
  await page.addInitScript(([seed, duration]) => {
    const w = window as any;
    const lms = { calls: [] as { fn: string; args: string[]; out: string }[], data: { ...seed } as Record<string, string> };
    w.__lms = lms;
    const rec = (fn: string, f: (...a: string[]) => string) => (...args: string[]) => {
      const out = f(...args);
      lms.calls.push({ fn, args, out });
      return out;
    };
    w.API = {
      LMSInitialize: rec('LMSInitialize', () => 'true'),
      LMSFinish: rec('LMSFinish', () => 'true'),
      LMSGetValue: rec('LMSGetValue', (k) => lms.data[k!] ?? ''),
      LMSSetValue: rec('LMSSetValue', (k, v) => { lms.data[k!] = v!; return 'true'; }),
      LMSCommit: rec('LMSCommit', () => 'true'),
      LMSGetLastError: rec('LMSGetLastError', () => '0'),
      LMSGetErrorString: rec('LMSGetErrorString', () => ''),
      LMSGetDiagnostic: rec('LMSGetDiagnostic', () => ''),
    };

    // YouTube IFrame API stub: states 1 playing, 2 paused, 0 ended, reported asynchronously like the real one.
    const yt = { calls: [] as string[], rate: 10 };
    w.__yt = yt;
    class Player {
      private t = 0;
      private playing = false;
      private since = 0;
      constructor(_el: HTMLElement, private o: { events: Record<string, (e: unknown) => void> }) {
        setTimeout(() => o.events.onReady!({ target: this }), 0);
      }
      private state(data: number) { setTimeout(() => this.o.events.onStateChange!({ data }), 0); }
      private at() { return this.playing ? this.t + ((performance.now() - this.since) / 1000) * yt.rate : this.t; }
      getCurrentTime() {
        const t = this.at();
        if (t < duration) return t;
        if (this.playing) {
          this.t = duration;
          this.playing = false;
          this.state(0);
        }
        return duration;
      }
      getDuration() { return duration; }
      playVideo() {
        yt.calls.push('play');
        if (this.playing) return;
        this.since = performance.now();
        this.playing = true;
        this.state(1);
      }
      pauseVideo() {
        yt.calls.push('pause');
        if (!this.playing) return;
        this.t = this.at();
        this.playing = false;
        this.state(2);
      }
      seekTo(s: number) {
        yt.calls.push(`seekTo:${s}`);
        this.t = Math.min(Math.max(0, s), duration);
        this.since = performance.now();
      }
      setPlaybackRate() {}
      loadModule() {}
      unloadModule() {}
      setOption() {}
      getOption() { return undefined; }
      destroy() {}
    }
    w.YT = { Player };
  }, [data, DURATION] as const);
}

const lms = (page: Page) => page.evaluate(() => (window as any).__lms as Lms);
const ytCalls = (page: Page) => page.evaluate(() => (window as any).__yt.calls as string[]);
const sets = (l: Lms) => l.calls.filter((c) => c.fn === 'LMSSetValue').map((c) => [c.args[0], c.args[1]] as [string, string]);
const SESSION_TIME = /^\d{4}:\d{2}:\d{2}\.\d{2}$/;

/** Answers the open card with `choice`, checks it, and continues (retrying past the 400 ms swap guard). */
async function answer(page: Page, choice: string) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('radio', { name: choice }).check();
  await dialog.getByRole('button', { name: 'Check answer' }).click();
  await expect(async () => {
    await dialog.getByRole('button', { name: 'Continue' }).click({ timeout: 500 });
    await expect(dialog).toHaveCount(0, { timeout: 300 });
  }).toPass();
}

let url = '';
let close = async () => {};
test.beforeAll(async ({}, info) => {
  const bundle = {
    js: await readFile(dist('player/dist/player.js'), 'utf8'),
    css: await readFile(dist('player/dist/player.css'), 'utf8'),
    launchJs: await readFile(dist('scorm/dist/launch.js'), 'utf8'),
  };
  const zip = await JSZip.loadAsync(await (await buildScormZip(project, new Map(), bundle)).arrayBuffer());
  const root = info.outputPath('package');
  for (const name of Object.keys(zip.files).filter((n) => !zip.files[n]!.dir)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), await zip.file(name)!.async('uint8array'));
  }
  const s = await serve(root);
  url = `${s.url}index.html`;
  close = () => new Promise((resolve) => s.server.close(() => resolve()));
});
test.afterAll(() => close());

test('play, checkpoint, answer, Submit: the LMS gets the right calls and values, and few commits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await prepare(page, { 'cmi.core.lesson_status': 'not attempted' });
  await page.goto(url);
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(page.getByRole('dialog')).toContainText('What colour is the sky?');
  expect(await ytCalls(page)).toContain('pause'); // the card paused the video
  await answer(page, 'Blue');
  await expect(page.getByRole('dialog')).toContainText('Water is wet.');
  await answer(page, 'False'); // wrong: 1 of 2 correct, 50%, below the 80% mastery
  const final = page.getByRole('dialog', { name: 'End of video' });
  await expect(final).toBeVisible({ timeout: 15_000 });
  const before = await lms(page);
  await final.getByRole('button', { name: 'Submit answers' }).click();
  await expect(final).toContainText('Your score: 50%');

  const l = await lms(page);
  const fns = l.calls.map((c) => c.fn);
  // Start: initialize, then read resume data and the status, before writing anything.
  expect(fns[0]).toBe('LMSInitialize');
  const firstSet = fns.indexOf('LMSSetValue');
  const reads = l.calls.slice(0, firstSet).filter((c) => c.fn === 'LMSGetValue').map((c) => c.args[0]);
  expect(reads).toEqual(expect.arrayContaining(['cmi.suspend_data', 'cmi.core.lesson_status']));
  // While watching: incomplete, and exit "suspend" with a session time before every commit until Submit.
  expect(sets(before)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
  const commitsBefore = before.calls.filter((c) => c.fn === 'LMSCommit').length;
  expect(commitsBefore).toBeGreaterThanOrEqual(2); // at least the two held answers
  before.calls.forEach((c, i) => {
    if (c.fn !== 'LMSCommit') return;
    const prior = before.calls.slice(0, i).filter((p) => p.fn === 'LMSSetValue').map((p) => p.args[0]);
    expect(prior).toContain('cmi.core.exit');
    expect(prior).toContain('cmi.core.session_time');
  });
  expect(sets(before).filter(([k]) => k === 'cmi.core.exit').every(([, v]) => v === 'suspend')).toBe(true);
  // Not one commit per second of playback: suspend_data was updated far more often than the LMS was asked to commit.
  const suspendWrites = sets(before).filter(([k]) => k === 'cmi.suspend_data').length;
  expect(suspendWrites).toBeGreaterThanOrEqual(10);
  expect(commitsBefore).toBeLessThanOrEqual(6);

  // Submit: score as a percentage, status, final suspend data, exit "", session time, then commit, then finish last.
  expect(l.data['cmi.core.score.raw']).toBe('50');
  expect(l.data['cmi.core.score.min']).toBe('0');
  expect(l.data['cmi.core.score.max']).toBe('100');
  expect(l.data['cmi.core.lesson_status']).toBe('failed');
  expect(l.data['cmi.core.exit']).toBe('');
  expect(l.data['cmi.core.session_time']).toMatch(SESSION_TIME);
  expect(l.data['cmi.core.session_time']).not.toBe('0000:00:00.00');
  expect(decodeProjectSuspend(l.data['cmi.suspend_data']!, project.interactions)).toMatchObject({
    submitted: true,
    answers: { [Q1.id]: ['cb3k9w2qz'], [TF.id]: ['false'] },
  });
  expect(fns.at(-1)).toBe('LMSFinish');
  expect(fns.at(-2)).toBe('LMSCommit');
  expect(fns.filter((f) => f === 'LMSFinish')).toHaveLength(1);
  // The score screen stays up after LMSFinish (Ruling 22).
  await expect(final).toContainText('Not passed');
  expect(errors).toEqual([]);
});

test('closing mid-way and relaunching with the saved suspend_data resumes: seek to 2 s before the furthest point, answers kept', async ({ page, context }) => {
  await prepare(page, {});
  await page.goto(url);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('What colour is the sky?');
  await answer(page, 'Blue');
  // It plays on to the true/false card at 20 s, which pauses it; then the learner leaves (pagehide commits and finishes).
  await expect(page.getByRole('dialog')).toContainText('Water is wet.');
  const mid = await lms(page);
  const saved = mid.data['cmi.suspend_data']!;
  const state = decodeProjectSuspend(saved, project.interactions)!;
  expect(state).toMatchObject({ submitted: false, answers: { [Q1.id]: ['cb3k9w2qz'] } });
  expect(state.furthest).toBeGreaterThanOrEqual(20);
  expect(state.furthest).toBeLessThan(25); // the true/false card at 20 s stopped it
  await page.goto('about:blank'); // pagehide
  await page.close();

  // Relaunch as the same learner: the LMS hands back what it stored.
  const again = await context.newPage();
  await prepare(again, { 'cmi.suspend_data': saved, 'cmi.core.lesson_status': 'incomplete' });
  await again.goto(url);
  await expect.poll(() => ytCalls(again)).toContain(`seekTo:${state.furthest - 2}`);
  await expect(again.locator('input[type=range]')).toHaveValue(String(state.furthest - 2));
  await again.getByRole('button', { name: 'Play', exact: true }).click();
  // The answered question does not come back; the next one does.
  await expect(again.getByRole('dialog')).toContainText('Water is wet.');
  await answer(again, 'True');
  const final = again.getByRole('dialog', { name: 'End of video' });
  await expect(final).toBeVisible({ timeout: 15_000 });
  await expect(final).toContainText('You answered 2 of 2 questions');
  await final.getByRole('button', { name: 'Submit answers' }).click();
  await expect(final).toContainText('Your score: 100%');
  const l = await lms(again);
  expect(l.data['cmi.core.lesson_status']).toBe('passed');
  expect(l.data['cmi.core.score.raw']).toBe('100');
});

test('a learner who already passed keeps passed while rewatching, and a submitted relaunch shows the result at once', async ({ page }) => {
  const submitted = encodeProjectSuspend({ furthest: 60, answers: { [Q1.id]: ['cb3k9w2qz'], [TF.id]: ['true'] }, submitted: true }, project.interactions);
  await prepare(page, { 'cmi.suspend_data': submitted, 'cmi.core.lesson_status': 'passed' });
  await page.goto(url);
  const final = page.getByRole('dialog', { name: 'End of video' });
  await expect(final).toContainText('Your score: 100%');
  await expect(final.getByRole('button', { name: 'Submit answers' })).toHaveCount(0);
  await final.getByRole('button', { name: 'Watch again' }).click();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect.poll(async () => (await lms(page)).calls.some((c) => c.fn === 'LMSCommit')).toBe(true); // the pause committed
  const l = await lms(page);
  // A session resumed after Submit: LMSFinish already happened in the earlier session, this one finishes on leaving.
  expect(sets(l).filter(([k]) => k === 'cmi.core.lesson_status')).toEqual([]);
  expect(l.data['cmi.core.lesson_status']).toBe('passed');
  expect(sets(l)).not.toContainEqual(['cmi.core.exit', 'suspend']);
});
