import type { Project } from './index';

export type ResolvedSettings = {
  disableForwardScrubbing: boolean;
  masteryPercent: number;
  captionsConfirmed: boolean;
  allowRetry: boolean;
  showSolution: boolean;
};

/**
 * The project's settings with every optional one filled in. This is the only place their defaults live; the player,
 * editor and export read settings through it. The defaults are the controller's calls, to be confirmed by the owner:
 * captions not yet confirmed (the editor keeps reminding), one try per question, and the correct answer shown after
 * checking. Missing settings are never written back, so a stored project still says only what the author chose.
 */
export function resolveSettings(s: Project['settings']): ResolvedSettings {
  return {
    disableForwardScrubbing: s.disableForwardScrubbing,
    masteryPercent: s.masteryPercent,
    captionsConfirmed: s.captionsConfirmed ?? false,
    allowRetry: s.allowRetry ?? false,
    showSolution: s.showSolution ?? true,
  };
}

/** The optional true/false settings; validateProject checks each one's type. */
export const OPTIONAL_FLAGS = ['captionsConfirmed', 'allowRetry', 'showSolution'] as const;
