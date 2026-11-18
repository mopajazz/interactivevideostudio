import { sanitizeHtml } from '@ivt/schema';

let seq = 0;
/** A page-unique id for aria wiring. */
export const uid = (prefix: string) => `ivp-${prefix}-${++seq}`;

/** Element with class and optional text (set via textContent, never parsed). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** The only place author HTML enters the DOM: always sanitized first. */
export function authorHtml<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, html: string | undefined): HTMLElementTagNameMap[K] {
  const e = h(tag, cls);
  e.innerHTML = sanitizeHtml(html ?? '');
  return e;
}

export function button(label: string, cls = 'ivp-btn'): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  return b;
}
