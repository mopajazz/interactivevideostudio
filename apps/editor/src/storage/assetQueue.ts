type Op = { kind: 'put'; blob: Blob } | { kind: 'delete' };
export type AssetQueueState = { pending: boolean; failed: boolean };

/**
 * Image writes and removals waiting to reach storage. A failed one stays queued (and `failed`) until a later
 * flush gets it through; the last operation queued for an id wins. Flushes run one at a time.
 */
export function createAssetQueue(
  io: { put: (id: string, blob: Blob) => Promise<void>; del: (id: string) => Promise<void> },
  onChange: (s: AssetQueueState) => void,
) {
  const queue = new Map<string, Op>();
  const failedIds = new Set<string>();
  let chain = Promise.resolve();
  const report = () => onChange({ pending: queue.size > 0, failed: failedIds.size > 0 });

  const run = async () => {
    for (const [id, op] of [...queue]) {
      try {
        await (op.kind === 'put' ? io.put(id, op.blob) : io.del(id));
        if (queue.get(id) === op) queue.delete(id);
        failedIds.delete(id);
      } catch {
        if (queue.get(id) === op) failedIds.add(id);
      }
    }
    report();
  };
  const flush = (): Promise<void> => (chain = chain.then(run));
  const enqueue = (id: string, op: Op) => {
    queue.set(id, op);
    report();
    return flush();
  };

  return {
    put: (id: string, blob: Blob) => enqueue(id, { kind: 'put', blob }),
    remove: (id: string) => enqueue(id, { kind: 'delete' }),
    /** Retries everything still queued. */
    flush,
    /** Forgets the queue (a whole project, with its images, was written in its place). */
    clear() {
      queue.clear();
      failedIds.clear();
      report();
    },
  };
}
