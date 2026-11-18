import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'pnpm exec vite --logLevel error',
    url: 'http://localhost:5174/e2e/index.html',
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
