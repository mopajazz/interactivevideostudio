import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from '../src/storage/autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createAutosave', () => {
  it('debounces to one save of the latest value 500 ms after the last change', () => {
    const save = vi.fn();
    const a = createAutosave(save);
    a.schedule('a');
    vi.advanceTimersByTime(300);
    a.schedule('b');
    vi.advanceTimersByTime(499);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('b');
  });

  it('flush saves a pending value at once, and only once', () => {
    const save = vi.fn();
    const a = createAutosave(save);
    a.schedule(1);
    a.flush();
    expect(save).toHaveBeenCalledWith(1);
    vi.advanceTimersByTime(1000);
    a.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('cancel drops a pending value', () => {
    const save = vi.fn();
    const a = createAutosave(save);
    a.schedule(1);
    a.cancel();
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('honors a custom delay', () => {
    const save = vi.fn();
    const a = createAutosave(save, 50);
    a.schedule(1);
    vi.advanceTimersByTime(50);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
