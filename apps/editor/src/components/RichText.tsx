import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/core';
import { IconAlert, IconBold, IconBulletList, IconItalic, IconLink, IconNumberList } from '../ui/icons';
import { createRichTextEditor, isSafeLinkUrl } from './richText';

export const SHORTCUTS_ID = 'rt-shortcuts';
export const BAD_URL = 'Use a web address that starts with https://, http:// or mailto:';

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

/** The visible list of formatting shortcuts; every toolbar points at it with aria-describedby. Render once. */
export function ShortcutHint() {
  return (
    <p id={SHORTCUTS_ID} className="field-hint rt-shortcuts">
      Shortcuts: {MOD}+B bold, {MOD}+I italic, {MOD}+Shift+8 bulleted list, {MOD}+Shift+7 numbered list, {MOD}+K link.
      In a formatting toolbar, use the arrow keys to move between buttons.
    </p>
  );
}

type Props = {
  label: string;
  value: string;
  /** Receives sanitized HTML only ('' when empty). */
  onChange: (html: string) => void;
  hint?: ReactNode;
  /** Marks the drawer's first field, which receives focus when a checkpoint is added. */
  first?: boolean;
};

type Tool = { name: string; Icon: () => JSX.Element; active: (e: Editor) => boolean; run: (e: Editor) => void };
const TOOLS: Tool[] = [
  { name: 'Bold', Icon: IconBold, active: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
  { name: 'Italic', Icon: IconItalic, active: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  { name: 'Bulleted list', Icon: IconBulletList, active: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
  { name: 'Numbered list', Icon: IconNumberList, active: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
];

/**
 * Rich-text field (Tiptap). A labelled toolbar of real buttons with aria-pressed (one Tab stop, arrow keys inside,
 * as the ARIA toolbar pattern), then the editable textbox. Uncontrolled after mount: key it by what it edits.
 */
export function RichText({ label, value, onChange, hint, first }: Props) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const host = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [active, setActive] = useState(0);
  const bar = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  // StrictMode re-creates the editor straight after mounting; keep focus if the old one had it.
  const hadFocus = useRef(false);

  useEffect(() => {
    const e = createRichTextEditor({
      element: host.current!,
      content: value,
      label: labelId,
      describedBy: hint ? hintId : undefined,
      onChange: (html) => change.current(html),
      onSelectionUpdate: rerender,
      onLinkRequest: () => setLinkOpen(true),
    });
    setEditor(e);
    if (hadFocus.current) e.commands.focus();
    return () => {
      hadFocus.current = e.view.hasFocus();
      e.destroy();
      setEditor(null);
    };
    // Mount once; later `value` changes come from this editor itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buttons = () => Array.from(bar.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const onBarKey = (e: KeyboardEvent) => {
    const all = buttons();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to === undefined || i < 0) return;
    e.preventDefault();
    const next = (to + all.length) % all.length;
    setActive(next);
    all[next]!.focus();
  };

  const tool = (i: number, name: string, Icon: () => JSX.Element, pressed: boolean, run: () => void) => (
    <button
      key={name}
      type="button"
      className="rt-btn"
      aria-pressed={pressed}
      tabIndex={i === active ? 0 : -1}
      title={name}
      onFocus={() => setActive(i)}
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={run}
    >
      <Icon />
      <span className="visually-hidden">{name}</span>
    </button>
  );

  return (
    <div className="field rt" data-field={first ? '' : undefined}>
      <div id={labelId} className="field-label" onClick={() => editor?.commands.focus()}>{label}</div>
      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      <div className="rt-frame">
        <div ref={bar} role="toolbar" aria-label={`Formatting for ${label}`} aria-describedby={SHORTCUTS_ID} className="rt-toolbar" onKeyDown={onBarKey}>
          {TOOLS.map((t, i) => tool(i, t.name, t.Icon, !!editor && t.active(editor), () => editor && t.run(editor)))}
          {tool(TOOLS.length, 'Link', IconLink, !!editor?.isActive('link'), () => setLinkOpen(true))}
        </div>
        {linkOpen && editor && <LinkForm editor={editor} onDone={() => { setLinkOpen(false); editor.commands.focus(); }} />}
        <div ref={host} className="rt-host" />
      </div>
    </div>
  );
}

/** Inline form for the link under the cursor: validated address, apply, remove, cancel. */
function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const id = useId();
  const current = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [url, setUrl] = useState(current);
  const [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const apply = () => {
    const href = url.trim();
    if (!isSafeLinkUrl(href)) return setError(true);
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive('link')) {
      chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.extendMarkRange('link').setLink({ href }).run();
    }
    onDone();
  };

  return (
    <div className="rt-link" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onDone(); } }}>
      <label htmlFor={`${id}-url`} className="field-label">Link address</label>
      <input
        ref={input}
        id={`${id}-url`}
        className="input"
        type="url"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={url}
        aria-invalid={error || undefined}
        aria-describedby={`${id}-msg`}
        onChange={(e) => { setUrl(e.target.value); setError(false); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
      />
      <div id={`${id}-msg`} role="status" className="field-status">
        {error && <p className="msg msg-error"><IconAlert />{BAD_URL}</p>}
      </div>
      <div className="rt-link-actions">
        <button type="button" className="btn btn-primary btn-small" onClick={apply}>Apply link</button>
        {current && (
          <button type="button" className="btn btn-secondary btn-small" onClick={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); onDone(); }}>
            Remove link
          </button>
        )}
        <button type="button" className="btn btn-secondary btn-small" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}
