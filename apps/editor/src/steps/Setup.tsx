import { useEffect, useRef, useState } from 'react';
import { parseYouTubeId, type Project } from '@ivt/schema';
import { formatDuration, isoDuration } from '../format';
import { watchUrl } from '../project';
import { fetchVideoInfo as realFetchVideoInfo, type FetchVideoInfo, type VideoInfo } from '../video/info';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { IconAlert, IconArrowRight, IconCheck, IconRefresh, IconSpinner } from '../ui/icons';

type Check = 'idle' | 'checking' | 'ok' | 'embed-disabled' | 'unavailable';

type Props = {
  project: Project;
  onChange: (update: (p: Project) => Project) => void;
  onNext: () => void;
  fetchVideoInfo?: FetchVideoInfo;
};

export const BAD_LINK = "That doesn't look like a YouTube link";
const EMBED_OFF = "This video's owner doesn't allow it to be played on other sites. Choose a different video.";
const UNAVAILABLE = "We couldn't load this video. It may be private or removed, or YouTube may be unreachable.";

/** Step 1: a YouTube link and a title, nothing else. Learns the duration and checks the video can be embedded. */
export function Setup({ project, onChange, onNext, fetchVideoInfo = realFetchVideoInfo }: Props) {
  const [text, setText] = useState(project.videoId ? watchUrl(project.videoId) : '');
  const [touched, setTouched] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [check, setCheck] = useState<Check>(project.videoId && project.duration > 0 ? 'ok' : 'idle');
  // A restored project whose duration is known was already checked; don't ask YouTube again.
  const verified = useRef(project.duration > 0 ? project.videoId : '');
  const inflight = useRef<{ key: string; promise: Promise<VideoInfo> } | null>(null);
  const urlInput = useRef<HTMLInputElement>(null);
  // A different video for a project that already has checkpoints, waiting for the author to confirm.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { videoId } = project;
  const checkpoints = project.interactions.length;

  useEffect(() => {
    if (!videoId) return setCheck('idle');
    if (verified.current === videoId) return setCheck('ok');
    let live = true;
    setCheck('checking');
    // Reuse one request per (video, attempt), so a re-run effect never asks twice.
    const key = `${videoId}#${attempt}`;
    if (inflight.current?.key !== key) inflight.current = { key, promise: fetchVideoInfo(videoId) };
    inflight.current.promise.then((r) => {
      if (!live) return;
      const ok = !('error' in r) && r.embeddable && r.duration > 0;
      if (ok) verified.current = videoId;
      setCheck(ok ? 'ok' : 'error' in r ? r.error : 'embed-disabled');
      onChange((p) => (p.videoId === videoId ? { ...p, duration: ok ? r.duration : 0 } : p));
    });
    return () => { live = false; };
  }, [videoId, attempt, fetchVideoInfo, onChange]);

  const useVideo = (id: string) => onChange((p) => ({ ...p, videoId: id, duration: 0 }));
  const setUrl = (value: string) => {
    setText(value);
    const id = parseYouTubeId(value) ?? '';
    if (id === videoId) return;
    // With checkpoints, only a complete, different link changes the video, and only once confirmed.
    if (!checkpoints) useVideo(id);
    else if (id) setPendingId(id);
  };
  const closeConfirm = (change: boolean) => {
    if (change && pendingId) useVideo(pendingId);
    else setText(videoId ? watchUrl(videoId) : '');
    setPendingId(null);
    refocus.current = true;
  };
  // ConfirmDialog leaves focus to its caller: back to the link once the dialog has closed.
  const refocus = useRef(false);
  useEffect(() => {
    if (pendingId || !refocus.current) return;
    refocus.current = false;
    urlInput.current?.focus();
  });

  const badLink = touched && text.trim() !== '' && !parseYouTubeId(text);
  const urlInvalid = badLink || check === 'embed-disabled' || check === 'unavailable';
  const titleMissing = !project.title.trim();
  const reason = nextReason(!videoId, check, titleMissing);

  return (
    <section className="panel" aria-labelledby="step-heading">
      <h2 id="step-heading" className="panel-title" tabIndex={-1}>Setup</h2>
      <p className="panel-lead">Start with a YouTube video and a title. You'll add interactions in the next step.</p>

      <div className="field">
        <label htmlFor="setup-url" className="field-label">YouTube link</label>
        <p id="setup-url-hint" className="field-hint">Paste the video's address, like https://www.youtube.com/watch?v=…</p>
        <input
          ref={urlInput}
          id="setup-url"
          className="input"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={urlInvalid || undefined}
          aria-describedby="setup-url-hint setup-url-msg"
          onChange={(e) => setUrl(e.target.value)}
          onPaste={() => setTouched(true)}
          onBlur={() => setTouched(true)}
        />
        {/* Always rendered (never display:none), so a message inserted later is announced. */}
        {/* The id is on the always-present region, so aria-describedby never points at nothing. */}
        <div id="setup-url-msg" role="status" className="field-status" data-testid="url-status">
          <UrlMessage badLink={badLink} check={check} duration={project.duration} />
        </div>
        {check === 'unavailable' && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => setAttempt((a) => a + 1)}>
            <IconRefresh />Check again
          </button>
        )}
      </div>

      <div className="field">
        <label htmlFor="setup-title" className="field-label">Title</label>
        <p id="setup-title-hint" className="field-hint">Learners see this as the activity's name.</p>
        <input
          id="setup-title"
          className="input"
          type="text"
          maxLength={200}
          value={project.title}
          aria-describedby="setup-title-hint"
          onChange={(e) => {
            const title = e.target.value;
            onChange((p) => ({ ...p, title }));
          }}
        />
      </div>

      <div className="panel-footer">
        {reason && <p id="next-reason" className="next-reason" data-testid="next-reason">{reason}</p>}
        <button
          type="button"
          className="btn btn-primary"
          aria-disabled={reason ? true : undefined}
          aria-describedby={reason ? 'next-reason' : undefined}
          onClick={() => !reason && onNext()}
        >
          Next: Interactions<IconArrowRight />
        </button>
      </div>
      {pendingId && (
        <ConfirmDialog title="Change the video?" confirmLabel="Change video" onConfirm={() => closeConfirm(true)} onCancel={() => closeConfirm(false)}>
          <p>
            {checkpoints === 1
              ? 'Your 1 checkpoint stays at its time in the new video, so check that it still fits.'
              : `Your ${checkpoints} checkpoints stay at their times in the new video, so check that each one still fits.`}
            {' '}To keep the current video, choose Cancel.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

function UrlMessage({ badLink, check, duration }: { badLink: boolean; check: Check; duration: number }) {
  if (badLink) return <p className="msg msg-error"><IconAlert />{BAD_LINK}</p>;
  switch (check) {
    case 'checking':
      return <p className="msg msg-info"><IconSpinner />Checking the video…</p>;
    case 'ok':
      return (
        <p className="msg msg-ok">
          <IconCheck />Video found<span className="pill">Length <time dateTime={isoDuration(duration)}>{formatDuration(duration)}</time></span>
        </p>
      );
    case 'embed-disabled':
      return <p className="msg msg-error"><IconAlert />{EMBED_OFF}</p>;
    case 'unavailable':
      return <p className="msg msg-error"><IconAlert />{UNAVAILABLE}</p>;
    default:
      return null;
  }
}

function nextReason(noVideo: boolean, check: Check, noTitle: boolean): string | null {
  const title = noTitle ? ' and a title' : '';
  if (noVideo) return `To continue, add a YouTube link${title}.`;
  if (check === 'checking') return `To continue, wait for the video check to finish${noTitle ? ' and add a title' : ''}.`;
  if (check === 'embed-disabled') return 'To continue, choose a video that can be embedded.';
  if (check === 'unavailable') return 'To continue, use a video that can be loaded.';
  if (noTitle) return 'To continue, add a title.';
  return null;
}
