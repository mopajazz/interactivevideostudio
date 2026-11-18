import { describe, it, expect } from 'vitest';
import type { Interaction } from '@ivt/schema';
import { InteractionScheduler } from '../src/scheduler';
import { FakeAdapter } from '../src/fakeAdapter';

const mk = (id: string, time: number, order = 0): Interaction => ({
  id, type: 'text', time, order, promptHtml: '',
});

describe('InteractionScheduler', () => {
  it('orders same-time checkpoints by order', () => {
    const s = new InteractionScheduler([mk('b', 5, 2), mk('a', 5, 1)], 100);
    expect(s.due(4, 6).map((i) => i.id)).toEqual(['a', 'b']);
  });
  it('uses prev < time <= cur', () => {
    const s = new InteractionScheduler([mk('a', 5)], 100);
    expect(s.due(5, 6)).toEqual([]);
    expect(s.due(4, 5).map((i) => i.id)).toEqual(['a']);
  });
  it('does not retrigger seen items after seek back then forward', () => {
    const s = new InteractionScheduler([mk('a', 5)], 100);
    expect(s.due(4, 6)).toHaveLength(1);
    s.markSeen('a');
    expect(s.due(6, 2)).toEqual([]);
    expect(s.due(2, 8)).toEqual([]);
  });
  it('never returns an item at time >= duration', () => {
    const s = new InteractionScheduler([mk('a', 100), mk('b', 150)], 100);
    expect(s.due(99, 100)).toEqual([]);
    expect(s.due(0, 200)).toEqual([]);
  });
  it('returns item at 99.5 with duration 100 when crossed', () => {
    const s = new InteractionScheduler([mk('a', 99.5)], 100);
    expect(s.due(99, 99.6).map((i) => i.id)).toEqual(['a']);
  });
  it('handles empty list, duration 0 and backwards ranges', () => {
    expect(new InteractionScheduler([], 100).due(0, 50)).toEqual([]);
    expect(new InteractionScheduler([mk('a', 5)], 0).due(0, 50)).toEqual([]);
    expect(new InteractionScheduler([mk('a', 5)], 100).due(10, 2)).toEqual([]);
  });
});

describe('FakeAdapter', () => {
  it('advances time while playing and emits events', () => {
    const f = new FakeAdapter(100);
    const times: number[] = [];
    f.on('time', (t) => times.push(t));
    f.advance(3);
    expect(times).toEqual([]);
    f.play();
    f.advance(3);
    expect(f.getCurrentTime()).toBe(3);
    expect(times).toEqual([3]);
    f.seekTo(50);
    expect(f.getCurrentTime()).toBe(50);
    f.advance(1000);
    expect(f.getCurrentTime()).toBe(100);
  });
  it('emits errors', () => {
    const f = new FakeAdapter(10);
    const errs: number[] = [];
    f.on('error', (c) => errs.push(c));
    f.emitError(150);
    expect(errs).toEqual([150]);
  });
});
