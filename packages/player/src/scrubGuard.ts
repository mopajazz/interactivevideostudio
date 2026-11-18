/** Blocks forward seeking beyond the furthest watched point. UI-free. */
export class ScrubGuard {
  furthest: number;
  private seeded: boolean;
  private enabled: boolean;
  private tolerance: number;
  private now: () => number;
  private retryMs: number;
  private pendingSince: number | null = null;

  constructor(o: {
    enabled: boolean;
    tolerance?: number;
    furthest?: number;
    now?: () => number;
    retryMs?: number;
  }) {
    this.enabled = o.enabled;
    this.tolerance = o.tolerance ?? 1.5;
    this.now = o.now ?? Date.now;
    this.retryMs = o.retryMs ?? 750;
    this.seeded = o.furthest !== undefined;
    this.furthest = o.furthest ?? 0;
  }

  /** Returns the time to snap back to, or null. */
  update(t: number): number | null {
    if (!Number.isFinite(t)) return null;
    // Without a preset furthest, the first sample seeds the baseline.
    if (!this.seeded) {
      this.seeded = true;
      this.furthest = t;
      return null;
    }
    if (!this.enabled) {
      this.furthest = Math.max(this.furthest, t);
      return null;
    }
    if (t > this.furthest + this.tolerance) {
      // Player may lag behind seekTo; don't re-issue the snap on every tick.
      const n = this.now();
      if (this.pendingSince !== null && n - this.pendingSince < this.retryMs) return null;
      this.pendingSince = n;
      return this.furthest;
    }
    this.pendingSince = null;
    this.furthest = Math.max(this.furthest, t);
    return null;
  }

  release(): void {
    this.enabled = false;
    this.pendingSince = null;
  }
}
