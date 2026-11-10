// End-to-end tests: a real browser (Chromium) clicking through the app on the demo catalogue.
// Run with `npm run test:e2e`. Playwright starts the servers below and stops them afterwards.
// Ports are chosen to never clash with the normal dev servers (5000, 5173, 5055, 5199).
import { defineConfig, devices } from '@playwright/test'

const PORTS = {
  api: 5066, // demo catalogue, accounts off
  client: 5288, // dev server → api
  accountsApi: 5067, // demo catalogue, accounts on (PGlite + test keys)
  accountsClient: 5289, // dev server → accountsApi, with pretend Supabase settings
  prod: 5290, // production build + vercel.json headers → api
}
const url = (port) => `http://127.0.0.1:${port}`
// Lighthouse is slow, so it only runs through `npm run test:lighthouse` (which sets this)
const lighthouse = Boolean(process.env.E2E_LIGHTHOUSE)

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }

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
    baseURL: url(PORTS.client),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'desktop', use: desktop, testIgnore: /[\\/](accounts|prod|lighthouse)[\\/]/, grepInvert: /@mobile/ },
    // Pixel 7 is a Chromium device profile, so no extra browser is needed
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /[\\/](accounts|prod|lighthouse)[\\/]/, grep: /@mobile/ },
    { name: 'accounts', use: { ...desktop, baseURL: url(PORTS.accountsClient) }, testMatch: /[\\/]accounts[\\/].*\.spec\.js/ },
    { name: 'prod', use: { ...desktop, baseURL: url(PORTS.prod) }, testMatch: /[\\/]prod[\\/].*\.spec\.js/ },
    ...(lighthouse ? [{ name: 'lighthouse', use: { baseURL: url(PORTS.prod) }, testMatch: /[\\/]lighthouse[\\/].*\.spec\.js/, timeout: 300_000 }] : []),
  ],
  webServer: [
    {
      command: 'node server/scripts/e2e-server.js',
      url: `${url(PORTS.api)}/api/health`,
      reuseExistingServer: false, // never attach to someone else's server
      timeout: 30_000,
    },
    {
      command: 'npx vite --config vite.e2e.config.js',
      cwd: './client',
      url: url(PORTS.client),
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node server/scripts/e2e-server.js --accounts',
      url: `${url(PORTS.accountsApi)}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite --config vite.e2e.config.js',
      cwd: './client',
      url: url(PORTS.accountsClient),
      reuseExistingServer: false,
      timeout: 60_000,
      // Pretend Supabase project: public-looking values only, answered by the tests themselves
      env: { E2E_VARIANT: 'accounts', VITE_SUPABASE_URL: 'http://supabase.e2e.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key' },
    },
    {
      command: 'npx vite build --config vite.e2e.config.js --logLevel warn && npx vite preview --config vite.e2e.config.js',
      cwd: './client',
      url: url(PORTS.prod),
      reuseExistingServer: false,
      timeout: 120_000,
      env: { E2E_VARIANT: 'prod' },
    },
  ],
})
