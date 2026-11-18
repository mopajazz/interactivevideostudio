import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@ivt/schema';
import { newProject, isSetupComplete } from '../project';
import { createAssetQueue, type AssetQueueState } from './assetQueue';
import { createAutosave } from './autosave';
import { deleteAsset, loadSession, putAsset, replaceProject, saveProject, saveStep, type Step } from './projectStore';

/** 'unavailable': IndexedDB failed at startup, so nothing is saved; everything else keeps working in memory. */
export type SaveStatus = 'saved' | 'saving' | 'error' | 'unavailable';
/** What startup found that the author must be told about. */
export type LoadIssue = 'corrupt' | 'unavailable' | null;

type Snapshot = { project: Project; step: Step; assets: Map<string, Blob> };

/**
 * Loads the saved session once, then autosaves every project/step change (debounced 500 ms) to IndexedDB.
 * Never hangs on a storage failure: it starts with an empty project and reports the issue instead.
 */
export function usePersistence() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [loadIssue, setLoadIssue] = useState<LoadIssue>(null);
  const [hasBackup, setHasBackup] = useState(false);
  const changes = useRef(0);
  const latest = useRef<Snapshot | null>(null);
  latest.current = state;
  const available = status !== 'unavailable';
  // Image writes are kept apart from the project save: a failed one stays reported (a later successful project
  // save does not hide it) and is retried with every autosave until it gets through.
  const [images, setImages] = useState<AssetQueueState>({ pending: false, failed: false });
  const assetQueue = useMemo(() => createAssetQueue({ put: putAsset, del: deleteAsset }, setImages), []);

  const autosave = useMemo(
    () =>
      createAutosave<{ snap: Snapshot; n: number }>(({ snap, n }) => {
        assetQueue.flush().then(() => Promise.all([saveProject(snap.project), saveStep(snap.step)])).then(
          () => { if (changes.current === n) setStatus('saved'); },
          () => setStatus('error'),
        );
      }),
    [assetQueue],
  );

  useEffect(() => {
    let live = true;
    loadSession().then(
      (s) => {
        if (!live) return;
        const project = s.project ?? newProject();
        setState({ project, step: isSetupComplete(project) ? s.step : 1, assets: s.assets });
        setLoadIssue(s.corrupt ? 'corrupt' : null);
        setHasBackup(s.hasBackup);
      },
      () => {
        if (!live) return;
        setState({ project: newProject(), step: 1, assets: new Map() });
        setStatus('unavailable');
        setLoadIssue('unavailable');
      },
    );
    return () => { live = false; };
  }, []);

  // Save after every change except the initial load (and never when storage is unavailable).
  const loaded = useRef(false);
  const schedule = useCallback((snap: Snapshot) => {
    changes.current += 1;
    setStatus('saving');
    autosave.schedule({ snap, n: changes.current });
  }, [autosave]);
  useEffect(() => {
    if (!state) return;
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    if (available) schedule(state);
  }, [state, available, schedule]);

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

  /**
   * Swaps in a whole project and its images at step 1 (import, start new). Storage is written first, atomically;
   * if that fails this rejects, the screen and storage keep the previous project, and its unsaved edits are
   * scheduled again.
   */
  const replace = useCallback(async (project: Project, assets: Map<string, Blob>) => {
    if (available) {
      autosave.cancel(); // a pending save of the old project must not land after the new one
      try {
        await replaceProject(project, assets);
        assetQueue.clear(); // the new project's images were written with it; old pending writes no longer apply
      } catch (e) {
        if (latest.current) schedule(latest.current);
        throw e;
      }
    }
    setState({ project, step: 1, assets });
  }, [available, autosave, schedule, assetQueue]);

  /**
   * Adds an image to the in-memory assets (which export reads) and queues it for storage. If the write fails it is
   * reported (`imageError`) and retried with every autosave; the image stays usable in memory meanwhile.
   */
  const addAsset = useCallback(async (id: string, blob: Blob) => {
    setState((s) => (s ? { ...s, assets: new Map(s.assets).set(id, blob) } : s));
    if (available) await assetQueue.put(id, blob);
  }, [available, assetQueue]);

  /** Drops an image no interaction uses any more, from memory and (queued, retried like a write) from storage. */
  const removeAsset = useCallback(async (id: string) => {
    setState((s) => {
      if (!s?.assets.has(id)) return s;
      const assets = new Map(s.assets);
      assets.delete(id);
      return { ...s, assets };
    });
    if (available) await assetQueue.remove(id);
  }, [available, assetQueue]);

  return {
    state, status, loadIssue, hasBackup, setHasBackup, updateProject, setStep, replace, addAsset, removeAsset,
    /** An image write or removal failed and is still waiting to be retried. */
    imageError: images.failed,
    /** Image writes not yet in storage (including failed ones); export waits for these. */
    assetsPending: images.pending,
    /** The queue itself, so the SCORM export can flush it and check what is left. */
    assetQueue,
  };
}
