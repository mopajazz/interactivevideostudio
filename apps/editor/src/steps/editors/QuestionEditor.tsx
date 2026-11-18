import { useEffect, useId, useRef } from 'react';
import { sanitizeHtml, type Choice } from '@ivt/schema';
import { RichText } from '../../components/RichText';
import { addChoice, removeChoice, setCorrect } from '../../interactions';
import { IconAlert, IconPlus, IconTrash } from '../../ui/icons';
import type { EditorProps } from './types';

/** Choice text is plain text, stored as escaped (and sanitized) HTML. */
const toHtml = (text: string) => sanitizeHtml(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
const toText = (html: string) => new DOMParser().parseFromString(sanitizeHtml(html), 'text/html').body.textContent ?? '';

/**
 * Quiz (multiple choice, one or more correct: a "Correct" checkbox per choice) and True/False (two fixed choices,
 * exactly one correct: a radio group). Both have a prompt, optional feedback per choice and an optional hint.
 */
export function QuestionEditor({ it, onPatch }: EditorProps) {
  const id = useId();
  const tf = it.type === 'trueFalse';
  const choices = it.choices ?? [];
  const noneCorrect = !choices.some((c) => c.correct);
  const list = useRef<HTMLDivElement>(null);
  const focusChoice = useRef<number | null>(null);

  useEffect(() => {
    if (focusChoice.current === null) return;
    list.current?.querySelectorAll<HTMLInputElement>('input[type="text"]')[focusChoice.current]?.focus();
    focusChoice.current = null;
  });

  const patchChoice = (cid: string, patch: Partial<Choice>) =>
    onPatch((x) => ({ ...x, choices: (x.choices ?? []).map((c) => (c.id === cid ? { ...c, ...patch } : c)) }));

  return (
    <>
      <RichText first label="Question" value={it.promptHtml} onChange={(promptHtml) => onPatch((x) => ({ ...x, promptHtml }))} />

      <fieldset className="field choices" aria-describedby={noneCorrect ? `${id}-none` : undefined}>
        <legend className="field-label">Answer choices</legend>
        {tf ? (
          <div role="radiogroup" aria-labelledby={`${id}-correct`} className="tf-correct">
            <span id={`${id}-correct`} className="field-label-small">Correct answer</span>
            {choices.map((c) => (
              <label key={c.id} className="check">
                <input type="radio" name={`${id}-tf`} checked={c.correct} onChange={() => onPatch((x) => setCorrect(x, c.id, true))} />
                {toText(c.html)}
              </label>
            ))}
          </div>
        ) : (
          <p className="field-hint">Tick every correct answer. Learners choose all that apply when more than one is correct.</p>
        )}
        <div ref={list} className="choice-list">
          {choices.map((c, i) => {
            const n = tf ? toText(c.html) : `choice ${i + 1}`;
            return (
              <div key={c.id} className="choice">
                {!tf && (
                  <div className="choice-row">
                    <div className="choice-text">
                      <label htmlFor={`${id}-${c.id}`} className="field-label-small">Choice {i + 1}</label>
                      <input
                        id={`${id}-${c.id}`}
                        className="input"
                        type="text"
                        value={toText(c.html)}
                        onChange={(e) => patchChoice(c.id, { html: toHtml(e.target.value) })}
                      />
                    </div>
                    <label className="check">
                      <input type="checkbox" checked={c.correct} onChange={(e) => onPatch((x) => setCorrect(x, c.id, e.target.checked))} />
                      Correct<span className="visually-hidden"> answer: choice {i + 1}</span>
                    </label>
                    {choices.length > 2 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => {
                          focusChoice.current = Math.min(i, choices.length - 2);
                          onPatch((x) => removeChoice(x, c.id));
                        }}
                      >
                        <IconTrash />Remove<span className="visually-hidden"> choice {i + 1}</span>
                      </button>
                    )}
                  </div>
                )}
                <RichText
                  key={`${c.id}-feedback`}
                  label={`Feedback for ${n} (optional)`}
                  value={c.feedbackHtml ?? ''}
                  onChange={(html) => patchChoice(c.id, { feedbackHtml: html || undefined })}
                />
              </div>
            );
          })}
        </div>
        {!tf && (
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              focusChoice.current = choices.length;
              onPatch(addChoice);
            }}
          >
            <IconPlus />Add choice
          </button>
        )}
        <div role="status" className="field-status">
          {noneCorrect && <p id={`${id}-none`} className="msg msg-error"><IconAlert />Mark at least one choice as correct</p>}
        </div>
      </fieldset>

      <RichText
        label="Hint (optional)"
        hint="Shown only if the learner asks for it."
        value={it.hintHtml ?? ''}
        onChange={(html) => onPatch((x) => ({ ...x, hintHtml: html || undefined }))}
      />
    </>
  );
}
