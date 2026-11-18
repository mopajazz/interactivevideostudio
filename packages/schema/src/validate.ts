import type { Project } from './index';

const TYPES = ['multipleChoice', 'trueFalse', 'text', 'link', 'image'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min;
const isStr = (v: unknown): v is string => typeof v === 'string';

function safeUrl(u: string): boolean {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(u).protocol);
  } catch {
    return false;
  }
}

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
    const seen = new Set<string>();
    p.interactions.forEach((it: unknown, i: number) => {
      const at = `interactions[${i}]`;
      if (!isRec(it)) return void errors.push(`${at} must be an object`);
      if (!isStr(it.id)) errors.push(`${at}.id must be a string`);
      else if (seen.has(it.id)) errors.push(`${at}.id "${it.id}" is a duplicate`);
      else seen.add(it.id);
      if (!isStr(it.type) || !TYPES.includes(it.type)) errors.push(`${at}.type must be one of ${TYPES.join(', ')}`);
      if (!isNum(it.time)) errors.push(`${at}.time must be a number >= 0`);
      if (!isNum(it.order)) errors.push(`${at}.order must be a number >= 0`);
      if (!isStr(it.promptHtml)) errors.push(`${at}.promptHtml must be a string`);
      for (const k of ['hintHtml', 'imageAssetId', 'alt'] as const) {
        if (it[k] !== undefined && !isStr(it[k])) errors.push(`${at}.${k} must be a string`);
      }
      if (it.decorative !== undefined && typeof it.decorative !== 'boolean') errors.push(`${at}.decorative must be a boolean`);
      if (it.url !== undefined) {
        if (!isStr(it.url)) errors.push(`${at}.url must be a string`);
        // '' is an unfilled draft (exportBlockers reports it); anything else must be a safe scheme.
        else if (it.url !== '' && !safeUrl(it.url)) errors.push(`${at}.url must be an http, https or mailto URL`);
      }
      if (it.choices !== undefined) {
        if (!Array.isArray(it.choices)) return void errors.push(`${at}.choices must be an array`);
        const ids = new Set<string>();
        it.choices.forEach((c: unknown, j: number) => {
          const cat = `${at}.choices[${j}]`;
          if (!isRec(c) || !isStr(c.id) || !isStr(c.html) || typeof c.correct !== 'boolean') {
            return void errors.push(`${cat} must have string id, string html and boolean correct`);
          }
          if (ids.has(c.id)) errors.push(`${cat}.id "${c.id}" is a duplicate`);
          ids.add(c.id);
          if (c.feedbackHtml !== undefined && !isStr(c.feedbackHtml)) errors.push(`${cat}.feedbackHtml must be a string`);
        });
      }
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, project: p as unknown as Project };
}

/** Human-readable reasons the project cannot be exported yet. */
export function exportBlockers(p: Project): string[] {
  const out: string[] = [];
  for (const it of p.interactions) {
    if (it.type === 'image' && !it.decorative && !(typeof it.alt === 'string' && it.alt.trim())) {
      out.push(`Image at ${it.time}s needs alt text or must be marked decorative`);
    }
    if (it.type === 'link' && !(typeof it.url === 'string' && it.url.trim())) {
      out.push(`Link at ${it.time}s needs a web address`);
    }
    if (it.type === 'multipleChoice' || it.type === 'trueFalse') {
      const choices = Array.isArray(it.choices) ? it.choices : [];
      if (choices.length < 2 || !choices.some((c) => c.correct)) {
        out.push(`Question at ${it.time}s needs at least 2 choices and one marked correct`);
      }
    }
  }
  return out;
}
