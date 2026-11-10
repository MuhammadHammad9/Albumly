// The API used by the Playwright end-to-end tests. Playwright starts and stops it.
// It builds the app directly instead of going through server.js, so server/.env is never read:
// no Spotify keys, no Supabase, always the demo catalogue.
//
//   node scripts/e2e-server.js              port 5066, accounts off
//   node scripts/e2e-server.js --accounts   port 5067, accounts on, with stand-ins for Supabase:
//                                           PGlite (Postgres in memory) and a key pair made at start
process.env.CATALOG_PROVIDER = 'mock'

const withAccounts = process.argv.includes('--accounts')
const PORT = Number(process.env.E2E_API_PORT || (withAccounts ? 5067 : 5066))
// The pretend Supabase project. Nothing listens there: the tests answer its requests in the browser.
const FAKE_SUPABASE_URL = 'http://supabase.e2e.test'

const { createApp } = await import('../src/app.js')

let accounts = null
let issueSession = null
if (withAccounts) {
  const { randomUUID } = await import('node:crypto')
  const { createTokenVerifier } = await import('../src/auth/verifyToken.js')
  const { createTestDatabase } = await import('../src/test/testDb.js')
  const { createTestKeys } = await import('../src/test/tokens.js')

  const db = await createTestDatabase()
  const issuer = `${FAKE_SUPABASE_URL}/auth/v1`
  const keys = await createTestKeys()
  const verify = createTokenVerifier({ issuer, keySet: keys.keySet })
  const authAdmin = {
    async deleteUser(id) {
      await db.query('delete from auth.users where id = $1', [id]) // what Supabase would do
    },
  }
  accounts = { verify, db, authAdmin }

  // Plays Supabase Auth's part: makes (or finds) the user and returns a session shaped like
  // Supabase's, with a real token our server accepts. Only this test server has this.
  issueSession = async (email) => {
    const found = await db.query('select id from auth.users where email = $1', [email])
    const id = found.rows[0]?.id ?? randomUUID()
    if (!found.rows[0]) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
    const accessToken = await keys.sign(id, { email, issuer })
    const user = { id, aud: 'authenticated', role: 'authenticated', email, email_confirmed_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
    return { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: `refresh-${randomUUID()}`, user }
  }
}

// rateLimits: false, because a parallel test run sends far more requests than one visitor would
const app = createApp({ accounts, rateLimits: false })

if (issueSession) {
  // Added after createApp, outside /api, so the app's own routes are untouched
  app.post('/__e2e/session', async (req, res) => {
    const email = String(req.body?.email ?? '')
    if (!/^[^@\s]+@example\.com$/.test(email)) return res.status(400).json({ error: 'example.com addresses only' })
    res.json(await issueSession(email))
  })
}

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`E2E API on http://127.0.0.1:${PORT} (demo catalogue, accounts ${withAccounts ? 'on (PGlite)' : 'off'})`)
})

// Close cleanly when Playwright stops us
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
