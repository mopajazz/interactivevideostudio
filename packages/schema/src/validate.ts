import type { Project } from './index';

const TYPES = ['multipleChoice', 'trueFalse', 'text', 'link', 'image'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;
const isStr = (v: unknown): v is string => typeof v === 'string';

export function validateProject(p: unknown): { ok: true; project: Project } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRec(p)) return { ok: false, errors: ['project must be an object'] };

  if (p.version !== 1) errors.push('version must be 1');
  if (!isStr(p.title)) errors.push('title must be a string');
  if (!isStr(p.videoId)) errors.push('videoId must be a string');
  if (!isNum(p.duration)) errors.push('duration must be a number >= 0');

  if (!isRec(p.settings)) {
    errors.push('settings must be an object');
  } else {
    if (typeof p.settings.disableForwardScrubbing !== 'boolean') errors.push('settings.disableForwardScrubbing must be a boolean');
    const m = p.settings.masteryPercent;
    if (!isNum(m) || m > 100) errors.push('settings.masteryPercent must be a number between 0 and 100');
  }

  if (!Array.isArray(p.interactions)) {
    errors.push('interactions must be an array');
  } else {
    p.interactions.forEach((it: unknown, i: number) => {
      const at = `interactions[${i}]`;
      if (!isRec(it)) return void errors.push(`${at} must be an object`);
      if (!isStr(it.id)) errors.push(`${at}.id must be a string`);
      if (!isStr(it.type) || !TYPES.includes(it.type)) errors.push(`${at}.type must be one of ${TYPES.join(', ')}`);
      if (!isNum(it.time)) errors.push(`${at}.time must be a number >= 0`);
      if (!isNum(it.order)) errors.push(`${at}.order must be a number >= 0`);
      if (!isStr(it.promptHtml)) errors.push(`${at}.promptHtml must be a string`);
      if (it.choices !== undefined) {
        if (!Array.isArray(it.choices)) return void errors.push(`${at}.choices must be an array`);
        it.choices.forEach((c: unknown, j: number) => {
          if (!isRec(c) || !isStr(c.id) || !isStr(c.html) || typeof c.correct !== 'boolean') {
            errors.push(`${at}.choices[${j}] must have string id, string html and boolean correct`);
          }
        });
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, project: p as unknown as Project };
}

/** Human-readable reasons the project cannot be exported yet. */
export function exportBlockers(p: Project): string[] {
  return p.interactions
    .filter((it) => it.type === 'image' && !it.decorative && !(it.alt && it.alt.trim()))
    .map((it) => `Image at ${it.time}s needs alt text or must be marked decorative`);
}
