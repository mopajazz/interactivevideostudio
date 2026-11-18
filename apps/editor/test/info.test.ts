import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchVideoInfo } from '../src/video/info';

type Opts = { videoId: string; events: Record<string, (e?: any) => void> };

/** Minimal stand-in for YT.Player (not the real player): only what fetchVideoInfo exercises. */
class StubPlayer {
  static last: StubPlayer;
  static destroyed = 0;
  dur = 0;
  constructor(public el: HTMLElement, public o: Opts) { StubPlayer.last = this; }
  getDuration() { return this.dur; }
  getCurrentTime() { return 0; }
  destroy() { StubPlayer.destroyed++; }
}

const w = window as any;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.useFakeTimers();
  w.YT = { Player: StubPlayer };
  StubPlayer.destroyed = 0;
});
afterEach(() => {
  vi.useRealTimers();
  delete w.YT;
  document.body.innerHTML = '';
});

const start = (id = 'dQw4w9WgXcQ') => {
  let result: unknown;
  fetchVideoInfo(id).then((r) => (result = r));
  return { get result() { return result; }, player: StubPlayer.last };
};

describe('fetchVideoInfo with a stubbed YT.Player', () => {
  it('loads the video in a hidden container', () => {
    const { player } = start('M7lc1UVf-VE');
    expect(player.o.videoId).toBe('M7lc1UVf-VE');
    const box = player.el.parentElement!;
    expect(box.getAttribute('aria-hidden')).toBe('true');
    expect(document.body.contains(box)).toBe(true);
  });

  it('resolves the duration once the player knows it, then cleans up', async () => {
    const run = start();
    run.player.o.events.onReady!();
    vi.advanceTimersByTime(500);
    await flush();
    expect(run.result).toBeUndefined(); // ready, but duration still unknown
    run.player.dur = 212.4;
    vi.advanceTimersByTime(500);
    await flush();
    expect(run.result).toEqual({ duration: 212.4, embeddable: true });
    expect(StubPlayer.destroyed).toBe(1);
    expect(document.body.children).toHaveLength(0);
  });

  it.each([
    [101, 'embed-disabled'],
    [150, 'embed-disabled'],
    [100, 'unavailable'],
    [2, 'unavailable'],
    [5, 'unavailable'],
  ])('maps player error %s to %s', async (code, error) => {
    const run = start();
    run.player.o.events.onError!({ data: code });
    await flush();
    expect(run.result).toEqual({ error });
    expect(StubPlayer.destroyed).toBe(1);
    expect(document.body.children).toHaveLength(0);
  });

  it('gives up as unavailable after 15 s', async () => {
    const run = start();
    vi.advanceTimersByTime(14_999);
    await flush();
    expect(run.result).toBeUndefined();
    vi.advanceTimersByTime(1);
    await flush();
    expect(run.result).toEqual({ error: 'unavailable' });
    expect(StubPlayer.destroyed).toBe(1);
    expect(document.body.children).toHaveLength(0);
  });

  it('settles only once', async () => {
    const run = start();
    run.player.o.events.onError!({ data: 150 });
    run.player.o.events.onError!({ data: 100 });
    vi.advanceTimersByTime(20_000);
    await flush();
    expect(run.result).toEqual({ error: 'embed-disabled' });
    expect(StubPlayer.destroyed).toBe(1);
  });
});
