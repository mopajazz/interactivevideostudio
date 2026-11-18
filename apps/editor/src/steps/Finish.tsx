import { useState } from 'react';
import type { Project } from '@ivt/schema';
import { listBlockers, type Blocker, type PendingImages } from '../export/blockers';
import { checkpointName } from '../interactions';
import { MASTERY_ERROR, parseMastery, scoringSummary } from '../scoring';
import type { Step } from '../storage/projectStore';
import { downloadBlob } from '../ui/download';
import { IconAlert, IconArrowLeft, IconArrowRight, IconCheck, IconDownload, IconSpinner } from '../ui/icons';

type Props = {
  project: Project;
  onChange: (update: (p: Project) => Project) => void;
  assets: Map<string, Blob>;
  assetQueue: PendingImages;
  onGo: (s: Step) => void;
  /** Back to Step 2 with this checkpoint open and focus in its drawer. */
  onGoToCheckpoint: (id: string) => void;
  onNotice: (n: { tone: 'ok' | 'error'; text: string }) => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Step 3: the mastery threshold, the scrubbing switch, a summary of what is scored, and the SCORM export. */
export function Finish({ project, onChange, assets, assetQueue, onGo, onGoToCheckpoint, onNotice }: Props) {
  const [masteryText, setMasteryText] = useState(String(project.settings.masteryPercent));
  const [busy, setBusy] = useState(false);
  const masteryValid = parseMastery(masteryText) !== null;
  const { questions, cards, points } = scoringSummary(project);
  const { masteryPercent, disableForwardScrubbing } = project.settings;
  const toPass = Math.ceil((masteryPercent * points) / 100);

  const blockers: Blocker[] = [
    ...(masteryValid ? [] : [{ message: `Mastery score: ${MASTERY_ERROR}` }]),
    ...listBlockers(project, assets),
  ];
  const blocked = blockers.length > 0;

  const setSetting = (patch: Partial<Project['settings']>) => onChange((p) => ({ ...p, settings: { ...p.settings, ...patch } }));

  const onMastery = (text: string) => {
    setMasteryText(text);
    const n = parseMastery(text);
    // Only a valid number reaches the project, so the saved project always stays valid.
    if (n !== null) setSetting({ masteryPercent: n });
  };

  const exportPackage = async () => {
    if (blocked || busy) return;
    setBusy(true);
    try {
      // The packager (learner bundles + JSZip) is its own chunk, loaded on the first export.
      const { runExport } = await import('../export/runExport');
      const r = await runExport(project, assets, { queue: assetQueue });
      if (r.ok) {
        downloadBlob(r.blob, r.filename);
        onNotice({ tone: 'ok', text: `Downloaded ${r.filename}. Upload it to your LMS as a SCORM 1.2 package.` });
      } else {
        onNotice({ tone: 'error', text: `Couldn't export yet. ${r.blockers.map((b) => b.message).join(' ')}` });
      }
    } catch {
      onNotice({ tone: 'error', text: "Couldn't build the package. Try again, or try another browser." });
    } finally {
      setBusy(false);
    }
  };

  const nameOf = (id: string) => {
    const it = project.interactions.find((i) => i.id === id);
    return it ? checkpointName(project, it) : '';
  };

  return (
    <section className="panel" aria-labelledby="step-heading">
      <h2 id="step-heading" className="panel-title" tabIndex={-1}>Scoring &amp; export</h2>
      <p className="panel-lead">Choose how learners pass, then download a SCORM 1.2 package for your LMS.</p>

      <section className="finish-section" aria-labelledby="scoring-heading">
        <h3 id="scoring-heading" className="section-title">Scoring</h3>
        <div className="field">
          <label htmlFor="mastery" className="field-label">Mastery score (%)</label>
          <p id="mastery-hint" className="field-hint">Learners pass when they score at least this percentage. A whole number from 0 to 100.</p>
          <input
            id="mastery"
            className="input input-mastery"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={masteryText}
            aria-invalid={!masteryValid || undefined}
            aria-describedby="mastery-hint mastery-msg"
            onChange={(e) => onMastery(e.target.value)}
          />
          {/* Always rendered (never display:none), so the message is announced when it appears. */}
          <p id="mastery-msg" role="status" className="msg msg-error field-status">
            {!masteryValid && <><IconAlert />{MASTERY_ERROR}</>}
          </p>
        </div>

        <div className="switch-field">
          <button
            type="button"
            role="switch"
            className="switch"
            aria-checked={disableForwardScrubbing}
            aria-describedby="scrub-hint"
            onClick={() => setSetting({ disableForwardScrubbing: !disableForwardScrubbing })}
          >
            <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
            <span className="switch-label">Disable forward scrubbing</span>
            <span className="switch-state" aria-hidden="true">{disableForwardScrubbing ? 'On' : 'Off'}</span>
          </button>
          <p id="scrub-hint" className="field-hint">Learners can't skip ahead of what they've watched.</p>
        </div>
      </section>

      <section className="finish-section" aria-labelledby="summary-heading">
        <h3 id="summary-heading" className="section-title">Summary</h3>
        <ul className="summary">
          <li><strong>{plural(questions, 'scored question', 'scored questions')}</strong></li>
          <li><strong>{plural(cards, 'info card', 'info cards')}</strong> (text, link and image; not scored)</li>
          <li><strong>{plural(points, 'point possible', 'points possible')}</strong> (one per question)</li>
        </ul>
        <p className="summary-note">
          {questions === 0
            ? 'Learners see "Finish" instead of "Submit answers", and the LMS records the video as completed.'
            : `Learners pass with ${masteryPercent}% or more: at least ${plural(toPass, 'point', 'points')} of ${points}. The LMS records passed or failed with the score.`}
        </p>
      </section>

      <section className="finish-section" aria-labelledby="export-heading">
        <h3 id="export-heading" className="section-title">Export</h3>
        {/* One always-rendered polite live region (never remounted or display:none), so a change in what blocks
            the export is announced. */}
        <p id="export-reason" role="status" className={`msg ${blocked ? 'msg-error' : 'msg-ok'}`}>
          {blocked ? <IconAlert /> : <IconCheck />}
          {!blocked ? 'Ready to export.' : blockers.length === 1 ? 'Fix the item below to export.' : `Fix the ${blockers.length} items below to export.`}
        </p>
        {blocked && (
          <ul className="blockers" aria-label="Fix before exporting">
            {blockers.map((b, i) => (
              <li key={`${b.interactionId ?? ''}:${i}`} className="blocker">
                <span>{b.message}</span>
                {b.interactionId && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    aria-label={`Go to checkpoint: ${nameOf(b.interactionId)}`}
                    onClick={() => onGoToCheckpoint(b.interactionId!)}
                  >
                    Go to checkpoint<IconArrowRight />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="export-row">
          <button
            type="button"
            className="btn btn-primary"
            aria-disabled={blocked || busy || undefined}
            aria-describedby="export-reason"
            onClick={() => void exportPackage()}
          >
            {busy ? <IconSpinner /> : <IconDownload />}Export SCORM package
          </button>
          <p role="status" className="field-hint">{busy ? 'Building the package…' : ''}</p>
        </div>
      </section>

      <div className="panel-footer">
        <button type="button" className="btn btn-secondary" onClick={() => onGo(2)}>
          <IconArrowLeft />Back: Interactions
        </button>
      </div>
    </section>
  );
}
