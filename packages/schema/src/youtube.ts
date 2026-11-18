const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Extracts the 11-character video id from a YouTube URL, or null. */
export function parseYouTubeId(input: string): string | null {
  let url: URL;
  try {
    const trimmed = input.trim();
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  let candidate: string | null | undefined;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1];
  } else if (HOSTS.has(host)) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') candidate = url.searchParams.get('v');
    else if (first === 'shorts' || first === 'embed' || first === 'live' || first === 'v') candidate = second;
  }
  return candidate && ID.test(candidate) ? candidate : null;
}
