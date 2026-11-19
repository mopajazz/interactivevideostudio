import type { Project, ResolvedSettings } from '@ivt/schema';

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

/** The per-question rules in plain words, for the Step 3 summary. */
export function questionRulesSummary({ allowRetry, showSolution }: Pick<ResolvedSettings, 'allowRetry' | 'showSolution'>): string {
  if (!allowRetry) {
    return showSolution
      ? 'Learners get one try at each question, and then see the correct answer.'
      : 'Learners get one try at each question and are not shown the correct answer.';
  }
  // With retry on, the player reveals the answer only after a correct check (see packages/player/src/ui/card.ts).
  return showSolution
    ? 'Learners can try a question again after a wrong answer, and see the correct answer once they get it right.'
    : 'Learners can try a question again after a wrong answer, and are not shown the correct answer.';
}
