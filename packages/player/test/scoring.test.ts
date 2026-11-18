import { describe, it, expect } from 'vitest';
import type { Interaction } from '@ivt/schema';
import { ScoreState } from '../src/scoring';

const tf = (id: string): Interaction => ({
  id, type: 'trueFalse', time: 1, order: 0, promptHtml: '',
  choices: [{ id: 't', html: 'True', correct: true }, { id: 'f', html: 'False', correct: false }],
});
const mc = (id: string): Interaction => ({
  id, type: 'multipleChoice', time: 1, order: 0, promptHtml: '',
  choices: [
    { id: 'a', html: 'A', correct: true },
    { id: 'b', html: 'B', correct: true },
    { id: 'c', html: 'C', correct: false },
  ],
});
const text = (id: string): Interaction => ({ id, type: 'text', time: 1, order: 0, promptHtml: '' });
const four = () => [tf('q1'), tf('q2'), tf('q3'), tf('q4')];

describe('ScoreState', () => {
  it('3 of 4 correct at mastery 80 fails with 75%', () => {
    const s = new ScoreState(four(), 80);
    s.setAnswer('q1', ['t']); s.setAnswer('q2', ['t']); s.setAnswer('q3', ['t']); s.setAnswer('q4', ['f']);
    expect(s.submit()).toEqual({ raw: 3, max: 4, percent: 75, passed: false, scored: true, status: 'failed' });
  });
  it('4 of 4 passes', () => {
    const s = new ScoreState(four(), 80);
    for (const q of ['q1', 'q2', 'q3', 'q4']) s.setAnswer(q, ['t']);
    const r = s.submit();
    expect(r.percent).toBe(100);
    expect(r.status).toBe('passed');
    expect(r.passed).toBe(true);
  });
  it('percent equal to mastery passes; mastery 0 and 100', () => {
    const s = new ScoreState(four(), 75);
    s.setAnswer('q1', ['t']); s.setAnswer('q2', ['t']); s.setAnswer('q3', ['t']);
    expect(s.submit().status).toBe('passed');
    expect(new ScoreState(four(), 0).submit().status).toBe('passed');
    expect(new ScoreState(four(), 100).submit().status).toBe('failed');
  });
  it('unanswered counts wrong', () => {
    const s = new ScoreState(four(), 80);
    s.setAnswer('q1', ['t']);
    expect(s.submit().raw).toBe(1);
  });
  it('multiple-correct question needs the exact set', () => {
    const run = (ids: string[]) => {
      const s = new ScoreState([mc('m')], 50);
      s.setAnswer('m', ids);
      return s.submit().raw;
    };
    expect(run(['a', 'b'])).toBe(1);
    expect(run(['b', 'a'])).toBe(1);
    expect(run(['a'])).toBe(0);
    expect(run(['a', 'b', 'c'])).toBe(0);
    expect(run(['a', 'c'])).toBe(0);
    expect(run(['a', 'a', 'b'])).toBe(1);
  });
  it('ignores unknown choice ids and unknown question ids', () => {
    const s = new ScoreState([mc('m')], 50);
    s.setAnswer('m', ['a', 'b', 'zzz']);
    expect(() => s.setAnswer('nope', ['a'])).not.toThrow();
    expect(s.submit().raw).toBe(1);
  });
  it('later setAnswer before submit replaces earlier', () => {
    const s = new ScoreState([tf('q')], 50);
    s.setAnswer('q', ['f']);
    s.setAnswer('q', ['t']);
    expect(s.submit().raw).toBe(1);
  });
  it('submit is final', () => {
    const s = new ScoreState(four(), 80);
    expect(s.isSubmitted()).toBe(false);
    const r1 = s.submit();
    expect(s.isSubmitted()).toBe(true);
    expect(s.submit()).toBe(r1);
    expect(() => s.setAnswer('q1', ['t'])).toThrow();
  });
  it('getAnswers returns a copy', () => {
    const s = new ScoreState(four(), 80);
    const ids = ['t'];
    s.setAnswer('q1', ids);
    ids.push('f');
    const a = s.getAnswers();
    expect(a).toEqual({ q1: ['t'] });
    a.q1!.push('x'); a.q2 = [];
    expect(s.getAnswers()).toEqual({ q1: ['t'] });
  });
  it('with no scored questions: scored false, completed', () => {
    const s = new ScoreState([text('x'), { ...text('i'), type: 'image' }], 80);
    expect(s.submit()).toEqual({ raw: 0, max: 0, percent: 0, passed: true, scored: false, status: 'completed' });
    expect(new ScoreState([], 80).submit().status).toBe('completed');
  });
  it('non-question interactions never count toward max', () => {
    const s = new ScoreState([tf('q'), text('x'), { ...text('l'), type: 'link' }], 80);
    s.setAnswer('q', ['t']);
    expect(s.submit()).toMatchObject({ raw: 1, max: 1, percent: 100 });
  });
});
