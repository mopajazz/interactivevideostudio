import { defineConfig } from 'vite';

// IIFE bundle of the launch glue: dist/launch.js exposes window.IVScorm.start.
// The player is a separate bundle (loaded first by index.html) and is never included here.
export default defineConfig({
  build: {
    lib: { entry: 'src/launchBundle.ts', name: 'IVScorm', formats: ['iife'], fileName: () => 'launch.js' },
    emptyOutDir: true,
  },
});
