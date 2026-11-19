import { describe, it, expect, vi } from 'vitest';
import type { Project, SuspendState } from '@ivt/schema';
import type { mount } from '@ivt/player';
import { start } from '../src/launch';
import { decodeProjectSuspend, encodeProjectSuspend, encodeSuspend } from '../src/suspend';

const project: Project = {
  version: 1,
  title: 't',
  videoId: 'dQw4w9WgXcQ',
  duration: 10,
  settings: { disableForwardScrubbing: false, masteryPercent: 80 },
  interactions: [
    { id: 'a', type: 'trueFalse', time: 1, order: 0, promptHtml: 'x', choices: [{ id: 'c1', html: 'T', correct: true }] },
    { id: 'b', type: 'text', time: 2, order: 1, promptHtml: 'y' },
  ],
};
const enc = (st: SuspendState) => encodeProjectSuspend(st, project.interactions);

function setup(opts: { api?: boolean; suspend?: string; status?: string; apiOver?: Record<string, unknown> } = {}) {
  const api = {
    LMSInitialize: vi.fn(() => 'true'),
    LMSGetValue: vi.fn((k: string) => (k === 'cmi.core.lesson_status' ? opts.status ?? 'not attempted' : opts.suspend ?? '')),
    LMSSetValue: vi.fn(() => 'true'),
    LMSCommit: vi.fn(() => 'true'),
    LMSFinish: vi.fn(() => 'true'),
    LMSGetLastError: vi.fn(() => '0'),
    ...opts.apiOver,
  };
  const parent: Record<string, unknown> = opts.api === false ? {} : { API: api };
  parent.parent = parent;
  const doc = document.implementation.createHTMLDocument('x');
  doc.body.innerHTML = '<div id="ivt-root"></div>';
  const listeners: Record<string, () => void> = {};
  const win = { parent, addEventListener: (n: string, f: () => void) => (listeners[n] = f) } as unknown as Window;
  let clock = 0;
  const tick = (ms: number) => (clock += ms);
  let captured: Parameters<typeof mount> | null = null;
  const mountFn = vi.fn((...a: Parameters<typeof mount>) => {
    captured = a;
    return { destroy() {} };
  }) as unknown as typeof mount;
  const run = () => start(win, doc, project, mountFn, { now: () => clock });
  const hide = () => {
    Object.defineProperty(doc, 'visibilityState', { value: 'hidden', configurable: true });
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { api, doc, win, mountFn, listeners, run, tick, hide, opts: () => captured![2]!, el: () => captured![0] };
}
const sets = (api: { LMSSetValue: { mock: { calls: unknown[][] } } }) => api.LMSSetValue.mock.calls.map((c) => [c[0], c[1]]);
const state = (over: Partial<SuspendState> = {}): SuspendState => ({ furthest: 4, answers: { a: ['c1'] }, submitted: false, ...over });
const result = { raw: 1, max: 2, percent: 50, passed: false, scored: true, status: 'failed' as const };

describe('start', () => {
  it('mounts into #ivt-root with the project and inits SCORM', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    expect(s.api.LMSInitialize).toHaveBeenCalledWith('');
    expect(s.el()).toBe(s.doc.getElementById('ivt-root'));
    expect((s.mountFn as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]![1]).toBe(project);
    expect(s.opts().initial).toBeUndefined();
  });

  it('resumes from suspend_data', () => {
    const s = setup({ suspend: enc(state()) });
    start(s.win, s.doc, project, s.mountFn);
    expect(s.opts().initial).toEqual(state());
  });

  it('starts fresh when the fingerprint does not match', () => {
    const s = setup({ suspend: encodeSuspend(state(), ['a', 'zzz']) });
    start(s.win, s.doc, project, s.mountFn);
    expect(s.opts().initial).toBeUndefined();
  });

  it('onProgress (an answer) writes suspend_data, incomplete, and commits', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!(state(), 'answer');
    expect(sets(s.api)).toContainEqual(['cmi.suspend_data', enc(state())]);
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
    expect(s.api.LMSCommit).toHaveBeenCalled();
  });

  it('onProgress after submission does not revert status to incomplete', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onResult!(result);
    s.api.LMSSetValue.mockClear();
    s.opts().onProgress!(state({ submitted: true }));
    expect(sets(s.api).filter((c) => c[0] === 'cmi.core.lesson_status')).toEqual([]);
  });

  it('onResult writes score, status, submitted suspend, commits and finishes', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!(state());
    s.opts().onResult!(result);
    const w = sets(s.api);
    expect(w).toContainEqual(['cmi.core.score.raw', '50']);
    expect(w).toContainEqual(['cmi.core.score.min', '0']);
    expect(w).toContainEqual(['cmi.core.score.max', '100']);
    expect(w).toContainEqual(['cmi.core.lesson_status', 'failed']);
    expect(w).toContainEqual(['cmi.suspend_data', enc(state({ submitted: true }))]);
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
    const order = [...s.api.LMSSetValue.mock.invocationCallOrder, ...s.api.LMSCommit.mock.invocationCallOrder];
    expect(Math.max(...order)).toBeLessThan(s.api.LMSFinish.mock.invocationCallOrder[0]!);
  });

  it('unscored result writes status but no score', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onResult!({ raw: 0, max: 0, percent: 100, passed: true, scored: false, status: 'completed' });
    const w = sets(s.api);
    expect(w.map((c) => c[0])).not.toContain('cmi.core.score.raw');
    expect(w).toContainEqual(['cmi.core.lesson_status', 'completed']);
  });

  it('pagehide commits and finishes once', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.listeners.pagehide!();
    s.listeners.pagehide!();
    expect(s.api.LMSCommit).toHaveBeenCalled();
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('pagehide after result does not finish twice', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onResult!(result);
    s.listeners.pagehide!();
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('still mounts and works with no SCORM API', () => {
    const s = setup({ api: false });
    expect(() => start(s.win, s.doc, project, s.mountFn)).not.toThrow();
    expect(s.mountFn).toHaveBeenCalled();
    expect(() => s.opts().onProgress!(state())).not.toThrow();
    expect(() => s.opts().onResult!(result)).not.toThrow();
  });

  it('a throwing LMS never propagates', () => {
    const boom = () => {
      throw new Error('lms down');
    };
    const s = setup({ apiOver: { LMSSetValue: boom, LMSCommit: boom, LMSFinish: boom, LMSGetValue: boom } });
    expect(() => start(s.win, s.doc, project, s.mountFn)).not.toThrow();
    expect(() => s.opts().onProgress!(state())).not.toThrow();
    expect(() => s.opts().onResult!(result)).not.toThrow();
    expect(() => s.listeners.pagehide!()).not.toThrow();
  });

  const names = (m: { mock: { calls: unknown[][] } }) => m.mock.calls.length;

  it('a failing encodeSuspend still reports incomplete and commits', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    const bad = { furthest: 1, get answers(): never { throw new Error('x'); }, submitted: false } as unknown as SuspendState;
    expect(() => s.opts().onProgress!(bad, 'answer')).not.toThrow();
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
    expect(s.api.LMSCommit).toHaveBeenCalled();
  });

  it('a throwing setSuspend still reports incomplete and commits', () => {
    const s = setup({ apiOver: { LMSSetValue: vi.fn((k: string) => { if (k === 'cmi.suspend_data') throw new Error('x'); return 'true'; }) } });
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!(state(), 'answer');
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
    expect(s.api.LMSCommit).toHaveBeenCalled();
  });

  it('a throwing setScore still sets status, commits and finishes', () => {
    const s = setup({ apiOver: { LMSSetValue: vi.fn((k: string) => { if (k.startsWith('cmi.core.score')) throw new Error('x'); return 'true'; }) } });
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onResult!(result);
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'failed']);
    expect(s.api.LMSCommit).toHaveBeenCalled();
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('a failing encodeSuspend in onResult still sets status, commits and finishes', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!({ furthest: 1, get answers(): never { throw new Error('x'); }, submitted: false } as unknown as SuspendState);
    s.opts().onResult!(result);
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'failed']);
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('pagehide after onResult makes no LMS calls (nothing after LMSFinish)', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onResult!(result);
    const commits = names(s.api.LMSCommit);
    const setCount = names(s.api.LMSSetValue);
    s.listeners.pagehide!();
    s.opts().onProgress!(state({ submitted: true }));
    expect(names(s.api.LMSCommit)).toBe(commits);
    expect(names(s.api.LMSSetValue)).toBe(setCount);
    expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  describe('commit throttling (Ruling 20)', () => {
    const commits = (s: ReturnType<typeof setup>) => s.api.LMSCommit.mock.calls.length;

    it('2 minutes of playback reported every second commits at most a handful of times, but updates suspend_data each time', () => {
      const s = setup();
      s.run();
      for (let sec = 1; sec <= 120; sec++) {
        s.tick(1000);
        s.opts().onProgress!(state({ furthest: sec }), 'tick');
      }
      expect(commits(s)).toBeLessThanOrEqual(4);
      expect(commits(s)).toBeGreaterThanOrEqual(3); // at most once per 30 s, not never
      const suspends = sets(s.api).filter((c) => c[0] === 'cmi.suspend_data');
      expect(suspends).toHaveLength(120);
      expect(suspends.at(-1)![1]).toBe(enc(state({ furthest: 120 })));
    });

    it('never commits twice within 30 s for ticks, and a progress report without a reason counts as a tick', () => {
      const s = setup();
      s.run();
      s.tick(29_000);
      s.opts().onProgress!(state({ furthest: 1 }), 'tick');
      s.opts().onProgress!(state({ furthest: 2 }));
      expect(commits(s)).toBe(0);
      s.tick(1_000);
      s.opts().onProgress!(state({ furthest: 3 }), 'tick');
      expect(commits(s)).toBe(1);
      s.tick(29_999);
      s.opts().onProgress!(state({ furthest: 4 }), 'tick');
      expect(commits(s)).toBe(1);
    });

    it('commits at once when an answer is held or the video pauses', () => {
      const s = setup();
      s.run();
      s.opts().onProgress!(state(), 'answer');
      expect(commits(s)).toBe(1);
      s.opts().onProgress!(state(), 'pause');
      expect(commits(s)).toBe(2);
    });

    it('commits when the page is hidden, and on pagehide (then finishes)', () => {
      const s = setup();
      s.run();
      s.opts().onProgress!(state(), 'tick');
      expect(commits(s)).toBe(0);
      s.hide();
      expect(commits(s)).toBe(1);
      expect(s.api.LMSFinish).not.toHaveBeenCalled();
      s.listeners.pagehide!();
      expect(commits(s)).toBe(2);
      expect(s.api.LMSFinish).toHaveBeenCalledTimes(1);
    });

    it('a hidden page after Submit makes no calls (nothing after LMSFinish)', () => {
      const s = setup();
      s.run();
      s.opts().onResult!(result);
      const n = commits(s);
      s.hide();
      expect(commits(s)).toBe(n);
    });
  });

  describe('cmi.core.exit and cmi.core.session_time (Ruling 21)', () => {
    const calls = (s: ReturnType<typeof setup>) =>
      [...(s.api.LMSSetValue.mock.calls as unknown[][]).map((c, i) => ({ at: s.api.LMSSetValue.mock.invocationCallOrder[i]!, what: `${c[0]}=${c[1]}` })),
        ...s.api.LMSCommit.mock.invocationCallOrder.map((at) => ({ at, what: 'commit' })),
        ...s.api.LMSFinish.mock.invocationCallOrder.map((at) => ({ at, what: 'finish' }))]
        .sort((a, b) => a.at - b.at).map((c) => c.what);

    it('writes exit "suspend" and the session time before a commit while not submitted', () => {
      const s = setup();
      s.run();
      s.tick(65_250);
      s.opts().onProgress!(state(), 'pause');
      const seq = calls(s);
      const commit = seq.indexOf('commit');
      expect(seq.slice(0, commit)).toContain('cmi.core.exit=suspend');
      expect(seq.slice(0, commit)).toContain('cmi.core.session_time=0000:01:05.25');
    });

    it('on Submit writes exit "" and the session time, then commits, then finishes', () => {
      const s = setup();
      s.run();
      s.tick(3_600_000);
      s.opts().onResult!(result);
      const seq = calls(s);
      expect(seq.slice(-2)).toEqual(['commit', 'finish']);
      const before = seq.slice(0, -2);
      expect(before).toContain('cmi.core.exit=');
      expect(before).not.toContain('cmi.core.exit=suspend');
      expect(before).toContain('cmi.core.session_time=0001:00:00.00');
    });

    it('on pagehide before Submit writes exit "suspend" and the session time before commit and finish', () => {
      const s = setup();
      s.run();
      s.tick(1_500);
      s.listeners.pagehide!();
      const seq = calls(s);
      expect(seq.slice(-2)).toEqual(['commit', 'finish']);
      expect(seq).toContain('cmi.core.exit=suspend');
      expect(seq).toContain('cmi.core.session_time=0000:00:01.50');
    });

    it('a session resumed after submission exits with ""', () => {
      const s = setup({ suspend: enc(state({ submitted: true })) });
      s.run();
      s.listeners.pagehide!();
      expect(sets(s.api)).toContainEqual(['cmi.core.exit', '']);
      expect(sets(s.api)).not.toContainEqual(['cmi.core.exit', 'suspend']);
    });
  });

  describe('lesson_status never regresses (Ruling 23)', () => {
    it.each(['passed', 'failed', 'completed'])('when the LMS already has %s, progress never writes incomplete', (status) => {
      const s = setup({ status });
      s.run();
      expect(s.api.LMSGetValue).toHaveBeenCalledWith('cmi.core.lesson_status');
      s.opts().onProgress!(state(), 'answer');
      s.opts().onProgress!(state(), 'pause');
      s.listeners.pagehide!();
      expect(sets(s.api).filter((c) => c[0] === 'cmi.core.lesson_status')).toEqual([]);
    });

    it('a new result is still written over an earlier one', () => {
      const s = setup({ status: 'passed' });
      s.run();
      s.opts().onProgress!(state(), 'answer');
      s.opts().onResult!(result);
      expect(sets(s.api).filter((c) => c[0] === 'cmi.core.lesson_status')).toEqual([['cmi.core.lesson_status', 'failed']]);
    });

    it.each(['not attempted', 'incomplete', 'browsed', ''])('with %j it writes incomplete', (status) => {
      const s = setup({ status });
      s.run();
      s.opts().onProgress!(state(), 'answer');
      expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
    });
  });

  describe('fingerprint keys (Ruling 24)', () => {
    it('stores answers against id:type:choice keys, and resumes from them', () => {
      const s = setup();
      s.run();
      s.opts().onProgress!(state(), 'answer');
      const saved = sets(s.api).filter((c) => c[0] === 'cmi.suspend_data').at(-1)![1] as string;
      expect(saved).toBe(encodeSuspend({ furthest: 4, answers: { 'a:trueFalse:c1': ['c1'] }, submitted: false }, ['a:trueFalse:c1', 'b:text:']));
      expect(decodeProjectSuspend(saved, project.interactions)).toEqual(state());
      const again = setup({ suspend: saved });
      again.run();
      expect(again.opts().initial).toEqual(state());
    });

    it('state saved with the old id-only keys does not resume', () => {
      const s = setup({ suspend: encodeSuspend(state(), ['a', 'b']) });
      s.run();
      expect(s.opts().initial).toBeUndefined();
    });
  });
});

