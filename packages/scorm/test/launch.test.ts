import { describe, it, expect, vi } from 'vitest';
import type { Project, SuspendState } from '@ivt/schema';
import type { mount } from '@ivt/player';
import { start } from '../src/launch';
import { encodeSuspend } from '../src/suspend';

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
const ids = ['a', 'b'];

function setup(opts: { api?: boolean; suspend?: string; apiOver?: Record<string, unknown> } = {}) {
  const api = {
    LMSInitialize: vi.fn(() => 'true'),
    LMSGetValue: vi.fn(() => opts.suspend ?? ''),
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
  let captured: Parameters<typeof mount> | null = null;
  const mountFn = vi.fn((...a: Parameters<typeof mount>) => {
    captured = a;
    return { destroy() {} };
  }) as unknown as typeof mount;
  return { api, doc, win, mountFn, listeners, opts: () => captured![2]!, el: () => captured![0] };
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
    const s = setup({ suspend: encodeSuspend(state(), ids) });
    start(s.win, s.doc, project, s.mountFn);
    expect(s.opts().initial).toEqual(state());
  });

  it('starts fresh when the fingerprint does not match', () => {
    const s = setup({ suspend: encodeSuspend(state(), ['a', 'zzz']) });
    start(s.win, s.doc, project, s.mountFn);
    expect(s.opts().initial).toBeUndefined();
  });

  it('onProgress writes suspend_data, incomplete, and commits', () => {
    const s = setup();
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!(state());
    expect(sets(s.api)).toContainEqual(['cmi.suspend_data', encodeSuspend(state(), ids)]);
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
    expect(w).toContainEqual(['cmi.suspend_data', encodeSuspend(state({ submitted: true }), ids)]);
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
    expect(() => s.opts().onProgress!(bad)).not.toThrow();
    expect(sets(s.api)).toContainEqual(['cmi.core.lesson_status', 'incomplete']);
    expect(s.api.LMSCommit).toHaveBeenCalled();
  });

  it('a throwing setSuspend still reports incomplete and commits', () => {
    const s = setup({ apiOver: { LMSSetValue: vi.fn((k: string) => { if (k === 'cmi.suspend_data') throw new Error('x'); return 'true'; }) } });
    start(s.win, s.doc, project, s.mountFn);
    s.opts().onProgress!(state());
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
});
