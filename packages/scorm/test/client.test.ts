import { describe, it, expect, vi } from 'vitest';
import { createScormClient, formatSessionTime } from '../src/client';

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

  it('writes cmi.core.exit and cmi.core.session_time, and reads lesson_status', () => {
    const api = fakeApi({ LMSGetValue: vi.fn((k: string) => (k === 'cmi.core.lesson_status' ? 'passed' : '')) });
    const c = createScormClient(chain(api, 0));
    c.init();
    expect(c.getStatus()).toBe('passed');
    expect(api.LMSGetValue).toHaveBeenCalledWith('cmi.core.lesson_status');
    c.setExit('suspend');
    c.setExit('');
    c.setSessionTime(3723.456);
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.exit', 'suspend');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.exit', '');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.session_time', '0001:02:03.46');
  });

  it('getStatus is "" with no API or a failing read', () => {
    expect(createScormClient(chain(null, 0)).getStatus()).toBe('');
    const api = fakeApi({ LMSGetValue: vi.fn(() => { throw new Error('x'); }) });
    expect(createScormClient(chain(api, 0)).getStatus()).toBe('');
  });

  describe('API discovery through window.opener', () => {
    it('finds the API on the opener (a popup launched by the LMS)', () => {
      const api = fakeApi();
      const lms: W = { API: api };
      lms.parent = lms;
      const popup: W = { opener: lms };
      popup.parent = popup;
      expect(createScormClient(popup as unknown as Window).connected).toBe(true);
    });

    it('finds the API in a parent of the opener, and of an opener of the opener', () => {
      const api = fakeApi();
      const top: W = { API: api };
      top.parent = top;
      const frame: W = { parent: top };
      const popup1: W = { opener: frame };
      popup1.parent = popup1;
      const popup2: W = { opener: popup1 };
      popup2.parent = popup2;
      expect(createScormClient(popup2 as unknown as Window).connected).toBe(true);
    });

    it('is bounded, survives a cross-origin opener, and does not loop on an opener cycle', () => {
      const a: W = {};
      a.parent = a;
      const b: W = { opener: a };
      b.parent = b;
      a.opener = b; // cycle
      expect(createScormClient(b as unknown as Window).connected).toBe(false);
      const blocked: W = {};
      Object.defineProperty(blocked, 'opener', { get() { throw new DOMException('blocked', 'SecurityError'); } });
      blocked.parent = blocked;
      expect(createScormClient(blocked as unknown as Window).connected).toBe(false);
      const api = fakeApi();
      let cur: W = { API: api };
      cur.parent = cur;
      for (let i = 0; i < 11; i++) {
        const next: W = { opener: cur };
        next.parent = next;
        cur = next;
      }
      expect(createScormClient(cur as unknown as Window).connected).toBe(false);
    });
  });

  describe('init honours an LMSInitialize "false"', () => {
    it('makes the client inert: no further calls reach the LMS', () => {
      const api = fakeApi({ LMSInitialize: vi.fn(() => 'false') });
      const c = createScormClient(chain(api, 0));
      c.init();
      expect(c.connected).toBe(false);
      c.setScore(1, 0, 2);
      c.setStatus('passed');
      c.setSuspend('x');
      c.setExit('suspend');
      c.setSessionTime(1);
      c.commit();
      c.finish();
      expect(c.getSuspend()).toBe('');
      expect(c.getStatus()).toBe('');
      expect(api.LMSSetValue).not.toHaveBeenCalled();
      expect(api.LMSCommit).not.toHaveBeenCalled();
      expect(api.LMSFinish).not.toHaveBeenCalled();
      expect(api.LMSGetValue).not.toHaveBeenCalled();
    });

    it('a throwing LMSInitialize is treated the same way', () => {
      const api = fakeApi({ LMSInitialize: vi.fn(() => { throw new Error('x'); }) });
      const c = createScormClient(chain(api, 0));
      c.init();
      c.commit();
      expect(api.LMSCommit).not.toHaveBeenCalled();
    });
  });

  describe('?scormdebug=1 trace', () => {
    const withSearch = (api: unknown, search: string) => {
      const w: W = { API: api, location: { search } };
      w.parent = w;
      return w as unknown as Window;
    };

    it('logs nothing by default', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const api = fakeApi({ LMSSetValue: vi.fn(() => 'false') });
      const c = createScormClient(withSearch(api, ''));
      c.init();
      c.setStatus('incomplete');
      c.commit();
      c.finish();
      expect(debug).not.toHaveBeenCalled();
      expect(api.LMSGetLastError).not.toHaveBeenCalled();
      debug.mockRestore();
    });

    it('traces every LMS call, and the last error after a failure', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const api = fakeApi({ LMSSetValue: vi.fn(() => 'false'), LMSGetLastError: vi.fn(() => '405') });
      const c = createScormClient(withSearch(api, '?a=1&scormdebug=1'));
      c.init();
      c.setStatus('incomplete');
      c.commit();
      const lines = debug.mock.calls.map((a) => a.join(' '));
      expect(lines.some((l) => l.includes('LMSInitialize'))).toBe(true);
      expect(lines.some((l) => l.includes('LMSSetValue') && l.includes('cmi.core.lesson_status') && l.includes('incomplete'))).toBe(true);
      expect(lines.some((l) => l.includes('LMSCommit'))).toBe(true);
      expect(api.LMSGetLastError).toHaveBeenCalled();
      expect(lines.some((l) => l.includes('405'))).toBe(true);
      debug.mockRestore();
    });

    it('a missing or unreadable location means no debug', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const w: W = { API: fakeApi() };
      Object.defineProperty(w, 'location', { get() { throw new Error('x'); } });
      w.parent = w;
      createScormClient(w as unknown as Window).init();
      expect(debug).not.toHaveBeenCalled();
      debug.mockRestore();
    });
  });
});

describe('formatSessionTime (SCORM 1.2 CMITimespan HHHH:MM:SS.SS)', () => {
  it.each([
    [0, '0000:00:00.00'],
    [59.99, '0000:00:59.99'],
    [3600, '0001:00:00.00'],
    [36000.5, '0010:00:00.50'],
    [59.999, '0000:01:00.00'],
    [-5, '0000:00:00.00'],
    [Number.NaN, '0000:00:00.00'],
    [10000 * 3600, '9999:59:59.99'],
    [Number.POSITIVE_INFINITY, '9999:59:59.99'],
  ])('%s s -> %s', (s, out) => {
    expect(formatSessionTime(s)).toBe(out);
  });
});

