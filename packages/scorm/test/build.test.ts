import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('launch bundle', () => {
  let js = '';
  beforeAll(() => {
    execSync('pnpm exec vite build', { cwd: root, stdio: 'pipe' });
    js = readFileSync(resolve(root, 'dist/launch.js'), 'utf8');
  }, 60_000);

  it('defines IVScorm.start', () => {
    const win: Record<string, unknown> = {};
    new Function('window', `${js}; window.IVScorm = typeof IVScorm === 'undefined' ? undefined : IVScorm;`)(win);
    expect(typeof (win.IVScorm as { start?: unknown })?.start).toBe('function');
  });

  it('does not bundle the player', () => {
    expect(js).not.toContain('ivp-root');
    expect(js).not.toContain('YouTubeAdapter');
  });
});
