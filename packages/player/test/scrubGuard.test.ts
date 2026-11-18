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

  describe('snap-back rate limit', () => {
    const mk = () => {
      let now = 0;
      const g = new ScrubGuard({ enabled: true, now: () => now, retryMs: 750 });
      return { g, tick: (ms: number) => { now += ms; } };
    };
    it('returns null on an immediate second ahead sample', () => {
      const { g } = mk();
      g.update(10);
      expect(g.update(40)).toBe(10);
      expect(g.update(40)).toBe(null);
    });
    it('retries after retryMs', () => {
      const { g, tick } = mk();
      g.update(10);
      expect(g.update(40)).toBe(10);
      tick(749);
      expect(g.update(40)).toBe(null);
      tick(1);
      expect(g.update(40)).toBe(10);
    });
    it('a sample within tolerance clears pending', () => {
      const { g } = mk();
      g.update(10);
      expect(g.update(40)).toBe(10);
      expect(g.update(10.5)).toBe(null);
      expect(g.update(40)).toBe(10.5);
    });
  });

  describe('furthest option', () => {
    it('snaps a first-sample forward jump when furthest is preset', () => {
      const g = new ScrubGuard({ enabled: true, furthest: 30 });
      expect(g.update(90)).toBe(30);
    });
    it('without option, first sample seeds then 40 snaps to 10', () => {
      const g = new ScrubGuard({ enabled: true });
      expect(g.update(10)).toBe(null);
      expect(g.update(40)).toBe(10);
    });
  });
});
