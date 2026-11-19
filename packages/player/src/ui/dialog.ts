const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shows `card` as a modal dialog inside `layer`: makes `background` inert, moves focus into the card,
 * keeps Tab inside it, and calls `onEscape` (if given) on Escape. Returns a function that closes it.
 * Restoring focus afterwards is the caller's job.
 *
 * Tab is kept in with focus sentinels on both sides of the card rather than by comparing the focused
 * element with the first/last focusable: a radio group is one tab stop and the browser may land on any
 * radio in it, and inside an LMS iframe a missed check would send focus out of the iframe document.
 */
export function openModal(layer: HTMLElement, card: HTMLElement, o: { background: HTMLElement[]; onEscape?: () => void }): () => void {
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  const before = sentinel();
  const after = sentinel();
  layer.append(before, card, after);
  layer.hidden = false;
  o.background.forEach((b) => { b.inert = true; });
  void card.offsetWidth; // commit the start state so the enter transition runs
  card.classList.add('is-open');
  card.focus();

  const focusables = () =>
    Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => e.getClientRects().length > 0);
  // Reaching a sentinel means Tab tried to leave: wrap to the other end of the card.
  before.addEventListener('focus', () => (focusables().at(-1) ?? card).focus());
  after.addEventListener('focus', () => (focusables()[0] ?? card).focus());

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    o.onEscape?.();
  };
  // Backstop: anything that moves focus elsewhere in this document (e.g. a click) is pulled back.
  const onFocusIn = (e: FocusEvent) => {
    if (e.target instanceof Node && !card.contains(e.target) && e.target !== before && e.target !== after) card.focus();
  };
  // A press on the dimmed backdrop (such as a double-click's second press after the card's buttons moved) must not
  // move focus to the page body, where the focusin backstop can't see it.
  const onBackdrop = (e: MouseEvent) => { if (e.target === layer) e.preventDefault(); };
  card.addEventListener('keydown', onKey);
  document.addEventListener('focusin', onFocusIn);
  layer.addEventListener('mousedown', onBackdrop);

  return () => {
    card.removeEventListener('keydown', onKey);
    document.removeEventListener('focusin', onFocusIn);
    layer.removeEventListener('mousedown', onBackdrop);
    before.remove();
    card.remove();
    after.remove();
    layer.hidden = layer.childElementCount === 0;
    o.background.forEach((b) => { b.inert = false; });
  };
}

function sentinel(): HTMLElement {
  const s = document.createElement('span');
  s.className = 'ivp-sentinel';
  s.tabIndex = 0;
  return s;
}
