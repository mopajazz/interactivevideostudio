import type { Project, SuspendState } from '@ivt/schema';
import type { mount } from '@ivt/player';
import { createScormClient } from './client';
import { decodeProjectSuspend, encodeProjectSuspend } from './suspend';

/** Runs fn and swallows any failure: SCORM trouble must never break the player. */
function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    /* ignore */
  }
}

/** New playback progress commits at most this often; answers, pauses and leaving the page commit at once. */
const TICK_COMMIT_MS = 30_000;
/** A status the learner already earned in this attempt: progress must never set it back to incomplete. */
const DONE = new Set(['passed', 'failed', 'completed']);

export type StartOptions = {
  /** Milliseconds, for the session time and the commit throttle. Default: performance.now (or Date.now). */
  now?: () => number;
};

/** Wires the player to the LMS: resume from suspend_data, report progress, score and completion. */
export function start(win: Window, doc: Document, project: Project, mountFn: typeof mount, o: StartOptions = {}): void {
  const now = o.now ?? (() => {
    try {
      return win.performance?.now?.() ?? Date.now();
    } catch {
      return Date.now();
    }
  });
  const startedAt = now();
  const items = project.interactions;
  const client = createScormClient(win);
  guard(() => client.init());

  let initial: SuspendState | null = null;
  try {
    initial = decodeProjectSuspend(client.getSuspend(), items);
  } catch {
    initial = null;
  }
  let prior = '';
  guard(() => { prior = client.getStatus(); });

  let submitted = initial?.submitted === true;
  let finished = false;
  let wroteIncomplete = false;
  let lastCommit = startedAt;
  let last: SuspendState = initial ?? { furthest: 0, answers: {}, submitted: false };

  const root = doc.getElementById('ivt-root');
  if (!root) throw new Error('Missing #ivt-root element');

  /** exit and session_time go with every commit and finish, so the LMS keeps the attempt open for resume. */
  const writeSession = () => {
    guard(() => client.setExit(submitted ? '' : 'suspend'));
    guard(() => client.setSessionTime((now() - startedAt) / 1000));
  };
  const commit = () => {
    if (finished) return;
    writeSession();
    lastCommit = now();
    guard(() => client.commit());
  };
  const finish = () => {
    if (finished) return;
    commit();
    finished = true;
    guard(() => client.finish());
  };

  mountFn(root, project, {
    initial: initial ?? undefined,
    onProgress(state, reason = 'tick') {
      if (finished) return;
      last = state;
      guard(() => client.setSuspend(encodeProjectSuspend(state, items)));
      guard(() => {
        if (!submitted && !wroteIncomplete && !DONE.has(prior)) {
          wroteIncomplete = true;
          client.setStatus('incomplete');
        }
      });
      if (reason === 'answer' || reason === 'pause' || (reason === 'tick' && now() - lastCommit >= TICK_COMMIT_MS)) commit();
    },
    onResult(result) {
      if (finished) return;
      submitted = true;
      guard(() => {
        if (result.scored) client.setScore(result.percent, 0, 100);
      });
      guard(() => client.setStatus(result.status));
      guard(() => client.setSuspend(encodeProjectSuspend({ ...last, submitted: true }, items)));
      // Finished right after Submit (Ruling 22): the result is in the LMS whatever the learner does next.
      finish();
    },
  });

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') commit();
  });
  win.addEventListener('pagehide', finish);
}
