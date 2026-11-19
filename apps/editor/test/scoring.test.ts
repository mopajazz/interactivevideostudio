import { describe, expect, it } from 'vitest';
import type { Interaction, Project } from '@ivt/schema';
import { MASTERY_ERROR, parseMastery, questionRulesSummary, scoringSummary } from '../src/scoring';

describe('parseMastery', () => {
  it.each([['0', 0], ['80', 80], ['100', 100], [' 75 ', 75], ['007', 7]])('accepts %j as %d', (text, n) => {
    expect(parseMastery(text)).toBe(n);
  });

  it.each(['101', '-1', '80.5', '', '   ', 'abc', '8O', '1e2', '+5', '1000'])('rejects %j', (text) => {
    expect(parseMastery(text)).toBeNull();
  });

  it('says what a valid value looks like', () => {
    expect(MASTERY_ERROR).toBe('Enter a whole number from 0 to 100.');
  });
});

const it_ = (id: string, type: Interaction['type']): Interaction => ({ id, type, time: 1, order: 1, promptHtml: '' });
const project = (interactions: Interaction[]): Project => ({
  version: 1, title: 't', videoId: 'dQw4w9WgXcQ', duration: 212,
  settings: { disableForwardScrubbing: false, masteryPercent: 80 }, interactions,
});

describe('scoringSummary', () => {
  it('counts scored questions, info cards and points (one per question)', () => {
    const s = scoringSummary(project([it_('a', 'multipleChoice'), it_('b', 'trueFalse'), it_('c', 'text'), it_('d', 'link'), it_('e', 'image')]));
    expect(s).toEqual({ questions: 2, cards: 3, points: 2 });
  });

  it('is all zeros for an empty project', () => {
    expect(scoringSummary(project([]))).toEqual({ questions: 0, cards: 0, points: 0 });
  });
});

describe('questionRulesSummary', () => {
  const rules = (allowRetry: boolean, showSolution: boolean) => questionRulesSummary({ allowRetry, showSolution });

  it.each([
    [false, true, 'Learners get one try at each question, and then see the correct answer.'],
    [false, false, 'Learners get one try at each question and are not shown the correct answer.'],
    [true, true, 'Learners can try a question again after a wrong answer, and see the correct answer once they get it right.'],
    [true, false, 'Learners can try a question again after a wrong answer, and are not shown the correct answer.'],
  ])('retry %s, solution %s: %j', (retry, solution, text) => {
    expect(rules(retry, solution)).toBe(text);
  });
});
