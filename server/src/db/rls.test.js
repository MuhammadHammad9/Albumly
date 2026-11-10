// The database's own protections, tested directly in SQL: RLS policies, grants and constraints.
// These hold even if a bug in our routes forgets to filter by user.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { applyMigrations } from './migrate.js'
import { USER_A, USER_B, createTestDatabase, resetTestDatabase } from '../test/testDb.js'

let db

const album = (id) => JSON.stringify({ id, name: `Album ${id}` })
const T = '2026-01-01T00:00:00.000Z'

// Adds an entry (and optionally a collection holding it) as `userId`
async function seed(userId, albumId, collectionId) {
  await db.asUser(userId, async (tx) => {
    await tx.query('insert into library_entries (album_id, album, added_at, updated_at) values ($1, $2, $3, $3)', [albumId, album(albumId), T])
    if (collectionId) {
      await tx.query('insert into collections (id, name, created_at, updated_at) values ($1, $2, $3, $3)', [collectionId, `List ${collectionId}`, T])
      await tx.query('insert into collection_albums (collection_id, album_id, position) values ($1, $2, 0)', [collectionId, albumId])
    }
  })
}

const rowsAs = (userId, sql, params) => db.asUser(userId, (tx) => tx.query(sql, params))

beforeAll(async () => {
  db = await createTestDatabase()
})
afterAll(() => db.close())
beforeEach(async () => {
  await resetTestDatabase(db)
  await seed(USER_A, 'albumA', 'listA')
  await seed(USER_B, 'albumB', 'listB')
})

test('running the migrations again changes nothing', async () => {
  expect(await applyMigrations(db)).toEqual([])
})

describe('row level security', () => {
  test('each user only sees their own rows in every table', async () => {
    for (const table of ['library_entries', 'collections', 'collection_albums']) {
      const { rows } = await rowsAs(USER_A, `select user_id from ${table}`)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((row) => row.user_id === USER_A)).toBe(true)
    }
  })

  test("user A cannot change or delete user B's rows, even by naming them", async () => {
    const updated = await rowsAs(USER_A, "update library_entries set review = 'hacked' where user_id = $1", [USER_B])
    const deleted = await rowsAs(USER_A, 'delete from collections where user_id = $1', [USER_B])

    expect(updated.rowCount).toBe(0)
    expect(deleted.rowCount).toBe(0)
    const { rows } = await rowsAs(USER_B, 'select review from library_entries')
    expect(rows).toEqual([{ review: '' }])
  })

  test("user A cannot insert rows that belong to user B", async () => {
    await expect(
      rowsAs(USER_A, 'insert into library_entries (user_id, album_id, album, added_at, updated_at) values ($1, $2, $3, $4, $4)', [USER_B, 'x', album('x'), T]),
    ).rejects.toThrow(/row-level security/)
  })

  test("user A cannot move their own row over to user B", async () => {
    await expect(rowsAs(USER_A, 'update library_entries set user_id = $1', [USER_B])).rejects.toThrow()
  })

  test('new rows belong to the signed-in user automatically', async () => {
    const { rows } = await rowsAs(USER_A, 'insert into library_entries (album_id, album, added_at, updated_at) values ($1, $2, $3, $3) returning user_id', ['new', album('new'), T])
    expect(rows[0].user_id).toBe(USER_A)
  })

  test('signed-out visitors (anon) are refused outright', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('set local role anon')
        await tx.query('select * from library_entries')
      }),
    ).rejects.toThrow(/permission denied/)
  })

  test('the migrations bookkeeping table is closed to app users', async () => {
    await expect(rowsAs(USER_A, 'select * from schema_migrations')).rejects.toThrow(/permission denied/)
  })
})

describe('constraints', () => {
  const insertEntry = (fields) =>
    rowsAs(
      USER_A,
      'insert into library_entries (album_id, album, rating, tags, added_at, updated_at) values ($1, $2, $3, $4, $5, $5)',
      [fields.id ?? 'c1', fields.album ?? album(fields.id ?? 'c1'), fields.rating ?? null, fields.tags ?? [], T],
    )

  test('reject a rating outside 1 to 10', async () => {
    await expect(insertEntry({ rating: 11 })).rejects.toThrow(/check constraint/)
  })

  test('reject bad tags: uppercase, repeated, too many', async () => {
    await expect(insertEntry({ tags: ['Loud'] })).rejects.toThrow(/check constraint/)
    await expect(insertEntry({ tags: ['loud', 'loud'] })).rejects.toThrow(/check constraint/)
    await expect(insertEntry({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).rejects.toThrow(/check constraint/)
  })

  test('reject a snapshot whose id does not match the album id', async () => {
    await expect(insertEntry({ id: 'c1', album: album('other') })).rejects.toThrow(/check constraint/)
  })

  test('reject two collections whose names differ only in case', async () => {
    await expect(rowsAs(USER_A, 'insert into collections (id, name, created_at, updated_at) values ($1, $2, $3, $3)', ['dup', 'LIST LISTA', T])).rejects.toThrow(/unique/)
  })

  test("a collection cannot hold an album the same user has not saved (not even someone else's)", async () => {
    await expect(rowsAs(USER_A, 'insert into collection_albums (collection_id, album_id, position) values ($1, $2, 1)', ['listA', 'albumB'])).rejects.toThrow(/foreign key/)
  })

  test('removing an album also removes it from collections', async () => {
    await rowsAs(USER_A, 'delete from library_entries where album_id = $1', ['albumA'])
    const { rows } = await rowsAs(USER_A, 'select * from collection_albums')
    expect(rows).toEqual([])
  })

  test("deleting an account deletes all of that user's rows and nobody else's", async () => {
    await rowsAs(USER_A, 'insert into profiles (id) values ($1)', [USER_A])
    await db.query('delete from auth.users where id = $1', [USER_A])

    for (const table of ['library_entries', 'collections', 'collection_albums']) {
      const { rows } = await db.query(`select user_id from ${table}`)
      expect(rows.map((row) => row.user_id)).toEqual([USER_B])
    }
    expect((await db.query('select * from profiles')).rows).toEqual([])
  })
})
