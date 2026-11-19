// The editor keeps one project per browser. Two tabs open on it would each autosave their own copy over the
// other's, so each tab tells the others it is there and the author is warned (a warning only: nothing is locked).

export type TabMsg = { kind: 'hello' | 'here' | 'bye'; from: string };
export type TabBus = { post(m: TabMsg): void; listen(cb: (m: TabMsg) => void): void; close(): void };

const CHANNEL = 'ivt-editor-tabs';

const isMsg = (m: unknown): m is TabMsg =>
  typeof m === 'object' && m !== null && ['hello', 'here', 'bye'].includes((m as TabMsg).kind) && typeof (m as TabMsg).from === 'string';

function broadcastBus(): TabBus | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    return {
      post: (m) => ch.postMessage(m),
      listen: (cb) => { ch.onmessage = (e) => { if (isMsg(e.data)) cb(e.data); }; },
      close: () => ch.close(),
    };
  } catch {
    return null;
  }
}

/** Fallback for browsers without BroadcastChannel: a localStorage write fires a storage event in every other tab. */
export function storageEventBus(win: Window): TabBus | null {
  let ls: Storage;
  try {
    ls = win.localStorage;
    if (!ls) return null;
  } catch {
    return null;
  }
  let handler: ((e: StorageEvent) => void) | null = null;
  return {
    post: (m) => {
      try {
        // A unique value each time, so repeating a message still counts as a change.
        ls.setItem(CHANNEL, JSON.stringify({ ...m, n: Math.random() }));
      } catch {
        /* storage full or blocked: no detection */
      }
    },
    listen: (cb) => {
      handler = (e) => {
        if (e.key !== CHANNEL || !e.newValue) return;
        try {
          const { kind, from } = JSON.parse(e.newValue);
          if (isMsg({ kind, from })) cb({ kind, from });
        } catch {
          /* not ours */
        }
      };
      win.addEventListener('storage', handler);
    },
    close: () => { if (handler) win.removeEventListener('storage', handler); },
  };
}

export const defaultTabBus = (): TabBus | null => broadcastBus() ?? (typeof window === 'undefined' ? null : storageEventBus(window));

/**
 * Calls `onChange(true)` while another editor tab is open on this browser's project, `onChange(false)` once none
 * is. Returns a stop function (call it on pagehide or unmount): it tells the other tabs this one has gone.
 */
export function watchOtherTabs(onChange: (others: boolean) => void, bus: TabBus | null = defaultTabBus()): () => void {
  if (!bus) return () => {};
  const me = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const others = new Set<string>();
  let last = false;
  const report = () => {
    const now = others.size > 0;
    if (now !== last) onChange((last = now));
  };
  bus.listen((m) => {
    if (m.from === me) return;
    if (m.kind === 'bye') others.delete(m.from);
    else others.add(m.from);
    if (m.kind === 'hello') bus.post({ kind: 'here', from: me });
    report();
  });
  bus.post({ kind: 'hello', from: me });
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      bus.post({ kind: 'bye', from: me });
      bus.close();
    } catch {
      /* closing anyway */
    }
  };
}

/**
 * Asks the browser to keep this site's storage (navigator.storage.persist()), once per page load, so the saved
 * project is less likely to be cleared under storage pressure. A refusal or a missing API is ignored silently;
 * browsers that ask the user decide themselves whether to show anything.
 */
export function createPersistRequest(nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): () => void {
  let asked = false;
  return () => {
    if (asked) return;
    asked = true;
    try {
      nav?.storage?.persist?.()?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  };
}
