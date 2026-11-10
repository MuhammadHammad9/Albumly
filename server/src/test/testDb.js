// A fresh in-memory Postgres (PGlite) with the Supabase shim and our migrations applied.
// Tests use it exactly like the real database, RLS included.
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { createPgliteDatabase } from '../db/database.js'
import { applyMigrations } from '../db/migrate.js'

const SHIM = new URL('../../../database/test/supabase-shim.sql', import.meta.url)

export const USER_A = '00000000-0000-4000-8000-00000000000a'
export const USER_B = '00000000-0000-4000-8000-00000000000b'

export async function createTestDatabase() {
  const db = createPgliteDatabase(new PGlite())
  await db.exec(await readFile(SHIM, 'utf8'))
  await applyMigrations(db)
  return db
}

// Empties every table and creates the two test accounts again
export async function resetTestDatabase(db) {
  await db.exec('truncate auth.users cascade')
  await db.query('insert into auth.users (id, email) values ($1, $2), ($3, $4)', [USER_A, 'a@example.com', USER_B, 'b@example.com'])
}
