import type { Interaction, Project, SuspendState } from '@ivt/schema';
import type { VideoAdapter } from './adapter';
import { YouTubeAdapter } from './YouTubeAdapter';
import { InteractionScheduler } from './scheduler';
import { ScoreState, isQuestion, type Result } from './scoring';
import { ScrubGuard } from './scrubGuard';
import { Announcer } from './ui/announcer';
import { buildCard } from './ui/card';
import { openModal } from './ui/dialog';
import { h } from './ui/dom';
import { buildErrorPanel } from './ui/errorPanel';
import { Playbar } from './ui/playbar';
import { buildFinal } from './ui/submit';
import './styles.css';

export type MountOptions = {
  adapter?: VideoAdapter;
  onResult?: (r: Result) => void;
  onProgress?: (s: SuspendState) => void;
  initial?: SuspendState;
  /** Maps an image interaction's imageAssetId to a URL. Default: `assets/<id>`. */
  assetUrl?: (id: string) => string;
  /**
   * Called when the learner presses Escape while any card is open (e.g. so a host's preview can close). The player
   * still closes only info cards itself; a scored question or the final screen stays until the learner acts.
   */
  onEscape?: () => void;
};

/** Seconds from the end that count as "at the end" (players stop a little short). */
const END_SLACK = 0.25;

