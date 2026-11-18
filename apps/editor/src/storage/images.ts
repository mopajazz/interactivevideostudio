import { IMAGE_EXT } from './assetIds';

export { newAssetId } from './assetIds';

/** Below this size an image of a type we store keeps its format (a small PNG icon stays crisp and transparent). */
const TINY_BYTES = 64 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.5];

const kb = (n: number) => `${Math.round(n / 1024)} KB`;

type Surface = { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D };
function surface(w: number, h: number): Surface {
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as Surface['ctx'] | null;
  if (!ctx) throw new Error("This browser can't process images.");
  return { canvas, ctx };
}

function encode(canvas: Surface['canvas'], type: string, quality: number): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("This browser can't process images."))), type, quality));
}

/**
 * Downscales so the longest edge is at most `maxEdge`, re-encodes (WebP where supported, else JPEG; tiny images keep
 * their format) and always redraws, which drops EXIF/GPS and other metadata. Throws a readable error if the result is
 * still over `maxBytes`.
 */
export async function compressImage(file: File, maxEdge = 1600, maxBytes = 800 * 1024): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This file couldn't be read as an image. Try a JPEG, PNG or WebP file.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const keep = scale === 1 && file.size <= TINY_BYTES && !!IMAGE_EXT[file.type];

  const { canvas, ctx } = surface(w, h);
  const draw = (background?: string) => {
    ctx.clearRect(0, 0, w, h);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
  };

  let out: Blob | null = null;
  for (const type of keep ? [file.type] : ['image/webp', 'image/jpeg']) {
    draw(type === 'image/jpeg' ? '#ffffff' : undefined); // JPEG has no alpha: flatten onto white, not black
    let best: Blob | null = null;
    for (const q of type === 'image/png' ? [1] : QUALITIES) {
      const blob = await encode(canvas, type, q);
      if (blob.type !== type) break; // encoder unsupported (browsers fall back to PNG): try the next type
      best = blob;
      if (blob.size <= maxBytes) break;
    }
    if (best) {
      out = best;
      break;
    }
  }
  bitmap.close();
  if (!out) throw new Error("This browser can't process images.");
  if (out.size > maxBytes) throw new Error(`This image is still larger than ${kb(maxBytes)} after compression. Try a smaller or simpler image.`);
  return out;
}
