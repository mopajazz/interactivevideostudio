import { describe, it, expect } from 'vitest';
import type { SuspendState } from '@ivt/schema';
import { encodeSuspend, decodeSuspend } from '../src/suspend';

const ids = ['a', 'b', 'c'];

describe('suspend data', () => {
  it('round trips', () => {
    const s: SuspendState = { furthest: 2, answers: { a: ['x', 'y'], c: ['z'] }, submitted: true };
    expect(decodeSuspend(encodeSuspend(s, ids), ids)).toEqual(s);
  });

  it('round trips empty answers and an unsubmitted state', () => {
    const s: SuspendState = { furthest: 0, answers: {}, submitted: false };
    expect(decodeSuspend(encodeSuspend(s, ids), ids)).toEqual(s);
  });

  it('round trips empty answer lists and empty-string choice ids', () => {
    const s: SuspendState = { furthest: 1, answers: { a: [], b: [''] }, submitted: false };
    expect(decodeSuspend(encodeSuspend(s, ids), ids)).toEqual(s);
  });

  it('escapes delimiter characters in choice ids', () => {
    const s: SuspendState = {
      furthest: 1,
      answers: { a: ['x|y', 'a;b,c=d', '%41', 'ünï 😀\n"'], b: ['~|;,='] },
      submitted: false,
    };
    const raw = encodeSuspend(s, ids);
    expect(decodeSuspend(raw, ids)).toEqual(s);
    expect(raw.split('|')).toHaveLength(4);
  });

  it('keys answers by index, not id', () => {
    const raw = encodeSuspend({ furthest: 0, answers: { c: ['q'] }, submitted: false }, ids);
    expect(raw).not.toContain('c=');
    expect(raw.startsWith('v1|')).toBe(true);
  });

  it('300 questions with answers fits in 4096 and decodes with furthest and submitted intact', () => {
    const many = Array.from({ length: 300 }, (_, i) => `question-${i}`);
    const answers: Record<string, string[]> = {};
    many.forEach((id, i) => (answers[id] = [`choice-${i}-a`, `choice-${i}-b`]));
    const raw = encodeSuspend({ furthest: 299, answers, submitted: true }, many);
    expect(raw.length).toBeLessThanOrEqual(4096);
    const d = decodeSuspend(raw, many);
    expect(d).not.toBeNull();
    expect(d!.furthest).toBe(299);
    expect(d!.submitted).toBe(true);
  });

  it('keeps answers when they fit the limit', () => {
    const s: SuspendState = { furthest: 1, answers: { a: ['x'] }, submitted: false };
    expect(decodeSuspend(encodeSuspend(s, ids, 4096), ids)).toEqual(s);
  });

  it('honours a custom limit', () => {
    const s: SuspendState = { furthest: 1, answers: { a: ['x'.repeat(100)] }, submitted: true };
    const raw = encodeSuspend(s, ids, 50);
    expect(raw.length).toBeLessThanOrEqual(50);
    expect(decodeSuspend(raw, ids)).toEqual({ furthest: 1, answers: {}, submitted: true });
  });

  it('normalises negative, fractional and non-finite furthest', () => {
    const enc = (f: number) => decodeSuspend(encodeSuspend({ furthest: f, answers: {}, submitted: false }, ids), ids)!.furthest;
    expect(enc(-3)).toBe(0);
    expect(enc(2.7)).toBe(2);
    expect(enc(NaN)).toBe(0);
    expect(enc(Infinity)).toBe(0);
  });

  it('ignores answers for ids not in orderedIds when encoding', () => {
    const raw = encodeSuspend({ furthest: 0, answers: { zzz: ['x'] }, submitted: false }, ids);
    expect(decodeSuspend(raw, ids)!.answers).toEqual({});
  });

  it('returns null for empty or malformed input', () => {
    for (const bad of ['', 'garbage', 'v2|1|0|', 'v1|x|0|', 'v1|-1|0|', 'v1|1.5|0|', 'v1|1|2|', 'v1|1|0', 'v1|1|0|0', 'v1|1|0|x=a,', 'v1|1|0|0=%E0%A4%A,', 'v1|1|0|0=a'])
      expect(decodeSuspend(bad, ids), bad).toBeNull();
  });

  it('ignores indexes beyond orderedIds', () => {
    const raw = encodeSuspend({ furthest: 1, answers: { a: ['x'], c: ['y'] }, submitted: false }, ids);
    expect(decodeSuspend(raw, ['a'])).toEqual({ furthest: 1, answers: { a: ['x'] }, submitted: false });
  });
});
