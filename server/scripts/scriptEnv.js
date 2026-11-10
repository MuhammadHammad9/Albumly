// Shared by db-migrate.js and live-check.js: loads server/.env and reports which variables are
// set. Only NAMES are printed; values (keys, passwords) never are.
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true })

const HELP = {
  SUPABASE_URL: 'Project URL: Project Settings → Data API (or the Connect dialog)',
  SUPABASE_PUBLISHABLE_KEY: 'Project Settings → API Keys → publishable key (or the legacy anon key)',
  SUPABASE_SECRET_KEY: 'Project Settings → API Keys → secret key (or the legacy service_role key)',
  DATABASE_URL: 'Connect → Connection string → Session pooler, with your database password filled in',
  DATABASE_SSL_CA: 'optional: Project Settings → Database → SSL Configuration → Download certificate, saved as server/certs/supabase-ca.crt',
}

const isSet = (name) => typeof process.env[name] === 'string' && process.env[name].trim() !== ''

// Prints "set"/"missing" for each name and exits with a helpful message when a required one is missing
export function requireVariables(required, optional = []) {
  console.log('Checking server/.env (names only, values are never shown):')
  for (const name of [...required, ...optional]) {
    const state = isSet(name) ? 'set' : required.includes(name) ? 'MISSING' : 'not set (optional)'
    console.log(`  ${name.padEnd(26)} ${state}`)
  }
  const missing = required.filter((name) => !isSet(name))
  if (missing.length === 0) return
  console.error('\nCannot continue. Add these to server/.env:')
  for (const name of missing) console.error(`  ${name}  ←  ${HELP[name]}`)
  console.error('Step-by-step instructions: docs/plans/phase-5-plan.md §10.')
  process.exit(1)
}

export const step = (text) => console.log(`\n▶ ${text}`)
