export type LessonStatus = 'passed' | 'failed' | 'incomplete' | 'completed';

export interface ScormClient {
  /** True while an LMS API was found and has not refused LMSInitialize. */
  connected: boolean;
  init(): void;
  setScore(raw: number, min: number, max: number): void;
  setStatus(s: LessonStatus): void;
  /** cmi.core.lesson_status as the LMS has it now ('' when unknown). */
  getStatus(): string;
  getSuspend(): string;
  setSuspend(s: string): void;
  /** cmi.core.exit: 'suspend' keeps the attempt open for resume, '' ends it normally. */
  setExit(v: '' | 'suspend'): void;
  /** cmi.core.session_time, from seconds spent in this session. */
  setSessionTime(seconds: number): void;
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

/** Reads a property of another window; a cross-origin throw counts as "not there". */
function prop(w: unknown, key: 'API' | 'parent' | 'opener'): unknown {
  try {
    return (w as Record<string, unknown> | null)?.[key] ?? null;
  } catch {
    return null;
  }
}

function readApi(w: unknown): Scorm12Api | null {
  const api = prop(w, 'API') as Scorm12Api | null;
  try {
    return api && typeof api.LMSInitialize === 'function' ? api : null;
  } catch {
    return null;
  }
}

/** The window and up to MAX_DEPTH parents. */
function findInParents(win: unknown): Scorm12Api | null {
  let cur: unknown = win;
  for (let i = 0; i <= MAX_DEPTH && cur; i++) {
    const api = readApi(cur);
    if (api) return api;
    const parent = prop(cur, 'parent');
    if (!parent || parent === cur) return null;
    cur = parent;
  }
  return null;
}

/** The SCORM 1.2 search: this window's parents, then each opener (up to MAX_DEPTH of them) and its parents. */
function findApi(win: Window): Scorm12Api | null {
  const seen = new Set<unknown>();
  let cur: unknown = win;
  for (let i = 0; i <= MAX_DEPTH && cur && !seen.has(cur); i++) {
    seen.add(cur);
    const api = findInParents(cur);
    if (api) return api;
    cur = prop(cur, 'opener');
  }
  return null;
}

/** `?scormdebug=1` on the launch page's URL turns on a console trace of every LMS call. */
function debugWanted(win: Window): boolean {
  try {
    return new URLSearchParams(String(win.location?.search ?? '')).get('scormdebug') === '1';
  } catch {
    return false;
  }
}

const round2 = (n: number): string => String(Math.round((Number.isFinite(n) ? n : 0) * 100) / 100);

/** SCORM 1.2 CMITimespan: HHHH:MM:SS.SS, zero padded, never negative, at most 9999:59:59.99. */
export function formatSessionTime(seconds: number): string {
  const MAX = 9999 * 360000 + 59 * 6000 + 5999; // in hundredths
  const cs = Number.isNaN(seconds) ? 0 : Math.min(MAX, Math.max(0, Math.round(seconds * 100)));
  const hh = Math.floor(cs / 360000);
  const mm = Math.floor((cs % 360000) / 6000);
  const ss = Math.floor((cs % 6000) / 100);
  const hs = cs % 100;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(hh, 4)}:${p(mm)}:${p(ss)}.${p(hs)}`;
}

function noop(): ScormClient {
  return {
    connected: false,
    init() {},
    setScore() {},
    setStatus() {},
    getStatus: () => '',
    getSuspend: () => '',
    setSuspend() {},
    setExit() {},
    setSessionTime() {},
    commit() {},
    finish() {},
  };
}

export function createScormClient(win: Window): ScormClient {
  const api = findApi(win);
  if (!api) return noop();
  const debug = debugWanted(win);
  let inited = false;
  let finished = false;
  let refused = false; // LMSInitialize said "false" (or threw): talk to the LMS no more
  const live = () => !finished && !refused;

  /** Calls the LMS; an LMS failure ("false" result or a throw) never breaks the learner's flow. */
  const call = (name: keyof Scorm12Api, args: string[], fallback: string): string => {
    let out: string;
    let threw = false;
    try {
      out = (api[name] as (...a: string[]) => string)(...args);
    } catch (e) {
      out = fallback;
      threw = true;
      if (debug) console.debug('[scorm]', `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`, 'threw', e);
    }
    if (debug) {
      if (!threw) console.debug('[scorm]', `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`, '->', JSON.stringify(out));
      if (threw || String(out) === 'false') {
        let code = '';
        try {
          code = String(api.LMSGetLastError());
        } catch {
          code = '(LMSGetLastError threw)';
        }
        console.debug('[scorm]', 'LMSGetLastError() ->', code);
      }
    }
    return out;
  };
  const set = (k: string, v: string) => void (live() && call('LMSSetValue', [k, String(v)], ''));
  const get = (k: string): string => {
    if (!live()) return '';
    const v = call('LMSGetValue', [k], '');
    return typeof v === 'string' && v !== 'false' ? v : '';
  };

  const client: ScormClient = {
    connected: true,
    init() {
      if (inited) return;
      inited = true;
      const ok = call('LMSInitialize', [''], 'false');
      if (String(ok) === 'false') {
        refused = true;
        client.connected = false;
      }
    },
    setScore(raw, min, max) {
      set('cmi.core.score.raw', round2(raw));
      set('cmi.core.score.min', round2(min));
      set('cmi.core.score.max', round2(max));
    },
    setStatus(s) {
      set('cmi.core.lesson_status', s);
    },
    getStatus: () => get('cmi.core.lesson_status'),
    getSuspend: () => get('cmi.suspend_data'),
    setSuspend(s) {
      set('cmi.suspend_data', s);
    },
    setExit(v) {
      set('cmi.core.exit', v);
    },
    setSessionTime(seconds) {
      set('cmi.core.session_time', formatSessionTime(seconds));
    },
    commit() {
      if (!live()) return; // nothing may follow LMSFinish (SCORM 1.2 error 301)
      call('LMSCommit', [''], '');
    },
    finish() {
      if (!inited || !live()) return;
      finished = true;
      call('LMSFinish', [''], '');
    },
  };
  return client;
}
