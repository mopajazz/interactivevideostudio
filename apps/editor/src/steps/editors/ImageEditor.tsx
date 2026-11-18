import { useEffect, useId, useState } from 'react';
import { RichText } from '../../components/RichText';
import { compressImage } from '../../storage/images';
import { IconAlert, IconSpinner } from '../../ui/icons';
import type { EditorProps } from './types';

type Props = EditorProps & {
  image: Blob | undefined;
  /** Stores the processed image and points this checkpoint at it (dropping any image it replaces). */
  onImage: (blob: Blob) => Promise<void>;
};

export const ALT_MISSING = 'Add alt text or mark decorative';

/** Image: file (compressed on the way in), alt text or "decorative", optional caption. */
export function ImageEditor({ it, onPatch, image, onImage }: Props) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = useObjectUrl(image);
  const altMissing = !it.decorative && !(it.alt ?? '').trim();

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onImage(await compressImage(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field" data-field="">
        <label htmlFor={`${id}-file`} className="field-label">Image file</label>
        <p id={`${id}-file-hint`} className="field-hint">JPEG, PNG, WebP or GIF. Large images are made smaller, and photo location data is removed.</p>
        <input
          id={`${id}-file`}
          className="input input-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          aria-describedby={`${id}-file-hint ${id}-file-msg`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // choosing the same file again still fires
            void choose(file);
          }}
        />
        <div role="status" className="field-status">
          {busy && <p id={`${id}-file-msg`} className="msg msg-info"><IconSpinner />Processing the image…</p>}
          {!busy && error && <p id={`${id}-file-msg`} className="msg msg-error"><IconAlert />{error}</p>}
        </div>
        {url && <img className="image-preview" src={url} alt="Preview of the chosen image" />}
      </div>

      <div className="field">
        <label htmlFor={`${id}-alt`} className="field-label">Alt text</label>
        <p id={`${id}-alt-hint`} className="field-hint">Describe what the image shows for people who can't see it.</p>
        <input
          id={`${id}-alt`}
          className="input"
          type="text"
          maxLength={500}
          value={it.alt ?? ''}
          disabled={!!it.decorative}
          aria-invalid={altMissing || undefined}
          aria-describedby={`${id}-alt-hint ${id}-alt-msg`}
          onChange={(e) => {
            const alt = e.target.value;
            onPatch((x) => ({ ...x, alt }));
          }}
        />
        <div role="status" className="field-status">
          {altMissing && <p id={`${id}-alt-msg`} className="msg msg-error"><IconAlert />{ALT_MISSING}</p>}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={!!it.decorative}
            aria-describedby={`${id}-dec-hint`}
            onChange={(e) => {
              const decorative = e.target.checked;
              onPatch((x) => ({ ...x, decorative, alt: decorative ? '' : x.alt }));
            }}
          />
          Decorative image
        </label>
        <p id={`${id}-dec-hint`} className="field-hint">Only for an image that adds nothing a learner needs. Screen readers skip it.</p>
      </div>

      <RichText label="Caption (optional)" value={it.promptHtml} onChange={(promptHtml) => onPatch((x) => ({ ...x, promptHtml }))} />
    </>
  );
}

/** An object URL for the blob, revoked when it changes or the editor closes. */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
