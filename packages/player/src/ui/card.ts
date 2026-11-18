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
  /** Called once when the learner commits an answer to a scored question. */
  onAnswer: (choiceIds: string[]) => void;
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

  const check = button('Check answer', 'ivp-btn ivp-btn-primary');
  check.addEventListener('click', () => {
    const chosen = inputs.filter((i) => i.checked).map((i) => i.value);
    if (chosen.length === 0) {
      o.announcer.say('Choose an answer first.');
      return;
    }
    inputs.forEach((i) => { i.disabled = true; });
    o.onAnswer(chosen);

    const ok = chosen.length === correctIds.size && chosen.every((id) => correctIds.has(id));
    feedback.classList.add(ok ? 'is-correct' : 'is-incorrect');
    const verdict = ok ? 'Correct' : 'Incorrect';
    feedback.append(h('p', 'ivp-verdict', verdict));
    const notes = choices
      .filter((c) => chosen.includes(c.id) && c.feedbackHtml)
      .map((c) => feedback.appendChild(authorHtml('div', 'ivp-feedback-text', c.feedbackHtml)).textContent?.trim() ?? '');
    feedback.hidden = false;
    o.announcer.say([`${verdict}.`, ...notes].join(' '));
    check.replaceWith(cont);
    cont.focus();
  });
  actions.append(check);
  return frag;
}
