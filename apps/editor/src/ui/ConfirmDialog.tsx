import { useEffect, useId, useRef, type ReactNode } from 'react';

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Modal confirmation on the native <dialog>: showModal() makes the rest of the page inert and Escape cancels.
 * Focus starts on Cancel, the safe choice. Callers decide where focus goes afterwards.
 */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    cancelRef.current?.focus();
    return () => d.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onCancel={(e) => {
        e.preventDefault(); // React state decides when the dialog closes
        onCancel();
      }}
    >
      <h2 id={`${id}-title`} className="dialog-title">{title}</h2>
      <div id={`${id}-body`} className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
