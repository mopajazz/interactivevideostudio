import type { VideoAdapter } from './adapter';

type Ev = 'time' | 'state' | 'error';

export class FakeAdapter implements VideoAdapter {
  private t = 0;
  private playing = false;
  rate = 1;
  captions = false;
  destroyed = false;
  private handlers: Record<Ev, Array<(v: any) => void>> = { time: [], state: [], error: [] };

  constructor(private duration = 100) {}

  private emit(ev: Ev, v: unknown) {
    this.handlers[ev].forEach((cb) => cb(v));
  }
  play() { this.playing = true; this.emit('state', 'playing'); }
  pause() { this.playing = false; this.emit('state', 'paused'); }
  seekTo(s: number) { this.t = Math.min(Math.max(0, s), this.duration); }
  getCurrentTime() { return this.t; }
  getDuration() { return this.duration; }
  setRate(r: number) { this.rate = r; }
  setCaptions(on: boolean) { this.captions = on; }
  on(ev: Ev, cb: (v: any) => void) { this.handlers[ev].push(cb); }
  destroy() { this.destroyed = true; }

  /** Test helper: move playback time forward (only while playing). */
  advance(seconds: number) {
    if (!this.playing) return;
    this.t = Math.min(this.t + seconds, this.duration);
    this.emit('time', this.t);
  }
  emitError(code: number) { this.emit('error', code); }
}
