// The API used by the Playwright end-to-end tests (port 5066).
// It builds the app directly instead of going through server.js, so server/.env is never read:
// no Spotify keys, no Supabase, always the demo catalogue. Playwright starts and stops it.
process.env.CATALOG_PROVIDER = 'mock'

const { createApp } = await import('../src/app.js')

const PORT = Number(process.env.E2E_API_PORT || 5066)

// accounts: null = local-only mode. rateLimits: false, because a parallel test run sends far more
// requests than one visitor would (rate limiting has its own test).
const server = createApp({ accounts: null, rateLimits: false }).listen(PORT, '127.0.0.1', () => {
  console.log(`E2E API on http://127.0.0.1:${PORT} (demo catalogue, accounts off)`)
})

// Close cleanly when Playwright stops us
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
