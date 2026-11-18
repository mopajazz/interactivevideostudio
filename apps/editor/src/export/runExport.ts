import type { Project } from '@ivt/schema';
import { buildScormZip } from '@ivt/scorm';
import { fileSlug } from '../project';
import { IMAGES_UNSAVED, listBlockers, type ExportResult, type PendingImages } from './blockers';
import { learnerBundle } from './bundle';

// Loaded on demand (the learner bundles and JSZip are big); blockers.ts is what the page needs up front.
export { listBlockers };
export type { Blocker, ExportResult, PendingImages } from './blockers';

/** "my-video.zip" for "My Video!"; never empty and never a path. */
export const zipName = (title: string) => `${fileSlug(title, 'interactive-video')}.zip`;

/**
 * Builds the SCORM 1.2 package, or says why it can't. Pending image writes are flushed first and only block the
 * export if some are still waiting afterwards. Only images a checkpoint uses are packaged.
 */
export async function runExport(p: Project, assets: Map<string, Blob>, opts: { queue?: PendingImages } = {}): Promise<ExportResult> {
  const blockers = listBlockers(p, assets);
  if (opts.queue) {
    await opts.queue.flush();
    if (opts.queue.pending()) blockers.push({ message: IMAGES_UNSAVED });
  }
  if (blockers.length) return { ok: false, blockers };

  const used = new Map<string, Uint8Array>();
  for (const it of p.interactions) {
    if (it.imageAssetId && !used.has(it.imageAssetId)) {
      used.set(it.imageAssetId, new Uint8Array(await assets.get(it.imageAssetId)!.arrayBuffer()));
    }
  }
  const blob = await buildScormZip(p, used, learnerBundle);
  return { ok: true, blob, filename: zipName(p.title) };
}
