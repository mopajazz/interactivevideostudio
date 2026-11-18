import { describe, it, expect } from 'vitest';
import { ScrubGuard } from '../src/scrubGuard';

describe('ScrubGuard', () => {
  it('snaps back to furthest when jumping forward past tolerance', () => {
    const g = new ScrubGuard({ enabled: true });
    expect(g.update(10)).toBe(null);
    expect(g.update(40)).toBe(10);
    expect(g.furthest).toBe(10);
  });
  it('does not snap normal playback and advances furthest', () => {
    const g = new ScrubGuard({ enabled: true });
    g.update(10);
    expect(g.update(11)).toBe(null);
    expect(g.furthest).toBe(11);
  });
  it('allows seeking backwards', () => {
    const g = new ScrubGuard({ enabled: true });
    g.update(10);
    expect(g.update(2)).toBe(null);
    expect(g.furthest).toBe(10);
  });
  it('release stops snapping', () => {
    const g = new ScrubGuard({ enabled: true });
    g.update(10);
    g.release();
    expect(g.update(99)).toBe(null);
  });
  it('disabled never snaps', () => {
    const g = new ScrubGuard({ enabled: false });
    g.update(10);
    expect(g.update(99)).toBe(null);
  });
  it('honours custom tolerance and ignores NaN', () => {
    const g = new ScrubGuard({ enabled: true, tolerance: 5 });
    g.update(10);
    expect(g.update(14)).toBe(null);
    expect(g.update(30)).toBe(14);
    expect(g.update(NaN)).toBe(null);
  });
});
