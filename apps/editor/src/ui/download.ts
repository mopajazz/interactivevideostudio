/** How long the object URL stays valid: a browser may still be reading it while its save dialog is open. */
const REVOKE_AFTER_MS = 30_000;

/** Hands the viewer a file to save. */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  const url = a.href;
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
