/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// One config: the editor app, the dev server Playwright drives, and Vitest (unit tests only; e2e/ is Playwright's).
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  // The editor is one ~600 kB (about 200 kB gzipped) chunk: the rich-text editor (Tiptap + ProseMirror) is about
  // 105 kB gzipped of it. Authoring-only; the exported learner package never includes it. The SCORM packager
  // (learner bundles + JSZip, about 53 kB gzipped) is a separate chunk, loaded on the first export.
  build: { chunkSizeWarningLimit: 700 },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom', setupFiles: ['test/setup.ts'] },
});
