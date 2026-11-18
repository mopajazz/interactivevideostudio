import type { Interaction } from '@ivt/schema';

export type Result = {
  raw: number;
  max: number;
  percent: number;
  passed: boolean;
  scored: boolean;
  status: 'passed' | 'failed' | 'completed';
};

export const isQuestion = (i: Interaction) => i.type === 'multipleChoice' || i.type === 'trueFalse';

export class ScoreState {
  private readonly questions: Interaction[];
  private readonly answers: Record<string, string[]> = {};
  private result: Result | null = null;

  constructor(items: Interaction[], private readonly masteryPercent: number) {
    this.questions = items.filter(isQuestion);
  }

  setAnswer(id: string, choiceIds: string[]): void {
    if (this.result) throw new Error('Quiz already submitted');
    if (!this.questions.some((q) => q.id === id)) return;
    this.answers[id] = [...choiceIds];
  }

  getAnswers(): Record<string, string[]> {
    return Object.fromEntries(Object.entries(this.answers).map(([k, v]) => [k, [...v]]));
  }

  isSubmitted(): boolean {
    return this.result !== null;
  }

  submit(): Result {
    if (this.result) return this.result;
    const max = this.questions.length;
    const raw = this.questions.filter((q) => this.isCorrect(q)).length;
    if (max === 0) {
      this.result = { raw: 0, max: 0, percent: 0, passed: true, scored: false, status: 'completed' };
    } else {
      const percent = (raw * 100) / max;
      const passed = percent >= this.masteryPercent;
      this.result = { raw, max, percent, passed, scored: true, status: passed ? 'passed' : 'failed' };
    }
    return this.result;
  }

  private isCorrect(q: Interaction): boolean {
    const choices = q.choices ?? [];
    const correct = new Set(choices.filter((c) => c.correct).map((c) => c.id));
    if (correct.size === 0) return false;
    const known = new Set(choices.map((c) => c.id));
    const chosen = new Set((this.answers[q.id] ?? []).filter((id) => known.has(id)));
    return chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
  }
}
