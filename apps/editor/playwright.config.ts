import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'pnpm exec vite --logLevel error',
    url: 'http://localhost:5175/',
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
