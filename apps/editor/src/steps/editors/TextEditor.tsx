import { RichText } from '../../components/RichText';
import type { EditorProps } from './types';

/** Text: one rich-text body, shown on a card with Continue. */
export function TextEditor({ it, onPatch }: EditorProps) {
  return (
    <RichText
      first
      label="Text"
      hint="Learners read this while the video is paused."
      value={it.promptHtml}
      onChange={(promptHtml) => onPatch((x) => ({ ...x, promptHtml }))}
    />
  );
}
