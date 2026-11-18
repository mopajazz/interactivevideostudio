import type { Project, SuspendState } from '@ivt/schema';
import type { mount } from '@ivt/player';
import { createScormClient } from './client';
import { decodeSuspend, encodeSuspend } from './suspend';

/** Runs fn and swallows any failure: SCORM trouble must never break the player. */
function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    /* ignore */
  }
}

/** Wires the player to the LMS: resume from suspend_data, report progress, score and completion. */
export function start(win: Window, doc: Document, project: Project, mountFn: typeof mount): void {
  const ids = project.interactions.map((i) => i.id);
  const client = createScormClient(win);
  guard(() => client.init());

  let initial: SuspendState | null = null;
  try {
    initial = decodeSuspend(client.getSuspend(), ids);
  } catch {
    initial = null;
  }

  let submitted = initial?.submitted === true;
  let finished = false;
  let last: SuspendState = initial ?? { furthest: 0, answers: {}, submitted: false };

  const root = doc.getElementById('ivt-root');
  if (!root) throw new Error('Missing #ivt-root element');

  mountFn(root, project, {
    initial: initial ?? undefined,
    onProgress(state) {
      if (finished) return;
      last = state;
      guard(() => client.setSuspend(encodeSuspend(state, ids)));
      guard(() => {
        if (!submitted) client.setStatus('incomplete');
      });
      guard(() => client.commit());
    },
    onResult(result) {
      if (finished) return;
      submitted = true;
      guard(() => {
        if (result.scored) client.setScore(result.raw, 0, result.max);
      });
      guard(() => client.setStatus(result.status));
      guard(() => client.setSuspend(encodeSuspend({ ...last, submitted: true }, ids)));
      guard(() => client.commit());
      finished = true;
      guard(() => client.finish());
    },
  });

  win.addEventListener('pagehide', () => {
    if (finished) return; // already committed and finished by onResult
    guard(() => client.commit());
    finished = true;
    guard(() => client.finish());
  });
}
