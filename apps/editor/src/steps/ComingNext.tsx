import type { Step } from '../storage/projectStore';
import { IconArrowLeft } from '../ui/icons';

/** Placeholder for step 3 until it is built. */
export function ComingNext({ onGo }: { onGo: (s: Step) => void }) {
  return (
    <section className="panel" aria-labelledby="step-heading">
      <h2 id="step-heading" className="panel-title" tabIndex={-1}>Scoring &amp; export</h2>
      <div className="coming-next">
        <p className="badge">Coming next</p>
        <p>Here you'll set the mastery score and export a SCORM 1.2 package that sends the score to your LMS gradebook.</p>
      </div>
      <div className="panel-footer">
        <button type="button" className="btn btn-secondary" onClick={() => onGo(2)}>
          <IconArrowLeft />Back: Interactions
        </button>
      </div>
    </section>
  );
}
