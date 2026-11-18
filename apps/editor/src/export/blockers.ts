import { exportBlockers, type Project } from '@ivt/schema';
import { formatDuration } from '../format';
import { checkpointName, outOfRange } from '../interactions';

/** A reason the package can't be exported yet; `interactionId` names the checkpoint to fix, when there is one. */
export type Blocker = { message: string; interactionId?: string };
export type ExportResult = { ok: true; blob: Blob; filename: string } | { ok: false; blockers: Blocker[] };
/** The image writes still waiting for storage (see storage/assetQueue.ts). */
export type PendingImages = { flush: () => Promise<void>; pending: () => boolean };

export const NO_CHECKPOINTS = 'Add at least one checkpoint';
export const IMAGES_UNSAVED = "Some images aren't saved in this browser yet. The editor is retrying; try exporting again in a moment.";

/**
 * Everything that stops an export, apart from images waiting for storage: the schema's checks (attributed to their
 * checkpoint), checkpoints at or after the end of the video, and images whose file is missing.
 */
export function listBlockers(p: Project, assets: Map<string, Blob>): Blocker[] {
  const out: Blocker[] = [];
  if (p.interactions.length === 0) out.push({ message: NO_CHECKPOINTS });
  // exportBlockers checks each checkpoint on its own; run it one checkpoint at a time to know which one a message is
  // about, plus once with none for anything about the project as a whole.
  for (const message of exportBlockers({ ...p, interactions: [] })) out.push({ message });
  for (const it of p.interactions) {
    for (const message of exportBlockers({ ...p, interactions: [it] })) out.push({ message, interactionId: it.id });
  }
  for (const id of outOfRange(p)) {
    const it = p.interactions.find((i) => i.id === id)!;
    out.push({
      message: `${checkpointName(p, it)} is at or after the end of the video (${formatDuration(p.duration)}). Move it earlier.`,
      interactionId: id,
    });
  }
  for (const it of p.interactions) {
    if (it.imageAssetId !== undefined && !assets.has(it.imageAssetId)) {
      out.push({ message: `${checkpointName(p, it)} has lost its picture. Choose the image again.`, interactionId: it.id });
    }
  }
  return out;
}
