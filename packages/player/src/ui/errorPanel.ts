import { API_LOAD_FAILED } from '../YouTubeAdapter';
import { h } from './dom';

const MESSAGES: Record<string, string> = {
  '2': "This video can't be played because its link is invalid.",
  '5': "This video can't be played in this browser.",
  '100': 'This video is unavailable. It may have been removed or made private.',
  '101': "This video's owner doesn't allow it to be played here.",
  '150': "This video's owner doesn't allow it to be played here.",
  [API_LOAD_FAILED]: "The YouTube player couldn't load. Check your connection, or ask whether YouTube is blocked on this network.",
};

/** A visible alert for player errors with a link to the video on YouTube. */
export function buildErrorPanel(code: unknown, videoId: string): HTMLElement {
  const el = h('div', 'ivp-error');
  el.setAttribute('role', 'alert');
  el.append(h('p', '', MESSAGES[String(code)] ?? "This video can't be played right now."));
  const a = h('a', 'ivp-btn', 'Watch on YouTube');
  a.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  el.append(a);
  return el;
}
