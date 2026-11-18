import { forwardRef, memo } from 'react';
import type { Interaction } from '@ivt/schema';
import { ImageEditor } from '../steps/editors/ImageEditor';
import { LinkEditor } from '../steps/editors/LinkEditor';
import { QuestionEditor } from '../steps/editors/QuestionEditor';
import { TextEditor } from '../steps/editors/TextEditor';
import { IconPlayhead, IconTrash } from '../ui/icons';
import { ShortcutHint } from './RichText';
import { TimeField } from './TimeField';
import { toolOf } from './ToolBar';

type Props = {
  it: Interaction;
  name: string;
  maxTime: number;
  duration: number;
  image: Blob | undefined;
  onPatch: (id: string, update: (it: Interaction) => Interaction) => void;
  onTime: (id: string, seconds: number) => void;
  onMoveToPlayhead: (id: string) => void;
  onImage: (id: string, blob: Blob) => Promise<void>;
  onDeleteRequest: (id: string, trigger: HTMLElement) => void;
};

/**
 * Settings for the selected checkpoint: only that type's fields, then its time and Delete. Memoized so the playhead
 * ticking does not re-render the editors; the forwarded ref lets the step focus its first field.
 */
export const Drawer = memo(forwardRef<HTMLElement, Props>(function Drawer(
  { it, name, maxTime, duration, image, onPatch, onTime, onMoveToPlayhead, onImage, onDeleteRequest },
  ref,
) {
  const { key, Icon } = toolOf(it.type);
  const patch = (update: (x: Interaction) => Interaction) => onPatch(it.id, update);
  return (
    <section ref={ref} className={`drawer drawer-${key}`} aria-labelledby="drawer-heading">
      <div className="drawer-head">
        <span className={`drawer-icon tool-${key}`}><Icon /></span>
        <h3 id="drawer-heading" className="drawer-title">{name}</h3>
      </div>
      <div className="drawer-body">
        <ShortcutHint />
        {(it.type === 'multipleChoice' || it.type === 'trueFalse') && <QuestionEditor it={it} onPatch={patch} />}
        {it.type === 'text' && <TextEditor it={it} onPatch={patch} />}
        {it.type === 'link' && <LinkEditor it={it} onPatch={patch} />}
        {it.type === 'image' && <ImageEditor it={it} onPatch={patch} image={image} onImage={(blob) => onImage(it.id, blob)} />}
        <div className="drawer-time">
          <TimeField value={it.time} max={maxTime} duration={duration} onCommit={(t) => onTime(it.id, t)} />
          <button type="button" className="btn btn-secondary btn-small" onClick={() => onMoveToPlayhead(it.id)}>
            <IconPlayhead />Move to playhead
          </button>
        </div>
        <div className="drawer-actions">
          <button type="button" className="btn btn-secondary btn-small btn-delete" onClick={(e) => onDeleteRequest(it.id, e.currentTarget)}>
            <IconTrash />Delete checkpoint
          </button>
        </div>
      </div>
    </section>
  );
}));
