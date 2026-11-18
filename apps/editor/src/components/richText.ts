import { Editor, Extension } from '@tiptap/core';
import Bold from '@tiptap/extension-bold';
import Document from '@tiptap/extension-document';
import HardBreak from '@tiptap/extension-hard-break';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import { UndoRedo } from '@tiptap/extensions';
import { sanitizeHtml } from '@ivt/schema';

/** Link targets an author may use: the same schemes the schema and the player accept. */
export function isSafeLinkUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (u.protocol === 'mailto:') return u.pathname.length > 0;
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** What is stored: sanitized HTML, and '' for an editor with no text in it. */
export function toStoredHtml(html: string): string {
  const clean = sanitizeHtml(html);
  const box = document.createElement('div');
  box.innerHTML = clean; // already sanitized; never attached to the page
  return box.textContent?.trim() ? clean : '';
}

/**
 * The schema IS the allow-list: only these nodes and marks exist, so anything else pasted (tables, images,
 * styles, Office markup, scripts) cannot enter the document; the output is sanitized again on the way out.
 */
const extensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Bold,
  Italic,
  BulletList,
  OrderedList,
  // Tab must keep moving focus (no keyboard trap), so the list's Tab/Shift-Tab indenting is not bound.
  ListItem.extend({
    addKeyboardShortcuts() {
      return { Enter: () => this.editor.commands.splitListItem(this.name) };
    },
  }),
  Link.configure({
    openOnClick: false,
    autolink: false,
    linkOnPaste: false,
    isAllowedUri: (url) => isSafeLinkUrl(url),
  }),
  UndoRedo,
];

export type RichTextEditorOptions = {
  element: HTMLElement;
  content: string;
  /** id of the visible label */
  label: string;
  describedBy?: string;
  onChange: (html: string) => void;
  /** Re-render hook for the toolbar state (selection moved or content changed). */
  onSelectionUpdate?: () => void;
  /** Ctrl/Cmd+K: the toolbar opens its link form. */
  onLinkRequest?: () => void;
};

/** A labelled, multi-line rich-text textbox that emits only sanitized HTML. Framework-free so it can be unit-tested. */
export function createRichTextEditor(o: RichTextEditorOptions): Editor {
  let last = toStoredHtml(o.content);
  return new Editor({
    element: o.element,
    extensions: [
      ...extensions,
      Extension.create({
        name: 'linkShortcut',
        addKeyboardShortcuts: () => ({ 'Mod-k': () => (o.onLinkRequest?.(), true) }),
      }),
    ],
    content: sanitizeHtml(o.content),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': o.label,
        ...(o.describedBy ? { 'aria-describedby': o.describedBy } : {}),
        class: 'rt-content',
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor }) => {
      const html = toStoredHtml(editor.getHTML());
      if (html === last) return;
      last = html;
      o.onChange(html);
    },
    onTransaction: () => o.onSelectionUpdate?.(),
  });
}
