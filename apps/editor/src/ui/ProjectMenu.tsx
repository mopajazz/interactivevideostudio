import { useRef } from 'react';
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

type Props = {
  project: Project;
  assets: Map<string, Blob>;
  saveStatus: SaveStatus;
  onImported: (p: Project, assets: Map<string, Blob>) => void;
  onNotice: (n: { tone: 'ok' | 'error'; text: string }) => void;
  onStartNew: (trigger: HTMLElement) => void;
};

/** Save status plus the project file actions: import, export, start new. */
export function ProjectMenu({ project, assets, saveStatus, onImported, onNotice, onStartNew }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
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
      <p className={`save-status is-${saveStatus}`}>
        <span data-testid="save-status">{QUIET_TEXT[saveStatus]}</span>
        <span role="status">{PROBLEM_TEXT[saveStatus]}</span>
      </p>
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
