import { describe, expect, it } from 'vitest';
import { IMAGE_HINT, UNREADABLE_IMAGE, newAssetId } from '../src/storage/images';

// compressImage needs a real canvas, so it is tested in the browser: e2e/images.spec.ts.
describe('newAssetId', () => {
  it.each([
    ['image/webp', 'webp'],
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
  ])('gives %s ids of 12 url-safe chars plus .%s', (type, ext) => {
    expect(newAssetId(type)).toMatch(new RegExp(`^[A-Za-z0-9_-]{12}\\.${ext}$`));
  });

  it('refuses types it cannot store', () => {
    expect(() => newAssetId('image/gif')).toThrow(/image type/);
  });

  it('does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newAssetId('image/png')));
    expect(ids.size).toBe(500);
  });
});

describe('image copy', () => {
  it('the picker hint and the unreadable-file message name the same types, and say a GIF loses its animation', () => {
    for (const t of ['JPEG', 'PNG', 'WebP', 'GIF']) {
      expect(IMAGE_HINT).toContain(t);
      expect(UNREADABLE_IMAGE).toContain(t);
    }
    expect(IMAGE_HINT).toMatch(/GIF.*(still|animation)/);
  });
});
