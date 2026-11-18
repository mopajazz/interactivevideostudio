export type InteractionType = 'multipleChoice' | 'trueFalse' | 'text' | 'link' | 'image';

export interface Choice {
  id: string;
  html: string;
  correct: boolean;
  feedbackHtml?: string;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  time: number;
  order: number;
  promptHtml: string;
  choices?: Choice[];
  hintHtml?: string;
  url?: string;
  imageAssetId?: string;
  alt?: string;
  decorative?: boolean;
}

export interface Project {
  version: 1;
  title: string;
  videoId: string;
  /** Video length in seconds; 0 until known. */
  duration: number;
  settings: {
    disableForwardScrubbing: boolean;
    masteryPercent: number;
    /** The author ticked "I've checked that this video has captions". A reminder only: it never blocks export. */
    captionsConfirmed?: boolean;
    /** After a wrong check, the learner may choose again; the last checked answer is the one scored. */
    allowRetry?: boolean;
    /** After a check, the card shows which choice(s) are correct. */
    showSolution?: boolean;
  };
  interactions: Interaction[];
}

export interface SuspendState {
  furthest: number;
  answers: Record<string, string[]>;
  submitted: boolean;
}

export { parseYouTubeId } from './youtube';
export { sanitizeHtml } from './sanitize';
export { validateProject, exportBlockers } from './validate';
export { resolveSettings, type ResolvedSettings } from './settings';
