import type { Project } from '@ivt/schema';

export const MASTERY_ERROR = 'Enter a whole number from 0 to 100.';

/** The mastery threshold typed by the author: a whole number 0-100, or null for anything else. */
export function parseMastery(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n <= 100 ? n : null;
}

export const isScored = (type: string) => type === 'multipleChoice' || type === 'trueFalse';

/** What the learner is scored on: every question is worth one point; Text, Link and Image cards are not scored. */
export function scoringSummary(p: Project) {
  const questions = p.interactions.filter((i) => isScored(i.type)).length;
  return { questions, cards: p.interactions.length - questions, points: questions };
}
