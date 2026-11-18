import type { ReactNode } from 'react';
import type { Step } from '../storage/projectStore';
import { IconArrowLeft, IconArrowRight, IconImage, IconLink, IconQuiz, IconText, IconTrueFalse } from '../ui/icons';

const TOOLS = [
  { key: 'quiz', label: 'Quiz', Icon: IconQuiz },
  { key: 'truefalse', label: 'True/False', Icon: IconTrueFalse },
  { key: 'text', label: 'Text', Icon: IconText },
  { key: 'link', label: 'Link', Icon: IconLink },
  { key: 'image', label: 'Image', Icon: IconImage },
] as const;

const COPY: Record<2 | 3, { title: string; body: ReactNode }> = {
  2: {
    title: 'Interactions',
    body: (
      <>
        <p>Here you'll place questions, text, links and images on the video's timeline. Each one pauses the video and takes over the frame.</p>
        <ul className="tool-preview" aria-label="Interaction tools">
          {TOOLS.map(({ key, label, Icon }) => (
            <li key={key} className={`tool-chip tool-${key}`}><Icon />{label}</li>
          ))}
        </ul>
      </>
    ),
  },
  3: {
    title: 'Scoring & export',
    body: <p>Here you'll set the mastery score and export a SCORM 1.2 package that sends the score to your LMS gradebook.</p>,
  },
};

/** Placeholder for steps 2 and 3 until they are built. */
export function ComingNext({ step, onGo }: { step: 2 | 3; onGo: (s: Step) => void }) {
  const { title, body } = COPY[step];
  return (
    <section className="panel" aria-labelledby="step-heading">
      <h2 id="step-heading" className="panel-title" tabIndex={-1}>{title}</h2>
      <div className="coming-next">
        <p className="badge">Coming next</p>
        {body}
      </div>
      <div className="panel-footer">
        <button type="button" className="btn btn-secondary" onClick={() => onGo((step - 1) as Step)}>
          <IconArrowLeft />Back: {step === 2 ? 'Setup' : 'Interactions'}
        </button>
        {step === 2 && (
          <button type="button" className="btn btn-primary" onClick={() => onGo(3)}>
            Next: Scoring &amp; export<IconArrowRight />
          </button>
        )}
      </div>
    </section>
  );
}
