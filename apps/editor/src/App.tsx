import { useEffect, useRef, useState } from 'react';
import type { Project } from '@ivt/schema';
import { Finish } from './steps/Finish';
import { Interactions } from './steps/Interactions';
import { Setup } from './steps/Setup';
import { isBlank, isSetupComplete, newProject } from './project';
import { discardCorruptBackup, loadCorruptBackup, type Step } from './storage/projectStore';
import { usePersistence, type LoadIssue } from './storage/usePersistence';
import { watchOtherTabs } from './storage/tabs';
import { downloadBlob } from './ui/download';
import { ProjectMenu } from './ui/ProjectMenu';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { StepIndicator } from './ui/StepIndicator';
import { IconPlay } from './ui/icons';
import { youTubeAdapters, type VideoAdapters } from './video/adapters';
import type { FetchVideoInfo } from './video/info';

type Pending =
  | { kind: 'new' }
  | { kind: 'import'; project: Project; assets: Map<string, Blob> };
type Notice = { tone: 'ok' | 'error'; text: string } | null;

const LOAD_NOTICE: Record<Exclude<LoadIssue, null>, string> = {
  corrupt: "Your saved project couldn't be read, so a new one was started. The damaged data is kept in this browser.",
  unavailable: 'Saving is unavailable in this browser; export your project to keep it',
};
const titleOf = (p: Project) => p.title || 'Untitled project';