export function mount(el: HTMLElement, project: Project, opts: MountOptions = {}): { destroy(): void } {
  const root = h('div', 'ivp-root');
  const stage = h('div', 'ivp-stage');
  const video = h('div', 'ivp-video');
  video.inert = true; // the embed is never a keyboard or pointer target: our playbar is the only control
  const layer = h('div', 'ivp-layer');
  layer.hidden = true;
  stage.append(video, layer);
  const announcer = new Announcer(root);
  const items = project.interactions;
  const questions = items.filter(isQuestion);
  const assetUrl = opts.assetUrl ?? ((id: string) => `assets/${encodeURIComponent(id)}`);

  const initial = opts.initial;
  const score = new ScoreState(items, project.settings.masteryPercent);
  for (const [id, ids] of Object.entries(initial?.answers ?? {})) score.setAnswer(id, ids);
  let result: Result | null = initial?.submitted ? score.submit() : null;
  const resumeFurthest = initial && Number.isFinite(initial.furthest) && initial.furthest >= 0 ? initial.furthest : undefined;
  const guard = new ScrubGuard({ enabled: project.settings.disableForwardScrubbing && !result, furthest: resumeFurthest });

  let scheduler: InteractionScheduler | null = null;
  let prev = -1; // so a checkpoint at time 0 is due on the first sample
  let queue: Interaction[] = [];
  let closeModal: (() => void) | null = null;
  let failed = false; // a fatal player error: the playbar stays disabled from then on
  let reportedFloor = Math.floor(guard.furthest);

  const playbar = new Playbar({
    onToggle: () => togglePlay(),
    onSeek: (t) => { adapter.seekTo(t); sample(adapter.getCurrentTime()); },
    onCaptions: (on) => adapter.setCaptions(on),
    onRate: (r) => adapter.setRate(r),
  });
  root.append(stage, playbar.el);
  el.append(root);

  const adapter = opts.adapter ?? new YouTubeAdapter(video, project.videoId);
  const duration = () => adapter.getDuration();

  const progress = () =>
    opts.onProgress?.({ furthest: guard.furthest, answers: score.getAnswers(), submitted: result !== null });

  /** Built once the real duration is known; resumed state marks what was already done as seen. */
  const ensureScheduler = () => {
    if (scheduler || duration() <= 0) return;
    scheduler = new InteractionScheduler(items, duration());
    const answers = score.getAnswers();
    for (const it of items) {
      const done = isQuestion(it)
        ? result !== null || it.id in answers
        : resumeFurthest !== undefined && it.time < resumeFurthest;
      if (done) scheduler.markSeen(it.id);
    }
  };

  /** Handles one time sample: scrub guard first, then due checkpoints. Returns false if it snapped back. */
  const sample = (t: number): boolean => {
    ensureScheduler();
    const snap = guard.update(t);
    if (snap !== null) {
      adapter.seekTo(snap);
      playbar.setTime(snap, duration());
      return false;
    }
    // A rate-limited snap returns null too: a sample still ahead of furthest is stale (the player has not
    // landed yet), so it must not move the slider or trigger checkpoints the learner has not watched.
    if (guard.isAhead(t)) return false;
    playbar.setTime(t, duration());
    if (Math.floor(guard.furthest) > reportedFloor) {
      reportedFloor = Math.floor(guard.furthest);
      progress();
    }
    if (!scheduler || closeModal) return true;
    const due = scheduler.due(prev, t);
    prev = t;
    if (due.length === 0) return true;
    due.forEach((it) => scheduler!.markSeen(it.id));
    queue.push(...due);
    adapter.pause();
    showNext();
    return true;
  };

  const atEnd = () => duration() > 0 && adapter.getCurrentTime() >= duration() - END_SLACK;

  /** Opens `card`; Escape closes it only if `dismiss` is given, and always tells the host (opts.onEscape). */
  const show = (card: HTMLElement, dismiss?: () => void) => {
    const onEscape = dismiss || opts.onEscape ? () => { dismiss?.(); opts.onEscape?.(); } : undefined;
    closeModal = openModal(layer, card, { background: [playbar.el], onEscape });
  };
  const hide = () => {
    closeModal?.(); // this makes the playbar live again...
    closeModal = null;
    if (failed) playbar.disable(); // ...unless the video can't play at all
  };

  const showNext = () => {
    hide();
    const it = queue.shift();
    if (!it) {
      if (atEnd()) return showFinal();
      if (failed) return stage.querySelector<HTMLElement>('.ivp-error a')?.focus();
      playbar.focusPlay();
      adapter.play();
      return;
    }
    const card = buildCard(it, {
      announcer,
      assetUrl,
      onAnswer: (ids) => { score.setAnswer(it.id, ids); progress(); },
      onDone: showNext,
    });
    show(card.el, card.escapable ? showNext : undefined);
    // The dialog's name already says what kind of card it is; only the pause needs saying.
    announcer.say('Video paused.');
  };

  const showFinal = () => {
    if (closeModal) return;
    const answers = score.getAnswers();
    show(buildFinal({
      scored: questions.length > 0,
      answered: questions.filter((q) => q.id in answers).length,
      total: questions.length,
      masteryPercent: project.settings.masteryPercent,
      result,
      announcer,
      submit: () => {
        result = score.submit();
        guard.release(); // rewatching after submission is free
        questions.forEach((q) => scheduler?.markSeen(q.id)); // nothing is re-scored
        opts.onResult?.(result);
        progress();
        return result;
      },
      rewatch: () => {
        hide();
        adapter.seekTo(0);
        prev = 0;
        playbar.setTime(0, duration());
        playbar.focusPlay();
      },
    }));
    // Nothing to announce: focus moves into the dialog, whose name is "End of video".
  };

  let playing = false;
  const togglePlay = () => {
    if (playing) return adapter.pause();
    sample(adapter.getCurrentTime()); // opens a card due now, e.g. at time 0
    if (!closeModal) adapter.play();
  };

  adapter.on('time', (t: number) => sample(t));
  adapter.on('state', (s: string) => {
    ensureScheduler();
    if (s === 'buffering') return playbar.setBuffering(true);
    playbar.setBuffering(false);
    playing = s === 'playing';
    playbar.setPlaying(playing);
    // A checkpoint just before the end may fall between polls: sample the end first.
    if (s === 'ended' && sample(duration())) showFinal();
  });
  adapter.on('error', (code: unknown) => {
    failed = true;
    adapter.pause();
    playbar.disable();
    stage.querySelector('.ivp-error')?.remove();
    stage.append(buildErrorPanel(code, project.videoId));
  });

  playbar.setTime(0, duration());

  return {
    destroy() {
      hide();
      adapter.destroy();
      root.remove();
    },
  };
}
