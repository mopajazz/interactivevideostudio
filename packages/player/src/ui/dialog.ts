const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shows `card` as a modal dialog inside `layer`: makes `background` inert, moves focus into the card,
 * keeps Tab inside it, and calls `onEscape` (if given) on Escape. Returns a function that closes it.
 * Restoring focus afterwards is the caller's job.
 */
export function openModal(layer: HTMLElement, card: HTMLElement, o: { background: HTMLElement[]; onEscape?: () => void }): () => void {
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  layer.append(card);
  layer.hidden = false;
  o.background.forEach((b) => { b.inert = true; });
  void card.offsetWidth; // commit the start state so the enter transition runs
  card.classList.add('is-open');
  card.focus();

  const focusables = () =>
    Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.getClientRects().length > 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      o.onEscape?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const list = focusables();
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (!first || !last) {
      e.preventDefault();
      card.focus();
    } else if (e.shiftKey && (active === first || active === card)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  // Backstop: anything that moves focus outside (e.g. a click elsewhere on the page) is pulled back.
  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof Node && !card.contains(e.target)) card.focus();
  };
  card.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);

  return () => {
    card.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocusIn);
    card.remove();
    layer.hidden = layer.childElementCount === 0;
    o.background.forEach((b) => { b.inert = false; });
  };
}
