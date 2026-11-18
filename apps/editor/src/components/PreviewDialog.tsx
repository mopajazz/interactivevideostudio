import { useEffect, useRef } from 'react';
import { mount } from '@ivt/player';
import type { Project } from '@ivt/schema';
import type { VideoAdapters } from '../video/adapters';
import { IconClose } from '../ui/icons';

type Props = { project: Project; assets: Map<string, Blob>; adapters: VideoAdapters; onClose: () => void };

/**
 * The real learner player (@ivt/player `mount`) in a modal <dialog>, like ConfirmDialog: the page behind is inert and
 * Escape closes it (the player keeps Escape for itself while a question is open). Unmounting destroys the player.
 * The caller returns focus to the button that opened it.
 */
export function PreviewDialog({ project, assets, adapters, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    const urls = new Map([...assets].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
    const player = mount(stage.current!, project, { adapter: adapters.preview(project), assetUrl: (id) => urls.get(id) ?? '' });
    close.current?.focus();
    return () => {
      player.destroy();
      urls.forEach((u) => URL.revokeObjectURL(u));
      d.close();
    };
    // A snapshot: the preview shows the project as it was when opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog preview-dialog"
      aria-labelledby="preview-title"
      onCancel={(e) => {
        e.preventDefault(); // React state decides when the dialog closes
        onClose();
      }}
    >
      <div className="preview-head">
        <h2 id="preview-title" className="dialog-title">Preview as learner</h2>
        <button ref={close} type="button" className="btn btn-secondary btn-small" onClick={onClose}>
          <IconClose />Close preview
        </button>
      </div>
      <p className="field-hint">This is what learners see. Answers here are not saved.</p>
      <div ref={stage} className="preview-stage" />
    </dialog>
  );
}
