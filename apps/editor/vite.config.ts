/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One config: the editor app, the dev server Playwright drives, and Vitest (unit tests only; e2e/ is Playwright's).
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', setupFiles: ['test/setup.ts'] },
});
