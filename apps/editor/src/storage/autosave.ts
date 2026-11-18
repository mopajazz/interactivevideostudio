/** Debounced saver: only the latest value is saved, `delay` ms after the last change. */
export function createAutosave<T>(save: (value: T) => void, delay = 500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { value: T } | null = null;

  const run = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    const { value } = pending;
    pending = null;
    save(value);
  };

  return {
    schedule(value: T) {
      pending = { value };
      clearTimeout(timer);
      timer = setTimeout(run, delay);
    },
    /** Save a pending value now (e.g. when the page is hidden). */
    flush: run,
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = null;
    },
  };
}
