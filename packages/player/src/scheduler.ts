import type { Interaction } from '@ivt/schema';

export class InteractionScheduler {
  private items: Interaction[];
  private seen = new Set<string>();

  constructor(items: Interaction[], duration: number) {
    this.items = items
      .filter((i) => Number.isFinite(i.time) && i.time < duration)
      .sort((a, b) => a.time - b.time || a.order - b.order);
  }

  /** Interactions with prev < time <= cur, by order, excluding seen. */
  due(prev: number, cur: number): Interaction[] {
    return this.items
      .filter((i) => i.time > prev && i.time <= cur && !this.seen.has(i.id))
      .sort((a, b) => a.time - b.time || a.order - b.order);
  }

  markSeen(id: string): void {
    this.seen.add(id);
  }
}
