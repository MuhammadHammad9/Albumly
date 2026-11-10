// Applies the SQL files in database/migrations in name order, each one exactly once.
// Which files already ran is recorded in the schema_migrations table, so running this again only
// applies new files. Each file runs in its own transaction: it either fully applies or not at all.
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../database/migrations/', import.meta.url))

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  return Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), 'utf8') })))
}

// Returns the names of the files it applied (empty when everything was already up to date)
export async function applyMigrations(db, { dir = MIGRATIONS_DIR, log = () => {} } = {}) {
  await db.exec(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
    alter table public.schema_migrations enable row level security;
    revoke all on public.schema_migrations from anon, authenticated;
  `)

  const { rows } = await db.query('select name from public.schema_migrations')
  const done = new Set(rows.map((row) => row.name))
  const applied = []

  for (const { name, sql } of await listMigrations(dir)) {
    if (done.has(name)) {
      log(`  already applied: ${name}`)
      continue
    }
    await db.transaction(async (tx) => {
      await tx.exec(sql)
      await tx.query('insert into public.schema_migrations (name) values ($1)', [name])
    })
    log(`  applied: ${name}`)
    applied.push(name)
  }
  return applied
}
