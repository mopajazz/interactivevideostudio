import type { Project } from '@ivt/schema';

export const newProject = (): Project => ({
  version: 1,
  title: '',
  videoId: '',
  duration: 0,
  settings: { disableForwardScrubbing: false, masteryPercent: 80 },
  interactions: [],
});

/** Step 1 is done when the video is known to be playable (duration learned) and there is a title. */
export const isSetupComplete = (p: Project) => !!p.videoId && p.duration > 0 && p.title.trim() !== '';

/** Nothing worth asking about before it is replaced. */
export const isBlank = (p: Project) => !p.videoId && !p.title.trim() && p.interactions.length === 0;

export const watchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;

/** Latin letters that Unicode decomposition does not reduce to plain a-z. */
const LATIN: Record<string, string> = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ð: 'd', ł: 'l', þ: 'th', ı: 'i' };

/**
 * "round-trip" from "Round trip!": lowercase a-z, 0-9 and single dashes, at most 60 characters, so it is safe as a
 * file name anywhere. Accents are dropped ("Café" -> "cafe"); a title with no Latin letters or digits gives `fallback`.
 */
export const fileSlug = (title: string, fallback = 'untitled-project') =>
  title.toLowerCase().replace(/[ßæœøđðłþı]/g, (c) => LATIN[c] ?? c).normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').slice(0, 60).replace(/^-+|-+$/g, '') || fallback;
