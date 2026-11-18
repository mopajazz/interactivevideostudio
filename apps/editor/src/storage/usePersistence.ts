import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@ivt/schema';
import { newProject, isSetupComplete } from '../project';
import { createAutosave } from './autosave';
import { loadProject, loadStep, saveProject, saveStep, type Step } from './projectStore';

export type SaveStatus = 'saved' | 'saving' | 'error';
type Snapshot = { project: Project; step: Step };

/**
 * Loads the saved project and step once, then autosaves every change (debounced 500 ms) to IndexedDB.
 * `replace` drops any pending save, runs `rewrite` (e.g. clear storage, store imported images), then swaps in
 * `project` at step 1.
 */
export function usePersistence() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const changes = useRef(0);

  const autosave = useMemo(
    () =>
      createAutosave<{ snap: Snapshot; n: number }>(({ snap, n }) => {
        Promise.all([saveProject(snap.project), saveStep(snap.step)]).then(
          () => { if (changes.current === n) setStatus('saved'); },
          () => setStatus('error'),
        );
      }),
    [],
  );

  useEffect(() => {
    let live = true;
    Promise.all([loadProject(), loadStep()]).then(([p, s]) => {
      if (!live) return;
      const project = p ?? newProject();
      setState({ project, step: isSetupComplete(project) ? s : 1 });
    });
    return () => { live = false; };
  }, []);

  // Save after every change except the initial load.
  const loaded = useRef<Snapshot | null>(null);
  useEffect(() => {
    if (!state) return;
    if (!loaded.current) {
      loaded.current = state;
      return;
    }
    changes.current += 1;
    setStatus('saving');
    autosave.schedule({ snap: state, n: changes.current });
  }, [state, autosave]);

  // Don't lose the last half second when the tab is hidden or closed.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') autosave.flush(); };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', autosave.flush);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', autosave.flush);
    };
  }, [autosave]);

  const updateProject = useCallback((update: (p: Project) => Project) => {
    setState((s) => (s ? { ...s, project: update(s.project) } : s));
  }, []);
  const setStep = useCallback((step: Step) => setState((s) => (s ? { ...s, step } : s)), []);
  const replace = useCallback(async (project: Project, rewrite: () => Promise<void>) => {
    autosave.cancel();
    await rewrite();
    setState({ project, step: 1 });
  }, [autosave]);

  return { state, status, updateProject, setStep, replace };
}
