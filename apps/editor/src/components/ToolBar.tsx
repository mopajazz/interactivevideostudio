import type { InteractionType } from '@ivt/schema';
import { IconImage, IconLink, IconQuiz, IconText, IconTrueFalse } from '../ui/icons';

/** The five tools, in the order they appear. `key` picks the color family from tokens.css (--tool-<key>). */
export const TOOLS = [
  { type: 'multipleChoice', key: 'quiz', label: 'Quiz', Icon: IconQuiz },
  { type: 'trueFalse', key: 'truefalse', label: 'True/False', Icon: IconTrueFalse },
  { type: 'text', key: 'text', label: 'Text', Icon: IconText },
  { type: 'link', key: 'link', label: 'Link', Icon: IconLink },
  { type: 'image', key: 'image', label: 'Image', Icon: IconImage },
] as const satisfies ReadonlyArray<{ type: InteractionType; key: string; label: string; Icon: () => JSX.Element }>;

export const toolOf = (type: InteractionType) => TOOLS.find((t) => t.type === type)!;

/** Chunky, color-coded buttons across the top of the video; each adds a checkpoint at the playhead. */
export function ToolBar({ onAdd }: { onAdd: (type: InteractionType) => void }) {
  return (
    <div role="group" aria-label="Add a checkpoint at the playhead" className="tools">
      {TOOLS.map(({ type, key, label, Icon }) => (
        <button key={type} type="button" className={`tool-btn tool-${key}`} onClick={() => onAdd(type)}>
          <Icon />{label}
        </button>
      ))}
    </div>
  );
}
