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
  settings: { disableForwardScrubbing: boolean; masteryPercent: number };
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
