import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

test('library build exposes window.IVPlayer.mount and emits player.css', async ({ page }) => {
  execSync('pnpm exec vite build --logLevel error', { cwd: root, stdio: 'pipe' });
  const js = `${root}dist/player.js`;
  const css = `${root}dist/player.css`;
  expect(existsSync(css)).toBe(true);
  expect(readFileSync(css, 'utf8')).toContain('.ivp-card');
  await page.setContent('<!doctype html><html><body><div id="app"></div></body></html>');
  await page.addScriptTag({ path: js });
  expect(await page.evaluate(() => typeof (window as any).IVPlayer?.mount)).toBe('function');
});
