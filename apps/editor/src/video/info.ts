import { YouTubeAdapter } from '@ivt/player';

export type VideoInfo = { duration: number; embeddable: boolean } | { error: 'unavailable' | 'embed-disabled' };
export type FetchVideoInfo = (videoId: string) => Promise<VideoInfo>;

/** YouTube IFrame API error codes: 101 and 150 mean the owner forbids embedding; the rest mean no playable video. */
const EMBED_DISABLED = new Set([101, 150]);
const TIMEOUT_MS = 15_000;

/**
 * Loads the video in a hidden player just long enough to learn its duration, or why it cannot be used.
 * Always destroys the player and removes its container. Never rejects.
 */
export const fetchVideoInfo: FetchVideoInfo = (videoId) =>
  new Promise((resolve) => {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    // Off-screen but laid out (YouTube needs a real size); inert keeps the iframe out of the tab order.
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:320px;height:180px;overflow:hidden;';
    box.inert = true;
    document.body.append(box);

    let done = false;
    let adapter: YouTubeAdapter | null = null;
    const finish = (r: VideoInfo) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      adapter?.destroy();
      box.remove();
      resolve(r);
    };
    const timer = setTimeout(() => finish({ error: 'unavailable' }), TIMEOUT_MS);

    adapter = new YouTubeAdapter(box, videoId, { pollMs: 250, loadTimeoutMs: TIMEOUT_MS });
    adapter.on('error', (code) => finish({ error: EMBED_DISABLED.has(code) ? 'embed-disabled' : 'unavailable' }));
    // The adapter polls time once ready; the duration arrives with the video's metadata.
    adapter.on('time', () => {
      const d = adapter?.getDuration() ?? 0;
      if (d > 0) finish({ duration: d, embeddable: true });
    });
  });
