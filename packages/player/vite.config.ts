/// <reference types="vitest" />
import { defineConfig } from 'vite';

// One config: the IIFE library bundle (dist/player.js + dist/player.css),
// the dev server for the e2e test page, and Vitest.
export default defineConfig({
  server: { port: 5174, strictPort: true },
  build: {
    lib: { entry: 'src/bundle.ts', name: 'IVPlayer', formats: ['iife'], fileName: () => 'player.js' },
    rollupOptions: { output: { assetFileNames: (a) => (a.name?.endsWith('.css') ? 'player.css' : '[name][extname]') } },
    cssCodeSplit: false,
    emptyOutDir: true,
  },
  test: { include: ['test/**/*.test.ts'], environment: 'jsdom' },
});
