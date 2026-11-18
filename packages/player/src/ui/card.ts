import type { Interaction } from '@ivt/schema';
import { isQuestion } from '../scoring';
import type { Announcer } from './announcer';
import { authorHtml, button, h, uid } from './dom';

export const KIND_LABEL: Record<Interaction['type'], string> = {
  multipleChoice: 'Question',
  trueFalse: 'True or false',
  text: 'Note',
  link: 'Link',
  image: 'Image',
};

export type CardOptions = {
  announcer: Announcer;
  assetUrl: (id: string) => string;
  /** Called each time the learner checks an answer to a scored question; the last call is the answer that counts. */
  onAnswer: (choiceIds: string[]) => void;
  /** After a wrong check, offer "Try again" (no limit on tries). */
  allowRetry: boolean;
  /** After a check, mark the correct choice(s) in text and name them in the feedback (see `reveal` below). */
  showSolution: boolean;
  onDone: () => void;
};

const SAFE_URL = /^(https?:|mailto:)/i;

/** Builds the full-frame card for one interaction. Escape may close it only when it is not a scored question. */
export function buildCard(it: Interaction, o: CardOptions): { el: HTMLElement; escapable: boolean } {
  const el = h('section', 'ivp-card');
  const title = h('h2', 'ivp-card-title', KIND_LABEL[it.type]);
  title.id = uid('title');
  el.setAttribute('aria-labelledby', title.id);
  const prompt = authorHtml('div', 'ivp-prompt', it.promptHtml);
  prompt.id = uid('prompt');
  el.setAttribute('aria-describedby', prompt.id);
  el.append(title, prompt);

  const actions = h('div', 'ivp-actions');
  const cont = button('Continue', 'ivp-btn ivp-btn-primary');
  cont.addEventListener('click', () => o.onDone());

  if (it.type === 'image' && it.imageAssetId) {
    const img = h('img', 'ivp-image');
    img.src = o.assetUrl(it.imageAssetId);
    img.alt = it.decorative ? '' : (it.alt ?? '');
    el.insertBefore(img, prompt);
  }

  if (isQuestion(it)) {
    el.append(buildQuestion(it, o, actions, cont));
    el.append(actions);
    return { el, escapable: false };
  }

  if (it.type === 'link' && it.url && SAFE_URL.test(it.url)) {
    const a = h('a', 'ivp-btn', 'Open link');
    a.href = it.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    actions.append(a);
  }
  actions.append(cont);
  el.append(actions);
  return { el, escapable: true };
}

function buildQuestion(it: Interaction, o: CardOptions, actions: HTMLElement, cont: HTMLButtonElement): DocumentFragment {
  const frag = document.createDocumentFragment();
  const choices = it.choices ?? [];
  const correctIds = new Set(choices.filter((c) => c.correct).map((c) => c.id));
  const multi = it.type === 'multipleChoice' && correctIds.size > 1;

  const set = h('fieldset', 'ivp-choices');
  set.append(h('legend', 'ivp-legend', multi ? 'Choose all that apply.' : 'Choose one answer.'));
  const name = uid('choice');
  const inputs = choices.map((c) => {
    const label = h('label', 'ivp-choice');
    const input = h('input');
    input.type = multi ? 'checkbox' : 'radio';
    input.name = name;
    input.value = c.id;
    label.append(input, authorHtml('span', 'ivp-choice-text', c.html));
    set.append(label);
    return input;
  });
  frag.append(set);

  if (it.hintHtml) {
    const hint = authorHtml('div', 'ivp-hint', it.hintHtml);
    hint.id = uid('hint');
    hint.hidden = true;
    const toggle = button('Show hint', 'ivp-btn ivp-btn-quiet');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', hint.id);
    toggle.addEventListener('click', () => {
      hint.hidden = !hint.hidden;
      toggle.setAttribute('aria-expanded', String(!hint.hidden));
      toggle.textContent = hint.hidden ? 'Show hint' : 'Hide hint';
    });
    frag.append(toggle, hint);
  }

  const feedback = h('div', 'ivp-feedback');
  feedback.hidden = true;
  frag.append(feedback);

  // Visible prompt for an empty Check answer, tied to the choices. Not a live region: the Announcer speaks it once.
  const empty = h('p', 'ivp-choice-error');
  empty.id = uid('empty');
  empty.hidden = true;
  set.after(empty);
  const clearEmpty = () => {
    empty.hidden = true;
    empty.textContent = '';
    set.removeAttribute('aria-describedby');
  };
  inputs.forEach((i) => i.addEventListener('change', clearEmpty));

  const check = button('Check answer', 'ivp-btn ivp-btn-primary');
  const retry = button('Try again', 'ivp-btn');

  check.addEventListener('click', () => {
    const chosen = inputs.filter((i) => i.checked).map((i) => i.value);
    if (chosen.length === 0) {
      const text = 'Choose an answer first.';
      empty.textContent = text;
      empty.hidden = false;
      set.setAttribute('aria-describedby', empty.id);
      o.announcer.say(text);
      return;
    }
    inputs.forEach((i) => { i.disabled = true; });
    o.onAnswer(chosen);

    const ok = chosen.length === correctIds.size && chosen.every((id) => correctIds.has(id));
    const canRetry = o.allowRetry && !ok;
    // The solution is revealed only when the learner can't try again: after a correct check, or after any check when
    // retry is off. With retry on there is no limit on tries, so a wrong check never reveals it and the solution shows
    // only after a correct check (otherwise "Try again" would just mean copying the answer).
    const reveal = o.showSolution && !canRetry;

    feedback.classList.add(ok ? 'is-correct' : 'is-incorrect');
    const verdict = ok ? 'Correct' : 'Incorrect';
    feedback.append(h('p', 'ivp-verdict', verdict));
    const notes = choices
      .filter((c) => chosen.includes(c.id) && c.feedbackHtml)
      .map((c) => feedback.appendChild(authorHtml('div', 'ivp-feedback-text', c.feedbackHtml)).textContent?.trim() ?? '');
    const said = [`${verdict}.`, ...notes];
    if (reveal) {
      const names: string[] = [];
      inputs.forEach((input, n) => {
        if (!correctIds.has(input.value)) return;
        const label = input.closest('label')!;
        // Text inside the choice (so it is part of its name and survives forced colors), never color alone.
        label.append(h('span', 'ivp-solution-mark', 'Correct answer'));
        names.push(label.querySelector('.ivp-choice-text')?.textContent?.trim() || `Choice ${n + 1}`);
      });
      // Plain text built from the sanitized choices' text: nothing here is parsed as HTML.
      const line = `${names.length > 1 ? 'Correct answers' : 'Correct answer'}: ${names.join(', ')}.`;
      feedback.append(h('p', 'ivp-solution', line));
      said.push(line);
    }
    feedback.hidden = false;
    o.announcer.say(said.join(' '));
    check.replaceWith(...(canRetry ? [retry, cont] : [cont]));
    cont.focus();
  });

  // Back to the unchecked state: choices enabled and cleared, no verdict, "Check answer" again. The held answer stays
  // the last one checked until the learner checks a new one.
  retry.addEventListener('click', () => {
    inputs.forEach((i) => { i.disabled = false; i.checked = false; });
    feedback.hidden = true;
    feedback.className = 'ivp-feedback';
    feedback.replaceChildren();
    inputs[0]?.focus(); // before the focused "Try again" goes, so focus never drops out of the card
    retry.remove();
    cont.replaceWith(check);
    o.announcer.say('Try again. Choose an answer.');
  });
  actions.append(check);
  return frag;
}
