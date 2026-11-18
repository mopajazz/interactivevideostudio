import { useEffect, useRef, useState } from 'react';
import type { Project } from '@ivt/schema';
import { ComingNext } from './steps/ComingNext';
import { Setup } from './steps/Setup';
import { isBlank, isSetupComplete, newProject } from './project';
import { clearAll, putAsset, type Step } from './storage/projectStore';
import { usePersistence } from './storage/usePersistence';
import { ProjectMenu } from './ui/ProjectMenu';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { StepIndicator } from './ui/StepIndicator';
import { IconPlay } from './ui/icons';
import type { FetchVideoInfo } from './video/info';

type Pending =
  | { kind: 'new' }
  | { kind: 'import'; project: Project; assets: Map<string, Blob> };
type Notice = { tone: 'ok' | 'error'; text: string } | null;

export function App({ fetchVideoInfo }: { fetchVideoInfo?: FetchVideoInfo }) {
  const { state, status, updateProject, setStep, replace } = usePersistence();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // Bumped on start-new/import so Setup starts with fresh field state.
  const [session, setSession] = useState(0);
  // Where focus goes after the next render: the new step's heading, or back to a trigger. Applied only once no
  // dialog is open, because a modal dialog makes the rest of the page inert.
  const focusAfter = useRef<'heading' | HTMLElement | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target || pending) return;
    focusAfter.current = null;
    (target === 'heading' ? document.getElementById('step-heading') : target)?.focus();
  });

  if (!state) return <p className="loading" role="status">Loading your project…</p>;
  const { project, step } = state;
  const unlocked = isSetupComplete(project);
  const shown: Step = unlocked ? step : 1;

  const go = (s: Step) => {
    focusAfter.current = 'heading';
    setStep(s);
  };

  const apply = async (p: Project, assets: Map<string, Blob>) => {
    await replace(p, async () => {
      await clearAll();
      for (const [id, blob] of assets) await putAsset(id, blob);
    });
    setSession((n) => n + 1);
    focusAfter.current = 'heading';
  };

  const closeDialog = (focusTo?: 'heading') => {
    setPending(null);
    focusAfter.current = focusTo === 'heading' ? 'heading' : returnFocus.current;
  };

  const confirm = async () => {
    if (!pending) return;
    const p = pending;
    closeDialog('heading');
    if (p.kind === 'new') {
      await apply(newProject(), new Map());
      setNotice({ tone: 'ok', text: 'Started a new project.' });
    } else {
      await apply(p.project, p.assets);
      setNotice({ tone: 'ok', text: `Opened "${p.project.title || 'Untitled project'}".` });
    }
  };

  const onImported = (p: Project, assets: Map<string, Blob>) => {
    if (isBlank(project)) {
      void apply(p, assets).then(() => setNotice({ tone: 'ok', text: `Opened "${p.title || 'Untitled project'}".` }));
    } else {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setPending({ kind: 'import', project: p, assets });
    }
  };

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><IconPlay /></span>
          <h1 className="brand-name">Interactive Video Studio</h1>
        </div>
        <ProjectMenu
          project={project}
          saveStatus={status}
          onImported={onImported}
          onNotice={setNotice}
          onStartNew={(trigger) => {
            returnFocus.current = trigger;
            setPending({ kind: 'new' });
          }}
        />
      </header>
      <StepIndicator current={shown} unlocked={unlocked} onGo={go} />
      <div role="status" className={`notice${notice ? ` notice-${notice.tone}` : ''}`}>{notice?.text}</div>
      <main id="main" tabIndex={-1} className="app-main">
        {shown === 1 ? (
          <Setup key={session} project={project} onChange={updateProject} onNext={() => go(2)} fetchVideoInfo={fetchVideoInfo} />
        ) : (
          <ComingNext key={shown} step={shown} onGo={go} />
        )}
      </main>
      {pending?.kind === 'new' && (
        <ConfirmDialog title="Start a new project?" confirmLabel="Clear and start new" onConfirm={confirm} onCancel={() => closeDialog()}>
          <p>This removes the current project and its images from this browser. To keep a copy, choose Cancel and then Export JSON.</p>
        </ConfirmDialog>
      )}
      {pending?.kind === 'import' && (
        <ConfirmDialog title="Replace the current project?" confirmLabel="Replace" onConfirm={confirm} onCancel={() => closeDialog()}>
          <p>Opening "{pending.project.title || 'Untitled project'}" replaces the project you're working on. To keep a copy of the current one, choose Cancel and then Export JSON.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
