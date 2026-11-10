// npm run db:migrate
// Applies database/migrations/*.sql to the real Supabase database (each file once) and shows
// which tables have Row Level Security switched on. Never prints secrets.
import { requireVariables, step } from './scriptEnv.js'
import { databaseSsl, readAccountsConfig } from '../src/config/accounts.js'
import { createPgDatabase } from '../src/db/database.js'
import { applyMigrations } from '../src/db/migrate.js'

const TABLES = ['profiles', 'library_entries', 'collections', 'collection_albums']

requireVariables(['DATABASE_URL'], ['DATABASE_SSL_CA'])

// Only the database settings matter here, so fill the others with placeholders for the config reader
const config = readAccountsConfig({ ...process.env, SUPABASE_URL: process.env.SUPABASE_URL || 'https://placeholder.invalid', SUPABASE_SECRET_KEY: 'unused' })
if (!config.ok) {
  console.error(config.problem ?? 'Configuration problem')
  process.exit(1)
}

let db
try {
  step('Connecting to the database')
  db = await createPgDatabase({ connectionString: config.databaseUrl, ssl: databaseSsl(config, (text) => console.warn(`  note: ${text}`)), max: 1 })
  await db.query('select 1')
  console.log('  connected')

  step('Applying migrations')
  const applied = await applyMigrations(db, { log: console.log })
  console.log(applied.length ? `  ${applied.length} new migration(s) applied` : '  already up to date')

  step('Checking Row Level Security')
  const { rows } = await db.query(
    `select c.relname as table, c.relrowsecurity as rls,
            (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any($1::text[]) order by c.relname`,
    [TABLES],
  )
  for (const row of rows) console.log(`  ${row.table.padEnd(20)} RLS ${row.rls ? 'on ' : 'OFF'}  ${row.policies} policies`)
  const problems = TABLES.filter((name) => !rows.some((row) => row.table === name && row.rls && row.policies === 4))
  if (problems.length) throw new Error(`These tables are missing RLS or policies: ${problems.join(', ')}`)

  console.log('\n✔ Database is ready.')
} catch (error) {
  console.error(`\n✖ ${explain(error)}`)
  process.exitCode = 1
} finally {
  await db?.close().catch(() => {})
}

// Friendlier messages for the usual connection mistakes (the error text never contains the password)
function explain(error) {
  const message = error.message ?? String(error)
  if (/password authentication failed/i.test(message)) return 'The database password in DATABASE_URL is wrong (replace [YOUR-PASSWORD] with the password you chose when creating the project).'
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) return 'The database host in DATABASE_URL could not be found. Copy the Session pooler string again from the Connect dialog.'
  if (/ENETUNREACH|EHOSTUNREACH/.test(message)) return 'The database could not be reached. Use the Session pooler string (the direct connection is IPv6-only on the free plan).'
  if (/self-signed|certificate/i.test(message)) return `TLS certificate problem: ${message}. Check that DATABASE_SSL_CA points to the certificate downloaded from Supabase.`
  if (/ETIMEDOUT|timeout/i.test(message)) return 'Connecting timed out. Is the project paused? Restore it in the Supabase dashboard.'
  return message
}
