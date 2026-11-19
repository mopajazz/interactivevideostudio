import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../src/ui/download';

describe('downloadBlob', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps the object URL for 30 s (a slow save dialog still gets the file), then revokes it', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadBlob(new Blob(['x']), 'a.json');
    expect(click).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(29_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });
});
