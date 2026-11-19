import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    // Set CHROMIUM_PATH to use a Chromium already on the machine; unset, Playwright uses its own installed browser.
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  webServer: {
    command: 'pnpm exec vite --logLevel error',
    url: 'http://localhost:5174/e2e/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
