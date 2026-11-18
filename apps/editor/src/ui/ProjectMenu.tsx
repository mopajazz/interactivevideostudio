import { useRef } from 'react';
import type { Project } from '@ivt/schema';
import { fileSlug } from '../project';
import { exportProjectJson, importProjectJson } from '../storage/projectJson';
import { loadAssets } from '../storage/projectStore';
import type { SaveStatus } from '../storage/usePersistence';
import { IconDownload, IconPlus, IconUpload } from './icons';

const SAVE_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved in this browser',
  saving: 'Saving…',
  error: "Couldn't save in this browser. Export JSON to keep a copy.",
};

type Props = {
  project: Project;
  saveStatus: SaveStatus;
  onImported: (p: Project, assets: Map<string, Blob>) => void;
  onNotice: (n: { tone: 'ok' | 'error'; text: string }) => void;
  onStartNew: (trigger: HTMLElement) => void;
};

/** Save status plus the project file actions: import, export, start new. */
export function ProjectMenu({ project, saveStatus, onImported, onNotice, onStartNew }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    const blob = await exportProjectJson(project, await loadAssets());
    const name = `${fileSlug(project.title)}.ivt.json`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
    onNotice({ tone: 'ok', text: `Downloaded ${name}.` });
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
      {/* Not a live region: it changes on every keystroke. */}
      <p className={`save-status is-${saveStatus}`} data-testid="save-status">{SAVE_TEXT[saveStatus]}</p>
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
