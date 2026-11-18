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

/** "round-trip" from "Round trip!"; never empty. */
export const fileSlug = (title: string) =>
  title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled-project';
