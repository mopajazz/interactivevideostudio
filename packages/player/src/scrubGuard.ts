/** Blocks forward seeking beyond the furthest watched point. UI-free. */
export class ScrubGuard {
  furthest = 0;
  private seeded = false;
  private enabled: boolean;
  private tolerance: number;

  constructor(o: { enabled: boolean; tolerance?: number }) {
    this.enabled = o.enabled;
    this.tolerance = o.tolerance ?? 1.5;
  }

  /** Returns the time to snap back to, or null. */
  update(t: number): number | null {
    if (!Number.isFinite(t)) return null;
    // The first sample seeds furthest (e.g. resuming mid-video); callers may also preset `furthest`.
    if (!this.seeded && this.furthest === 0) {
      this.seeded = true;
      this.furthest = t;
      return null;
    }
    this.seeded = true;
    if (!this.enabled) {
      this.furthest = Math.max(this.furthest, t);
      return null;
    }
    if (t > this.furthest + this.tolerance) return this.furthest;
    this.furthest = Math.max(this.furthest, t);
    return null;
  }

  release(): void {
    this.enabled = false;
  }
}
