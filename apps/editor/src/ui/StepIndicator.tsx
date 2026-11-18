import type { Step } from '../storage/projectStore';
import { IconCheck, IconLock } from './icons';

export const STEPS: ReadonlyArray<{ n: Step; label: string }> = [
  { n: 1, label: 'Setup' },
  { n: 2, label: 'Interactions' },
  { n: 3, label: 'Scoring & export' },
];

/** The three steps as an ordered list. State is shown by text and shape (number, check, lock), never color alone. */
export function StepIndicator({ current, unlocked, onGo }: { current: Step; unlocked: boolean; onGo: (s: Step) => void }) {
  return (
    <nav className="steps" aria-label="Steps">
      <ol>
        {STEPS.map(({ n, label }) => {
          const isCurrent = n === current;
          const locked = n > 1 && !unlocked;
          const done = !isCurrent && !locked && n < current;
          const state = isCurrent ? 'is-current' : locked ? 'is-locked' : done ? 'is-done' : 'is-open';
          return (
            <li key={n} className={`step ${state}`}>
              <button
                type="button"
                className="step-btn"
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={locked || undefined}
                onClick={() => !locked && !isCurrent && onGo(n)}
              >
                <span className="step-num">{n}</span>
                <span className="step-label">{label}</span>
                {done && <IconCheck />}
                {locked && <><IconLock /><span className="visually-hidden">(available after step 1)</span></>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
