import { test, expect, type Page } from '@playwright/test';

// compressImage needs a real canvas, so it runs in the browser through the Vite dev server.
test.beforeEach(async ({ page }) => {
  await page.goto('/?fake=1');
});

/** Draws a w x h test image in the page and runs compressImage on it; returns facts about the output. */
const compress = (page: Page, o: { w: number; h: number; type: string; maxEdge?: number; maxBytes?: number; exif?: boolean; orientation?: number }) =>
  page.evaluate(async (o) => {
    const { compressImage, newAssetId } = (await import('/src/storage/images.ts' as string)) as typeof import('../src/storage/images');
    const c = new OffscreenCanvas(o.w, o.h);
    const g = c.getContext('2d')!;
    // Noisy content, so the encoder has real work to do.
    const img = g.createImageData(o.w, Math.min(o.h, 64));
    for (let i = 0; i < img.data.length; i++) img.data[i] = (i * 2654435761) % 251;
    for (let y = 0; y < o.h; y += 64) g.putImageData(img, 0, y);
    let blob = await c.convertToBlob({ type: o.type, quality: 0.95 });
    if (o.exif) {
      // Splice an APP1 "Exif" segment (with a fake GPS tag) in after the JPEG SOI marker.
      const raw = new Uint8Array(await blob.arrayBuffer());
      const payload = new TextEncoder().encode('Exif\0\0GPS-SECRET-LOCATION');
      const seg = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
      blob = new Blob([raw.slice(0, 2), seg, raw.slice(2)], { type: o.type });
    }
    if (o.orientation) {
      // A minimal big-endian EXIF block holding one tag: Orientation (0x0112), SHORT, value o.orientation.
      const raw = new Uint8Array(await blob.arrayBuffer());
      const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o.orientation, 0, 0, 0, 0, 0, 0];
      const payload = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
      const seg = new Uint8Array([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255, ...payload]);
      blob = new Blob([raw.slice(0, 2), seg, raw.slice(2)], { type: o.type });
    }
    const file = new File([blob], 'photo', { type: o.type });
    try {
      const out = await compressImage(file, o.maxEdge, o.maxBytes);
      const bmp = await createImageBitmap(out);
      const text = new TextDecoder('latin1').decode(new Uint8Array(await out.arrayBuffer()));
      return { ok: true, w: bmp.width, h: bmp.height, type: out.type, size: out.size, id: newAssetId(out.type), hasExif: text.includes('Exif') || text.includes('GPS-SECRET') };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }, o);

test('scales a 4000 px image so its longest edge is 1600 px, as WebP with a matching id', async ({ page }) => {
  const r = await compress(page, { w: 4000, h: 2500, type: 'image/png' });
  expect(r).toMatchObject({ ok: true, w: 1600, h: 1000, type: 'image/webp' });
  expect(r.size).toBeLessThanOrEqual(800 * 1024);
  expect(r.id).toMatch(/^[A-Za-z0-9_-]{12}\.webp$/);
});

test('honors a custom max edge for portrait images', async ({ page }) => {
  const r = await compress(page, { w: 300, h: 1200, type: 'image/jpeg', maxEdge: 600 });
  expect(r).toMatchObject({ ok: true, w: 150, h: 600 });
});

test('keeps the format of a tiny image but still redraws it, stripping metadata', async ({ page }) => {
  const png = await compress(page, { w: 40, h: 30, type: 'image/png' });
  expect(png).toMatchObject({ ok: true, w: 40, h: 30, type: 'image/png' });
  expect(png.id).toMatch(/\.png$/);
  const jpg = await compress(page, { w: 40, h: 30, type: 'image/jpeg', exif: true });
  expect(jpg).toMatchObject({ ok: true, type: 'image/jpeg', hasExif: false });
  expect(jpg.id).toMatch(/\.jpg$/);
});

test('strips metadata from a large photo too', async ({ page }) => {
  const r = await compress(page, { w: 2400, h: 1600, type: 'image/jpeg', exif: true });
  expect(r).toMatchObject({ ok: true, w: 1600, h: 1067, type: 'image/webp', hasExif: false });
});

test('throws a readable error when the image is still over the size cap', async ({ page }) => {
  const r = await compress(page, { w: 1600, h: 1600, type: 'image/png', maxBytes: 2000 });
  expect(r).toEqual({ ok: false, message: 'This image is still larger than 2 KB after compression. Try a smaller or simpler image.' });
});

test('throws a readable error for a file that is not an image', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const { compressImage } = (await import('/src/storage/images.ts' as string)) as typeof import('../src/storage/images');
    return compressImage(new File(['hello'], 'notes.png', { type: 'image/png' })).then(() => 'resolved', (e: Error) => e.message);
  });
  expect(message).toBe("This file couldn't be read as an image. Try a JPEG, PNG or WebP file.");
});

test('applies EXIF orientation before redrawing, so a rotated photo stays upright', async ({ page }) => {
  // Orientation 6 = rotate 90° clockwise: stored 400 x 200, displayed 200 x 400.
  const small = await compress(page, { w: 400, h: 200, type: 'image/jpeg', orientation: 6 });
  expect(small).toMatchObject({ ok: true, w: 200, h: 400, hasExif: false });
  const big = await compress(page, { w: 3200, h: 1600, type: 'image/jpeg', orientation: 6 });
  expect(big).toMatchObject({ ok: true, w: 800, h: 1600, hasExif: false });
});
