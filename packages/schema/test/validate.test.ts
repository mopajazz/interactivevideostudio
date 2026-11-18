import { describe, it, expect } from 'vitest';
import { validateProject, exportBlockers } from '../src/validate';
import type { Project } from '../src/index';

const base = (): Project => ({
  version: 1,
  title: 'T',
  videoId: 'dQw4w9WgXcQ',
  duration: 0,
  settings: { disableForwardScrubbing: false, masteryPercent: 80 },
  interactions: [
    {
      id: 'i1', type: 'multipleChoice', time: 5, order: 0, promptHtml: '<p>q</p>',
      choices: [{ id: 'c1', html: 'a', correct: true }, { id: 'c2', html: 'b', correct: false }],
    },
  ],
});

describe('validateProject', () => {
  it('accepts a valid project', () => {
    const r = validateProject(base());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.project.title).toBe('T');
  });

  it('rejects non-objects', () => {
    expect(validateProject(null).ok).toBe(false);
    expect(validateProject('x').ok).toBe(false);
  });

  it.each([-1, 101, Number.NaN, '80'])('rejects masteryPercent %s', (m) => {
    const p: any = base();
    p.settings.masteryPercent = m;
    expect(validateProject(p).ok).toBe(false);
  });

  it.each([0, 100])('accepts masteryPercent %s', (m) => {
    const p = base();
    p.settings.masteryPercent = m;
    expect(validateProject(p).ok).toBe(true);
  });

  it('rejects unknown interaction types', () => {
    const p: any = base();
    p.interactions[0].type = 'drag';
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/type/);
  });

  it('requires duration to be a number >= 0', () => {
    for (const d of [-1, '3', undefined, Number.NaN]) {
      const p: any = base();
      p.duration = d;
      expect(validateProject(p).ok).toBe(false);
    }
    const p = base();
    p.duration = 12.5;
    expect(validateProject(p).ok).toBe(true);
  });

  it('rejects wrong version and missing fields', () => {
    const p: any = base();
    p.version = 2;
    delete p.videoId;
    const r = validateProject(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects negative interaction time and malformed choices', () => {
    const p: any = base();
    p.interactions[0].time = -3;
    p.interactions[0].choices = [{ id: 1 }];
    expect(validateProject(p).ok).toBe(false);
  });
});

describe('validateProject deep checks', () => {
  const bad = (mutate: (p: any) => void) => {
    const p: any = base();
    mutate(p);
    return validateProject(p);
  };
  const dup = (): Project => {
    const p = base();
    p.interactions.push({ ...p.interactions[0]!, order: 1 });
    return p;
  };

  it('rejects duplicate interaction ids', () => {
    expect(validateProject(dup()).ok).toBe(false);
  });

  it('rejects duplicate choice ids within an interaction', () => {
    expect(bad((p) => p.interactions[0].choices.push({ id: 'c1', html: 'b', correct: false })).ok).toBe(false);
  });

  it('allows the same choice id in different interactions', () => {
    const p = dup();
    p.interactions[1]!.id = 'i2';
    expect(validateProject(p).ok).toBe(true);
  });

  it.each([
    ['alt', 5],
    ['decorative', 'yes'],
    ['hintHtml', 1],
    ['url', 3],
    ['imageAssetId', {}],
  ])('rejects wrongly typed optional %s', (k, v) => {
    expect(bad((p) => (p.interactions[0][k] = v)).ok).toBe(false);
  });

  it.each(['feedbackHtml'])('rejects non-string choice %s', (k) => {
    expect(bad((p) => (p.interactions[0].choices[0][k] = 1)).ok).toBe(false);
  });

  it('accepts a question draft with no choices or no correct answer', () => {
    expect(bad((p) => delete p.interactions[0].choices).ok).toBe(true);
    expect(bad((p) => (p.interactions[0].choices[0].correct = false)).ok).toBe(true);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'JAVASCRIPT:x', 'ftp://x.org', 'not a url'])(
    'rejects link url %s',
    (url) => {
      expect(bad((p) => Object.assign(p.interactions[0], { type: 'link', url })).ok).toBe(false);
    },
  );

  it.each(['https://x.org', 'http://x.org/a', 'mailto:a@b.org'])('accepts link url %s', (url) => {
    expect(bad((p) => Object.assign(p.interactions[0], { type: 'link', url })).ok).toBe(true);
  });
});

describe('exportBlockers'
, () => {
  it('is empty for a clean project', () => {
    expect(exportBlockers(base())).toEqual([]);
  });

  it('reports one message per image interaction lacking alt and decorative', () => {
    const p = base();
    p.interactions.push(
      { id: 'a', type: 'image', time: 1, order: 1, promptHtml: '', imageAssetId: 'x' },
      { id: 'b', type: 'image', time: 2, order: 2, promptHtml: '', imageAssetId: 'y', alt: 'ok' },
      { id: 'c', type: 'image', time: 3, order: 3, promptHtml: '', imageAssetId: 'z', decorative: true },
      { id: 'd', type: 'image', time: 4, order: 4, promptHtml: '', imageAssetId: 'w', alt: '  ' },
    );
    expect(exportBlockers(p)).toHaveLength(2);
  });

  it('does not throw on a non-string alt', () => {
    const p: any = base();
    p.interactions.push({ id: 'a', type: 'image', time: 1, order: 1, promptHtml: '', alt: 5 });
    expect(exportBlockers(p)).toHaveLength(1);
  });

  it('reports one message per question with <2 choices or no correct choice', () => {
    const p = base(); // i1 is valid
    p.interactions.push(
      { id: 'q2', type: 'multipleChoice', time: 1, order: 1, promptHtml: '', choices: [
        { id: 'a', html: 'a', correct: false }, { id: 'b', html: 'b', correct: false } ] },
      { id: 'q3', type: 'trueFalse', time: 2, order: 2, promptHtml: '', choices: [
        { id: 'a', html: 'T', correct: true }, { id: 'b', html: 'F', correct: false } ] },
      { id: 'q4', type: 'trueFalse', time: 3, order: 3, promptHtml: '' },
      { id: 'q5', type: 'multipleChoice', time: 4, order: 4, promptHtml: '', choices: [{ id: 'a', html: 'a', correct: true }] },
    );
    expect(exportBlockers(p)).toHaveLength(3);
  });
});
