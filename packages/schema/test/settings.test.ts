import { describe, it, expect } from 'vitest';
import { resolveSettings, validateProject } from '../src/index';
import type { Project } from '../src/index';

const base = (settings: Record<string, unknown> = {}): Project => ({
  version: 1,
  title: 'T',
  videoId: 'dQw4w9WgXcQ',
  duration: 0,
  settings: { disableForwardScrubbing: false, masteryPercent: 80, ...settings } as Project['settings'],
  interactions: [],
});

const FIELDS = ['captionsConfirmed', 'allowRetry', 'showSolution'] as const;

describe('validateProject: optional settings', () => {
  it('accepts a project without any of them (missing means the default)', () => {
    expect(validateProject(base()).ok).toBe(true);
  });

  it.each(FIELDS)('accepts %s as true or false', (k) => {
    expect(validateProject(base({ [k]: true })).ok).toBe(true);
    expect(validateProject(base({ [k]: false })).ok).toBe(true);
  });

  it.each(FIELDS.flatMap((k) => ['true', 1, 0, null, {}, []].map((v) => [k, v] as const)))(
    'rejects %s = %j with a readable error',
    (k, v) => {
      const r = validateProject(base({ [k]: v }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual([`settings.${k} must be true or false when present`]);
    },
  );
});

describe('resolveSettings', () => {
  it('applies the defaults: captions not confirmed, no retry, solution shown', () => {
    expect(resolveSettings({ disableForwardScrubbing: true, masteryPercent: 65 })).toEqual({
      disableForwardScrubbing: true,
      masteryPercent: 65,
      captionsConfirmed: false,
      allowRetry: false,
      showSolution: true,
    });
  });

  it('keeps every value the author set', () => {
    expect(resolveSettings({ disableForwardScrubbing: false, masteryPercent: 80, captionsConfirmed: true, allowRetry: true, showSolution: false }))
      .toEqual({ disableForwardScrubbing: false, masteryPercent: 80, captionsConfirmed: true, allowRetry: true, showSolution: false });
  });

  it('returns a new object and leaves the stored settings untouched', () => {
    const s = { disableForwardScrubbing: false, masteryPercent: 80 };
    const r = resolveSettings(s);
    expect(r).not.toBe(s);
    expect(s).toEqual({ disableForwardScrubbing: false, masteryPercent: 80 });
  });
});
