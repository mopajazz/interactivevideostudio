import { describe, expect, it, vi } from 'vitest';
import { createPersistRequest, storageEventBus, watchOtherTabs, type TabBus, type TabMsg } from '../src/storage/tabs';

/** An in-memory stand-in for BroadcastChannel: a message reaches every other member, never the sender. */
function network() {
  const members = new Set<{ cb: (m: TabMsg) => void }>();
  const bus = (): TabBus => {
    const me = { cb: (_m: TabMsg) => {} };
    members.add(me);
    return {
      post: (m) => members.forEach((o) => o !== me && o.cb(m)),
      listen: (cb) => { me.cb = cb; },
      close: () => members.delete(me),
    };
  };
  return { bus };
}

describe('watchOtherTabs', () => {
  it('a lone tab sees no other; a second tab makes both see one; closing it clears the first', () => {
    const net = network();
    const a = vi.fn();
    const stopA = watchOtherTabs(a, net.bus());
    expect(a).not.toHaveBeenCalledWith(true);
    const b = vi.fn();
    const stopB = watchOtherTabs(b, net.bus());
    expect(a).toHaveBeenLastCalledWith(true);
    expect(b).toHaveBeenLastCalledWith(true);
    stopB();
    expect(a).toHaveBeenLastCalledWith(false);
    stopA();
  });

  it('with three tabs, closing one still leaves a warning', () => {
    const net = network();
    const a = vi.fn();
    watchOtherTabs(a, net.bus());
    const stopB = watchOtherTabs(() => {}, net.bus());
    watchOtherTabs(() => {}, net.bus());
    stopB();
    expect(a).toHaveBeenLastCalledWith(true);
  });

  it('does nothing (and never throws) without any channel', () => {
    const cb = vi.fn();
    const stop = watchOtherTabs(cb, null);
    expect(() => stop()).not.toThrow();
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('storageEventBus (fallback without BroadcastChannel)', () => {
  it('posts by writing localStorage and hears other tabs through storage events', () => {
    const listeners: Array<(e: { key: string | null; newValue: string | null }) => void> = [];
    const store = new Map<string, string>();
    const win = {
      localStorage: { setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) },
      addEventListener: (_n: string, f: (e: { key: string | null; newValue: string | null }) => void) => listeners.push(f),
      removeEventListener: vi.fn(),
    };
    const bus = storageEventBus(win as unknown as Window)!;
    const heard: TabMsg[] = [];
    bus.listen((m) => heard.push(m));
    bus.post({ kind: 'hello', from: 'x' });
    expect([...store.keys()]).toHaveLength(1);
    const [key, value] = [...store.entries()][0]!;
    listeners.forEach((f) => f({ key, newValue: value })); // as another tab would receive it
    expect(heard).toEqual([{ kind: 'hello', from: 'x' }]);
    listeners.forEach((f) => f({ key: 'unrelated', newValue: '{}' }));
    expect(heard).toHaveLength(1);
  });

  it('is null when localStorage is not usable', () => {
    const win = { get localStorage() { throw new Error('blocked'); }, addEventListener() {}, removeEventListener() {} };
    expect(storageEventBus(win as unknown as Window)).toBeNull();
  });
});

describe('createPersistRequest', () => {
  it('asks navigator.storage.persist() once, however often it is called', () => {
    const persist = vi.fn(() => Promise.resolve(true));
    const ask = createPersistRequest({ storage: { persist } } as unknown as Navigator);
    ask();
    ask();
    ask();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('ignores a refusal, a rejection, a throw or a missing API silently', async () => {
    const rejecting = vi.fn(() => Promise.reject(new Error('no')));
    expect(() => createPersistRequest({ storage: { persist: rejecting } } as unknown as Navigator)()).not.toThrow();
    await Promise.resolve();
    expect(() => createPersistRequest({ storage: { persist: () => { throw new Error('x'); } } } as unknown as Navigator)()).not.toThrow();
    expect(() => createPersistRequest({} as Navigator)()).not.toThrow();
    expect(() => createPersistRequest(undefined)()).not.toThrow();
  });
});
