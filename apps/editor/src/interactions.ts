import type { Choice, Interaction, InteractionType, Project } from '@ivt/schema';
import { formatDuration } from './format';

/** The latest time a checkpoint may use: half a second before the end, so it is never at or after the end. */
export const maxTime = (p: Project) => Math.max(0, p.duration - 0.5);

export const clampTime = (p: Project, t: number) => (Number.isFinite(t) ? Math.min(Math.max(0, t), maxTime(p)) : 0);

/** Next "<prefix><n>" after the highest n already used, so ids stay unique within the list. */
function nextId(prefix: string, ids: string[]): string {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const used = ids.map((id) => Number(re.exec(id)?.[1] ?? 0));
  return `${prefix}${Math.max(0, ...used) + 1}`;
}

function blank(type: InteractionType): Partial<Interaction> {
  switch (type) {
    case 'multipleChoice':
      return { choices: [{ id: 'c1', html: '', correct: true }, { id: 'c2', html: '', correct: false }] };
    case 'trueFalse':
      return { choices: [{ id: 'true', html: 'True', correct: true }, { id: 'false', html: 'False', correct: false }] };
    case 'link':
      return { url: '' };
    case 'image':
      return { alt: '', decorative: false };
    default:
      return {};
  }
}

/** Adds an empty checkpoint of `type` at `time` (clamped), after every existing one in play order. Pure. */
export function addInteraction(p: Project, type: InteractionType, time: number): Project {
  const order = Math.max(0, ...p.interactions.map((i) => i.order)) + 1;
  const id = nextId('i', p.interactions.map((i) => i.id));
  const it: Interaction = { id, type, time: clampTime(p, time), order, promptHtml: '', ...blank(type) };
  return { ...p, interactions: [...p.interactions, it] };
}

type Patch = Partial<Interaction> | ((it: Interaction) => Interaction);

/** Applies a patch (or updater) to one interaction; a new time is clamped like everywhere else. */
export function updateInteraction(p: Project, id: string, patch: Patch): Project {
  if (!p.interactions.some((i) => i.id === id)) return p;
  return {
    ...p,
    interactions: p.interactions.map((it) => {
      if (it.id !== id) return it;
      const next = typeof patch === 'function' ? patch(it) : { ...it, ...patch };
      return next.time === it.time ? next : { ...next, time: clampTime(p, next.time) };
    }),
  };
}

export const moveInteraction = (p: Project, id: string, time: number) => updateInteraction(p, id, { time });

export const removeInteraction = (p: Project, id: string): Project => ({ ...p, interactions: p.interactions.filter((i) => i.id !== id) });

export function addChoice(it: Interaction): Interaction {
  const choices = it.choices ?? [];
  return { ...it, choices: [...choices, { id: nextId('c', choices.map((c) => c.id)), html: '', correct: false }] };
}

export const removeChoice = (it: Interaction, choiceId: string): Interaction => ({
  ...it,
  choices: (it.choices ?? []).filter((c) => c.id !== choiceId),
});

/** Multiple choice: any number may be correct. True/false: exactly one, so marking one unmarks the other. */
export function setCorrect(it: Interaction, choiceId: string, correct: boolean): Interaction {
  const single = it.type === 'trueFalse';
  const choices = (it.choices ?? []).map((c): Choice =>
    c.id === choiceId ? { ...c, correct } : single && correct ? { ...c, correct: false } : c);
  return { ...it, choices };
}

/**
 * Checkpoints at or after the end of the video (possible after a shorter video replaces the old one). They are
 * flagged for the author to move, never clamped behind their back. Empty while the duration is unknown.
 */
export const outOfRange = (p: Project): string[] =>
  p.duration > 0 ? p.interactions.filter((i) => i.time >= p.duration).map((i) => i.id) : [];

/** Play order: by time, and by `order` for checkpoints that share a time. */
export const sortedInteractions = (p: Project) => [...p.interactions].sort((a, b) => a.time - b.time || a.order - b.order);

export const KIND_NAME: Record<InteractionType, string> = {
  multipleChoice: 'Quiz question',
  trueFalse: 'True/False question',
  text: 'Text',
  link: 'Link',
  image: 'Image',
};

/** "Quiz question 2 at 1:05": kind, its number among checkpoints of that kind in play order, and time. */
export function checkpointName(p: Project, it: Interaction): string {
  const n = sortedInteractions(p).filter((i) => i.type === it.type).findIndex((i) => i.id === it.id) + 1;
  return `${KIND_NAME[it.type]} ${n} at ${formatDuration(it.time)}`;
}
