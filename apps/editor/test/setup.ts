// jsdom's Blob has no text()/arrayBuffer(), which every browser has; use Node's spec-compliant Blob instead.
import { Blob as NodeBlob } from 'node:buffer';

globalThis.Blob = NodeBlob as unknown as typeof Blob;

// jsdom has no ClipboardEvent; ProseMirror's view.pasteHTML() (used to test pasting) constructs one.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  globalThis.ClipboardEvent = class ClipboardEvent extends Event {
    readonly clipboardData: DataTransfer | null = null;
  } as unknown as typeof ClipboardEvent;
}
