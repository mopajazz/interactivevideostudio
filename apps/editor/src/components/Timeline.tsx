import { forwardRef, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Project } from '@ivt/schema';
import { checkpointName, sortedInteractions } from '../interactions';
import { IconPlus } from '../ui/icons';
import { toolOf } from './ToolBar';

type Props = {
  project: Project;
  selectedId: string | null;
  playhead: number;
  onSelect: (id: string) => void;
  onAddQuiz: () => void;
  onDeleteRequest: (id: string, trigger: HTMLElement) => void;
};

const frac = (t: number, d: number) => (d > 0 ? Math.min(1, Math.max(0, t / d)) : 0);
const pct = (t: number, d: number) => `${frac(t, d) * 100}%`;
/** Centre-to-centre distance below which two nodes would overlap (44px target plus a gap). */
const GAP = 48;

/** Greedy lanes: each node goes in the lowest row where it clears the previous node by GAP pixels. */
function lanes(xs: number[]): number[] {
  const lastX: number[] = [];
  return xs.map((x) => {
    let lane = lastX.findIndex((l) => x - l >= GAP);
    if (lane < 0) lane = lastX.length;
    lastX[lane] = x;
    return lane;
  });
}

/**
 * One round node per checkpoint, in play order. The nodes are one Tab stop (roving tabindex): arrow keys, Home and
 * End move between them and select; Delete asks to remove the selected one. "+" adds a quiz question at the playhead.
 * The forwarded ref is the group itself, which takes focus when the last node is deleted.
 */
export const Timeline = forwardRef<HTMLDivElement, Props>(function Timeline(
  { project, selectedId, playhead, onSelect, onAddQuiz, onDeleteRequest },
  ref,
) {
  const items = sortedInteractions(project);
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = track.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lane = lanes(items.map((it) => frac(it.time, project.duration) * width));
  const rows = Math.max(1, ...lane.map((l) => l + 1));
  const stop = items.some((i) => i.id === selectedId) ? selectedId : items[0]?.id;

  const go = (id: string) => {
    onSelect(id);
    track.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
    if (to !== undefined) {
      e.preventDefault();
      go(items[Math.min(items.length - 1, Math.max(0, to))]!.id);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onDeleteRequest(items[i]!.id, e.currentTarget);
    }
  };

  return (
    <div className="timeline-wrap">
      <h3 id="timeline-heading" className="section-label">Timeline</h3>
      <div className="timeline-row">
        <div ref={ref} role="group" aria-labelledby="timeline-heading" aria-describedby="timeline-hint" tabIndex={-1} className="timeline">
          {/* Checkpoints too close to fit side by side go up a row, so each stays visible and clickable. */}
          <div ref={track} className="timeline-track" style={{ ['--rows' as string]: rows }}>
            <div className="timeline-playhead" style={{ left: pct(playhead, project.duration) }} aria-hidden="true" />
            {items.map((it, i) => {
              const { key, Icon } = toolOf(it.type);
              const selected = it.id === selectedId;
              return (
                <button
                  key={it.id}
                  type="button"
                  data-id={it.id}
                  className={`node tool-${key}${selected ? ' is-selected' : ''}`}
                  style={{ left: pct(it.time, project.duration), ['--lane' as string]: lane[i] }}
                  aria-label={checkpointName(project, it)}
                  aria-current={selected ? 'true' : undefined}
                  aria-describedby="timeline-hint"
                  tabIndex={it.id === stop ? 0 : -1}
                  onClick={() => onSelect(it.id)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <Icon />
                </button>
              );
            })}
          </div>
        </div>
        <button type="button" className="btn btn-secondary node-add" aria-label="Add a quiz question at the playhead" title="Add a quiz question at the playhead" onClick={onAddQuiz}>
          <IconPlus />
        </button>
      </div>
      <p id="timeline-hint" className="field-hint">
        {items.length ? 'Arrow keys move between checkpoints. Press Delete to remove the selected one.' : 'No checkpoints yet.'}
      </p>
    </div>
  );
});
