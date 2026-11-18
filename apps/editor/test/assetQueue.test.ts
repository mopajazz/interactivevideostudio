import { describe, expect, it, vi } from 'vitest';
import { createAssetQueue } from '../src/storage/assetQueue';

const blob = () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

describe('createAssetQueue', () => {
  it('writes, then reports nothing pending', async () => {
    const io = { put: vi.fn(async () => {}), del: vi.fn(async () => {}) };
    const states: unknown[] = [];
    const q = createAssetQueue(io, (s) => states.push(s));
    await q.put('a.png', blob());
    expect(io.put).toHaveBeenCalledWith('a.png', expect.any(Blob));
    expect(states.at(-1)).toEqual({ pending: false, failed: false });
  });

  it('keeps a failed write queued and failed until a later flush succeeds', async () => {
    let fail = true;
    const io = { put: vi.fn(async () => { if (fail) throw new Error('full'); }), del: vi.fn(async () => {}) };
    const states: Array<{ pending: boolean; failed: boolean }> = [];
    const q = createAssetQueue(io, (s) => states.push(s));
    await q.put('a.png', blob());
    expect(states.at(-1)).toEqual({ pending: true, failed: true });
    await q.flush();
    expect(states.at(-1)).toEqual({ pending: true, failed: true });
    fail = false;
    await q.flush();
    expect(io.put).toHaveBeenCalledTimes(3);
    expect(states.at(-1)).toEqual({ pending: false, failed: false });
  });

  it('retries failed removals, and the last operation on an id wins', async () => {
    let fail = true;
    const io = { put: vi.fn(async () => {}), del: vi.fn(async () => { if (fail) throw new Error('broken'); }) };
    const states: Array<{ pending: boolean; failed: boolean }> = [];
    const q = createAssetQueue(io, (s) => states.push(s));
    await q.remove('a.png');
    expect(states.at(-1)).toEqual({ pending: true, failed: true });
    await q.put('a.png', blob()); // re-added before the removal got through: only the put is written
    expect(io.del).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ pending: false, failed: false });
    fail = false;
    await q.remove('b.png');
    expect(io.del).toHaveBeenLastCalledWith('b.png');
  });

  it('clear() forgets everything queued', async () => {
    const io = { put: vi.fn(async () => { throw new Error('full'); }), del: vi.fn(async () => {}) };
    const states: Array<{ pending: boolean; failed: boolean }> = [];
    const q = createAssetQueue(io, (s) => states.push(s));
    await q.put('a.png', blob());
    q.clear();
    expect(states.at(-1)).toEqual({ pending: false, failed: false });
    await q.flush();
    expect(io.put).toHaveBeenCalledTimes(1);
  });
});
