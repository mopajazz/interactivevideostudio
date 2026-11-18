// jsdom's Blob has no text()/arrayBuffer(), which every browser has; use Node's spec-compliant Blob instead.
import { Blob as NodeBlob } from 'node:buffer';

globalThis.Blob = NodeBlob as unknown as typeof Blob;