export function App({ fetchVideoInfo, adapters = youTubeAdapters }: { fetchVideoInfo?: FetchVideoInfo; adapters?: VideoAdapters }) {
  const {
    state, status, loadIssue, hasBackup, setHasBackup, updateProject, setStep, replace, addAsset, removeAsset, imageError, assetsPending, assetQueue,
  } = usePersistence();
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  // A checkpoint Step 2 opens with focus in its drawer (from Step 3's "Go to checkpoint"); cleared by any other move.
  const [checkpoint, setCheckpoint] = useState<string | null>(null);
  // Bumped on start-new/import so Setup starts with fresh field state.
  const [session, setSession] = useState(0);
  // Where focus goes after the next render: the new step's heading, or back to a trigger. Applied only once no
  // dialog is open, because a modal dialog makes the rest of the page inert.
  const focusAfter = useRef<'heading' | HTMLElement | null>(null);
  // Another editor tab on this browser would autosave over this one's work (and the other way round): warn.
  const [otherTab, setOtherTab] = useState(false);
  useEffect(() => {
    const stop = watchOtherTabs(setOtherTab);
    window.addEventListener('pagehide', stop);
    return () => {
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, []);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target || pending) return;
    focusAfter.current = null;
    (target === 'heading' ? document.getElementById('step-heading') : target)?.focus();
  });

  // Announce what startup found only after the (empty) live region is on screen, so screen readers hear it.
  const loaded = !!state;
  useEffect(() => {
    if (loaded && loadIssue) setNotice({ tone: 'error', text: LOAD_NOTICE[loadIssue] });
  }, [loaded, loadIssue]);

  if (!state) return <p className="loading" role="status">Loading your project…</p>;
  const { project, step } = state;
  const unlocked = isSetupComplete(project);
  const shown: Step = unlocked ? step : 1;

  const go = (s: Step) => {
    focusAfter.current = 'heading';
    setCheckpoint(null);
    setStep(s);
  };
  /** Step 2 focuses the checkpoint's drawer itself, so the heading is not focused here. */
  const goToCheckpoint = (id: string) => {
    focusAfter.current = null;
    setCheckpoint(id);
    setStep(2);
  };

  /** Replaces the project; on a storage failure the previous project stays and the author is told why. */
  const apply = async (p: Project, assets: Map<string, Blob>, failure: string): Promise<boolean> => {
    try {
      await replace(p, assets);
    } catch {
      setNotice({ tone: 'error', text: `${failure}: it could not be saved in this browser. Your current project is unchanged.` });
      return false;
    }
    setSession((n) => n + 1);
    focusAfter.current = 'heading';
    return true;
  };

  const open = async (p: Project, assets: Map<string, Blob>) => {
    if (await apply(p, assets, `Couldn't open "${titleOf(p)}"`)) setNotice({ tone: 'ok', text: `Opened "${titleOf(p)}".` });
  };

  const closeDialog = (focusTo?: 'heading') => {
    setPending(null);
    focusAfter.current = focusTo === 'heading' ? 'heading' : returnFocus.current;
  };

  const confirm = async () => {
    if (!pending) return;
    const p = pending;
    closeDialog('heading');
    if (p.kind === 'import') return open(p.project, p.assets);
    if (await apply(newProject(), new Map(), "Couldn't start a new project")) setNotice({ tone: 'ok', text: 'Started a new project.' });
  };

  const onImported = (p: Project, assets: Map<string, Blob>) => {
    if (isBlank(project)) return void open(p, assets);
    returnFocus.current = document.activeElement as HTMLElement | null;
    setPending({ kind: 'import', project: p, assets });
  };

  const downloadBackup = async () => {
    try {
      downloadBlob(new Blob([JSON.stringify(await loadCorruptBackup(), null, 2)], { type: 'application/json' }), 'damaged-project.json');
    } catch {
      setNotice({ tone: 'error', text: "Couldn't read the damaged data from this browser." });
    }
  };
  const discardBackup = async () => {
    try {
      await discardCorruptBackup();
      focusAfter.current = document.getElementById('main'); // the button is about to go: don't let focus drop to body
      setHasBackup(false);
      setNotice({ tone: 'ok', text: 'Discarded the damaged data.' });
    } catch {
      setNotice({ tone: 'error', text: "Couldn't discard the damaged data from this browser." });
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
          assets={state.assets}
          saveStatus={status}
          imageError={imageError}
          assetsPending={assetsPending}
          onImported={onImported}
          onNotice={setNotice}
          onStartNew={(trigger) => {
            returnFocus.current = trigger;
            setPending({ kind: 'new' });
          }}
        />
      </header>
      <StepIndicator current={shown} unlocked={unlocked} onGo={go} />
      {/* Always rendered (never display:none), so messages inserted later are announced. */}
      <div role="status" data-testid="notice" className={`notice${notice ? ` notice-${notice.tone}` : ''}`}>{notice?.text}</div>
      {/* Always rendered, so the warning is announced when another tab opens. A warning, not a lock. */}
      <div role="alert" className="tab-warning" data-testid="tab-warning">
        {otherTab && 'This project is also open in another tab. Each tab saves its own copy, so changes made in one can overwrite the other\'s. Close the other tab, or work in just one.'}
      </div>
      {hasBackup && (
        <section className="recovery" aria-label="Damaged project data">
          <p>Damaged project data from an earlier session is kept in this browser.</p>
          <div className="recovery-actions">
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void downloadBackup()}>Download damaged data</button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void discardBackup()}>Discard damaged data</button>
          </div>
        </section>
      )}
      <main id="main" tabIndex={-1} className="app-main">
        {shown === 1 ? (
          <Setup key={session} project={project} onChange={updateProject} onNext={() => go(2)} fetchVideoInfo={fetchVideoInfo} />
        ) : shown === 2 ? (
          <Interactions
            key={session}
            project={project}
            onChange={updateProject}
            assets={state.assets}
            addAsset={addAsset}
            removeAsset={removeAsset}
            adapters={adapters}
            onGo={go}
            openCheckpoint={checkpoint}
          />
        ) : (
          <Finish
            key={session}
            project={project}
            onChange={updateProject}
            assets={state.assets}
            assetQueue={assetQueue}
            onGo={go}
            onGoToCheckpoint={goToCheckpoint}
            onNotice={setNotice}
          />
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
