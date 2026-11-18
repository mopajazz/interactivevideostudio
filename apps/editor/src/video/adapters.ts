import { FakeAdapter, YouTubeAdapter, type VideoAdapter } from '@ivt/player';
import type { Project } from '@ivt/schema';

/**
 * Where Step 2 gets its video players. `author` drives the scrubber (its embed goes in `host`); `preview` is handed
 * to the learner player, and undefined lets the player create its own YouTube embed.
 */
export type VideoAdapters = {
  author: (host: HTMLElement, p: Project) => VideoAdapter;
  preview: (p: Project) => VideoAdapter | undefined;
};

export const youTubeAdapters: VideoAdapters = {
  author: (host, p) => new YouTubeAdapter(host, p.videoId),
  preview: () => undefined,
};

/**
 * Test adapters (?fake=1 only). The newest live one is `window.__fake`, so e2e tests drive whichever player is in
 * front: the preview while it is open, the author scrubber again once it closes.
 */
export function fakeAdapters(w: { __fake?: FakeAdapter }): VideoAdapters {
  const make = (p: Project) => {
    const a = new FakeAdapter(p.duration);
    const previous = w.__fake;
    w.__fake = a;
    const destroy = a.destroy.bind(a);
    a.destroy = () => {
      destroy();
      if (w.__fake === a) w.__fake = previous && !previous.destroyed ? previous : undefined;
    };
    return a;
  };
  return { author: (_host, p) => make(p), preview: make };
}
