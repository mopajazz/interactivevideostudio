import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YouTubeAdapter, API_LOAD_FAILED } from '../src/YouTubeAdapter';

type Opts = { videoId: string; playerVars: Record<string, number | string>; events: Record<string, (e?: any) => void> };

/** Minimal stand-in for YT.Player, as in spike/index.html ?stub=1. Not the real player. */
class StubPlayer {
  static last: StubPlayer;
  calls: string[] = [];
  t = 0;
  dur = 60;
  constructor(public el: HTMLElement, public o: Opts) { StubPlayer.last = this; }
  playVideo() { this.calls.push('play'); }
  pauseVideo() { this.calls.push('pause'); }
  seekTo(s: number, allow: boolean) { this.calls.push(`seekTo:${s}:${allow}`); this.t = s; }
  getCurrentTime() { return this.t; }
  getDuration() { return this.dur; }
  setPlaybackRate(r: number) { this.calls.push(`rate:${r}`); }
  loadModule(m: string) { this.calls.push(`loadModule:${m}`); }
  unloadModule(m: string) { this.calls.push(`unloadModule:${m}`); }
  getOption() { return [{ languageCode: 'fr' }]; }
  setOption(m: string, k: string, v: unknown) { this.calls.push(`setOption:${m}:${k}:${JSON.stringify(v)}`); }
  destroy() { this.calls.push('destroy'); }
}

const w = window as any;
const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); };
let host: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  vi.useRealTimers();
  delete w.YT;
  delete w.onYouTubeIframeAPIReady;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  host.remove();
});

describe('YouTubeAdapter with a stubbed YT.Player', () => {
  it('hides native controls and keyboard, then maps calls onto the player', () => {
    w.YT = { Player: StubPlayer };
    const a = new YouTubeAdapter(host, 'M7lc1UVf-VE');
    const p = StubPlayer.last;
    expect(p.o.videoId).toBe('M7lc1UVf-VE');
    expect(p.o.playerVars).toMatchObject({ controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1, cc_load_policy: 0 });
    expect(a.getDuration()).toBe(0); // not ready yet
    a.play(); // queued until ready
    a.setRate(1.5);
    a.setCaptions(true);
    expect(p.calls).toEqual([]);
    p.o.events.onReady!();
    expect(p.calls).toEqual(['rate:1.5', 'loadModule:captions', 'setOption:captions:track:{"languageCode":"fr"}', 'play']);
    p.calls = [];
    expect(a.getDuration()).toBe(60);
    a.pause();
    a.seekTo(12);
    expect(a.getCurrentTime()).toBe(12);
    a.setCaptions(true);
    a.setCaptions(false);
    expect(p.calls).toEqual([
      'pause', 'seekTo:12:true', 'loadModule:captions', 'setOption:captions:track:{"languageCode":"fr"}', 'unloadModule:captions',
    ]);
    a.destroy();
    expect(p.calls.at(-1)).toBe('destroy');
  });

  it('maps player states, polls time, and forwards errors', () => {
    w.YT = { Player: StubPlayer };
    const a = new YouTubeAdapter(host, 'M7lc1UVf-VE', { pollMs: 250 });
    const states: string[] = [];
    const times: number[] = [];
    const errors: unknown[] = [];
    a.on('state', (s) => states.push(s));
    a.on('time', (t) => times.push(t));
    a.on('error', (e) => errors.push(e));
    const p = StubPlayer.last;
    p.o.events.onReady!();
    for (const data of [-1, 1, 3, 2, 0, 5]) p.o.events.onStateChange!({ data });
    expect(states).toEqual(['unstarted', 'playing', 'buffering', 'paused', 'ended', 'cued']);
    p.t = 3;
    vi.advanceTimersByTime(250);
    expect(times).toEqual([3]);
    p.o.events.onError!({ data: 150 });
    expect(errors).toEqual([150]);
    a.destroy();
    vi.advanceTimersByTime(1000);
    expect(times).toEqual([3]);
  });

  it('reports API_LOAD_FAILED when the IFrame API script fails to load', async () => {
    const a = new YouTubeAdapter(host, 'M7lc1UVf-VE');
    const errors: unknown[] = [];
    a.on('error', (e) => errors.push(e));
    const script = document.head.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    expect(script).not.toBeNull();
    script!.dispatchEvent(new Event('error'));
    await flush();
    expect(errors).toEqual([API_LOAD_FAILED]);
    a.destroy();
  });

  it('reports API_LOAD_FAILED when the API never becomes ready', async () => {
    const a = new YouTubeAdapter(host, 'M7lc1UVf-VE', { loadTimeoutMs: 5000 });
    const errors: unknown[] = [];
    a.on('error', (e) => errors.push(e));
    vi.advanceTimersByTime(5000);
    await flush();
    expect(errors).toEqual([API_LOAD_FAILED]);
    a.destroy();
  });

  it('boots when the API script calls onYouTubeIframeAPIReady', async () => {
    const a = new YouTubeAdapter(host, 'M7lc1UVf-VE', { loadTimeoutMs: 5000 });
    const errors: unknown[] = [];
    a.on('error', (e) => errors.push(e));
    w.YT = { Player: StubPlayer };
    w.onYouTubeIframeAPIReady();
    await flush();
    StubPlayer.last.o.events.onReady!();
    vi.advanceTimersByTime(5000);
    await flush();
    expect(errors).toEqual([]);
    expect(a.getDuration()).toBe(60);
    a.destroy();
  });
});
