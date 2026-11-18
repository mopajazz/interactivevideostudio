import { describe, it, expect, vi } from 'vitest';
import { createScormClient } from '../src/client';

function fakeApi(over: Record<string, unknown> = {}) {
  return {
    LMSInitialize: vi.fn(() => 'true'),
    LMSGetValue: vi.fn(() => ''),
    LMSSetValue: vi.fn(() => 'true'),
    LMSCommit: vi.fn(() => 'true'),
    LMSFinish: vi.fn(() => 'true'),
    LMSGetLastError: vi.fn(() => '0'),
    ...over,
  };
}
type W = Record<string, unknown>;
function chain(api: unknown, depth: number) {
  const top: W = api ? { API: api } : {};
  top.parent = top;
  let cur = top;
  for (let i = 0; i < depth; i++) {
    const child: W = { parent: cur };
    cur = child;
  }
  return cur as unknown as Window;
}

describe('createScormClient', () => {
  it('finds the API two levels up and sets score', () => {
    const api = fakeApi();
    const c = createScormClient(chain(api, 2));
    expect(c.connected).toBe(true);
    c.init();
    c.setScore(8, 0, 10);
    expect(api.LMSInitialize).toHaveBeenCalledWith('');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '8');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.min', '0');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.max', '10');
  });

  it('rounds scores to two decimals', () => {
    const api = fakeApi();
    const c = createScormClient(chain(api, 0));
    c.setScore(6.666666, 0, 10.004);
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '6.67');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.max', '10');
  });

  it('sets status', () => {
    const api = fakeApi();
    const c = createScormClient(chain(api, 1));
    c.setStatus('passed');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.lesson_status', 'passed');
  });

  it('gets and sets suspend data and commits', () => {
    const api = fakeApi({ LMSGetValue: vi.fn(() => 'v1|0|0|') });
    const c = createScormClient(chain(api, 1));
    expect(c.getSuspend()).toBe('v1|0|0|');
    expect(api.LMSGetValue).toHaveBeenCalledWith('cmi.suspend_data');
    c.setSuspend('abc');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.suspend_data', 'abc');
    c.commit();
    expect(api.LMSCommit).toHaveBeenCalledWith('');
  });

  it('is a safe no-op when no API exists', () => {
    const c = createScormClient(chain(null, 3));
    expect(c.connected).toBe(false);
    expect(() => {
      c.init();
      c.setScore(1, 0, 2);
      c.setStatus('failed');
      c.setSuspend('x');
      c.commit();
      c.finish();
    }).not.toThrow();
    expect(c.getSuspend()).toBe('');
  });

  it('treats a cross-origin throw on a parent as not found for that level', () => {
    const api = fakeApi();
    const top: W = { API: api };
    top.parent = top;
    const blocked = {} as W;
    Object.defineProperty(blocked, 'API', { get() { throw new DOMException('blocked', 'SecurityError'); } });
    blocked.parent = top;
    const c = createScormClient({ parent: blocked } as unknown as Window);
    expect(c.connected).toBe(true);
    const onlyBlocked = {} as W;
    Object.defineProperty(onlyBlocked, 'API', { get() { throw new Error('x'); } });
    onlyBlocked.parent = onlyBlocked;
    expect(createScormClient(onlyBlocked as unknown as Window).connected).toBe(false);
  });

  it('stops when parent is the window itself and does not loop forever', () => {
    const w: W = {};
    w.parent = w;
    expect(createScormClient(w as unknown as Window).connected).toBe(false);
  });

  it('walks at most 10 parents', () => {
    const api = fakeApi();
    expect(createScormClient(chain(api, 10)).connected).toBe(true);
    expect(createScormClient(chain(api, 11)).connected).toBe(false);
  });

  it('works with a real jsdom window', () => {
    const api = fakeApi();
    (window as unknown as W).API = api;
    expect(createScormClient(window).connected).toBe(true);
    delete (window as unknown as W).API;
  });

  it('swallows "false" results and thrown errors', () => {
    const api = fakeApi({
      LMSInitialize: vi.fn(() => 'false'),
      LMSSetValue: vi.fn(() => 'false'),
      LMSCommit: vi.fn(() => 'false'),
      LMSFinish: vi.fn(() => { throw new Error('boom'); }),
      LMSGetValue: vi.fn(() => { throw new Error('boom'); }),
    });
    const c = createScormClient(chain(api, 1));
    expect(() => {
      c.init();
      c.setScore(1, 0, 2);
      c.setStatus('completed');
      c.setSuspend('x');
      c.commit();
      c.finish();
    }).not.toThrow();
    expect(c.getSuspend()).toBe('');
  });

  it('init and finish are idempotent, and finish needs init', () => {
    const api = fakeApi();
    const c = createScormClient(chain(api, 1));
    c.finish();
    expect(api.LMSFinish).not.toHaveBeenCalled();
    c.init();
    c.init();
    expect(api.LMSInitialize).toHaveBeenCalledTimes(1);
    c.finish();
    c.finish();
    expect(api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('makes no LMS calls after finish()', () => {
    const api = fakeApi();
    const c = createScormClient(chain(api, 0));
    c.init();
    c.finish();
    api.LMSSetValue.mockClear();
    api.LMSCommit.mockClear();
    api.LMSGetValue.mockClear();
    c.commit();
    c.setScore(1, 0, 2);
    c.setStatus('passed');
    c.setSuspend('x');
    c.finish();
    expect(api.LMSCommit).not.toHaveBeenCalled();
    expect(api.LMSSetValue).not.toHaveBeenCalled();
    expect(api.LMSFinish).toHaveBeenCalledTimes(1);
  });
});
