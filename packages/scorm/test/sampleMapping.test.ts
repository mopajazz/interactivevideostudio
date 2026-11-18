import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateProject, type Project } from '@ivt/schema';
import { ScoreState, type mount } from '@ivt/player';
import { start } from '../src/launch';
import { decodeSuspend, encodeSuspend } from '../src/suspend';

// The LMS acceptance sample (examples/lms-acceptance-sample.json) through the real player scoring and the launch
// wiring, against a recording fake of the SCORM 1.2 API: the values an LMS should receive in each case.
const raw = JSON.parse(readFileSync(resolve(__dirname, '../../../examples/lms-acceptance-sample.json'), 'utf8'));
const checked = validateProject(raw.project);
if (!checked.ok) throw new Error(checked.errors.join('; '));
const sample: Project = checked.project;

/** Launches `project`, has the learner give `answers` (question id -> choice ids), submits, and returns what the LMS was told. */
function launchAndSubmit(project: Project, answers: Record<string, string[]>): Record<string, string> {
  const data: Record<string, string> = {};
  const api = {
    LMSInitialize: vi.fn(() => 'true'), LMSFinish: vi.fn(() => 'true'), LMSCommit: vi.fn(() => 'true'),
    LMSGetLastError: vi.fn(() => '0'), LMSGetValue: vi.fn((k: string) => data[k] ?? ''),
    LMSSetValue: vi.fn((k: string, v: string) => { data[k] = v; return 'true'; }),
  };
  const doc = document.implementation.createHTMLDocument('x');
  doc.body.innerHTML = '<div id="ivt-root"></div>';
  const win = { API: api, addEventListener: () => undefined } as unknown as Window;
  const mountFn = ((_el, p, opts) => {
    const score = new ScoreState(p.interactions, p.settings.masteryPercent);
    for (const [id, choices] of Object.entries(answers)) score.setAnswer(id, choices);
    opts!.onProgress!({ furthest: 250, answers: score.getAnswers(), submitted: false });
    opts!.onResult!(score.submit());
    return { destroy() { /* nothing */ } };
  }) as typeof mount;
  start(win, doc, project, mountFn);
  return data;
}

const allCorrect: Record<string, string[]> = { i2: ['c1'], i4: ['true'], i5: ['c1', 'c3'], i7: ['false'] };

describe('LMS acceptance sample: what the LMS is told', () => {
  it('3 of 4 correct (75%, mastery 80) is failed with raw 3, min 0, max 4', () => {
    const d = launchAndSubmit(sample, { ...allCorrect, i7: ['true'] });
    expect(d['cmi.core.score.raw']).toBe('3');
    expect(d['cmi.core.score.min']).toBe('0');
    expect(d['cmi.core.score.max']).toBe('4');
    expect(d['cmi.core.lesson_status']).toBe('failed');
  });

  it('a question with two correct choices needs both', () => {
    const d = launchAndSubmit(sample, { ...allCorrect, i5: ['c1'] });
    expect(d['cmi.core.score.raw']).toBe('3');
  });

  it('4 of 4 correct is passed with raw 4, min 0, max 4', () => {
    const d = launchAndSubmit(sample, allCorrect);
    expect([d['cmi.core.score.raw'], d['cmi.core.score.min'], d['cmi.core.score.max'], d['cmi.core.lesson_status']]).toEqual(['4', '0', '4', 'passed']);
  });

  it('a video with no scored questions is completed and writes no score', () => {
    const videoOnly: Project = { ...sample, interactions: sample.interactions.filter((i) => i.type === 'text' || i.type === 'link') };
    const d = launchAndSubmit(videoOnly, {});
    expect(d['cmi.core.lesson_status']).toBe('completed');
    expect(Object.keys(d).filter((k) => k.startsWith('cmi.core.score'))).toEqual([]);
  });
});

describe('LMS acceptance sample: resume data across a re-upload', () => {
  const ids = (p: Project) => p.interactions.map((i) => i.id);
  const saved = encodeSuspend({ furthest: 90, answers: { i2: ['c1'] }, submitted: false }, ids(sample));

  it('resumes when the package is unchanged', () => {
    expect(decodeSuspend(saved, ids(sample))).toMatchObject({ furthest: 90, answers: { i2: ['c1'] } });
  });

  it('restarts cleanly when a checkpoint is added or removed', () => {
    const added: Project = { ...sample, interactions: [...sample.interactions, { id: 'i8', type: 'text', time: 250, order: 8, promptHtml: '<p>x</p>' }] };
    expect(decodeSuspend(saved, ids(added))).toBeNull();
    expect(decodeSuspend(saved, ids({ ...sample, interactions: sample.interactions.slice(1) }))).toBeNull();
  });

  it('still resumes after a wording-only edit, because the fingerprint covers checkpoint ids, not their text', () => {
    const edited: Project = { ...sample, interactions: sample.interactions.map((i) => (i.id === 'i2' ? { ...i, promptHtml: '<p>Reworded?</p>' } : i)) };
    expect(decodeSuspend(saved, ids(edited))).toMatchObject({ furthest: 90 });
  });
});
