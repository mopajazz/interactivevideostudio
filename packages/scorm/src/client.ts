export type LessonStatus = 'passed' | 'failed' | 'incomplete' | 'completed';

export interface ScormClient {
  connected: boolean;
  init(): void;
  setScore(raw: number, min: number, max: number): void;
  setStatus(s: LessonStatus): void;
  getSuspend(): string;
  setSuspend(s: string): void;
  commit(): void;
  finish(): void;
}

interface Scorm12Api {
  LMSInitialize(arg: string): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(arg: string): string;
  LMSFinish(arg: string): string;
  LMSGetLastError(): string;
}

const MAX_DEPTH = 10;

function readApi(w: unknown): Scorm12Api | null {
  try {
    const api = (w as { API?: Scorm12Api } | null)?.API;
    return api && typeof api.LMSInitialize === 'function' ? api : null;
  } catch {
    return null; // cross-origin: treat as not found for this level
  }
}

function readParent(w: unknown): unknown {
  try {
    return (w as { parent?: unknown } | null)?.parent ?? null;
  } catch {
    return null;
  }
}

function findApi(win: Window): Scorm12Api | null {
  let cur: unknown = win;
  for (let i = 0; i <= MAX_DEPTH && cur; i++) {
    const api = readApi(cur);
    if (api) return api;
    const parent = readParent(cur);
    if (!parent || parent === cur) return null;
    cur = parent;
  }
  return null;
}

const round2 = (n: number): string => String(Math.round((Number.isFinite(n) ? n : 0) * 100) / 100);

function noop(): ScormClient {
  return {
    connected: false,
    init() {},
    setScore() {},
    setStatus() {},
    getSuspend: () => '',
    setSuspend() {},
    commit() {},
    finish() {},
  };
}

export function createScormClient(win: Window): ScormClient {
  const api = findApi(win);
  if (!api) return noop();
  let inited = false;
  let finished = false;
  // An LMS failure ("false" result or a throw) must never break the learner's flow.
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch {
      return fallback;
    }
  };
  const set = (k: string, v: string) => void (!finished && safe(() => api.LMSSetValue(k, String(v)), ''));
  return {
    connected: true,
    init() {
      if (inited) return;
      inited = true;
      safe(() => api.LMSInitialize(''), '');
    },
    setScore(raw, min, max) {
      set('cmi.core.score.raw', round2(raw));
      set('cmi.core.score.min', round2(min));
      set('cmi.core.score.max', round2(max));
    },
    setStatus(s) {
      set('cmi.core.lesson_status', s);
    },
    getSuspend: () => {
      const v = safe(() => api.LMSGetValue('cmi.suspend_data'), '');
      return typeof v === 'string' && v !== 'false' ? v : '';
    },
    setSuspend(s) {
      set('cmi.suspend_data', s);
    },
    commit() {
      if (finished) return; // nothing may follow LMSFinish (SCORM 1.2 error 301)
      safe(() => api.LMSCommit(''), '');
    },
    finish() {
      if (!inited || finished) return;
      finished = true;
      safe(() => api.LMSFinish(''), '');
    },
  };
}
