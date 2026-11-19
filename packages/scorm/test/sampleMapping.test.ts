import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { validateProject, type Project } from '@ivt/schema';
import { ScoreState, type mount } from '@ivt/player';
import { start } from '../src/launch';
import { decodeProjectSuspend, decodeSuspend, encodeProjectSuspend, suspendKeys } from '../src/suspend';

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
  it('3 of 4 correct (75%, mastery 80) is failed with raw 75, min 0, max 100', () => {
    const d = launchAndSubmit(sample, { ...allCorrect, i7: ['true'] });
    expect(d['cmi.core.score.raw']).toBe('75');
    expect(d['cmi.core.score.min']).toBe('0');
    expect(d['cmi.core.score.max']).toBe('100');
    expect(d['cmi.core.lesson_status']).toBe('failed');
  });

  it('a question with two correct choices needs both', () => {
    const d = launchAndSubmit(sample, { ...allCorrect, i5: ['c1'] });
    expect(d['cmi.core.score.raw']).toBe('75');
  });

  it('4 of 4 correct is passed with raw 100, min 0, max 100', () => {
    const d = launchAndSubmit(sample, allCorrect);
    expect([d['cmi.core.score.raw'], d['cmi.core.score.min'], d['cmi.core.score.max'], d['cmi.core.lesson_status']]).toEqual(['100', '0', '100', 'passed']);
  });

  it('2 of 3 correct reports 66.67 out of 100', () => {
    const three: Project = { ...sample, interactions: sample.interactions.filter((i) => i.id !== 'i7') };
    const d = launchAndSubmit(three, { i2: ['c1'], i4: ['true'], i5: ['c2'] });
    expect([d['cmi.core.score.raw'], d['cmi.core.score.max'], d['cmi.core.lesson_status']]).toEqual(['66.67', '100', 'failed']);
  });

  it('a video with no scored questions is completed and writes no score', () => {
    const videoOnly: Project = { ...sample, interactions: sample.interactions.filter((i) => i.type === 'text' || i.type === 'link') };
    const d = launchAndSubmit(videoOnly, {});
    expect(d['cmi.core.lesson_status']).toBe('completed');
    expect(Object.keys(d).filter((k) => k.startsWith('cmi.core.score'))).toEqual([]);
  });
});

describe('LMS acceptance sample: resume data across a re-upload', () => {
  const saved = encodeProjectSuspend({ furthest: 90, answers: { i2: ['c1'] }, submitted: false }, sample.interactions);
  const decode = (p: Project) => decodeProjectSuspend(saved, p.interactions);
  const edit = (id: string, f: (i: Project['interactions'][number]) => Project['interactions'][number]): Project =>
    ({ ...sample, interactions: sample.interactions.map((i) => (i.id === id ? f(i) : i)) });

  it('resumes when the package is unchanged', () => {
    expect(decode(sample)).toMatchObject({ furthest: 90, answers: { i2: ['c1'] } });
  });

  it('restarts cleanly when a checkpoint is added or removed', () => {
    const added: Project = { ...sample, interactions: [...sample.interactions, { id: 'i8', type: 'text', time: 250, order: 8, promptHtml: '<p>x</p>' }] };
    expect(decode(added)).toBeNull();
    expect(decode({ ...sample, interactions: sample.interactions.slice(1) })).toBeNull();
  });

  it('still resumes after a wording-only edit, because the fingerprint covers ids, types and choice ids, not text', () => {
    const edited = edit('i2', (i) => ({ ...i, promptHtml: '<p>Reworded?</p>', choices: i.choices!.map((c) => ({ ...c, html: `${c.html}!` })) }));
    expect(decode(edited)).toMatchObject({ furthest: 90, answers: { i2: ['c1'] } });
  });

  it('restarts when a question changes type', () => {
    const retyped = edit('i2', (i) => ({ ...i, type: 'trueFalse' }));
    expect(decode(retyped)).toBeNull();
    expect(decodeSuspend(saved, suspendKeys(retyped.interactions))).toBeNull();
  });

  it('restarts when a choice is replaced, added or removed', () => {
    const replaced = edit('i2', (i) => ({ ...i, choices: i.choices!.map((c, n) => (n === 0 ? { ...c, id: 'cZZZZZZZZ' } : c)) }));
    expect(decodeSuspend(saved, suspendKeys(replaced.interactions))).toBeNull();
    const added = edit('i2', (i) => ({ ...i, choices: [...i.choices!, { id: 'cnew', html: 'New', correct: false }] }));
    expect(decode(added)).toBeNull();
    const removed = edit('i2', (i) => ({ ...i, choices: i.choices!.slice(0, -1) }));
    expect(decode(removed)).toBeNull();
  });

  it('keys are id:type:choice ids per interaction', () => {
    expect(suspendKeys([{ id: 'iA', type: 'multipleChoice', time: 1, order: 0, promptHtml: '', choices: [{ id: 'c1', html: '', correct: true }, { id: 'c2', html: '', correct: false }] }, { id: 'iB', type: 'text', time: 2, order: 1, promptHtml: '' }]))
      .toEqual(['iA:multipleChoice:c1,c2', 'iB:text:']);
  });
});
