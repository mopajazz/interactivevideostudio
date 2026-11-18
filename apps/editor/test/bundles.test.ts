import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The exported package ships these prebuilt bundles; the editor imports them with ?raw (src/export/bundle.ts).
const BUNDLES = ['packages/player/dist/player.js', 'packages/player/dist/player.css', 'packages/scorm/dist/launch.js'];
const root = resolve(__dirname, '../../..');

describe('learner bundles', () => {
  it.each(BUNDLES)('%s is built', (path) => {
    expect(
      existsSync(resolve(root, path)),
      `${path} is missing. Run "pnpm --filter editor bundles" (the editor's dev, build, test and e2e scripts do this first).`,
    ).toBe(true);
  });
});
