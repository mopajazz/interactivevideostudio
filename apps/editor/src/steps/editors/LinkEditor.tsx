import { useId, useState } from 'react';
import { BAD_URL, RichText } from '../../components/RichText';
import { isSafeLinkUrl } from '../../components/richText';
import { IconAlert } from '../../ui/icons';
import type { EditorProps } from './types';

/** Link: a rich-text message and the web address the "Open link" button goes to. */
export function LinkEditor({ it, onPatch }: EditorProps) {
  const id = useId();
  const [text, setText] = useState(it.url ?? '');
  const empty = text.trim() === '';
  const bad = !empty && !isSafeLinkUrl(text);

  return (
    <>
      <RichText
        first
        label="Text shown with the link"
        hint="Say where the link goes and why it's worth opening."
        value={it.promptHtml}
        onChange={(promptHtml) => onPatch((x) => ({ ...x, promptHtml }))}
      />
      <div className="field">
        <label htmlFor={`${id}-url`} className="field-label">Web address</label>
        <p id={`${id}-hint`} className="field-hint">Starts with https://, http:// or mailto:. It opens in a new tab.</p>
        <input
          id={`${id}-url`}
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={bad || undefined}
          aria-describedby={`${id}-hint ${id}-msg`}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            // Only a safe address (or none yet) is stored, so the saved project always stays valid.
            const url = isSafeLinkUrl(value) ? value.trim() : '';
            onPatch((x) => (x.url === url ? x : { ...x, url }));
          }}
        />
        {/* Always rendered, so a message inserted later is announced. */}
        <div role="status" className="field-status" data-testid="url-message">
          {(empty || bad) && (
            <p id={`${id}-msg`} className="msg msg-error"><IconAlert />{empty ? 'Add a web address' : BAD_URL}</p>
          )}
        </div>
      </div>
    </>
  );
}
