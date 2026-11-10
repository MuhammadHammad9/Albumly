// npm run live-check
// An end-to-end check against the REAL Supabase project, using two throwaway accounts that are
// always deleted at the end (even when a check fails). It proves:
// - real tokens verify with the project's public keys
// - our API keeps user A's library away from user B
// - RLS protects the tables when Supabase's own Data API is called directly with the public key
// - deleting an account removes its data and the account itself
// It starts our Express app in this process on a random port (demo catalogue, no Spotify) and
// never prints keys, passwords or tokens.
import { randomBytes } from 'node:crypto'
import { requireVariables, step } from './scriptEnv.js'

process.env.CATALOG_PROVIDER = 'mock' // never touch Spotify from this script
requireVariables(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'DATABASE_URL'], ['DATABASE_SSL_CA'])

const { createApp } = await import('../src/app.js')
const { createAccounts, readAccountsConfig } = await import('../src/config/accounts.js')
const { decodeProtectedHeader } = await import('jose')

const config = readAccountsConfig()
if (!config.ok) {
  console.error(config.problem ?? `Missing: ${config.missing.join(', ')}`)
  process.exit(1)
}
const SUPABASE = config.supabaseUrl
const PUBLIC_KEY = config.publishableKey
const SECRET_KEY = config.secretKey
const adminHeaders = { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}`, 'Content-Type': 'application/json' }

const T1 = new Date(Date.now() - 60_000).toISOString()
const created = [] // { id, email } of every throwaway user, for the clean-up
let failures = 0
let accounts
let server

// One named check: prints ✓ or ✗ and remembers failures without stopping the clean-up
async function check(name, fn) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (error) {
    failures++
    console.log(`  ✗ ${name}\n      ${error.message}`)
  }
}
function expectEqual(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
// Supabase's error bodies hold a code and message, never secrets
const describeFailure = async (res) => {
  const body = await res.json().catch(() => ({}))
  return `HTTP ${res.status} ${body.error_code ?? body.code ?? ''} ${body.msg ?? body.message ?? body.error_description ?? ''}`.trim()
}

async function createThrowawayUser(label) {
  const email = `albumly-check-${label}-${randomBytes(4).toString('hex')}@example.com`
  const password = randomBytes(24).toString('base64url') // kept in memory only
  const res = await fetch(`${SUPABASE}/auth/v1/admin/users`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email, password, email_confirm: true }) })
  if (!res.ok) throw new Error(`Could not create a throwaway user: ${await describeFailure(res)}`)
  const user = await res.json()
  created.push({ id: user.id, email })
  console.log(`  created throwaway user ${email}`)

  const signIn = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!signIn.ok) throw new Error(`Could not sign in the throwaway user: ${await describeFailure(signIn)}`)
  const session = await signIn.json()
  return { id: user.id, email, token: session.access_token }
}

const userExists = async (id) => (await fetch(`${SUPABASE}/auth/v1/admin/users/${id}`, { headers: adminHeaders })).status === 200

try {
  step('Connecting')
  accounts = await createAccounts(config)
  const { rows } = await accounts.db.query('select name from public.schema_migrations order by name').catch(() => ({ rows: [] }))
  if (!rows.some((row) => row.name === '0002_rls.sql')) throw new Error('The migrations have not been applied yet. Run `npm run db:migrate --prefix server` first.')
  console.log(`  database ready (migrations: ${rows.map((row) => row.name).join(', ')})`)

  step('Creating two throwaway accounts')
  const a = await createThrowawayUser('a')
  const b = await createThrowawayUser('b')

  step('Tokens')
  await check('real tokens verify against the project keys', async () => {
    const alg = decodeProtectedHeader(a.token).alg
    expectEqual((await accounts.verify(a.token)).id, a.id, 'user id')
    console.log(`      token signing algorithm: ${alg}${alg === 'HS256' ? ' (legacy secret: the server asks Supabase Auth for each request; consider migrating to JWT signing keys)' : ''}`)
  })

  step('Our API (in-process, random port)')
  server = createApp({ accounts, rateLimits: false }).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const api = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body && JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const entry = (id, rating = null) => ({
    album: { id, name: `Check ${id}`, artists: [{ id: 'check', name: 'Check' }], albumType: 'album', inferredType: 'album', releaseDate: '2020', precision: 'year', year: 2020, totalTracks: 1, coverUrl: null, spotifyUrl: '', totalDurationMs: null },
    status: null, rating, review: '', notes: '', tags: [], addedAt: T1, updatedAt: T1,
  })

  await check('requests without a token are refused (401)', async () => {
    expectEqual((await api('GET', '/api/library')).status, 401, 'status')
  })
  await check('GET /api/me works for both users', async () => {
    expectEqual((await api('GET', '/api/me', a.token)).body.user.id, a.id, 'A')
    expectEqual((await api('GET', '/api/me', b.token)).body.user.id, b.id, 'B')
  })
  await check('A saves an album and a collection', async () => {
    expectEqual((await api('PUT', '/api/albums/checkA/entry', a.token, entry('checkA', 8))).status, 200, 'save')
    expectEqual((await api('POST', '/api/collections', a.token, { id: 'check-col', name: 'Check', createdAt: T1, updatedAt: T1 })).status, 201, 'collection')
    expectEqual((await api('POST', '/api/collections/check-col/albums', a.token, { albumId: 'checkA' })).body.collection.albumIds, ['checkA'], 'albums')
  })
  await check("B cannot see A's library", async () => {
    expectEqual((await api('GET', '/api/library', b.token)).body, { version: 1, entries: {}, collections: [] }, "B's library")
  })
  await check("B cannot change A's collection (404) and A's data is unchanged", async () => {
    expectEqual((await api('PATCH', '/api/collections/check-col', b.token, { name: 'Hacked', updatedAt: new Date().toISOString() })).status, 404, 'rename')
    expectEqual((await api('DELETE', '/api/collections/check-col/albums/checkA', b.token)).status, 404, 'remove album')
    const lib = (await api('GET', '/api/library', a.token)).body
    expectEqual([lib.collections[0]?.name, lib.entries.checkA?.rating], ['Check', 8], "A's data")
  })
  await check('import merges a browser library into B', async () => {
    const res = await api('POST', '/api/library/import', b.token, { library: { version: 1, entries: { checkB: entry('checkB') }, collections: [] } })
    expectEqual(res.body.summary.added, 1, 'added')
  })

  step("RLS through Supabase's own Data API (public key)")
  const rest = (path, init = {}) => fetch(`${SUPABASE}/rest/v1/${path}`, { ...init, headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json', ...init.headers } })
  await check("with B's token, only B's rows are returned", async () => {
    const res = await rest('library_entries?select=user_id,album_id', { headers: { Authorization: `Bearer ${b.token}` } })
    if (!res.ok) throw new Error(await describeFailure(res))
    const rows = await res.json()
    expectEqual(rows.map((row) => [row.user_id === b.id, row.album_id]), [[true, 'checkB']], 'rows')
  })
  await check("B cannot insert a row for A", async () => {
    const res = await rest('library_entries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${b.token}` },
      body: JSON.stringify({ user_id: a.id, album_id: 'sneaky', album: { id: 'sneaky' }, added_at: T1, updated_at: T1 }),
    })
    if (res.ok) throw new Error('the insert was accepted')
  })
  await check('the public key without a signed-in user sees nothing', async () => {
    const res = await rest('library_entries?select=album_id')
    if (res.ok && (await res.json()).length > 0) throw new Error('rows were returned to a signed-out caller')
  })

  step('Deleting both accounts through our API')
  await check('DELETE /api/me removes the data and the accounts', async () => {
    for (const user of [a, b]) {
      expectEqual((await api('DELETE', '/api/me', user.token)).status, 204, `delete ${user.email}`)
      console.log(`      deleted ${user.email}`)
    }
    const left = await accounts.db.query(
      `select (select count(*) from library_entries where user_id = any($1::uuid[]))
            + (select count(*) from collections where user_id = any($1::uuid[]))
            + (select count(*) from profiles where id = any($1::uuid[])) as n`,
      [[a.id, b.id]],
    )
    expectEqual(Number(left.rows[0].n), 0, 'rows left')
    expectEqual([await userExists(a.id), await userExists(b.id)], [false, false], 'accounts still exist')
  })
} catch (error) {
  failures++
  console.error(`\n✖ ${error.message}`)
} finally {
  // Always remove every throwaway user, whatever happened above
  step('Cleaning up')
  for (const user of created) {
    try {
      const res = await fetch(`${SUPABASE}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: adminHeaders })
      if (res.ok) console.log(`  deleted throwaway user ${user.email}`)
      else if (res.status === 404) console.log(`  throwaway user ${user.email} was already deleted`)
      else console.log(`  ✗ could not delete ${user.email} (${await describeFailure(res)}). Delete it in Authentication → Users.`)
    } catch (error) {
      console.log(`  ✗ could not delete ${user.email} (${error.message}). Delete it in Authentication → Users.`)
    }
  }
  if (created.length === 0) console.log('  nothing to clean up')
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()))
  await accounts?.db.close().catch(() => {})
}

console.log(failures === 0 ? '\n✔ All live checks passed.' : `\n✖ ${failures} check(s) failed.`)
process.exitCode = failures === 0 ? 0 : 1
