import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoAdapter } from '@ivt/player';
import type { Interaction, InteractionType, Project } from '@ivt/schema';
import { Drawer } from '../components/Drawer';
import { PreviewDialog } from '../components/PreviewDialog';
import { Scrubber } from '../components/Scrubber';
import { Timeline } from '../components/Timeline';
import { ToolBar } from '../components/ToolBar';
import {
  addInteraction, checkpointName, maxTime, moveInteraction, removeInteraction, sortedInteractions, updateInteraction,
} from '../interactions';
import type { Step } from '../storage/projectStore';
import { newAssetId } from '../storage/images';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconArrowLeft, IconArrowRight, IconEye } from '../ui/icons';
import type { VideoAdapters } from '../video/adapters';

type Props = {
  project: Project;
  onChange: (update: (p: Project) => Project) => void;
  assets: Map<string, Blob>;
  addAsset: (id: string, blob: Blob) => Promise<void>;
  removeAsset: (id: string) => Promise<void>;
  adapters: VideoAdapters;
  onGo: (s: Step) => void;
};

type Focus = 'drawer' | 'timeline' | 'preview' | { node: string } | HTMLElement | null;

/** Step 2: tools across the top of the video, the scrubber, the timeline of checkpoints and the settings drawer. */
export function Interactions({ project, onChange, assets, addAsset, removeAsset, adapters, onGo }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(() => sortedInteractions(project)[0]?.id ?? null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; trigger: HTMLElement } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<VideoAdapter | null>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<Focus>(null);
  const latest = useRef(project);
  latest.current = project;

  const selected = project.interactions.find((i) => i.id === selectedId) ?? null;

  // The author's video. Its embed is inert: the scrubber below is the only way to control it.
  useEffect(() => {
    const el = host.current!;
    el.inert = true;
    const a = adapters.author(el, latest.current);
    adapter.current = a;
    a.on('time', (t: number) => setTime(t));
    a.on('state', (s: string) => setPlaying(s === 'playing'));
    return () => {
      a.destroy();
      adapter.current = null;
      el.replaceChildren();
    };
  }, [adapters, project.videoId]);

  // Focus moves once dialogs have closed (a modal dialog makes the rest of the page inert).
  useEffect(() => {
    const f = focusAfter.current;
    if (!f || deleting || previewing) return;
    focusAfter.current = null;
    if (f === 'drawer') {
      const field = drawer.current?.querySelector<HTMLElement>('[data-field]');
      (field?.querySelector<HTMLElement>('[contenteditable], input') ?? field)?.focus();
    } else if (f === 'timeline') timeline.current?.focus();
    else if (f === 'preview') previewButton.current?.focus();
    else if ('node' in f) timeline.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(f.node)}"]`)?.focus();
    else f.focus();
  });

  const now = () => adapter.current?.getCurrentTime() ?? time;

  const add = (type: InteractionType) => {
    adapter.current?.pause();
    const t = now();
    const id = addInteraction(project, type, t).interactions.at(-1)!.id;
    onChange((p) => addInteraction(p, type, t));
    setSelectedId(id);
    focusAfter.current = 'drawer';
  };

  const seek = (t: number) => {
    adapter.current?.seekTo(t);
    setTime(adapter.current?.getCurrentTime() ?? t);
  };

  const onPatch = useCallback((id: string, update: (it: Interaction) => Interaction) => onChange((p) => updateInteraction(p, id, update)), [onChange]);
  const onTime = useCallback((id: string, t: number) => onChange((p) => moveInteraction(p, id, t)), [onChange]);
  const onMoveToPlayhead = useCallback((id: string) => {
    const t = adapter.current?.getCurrentTime() ?? 0;
    onChange((p) => moveInteraction(p, id, t));
  }, [onChange]);

  /** Drops an image no checkpoint uses any more. */
  const dropIfOrphan = useCallback((assetId: string | undefined, p: Project) => {
    if (assetId && !p.interactions.some((i) => i.imageAssetId === assetId)) void removeAsset(assetId);
  }, [removeAsset]);

  const onImage = useCallback(async (id: string, blob: Blob) => {
    const assetId = newAssetId(blob.type);
    await addAsset(assetId, blob);
    const old = latest.current.interactions.find((i) => i.id === id)?.imageAssetId;
    const next = updateInteraction(latest.current, id, { imageAssetId: assetId });
    onChange((p) => updateInteraction(p, id, { imageAssetId: assetId }));
    dropIfOrphan(old, next);
  }, [addAsset, onChange, dropIfOrphan]);

  const onDeleteRequest = useCallback((id: string, trigger: HTMLElement) => setDeleting({ id, trigger }), []);

  const confirmDelete = () => {
    if (!deleting) return;
    const order = sortedInteractions(project);
    const i = order.findIndex((x) => x.id === deleting.id);
    const neighbour = order[i + 1] ?? order[i - 1];
    const gone = order[i];
    const next = removeInteraction(project, deleting.id);
    onChange((p) => removeInteraction(p, deleting.id));
    dropIfOrphan(gone?.imageAssetId, next);
    setSelectedId(neighbour?.id ?? null);
    focusAfter.current = neighbour ? { node: neighbour.id } : 'timeline';
    setDeleting(null);
  };

  const openPreview = () => {
    adapter.current?.pause();
    setPreviewing(true);
  };

  const deletingIt = deleting && project.interactions.find((i) => i.id === deleting.id);

  return (
    <section className="panel" aria-labelledby="step-heading">
      <h2 id="step-heading" className="panel-title" tabIndex={-1}>Interactions</h2>
      <p className="panel-lead">Play or scrub to a moment, then choose a tool to add a checkpoint there. Each one pauses the video.</p>

      <div className="stage">
        <ToolBar onAdd={add} />
        <div ref={host} className="author-video" data-testid="author-video" />
        <div className="stage-controls">
          <Scrubber
            time={time}
            duration={project.duration}
            playing={playing}
            onToggle={() => (playing ? adapter.current?.pause() : adapter.current?.play())}
            onSeek={seek}
          />
          <button ref={previewButton} type="button" className="btn btn-secondary btn-small" onClick={openPreview}>
            <IconEye />Preview as learner
          </button>
        </div>
        <Timeline
          ref={timeline}
          project={project}
          selectedId={selectedId}
          playhead={time}
          onSelect={setSelectedId}
          onAddQuiz={() => add('multipleChoice')}
          onDeleteRequest={onDeleteRequest}
        />
      </div>

      {selected ? (
        <Drawer
          key={selected.id}
          ref={drawer}
          it={selected}
          name={checkpointName(project, selected)}
          maxTime={maxTime(project)}
          image={selected.imageAssetId ? assets.get(selected.imageAssetId) : undefined}
          onPatch={onPatch}
          onTime={onTime}
          onMoveToPlayhead={onMoveToPlayhead}
          onImage={onImage}
          onDeleteRequest={onDeleteRequest}
        />
      ) : (
        <p className="empty-state">Add your first checkpoint with a tool above</p>
      )}

      <div className="panel-footer">
        <button type="button" className="btn btn-secondary" onClick={() => onGo(1)}>
          <IconArrowLeft />Back: Setup
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onGo(3)}>
          Next: Scoring &amp; export<IconArrowRight />
        </button>
      </div>

      {deleting && deletingIt && (
        <ConfirmDialog
          title="Delete this checkpoint?"
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => {
            focusAfter.current = deleting.trigger;
            setDeleting(null);
          }}
        >
          <p>{checkpointName(project, deletingIt)} and its settings will be removed. This can't be undone.</p>
        </ConfirmDialog>
      )}
      {previewing && (
        <PreviewDialog
          project={project}
          assets={assets}
          adapters={adapters}
          onClose={() => {
            focusAfter.current = 'preview';
            setPreviewing(false);
          }}
        />
      )}
    </section>
  );
}
