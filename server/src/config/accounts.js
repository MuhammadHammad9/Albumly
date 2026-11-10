// Reads the account settings from the environment. Only the variable NAMES ever appear in
// messages; values (keys, passwords) are never printed.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAuthAdmin } from '../auth/supabaseAdmin.js'
import { createTokenVerifier, remoteKeySet } from '../auth/verifyToken.js'
import { createPgDatabase } from '../db/database.js'

export const REQUIRED_VARIABLES = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATABASE_URL']
const SERVER_DIR = fileURLToPath(new URL('../../', import.meta.url))

const isSet = (env, name) => typeof env[name] === 'string' && env[name].trim() !== ''

// { ok: true, ...settings } or { ok: false, missing: [names], problem? }
export function readAccountsConfig(env = process.env) {
  const missing = REQUIRED_VARIABLES.filter((name) => !isSet(env, name))
  if (missing.length > 0) return { ok: false, missing }

  let supabaseUrl
  try {
    supabaseUrl = new URL(env.SUPABASE_URL.trim()).origin
  } catch {
    return { ok: false, missing: [], problem: 'SUPABASE_URL is not a valid web address' }
  }

  return {
    ok: true,
    supabaseUrl,
    secretKey: env.SUPABASE_SECRET_KEY.trim(),
    publishableKey: isSet(env, 'SUPABASE_PUBLISHABLE_KEY') ? env.SUPABASE_PUBLISHABLE_KEY.trim() : null,
    databaseUrl: env.DATABASE_URL.trim(),
    sslCaPath: isSet(env, 'DATABASE_SSL_CA') ? path.resolve(SERVER_DIR, env.DATABASE_SSL_CA.trim()) : null,
    production: env.NODE_ENV === 'production',
    // SIGNUP_EMAIL_CONFIRMATION=off: our server creates accounts already confirmed, so sign-up
    // never waits on an email (Supabase's built-in sender allows only a few per hour)
    instantSignup: env.SIGNUP_EMAIL_CONFIRMATION?.trim().toLowerCase() === 'off',
  }
}

// TLS settings for the database connection. With Supabase's CA certificate the server's identity
// is checked; without it the connection is still encrypted but not verified (development only).
export function databaseSsl(config, warn = console.warn) {
  if (config.sslCaPath) return { ca: readFileSync(config.sslCaPath, 'utf8'), rejectUnauthorized: true }
  if (config.production) throw new Error('DATABASE_SSL_CA must be set in production')
  warn('DATABASE_SSL_CA is not set: the database connection is encrypted but the server certificate is not verified.')
  return { rejectUnauthorized: false }
}

// Everything the account routes need, built from a valid config
export async function createAccounts(config) {
  const authAdmin = createAuthAdmin({ supabaseUrl: config.supabaseUrl, secretKey: config.secretKey })
  const verify = createTokenVerifier({
    issuer: `${config.supabaseUrl}/auth/v1`,
    keySet: remoteKeySet(config.supabaseUrl),
    getUserFromAuthServer: authAdmin.getUser,
  })
  const db = await createPgDatabase({ connectionString: config.databaseUrl, ssl: databaseSsl(config) })
  return { verify, db, authAdmin, instantSignup: config.instantSignup }
}
