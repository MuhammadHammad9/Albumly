// End-to-end tests: a real browser (Chromium) clicking through the app on the demo catalogue.
// Run with `npm run test:e2e`. Playwright starts the two servers below and stops them afterwards.
import { defineConfig, devices } from '@playwright/test'

const API_PORT = 5066 // never 5000/5055: those belong to the normal dev servers
const CLIENT_PORT = 5288 // never 5173/5199, for the same reason

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  workers: 2,
  // No automatic retries: a flaky test should be fixed, not hidden
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { outputFolder: './e2e/playwright-report', open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, grepInvert: /@mobile/ },
    // Pixel 7 is a Chromium device profile, so no extra browser is needed
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: [
    {
      command: 'node server/scripts/e2e-server.js',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false, // never attach to someone else's server
      timeout: 30_000,
    },
    {
      command: 'npx vite --config vite.e2e.config.js',
      cwd: './client',
      url: `http://127.0.0.1:${CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
