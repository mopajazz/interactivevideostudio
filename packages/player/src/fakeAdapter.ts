import type { VideoAdapter } from './adapter';

type Ev = 'time' | 'state' | 'error';

export class FakeAdapter implements VideoAdapter {
  private t = 0;
  private playing = false;
  rate = 1;
  captions = false;
  destroyed = false;
  private handlers: Record<Ev, Array<(v: any) => void>> = { time: [], state: [], error: [] };

  /** Every seekTo target, in order (for tests). */
  seeks: number[] = [];
  /** Last value reported through getCurrentTime() or a 'time' event (for tests). */
  lastReported = 0;
  private lagLeft = 0;
  private stale = 0;
  private seekLagSamples: number;

  /** `seekLagSamples` (opt-in, default 0): after seekTo, report the old position for that many samples, like a real player. */
  constructor(private duration = 100, o: { seekLagSamples?: number } = {}) {
    this.seekLagSamples = o.seekLagSamples ?? 0;
  }

  private emit(ev: Ev, v: unknown) {
    this.handlers[ev].forEach((cb) => cb(v));
  }
  play() { this.playing = true; this.emit('state', 'playing'); }
  pause() { this.playing = false; this.emit('state', 'paused'); }
  seekTo(s: number) {
    this.seeks.push(s);
    if (this.seekLagSamples > 0) { this.stale = this.t; this.lagLeft = this.seekLagSamples; }
    this.t = Math.min(Math.max(0, s), this.duration);
  }
  getCurrentTime() {
    const v = this.lagLeft > 0 ? (this.lagLeft--, this.stale) : this.t;
    this.lastReported = v;
    return v;
  }
  getDuration() { return this.duration; }
  setRate(r: number) { this.rate = r; }
  setCaptions(on: boolean) { this.captions = on; }
  on(ev: Ev, cb: (v: any) => void) { this.handlers[ev].push(cb); }
  destroy() { this.destroyed = true; }

  /** Test helper: move playback time forward (only while playing). Reaching the end emits 'ended'. */
  advance(seconds: number) {
    if (!this.playing) return;
    this.t = Math.min(this.t + seconds, this.duration);
    this.emit('time', this.getCurrentTime());
    if (this.t >= this.duration && this.playing) {
      this.playing = false;
      this.emit('state', 'ended');
    }
  }
  emitError(code: number) { this.emit('error', code); }
  /** Test helper: simulate a player state change such as 'buffering'. */
  emitState(state: string) { this.emit('state', state); }
}
