import type { VideoAdapter } from './adapter';

/** Error value emitted when the IFrame API script cannot load (offline, blocked, or timed out). */
export const API_LOAD_FAILED = 'api-load-failed';

const API_SRC = 'https://www.youtube.com/iframe_api';
const STATES: Record<number, string> = { [-1]: 'unstarted', 0: 'ended', 1: 'playing', 2: 'paused', 3: 'buffering', 5: 'cued' };

type Ev = 'time' | 'state' | 'error';
type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number; getDuration(): number; setPlaybackRate(r: number): void;
  loadModule(m: string): void; unloadModule(m: string): void;
  getOption?(m: string, k: string): unknown; setOption(m: string, k: string, v: unknown): void;
  destroy(): void;
};
type YTGlobal = { Player: new (el: HTMLElement, o: unknown) => YTPlayer };
const win = () => window as unknown as { YT?: YTGlobal; onYouTubeIframeAPIReady?: () => void };

let loading: Promise<YTGlobal> | null = null;

/** Loads the IFrame API once per page; a failure resets so a later adapter can retry. */
function loadApi(timeoutMs: number): Promise<YTGlobal> {
  const w = win();
  if (loading) return loading;
  loading = new Promise<YTGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error(API_LOAD_FAILED)); };
    const timer = setTimeout(fail, timeoutMs);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      if (w.YT?.Player) resolve(w.YT); else fail();
    };
    script.src = API_SRC;
    script.async = true;
    script.addEventListener('error', fail);
    document.head.append(script);
  });
  return loading;
}

/** VideoAdapter over the YouTube IFrame API, with native controls and keyboard hidden (spike DECISION: GO). */
export class YouTubeAdapter implements VideoAdapter {
  private player: YTPlayer | null = null;
  private ready = false;
  private destroyed = false;
  private poll: ReturnType<typeof setInterval> | undefined;
  private pendingPlay = false;
  private rate = 1;
  private captions = false;
  private handlers: Record<Ev, Array<(v: any) => void>> = { time: [], state: [], error: [] };

  constructor(host: HTMLElement, private videoId: string, o: { pollMs?: number; loadTimeoutMs?: number } = {}) {
    const pollMs = o.pollMs ?? 250;
    const mountEl = document.createElement('div');
    host.append(mountEl);
    const YT = win().YT;
    if (YT?.Player) {
      this.create(YT, mountEl, pollMs);
      return;
    }
    loadApi(o.loadTimeoutMs ?? 15000).then(
      (YT) => { if (!this.destroyed) this.create(YT, mountEl, pollMs); },
      () => { if (!this.destroyed) this.emit('error', API_LOAD_FAILED); },
    );
  }

  private create(YT: YTGlobal, el: HTMLElement, pollMs: number) {
    const origin = /^https?:/.test(location.protocol) ? location.origin : undefined;
    this.player = new YT.Player(el, {
      videoId: this.videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        controls: 0, disablekb: 1, modestbranding: 1, rel: 0, playsinline: 1,
        cc_load_policy: 0, iv_load_policy: 3, fs: 0, enablejsapi: 1, ...(origin ? { origin } : {}),
      },
      events: {
        onReady: () => {
          this.ready = true;
          if (this.rate !== 1) this.player!.setPlaybackRate(this.rate);
          if (this.captions) this.setCaptions(true);
          if (this.pendingPlay) this.player!.playVideo();
          this.poll = setInterval(() => this.emit('time', this.getCurrentTime()), pollMs);
        },
        onStateChange: (e: { data: number }) => this.emit('state', STATES[e.data] ?? String(e.data)),
        onError: (e: { data: number }) => this.emit('error', e.data),
      },
    });
  }

  private emit(ev: Ev, v: unknown) { this.handlers[ev].forEach((cb) => cb(v)); }
  private get p() { return this.ready ? this.player : null; }

  play() { if (this.p) this.p.playVideo(); else this.pendingPlay = true; }
  pause() { this.pendingPlay = false; this.p?.pauseVideo(); }
  seekTo(s: number) { this.p?.seekTo(s, true); }
  getCurrentTime() { return this.p?.getCurrentTime() ?? 0; }
  getDuration() { return this.p?.getDuration() || 0; }
  setRate(r: number) { this.rate = r; this.p?.setPlaybackRate(r); }
  setCaptions(on: boolean) {
    this.captions = on;
    const p = this.p;
    if (!p) return;
    if (!on) return p.unloadModule('captions');
    p.loadModule('captions');
    // Not guaranteed by YouTube (spike: UNVERIFIED); pick the video's first track when the list is available.
    const list = p.getOption?.('captions', 'tracklist');
    const first = Array.isArray(list) ? (list[0] as { languageCode?: string } | undefined) : undefined;
    if (first?.languageCode) p.setOption('captions', 'track', { languageCode: first.languageCode });
  }
  on(ev: Ev, cb: (v: any) => void) { this.handlers[ev].push(cb); }
  destroy() {
    this.destroyed = true;
    clearInterval(this.poll);
    this.player?.destroy();
    this.player = null;
    this.ready = false;
  }
}
