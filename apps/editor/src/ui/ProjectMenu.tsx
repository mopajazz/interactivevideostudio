import { useEffect, useRef, useState } from 'react';
import type { Project } from '@ivt/schema';
import { fileSlug } from '../project';
import { exportProjectJson, importProjectJson } from '../storage/projectJson';
import type { SaveStatus } from '../storage/usePersistence';
import { downloadBlob } from './download';
import { IconDownload, IconPlus, IconUpload } from './icons';

/** Routine states change on every keystroke, so they are not announced. */
const QUIET_TEXT: Partial<Record<SaveStatus, string>> = { saved: 'All changes saved in this browser', saving: 'Saving…' };
/** Problems are announced, politely. */
const PROBLEM_TEXT: Partial<Record<SaveStatus, string>> = {
  error: "Couldn't save in this browser. Export JSON to keep a copy.",
  unavailable: 'Saving is unavailable in this browser; export your project to keep it',
};

export const IMAGE_ERROR = "Couldn't save an image. Retrying…";
export const STORAGE_NOTE = 'Your work is saved only in this browser. Export a project file now and then.';
const NOTE_DISMISSED = 'ivt-storage-note-dismissed';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(NOTE_DISMISSED) === '1';
  } catch {
    return false;
  }
};

/**
 * A standing reminder that the project lives only in this browser, dismissible for the session. Its live region is
 * always rendered (never display:none); the text is put in after the page loads, so screen readers announce it.
 */
function StorageNote() {
  const [shown, setShown] = useState(false);
  useEffect(() => { if (!readDismissed()) setShown(true); }, []);
  const dismiss = () => {
    setShown(false);
    try {
      sessionStorage.setItem(NOTE_DISMISSED, '1');
    } catch {
      /* dismissed for this page only */
    }
  };
  return (
    <div className={`storage-note${shown ? ' is-shown' : ''}`}>
      <p role="status" data-testid="storage-note" className="storage-note-text">{shown ? STORAGE_NOTE : ''}</p>
      {shown && (
        <button type="button" className="btn btn-secondary btn-small" aria-label="Dismiss the note about saving in this browser" onClick={dismiss}>
          Dismiss
        </button>
      )}
    </div>
  );
}

type Props = {
  project: Project;
  assets: Map<string, Blob>;
  saveStatus: SaveStatus;
  /** An image failed to save and is being retried: shown until it gets through, whatever the project save did. */
  imageError: boolean;
  /** Images not yet in storage: export waits for them. */
  assetsPending: boolean;
  onImported: (p: Project, assets: Map<string, Blob>) => void;
  onNotice: (n: { tone: 'ok' | 'error'; text: string }) => void;
  onStartNew: (trigger: HTMLElement) => void;
};

/** Save status plus the project file actions: import, export, start new. */
export function ProjectMenu({ project, assets, saveStatus, imageError, assetsPending, onImported, onNotice, onStartNew }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    if (assetsPending) {
      return onNotice({
        tone: 'error',
        text: 'Export is paused until every image is saved in this browser. The editor is retrying; try again in a moment.',
      });
    }
    const name = `${fileSlug(project.title)}.ivt.json`;
    try {
      downloadBlob(await exportProjectJson(project, assets), name);
      onNotice({ tone: 'ok', text: `Downloaded ${name}.` });
    } catch {
      onNotice({ tone: 'error', text: "Couldn't export the project. Try again, or try another browser." });
    }
  };

  const importJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { project: p, assets } = await importProjectJson(file);
      onImported(p, assets);
    } catch (e) {
      onNotice({ tone: 'error', text: (e as Error).message });
    }
  };

  return (
    <div className="project-menu">
      <p className={`save-status is-${imageError ? 'error' : saveStatus}`}>
        <span data-testid="save-status">{imageError ? '' : QUIET_TEXT[saveStatus]}</span>
        <span role="status">{[PROBLEM_TEXT[saveStatus], imageError && IMAGE_ERROR].filter(Boolean).join(' ')}</span>
      </p>
      <StorageNote />
      <div className="project-actions">
        <button type="button" className="btn btn-secondary btn-small" onClick={() => fileInput.current?.click()}>
          <IconUpload />Import JSON
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // so choosing the same file again still fires
            void importJson(file);
          }}
        />
        <button type="button" className="btn btn-secondary btn-small" onClick={() => void exportJson()}>
          <IconDownload />Export JSON
        </button>
        <button type="button" className="btn btn-secondary btn-small" onClick={(e) => onStartNew(e.currentTarget)}>
          <IconPlus />Start new project
        </button>
      </div>
    </div>
  );
}
