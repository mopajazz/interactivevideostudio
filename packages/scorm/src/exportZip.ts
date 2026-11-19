import JSZip from 'jszip';
import type { Project } from '@ivt/schema';
import { buildIndexHtml } from './launch.html';
import { buildManifest, manifestIdentifier } from './manifest';

const ASSET_ID = /^[A-Za-z0-9_-]+\.(jpg|png|webp|gif)$/;

export async function buildScormZip(
  project: Project,
  assets: Map<string, Uint8Array>,
  bundle: { js: string; css: string; launchJs: string },
): Promise<Blob> {
  for (const id of assets.keys()) {
    if (!ASSET_ID.test(id)) throw new Error(`Invalid asset id "${id}": use letters, digits, - or _ plus a .jpg, .png, .webp or .gif extension.`);
  }
  for (const it of project.interactions) {
    if (it.imageAssetId !== undefined && !assets.has(it.imageAssetId)) {
      throw new Error(`The image "${it.imageAssetId}" used by an interaction is missing from the assets.`);
    }
  }
  const files = ['index.html', 'player.js', 'player.css', 'launch.js', 'project.json', ...[...assets.keys()].map((id) => `assets/${id}`)];
  const zip = new JSZip();
  zip.file('imsmanifest.xml', buildManifest(project.title, files, manifestIdentifier(project)));
  zip.file('index.html', buildIndexHtml(project));
  zip.file('player.js', bundle.js);
  zip.file('player.css', bundle.css);
  zip.file('launch.js', bundle.launchJs);
  zip.file('project.json', JSON.stringify(project, null, 2));
  for (const [id, bytes] of assets) zip.file(`assets/${id}`, bytes);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip', compression: 'DEFLATE' });
}
