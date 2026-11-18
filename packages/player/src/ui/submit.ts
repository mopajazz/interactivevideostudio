import type { Result } from '../scoring';
import type { Announcer } from './announcer';
import { button, h, uid } from './dom';

export type FinalOptions = {
  scored: boolean;
  answered: number;
  total: number;
  masteryPercent: number;
  /** Set when the learner already submitted (e.g. on resume). */
  result: Result | null;
  announcer: Announcer;
  submit: () => Result;
  rewatch: () => void;
};

/** The end-of-video screen: one large Submit answers (or Finish) button, then the result. Submission is final. */
export function buildFinal(o: FinalOptions): HTMLElement {
  const el = h('section', 'ivp-card ivp-final');
  const title = h('h2', 'ivp-card-title', 'End of video');
  title.id = uid('title');
  el.setAttribute('aria-labelledby', title.id);
  const body = h('div', 'ivp-final-body');
  const actions = h('div', 'ivp-actions');
  const again = button('Watch again', 'ivp-btn');
  again.addEventListener('click', () => o.rewatch());
  el.append(title, body, actions);

  const showResult = (r: Result, announce: boolean) => {
    body.replaceChildren();
    actions.replaceChildren(again);
    const lines = r.scored
      ? [
          `Your score: ${Math.round(r.percent)}%`,
          `${r.raw} of ${r.max} correct`,
          r.passed ? 'Passed' : `Not passed. The pass mark is ${o.masteryPercent}%.`,
        ]
      : ['Finished. Thanks for watching.'];
    const summary = h('div', `ivp-result ${r.scored ? (r.passed ? 'is-correct' : 'is-incorrect') : ''}`);
    summary.tabIndex = -1;
    lines.forEach((l, i) => summary.append(h('p', i === 0 ? 'ivp-score' : '', l)));
    body.append(summary);
    if (announce) {
      o.announcer.say(lines.join('. '));
      summary.focus();
    }
  };

  if (o.result) {
    showResult(o.result, false);
    return el;
  }

  body.append(
    h('p', '', o.scored
      ? `You answered ${o.answered} of ${o.total} questions. Unanswered questions count as wrong. Submitting is final.`
      : "You've reached the end of the video."),
  );
  const primary = button(o.scored ? 'Submit answers' : 'Finish', 'ivp-btn ivp-btn-primary ivp-btn-submit');
  primary.addEventListener('click', () => showResult(o.submit(), true));
  actions.append(primary, again);
  return el;
}
