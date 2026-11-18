/** The only seam to the video backend (YouTube). Swap implementations, not callers. */
export interface VideoAdapter {
  play(): void;
  pause(): void;
  seekTo(s: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  setRate(r: number): void;
  setCaptions(on: boolean): void;
  on(ev: 'time' | 'state' | 'error', cb: (v: any) => void): void;
  destroy(): void;
}
