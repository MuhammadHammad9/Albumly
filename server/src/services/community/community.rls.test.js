// The Phase 7 rules checked directly in the database (PGlite), without our server in between.
// This is what someone calling Supabase's Data API with the public key would run into.
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { createCollection, makeAdmin, saveAlbums } from '../../routes/communityTestApp.js'
import { snapshot } from '../../test/testApp.js'
import { USER_A, USER_B, createTestDatabase, resetTestDatabase } from '../../test/testDb.js'
import { applyMigrations } from '../../db/migrate.js'
import { asVisitor } from './dbAccess.js'

let db
beforeAll(async () => {
  db = await createTestDatabase()
})
afterAll(() => db.close())
beforeEach(() => resetTestDatabase(db))

const asA = (fn) => db.asUser(USER_A, fn)
const asB = (fn) => db.asUser(USER_B, fn)
const anon = (fn) => asVisitor(db, fn)

async function makeBattle() {
  const { rows } = await asA((tx) =>
    tx.query('insert into battles (album_a_id, album_b_id, album_a, album_b) values ($1, $2, $3, $4) returning id', ['a1', 'b2', snapshot('a1'), snapshot('b2')]),
  )
  return rows[0].id
}

async function shareCollection({ visibility = 'public', includeReviews = false } = {}) {
  await saveAlbums(db, USER_A, [{ id: 'a1', review: 'Loved it', rating: 9, notes: 'private note', tags: ['secret'] }, 'b2'])
  await createCollection(db, USER_A, 'c1', ['a1', 'b2'], 'Road trip')
  const { rows } = await asA((tx) =>
    tx.query("insert into collection_shares (collection_id, slug, visibility, include_reviews) values ('c1', 'road-trip-abc12345', $1, $2) returning id", [visibility, includeReviews]),
  )
  return rows[0].id
}

test('migrations 0003 and 0004 applied after Phase 5, and running again changes nothing', async () => {
  const { rows } = await db.query("select name from public.schema_migrations where name like '000%' order by name")
  expect(rows.map((row) => row.name)).toEqual(['0001_library.sql', '0002_rls.sql', '0003_community.sql', '0004_community_rls.sql'])
  expect(await applyMigrations(db)).toEqual([])
})

// ---------- the exit criterion ----------

test('one vote per user per battle is enforced by the database itself', async () => {
  const battleId = await makeBattle()
  await asB((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))

  await expect(asB((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'b')", [battleId]))).rejects.toMatchObject({ code: '23505' })
  // Even as the database owner (no RLS at all), the primary key refuses it
  await expect(db.query("insert into battle_votes (battle_id, user_id, choice) values ($1, $2, 'b')", [battleId, USER_B])).rejects.toMatchObject({ code: '23505' })
  const { rows } = await db.query('select choice from battle_votes where battle_id = $1', [battleId])
  expect(rows).toEqual([{ choice: 'a' }])
})

test('the same pair in either order is one battle', async () => {
  await makeBattle()
  await expect(asB((tx) => tx.query('insert into battles (album_a_id, album_b_id, album_a, album_b) values ($1, $2, $3, $4)', ['a1', 'b2', snapshot('a1'), snapshot('b2')]))).rejects.toMatchObject({ code: '23505' })
  // Reversed order breaks the a < b rule
  await expect(asB((tx) => tx.query('insert into battles (album_a_id, album_b_id, album_a, album_b) values ($1, $2, $3, $4)', ['b2', 'a1', snapshot('b2'), snapshot('a1')]))).rejects.toMatchObject({ code: '23514' })
})

// ---------- votes ----------

test('votes: only your own are readable, and you cannot vote as someone else', async () => {
  const battleId = await makeBattle()
  await asA((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))

  expect((await asB((tx) => tx.query('select * from battle_votes'))).rows).toEqual([])
  await expect(asB((tx) => tx.query("insert into battle_votes (battle_id, user_id, choice) values ($1, $2, 'b')", [battleId, USER_A]))).rejects.toMatchObject({ code: '42501' })
  await expect(asB((tx) => tx.query("update battle_votes set choice = 'b'"))).rejects.toMatchObject({ code: '42501' })
  await expect(anon((tx) => tx.query('select * from battle_votes'))).rejects.toMatchObject({ code: '42501' })
})

test('votes on a hidden battle are refused, and the battle disappears', async () => {
  const battleId = await makeBattle()
  await db.query('update battles set hidden_at = now() where id = $1', [battleId])

  await expect(asB((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))).rejects.toMatchObject({ code: '42501' })
  expect((await anon((tx) => tx.query('select id from battles'))).rows).toEqual([])
  expect((await asB((tx) => tx.query('select * from public.battle_tallies($1::uuid[])', [[battleId]]))).rows).toEqual([])
})

test('battles: visible to visitors, but not who made them; users cannot hide or edit them', async () => {
  const battleId = await makeBattle()
  expect((await anon((tx) => tx.query('select id, album_a_id from battles'))).rows).toEqual([{ id: battleId, album_a_id: 'a1' }])
  await expect(anon((tx) => tx.query('select created_by from battles'))).rejects.toMatchObject({ code: '42501' })
  await expect(asA((tx) => tx.query('update battles set hidden_at = null'))).rejects.toMatchObject({ code: '42501' })
  await expect(anon((tx) => tx.query("insert into battles (album_a_id, album_b_id, album_a, album_b) values ('x', 'y', '{}', '{}')"))).rejects.toMatchObject({ code: '42501' })
})

test('tallies count votes per side for everyone', async () => {
  const battleId = await makeBattle()
  await asA((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))
  await asB((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))
  expect((await anon((tx) => tx.query('select * from public.battle_tallies($1::uuid[])', [[battleId]]))).rows).toEqual([{ battle_id: battleId, votes_a: 2, votes_b: 0 }])
})

// ---------- shared collections ----------

test('visitors read a public collection only through the safe function', async () => {
  await shareCollection({ includeReviews: false })

  const { rows } = await anon((tx) => tx.query("select public.get_public_collection('road-trip-abc12345') as data"))
  const data = rows[0].data
  expect(data).toMatchObject({ slug: 'road-trip-abc12345', name: 'Road trip', includeReviews: false })
  expect(data.albums.map((item) => item.album.id)).toEqual(['a1', 'b2'])
  expect(data.albums[0].review).toBeNull()
  const text = JSON.stringify(data)
  for (const secret of ['private note', 'secret', USER_A, 'Loved it']) expect(text).not.toContain(secret)

  // The tables themselves stay closed to visitors
  for (const table of ['collection_shares', 'library_entries', 'collections', 'reports', 'app_admins', 'review_hides']) {
    await expect(anon((tx) => tx.query(`select * from ${table}`)), table).rejects.toMatchObject({ code: '42501' })
  }
})

test('reviews are shown only when the owner chose to, and never once hidden', async () => {
  const shareId = await shareCollection({ includeReviews: true })
  const read = async () => (await anon((tx) => tx.query("select public.get_public_collection('road-trip-abc12345') as data"))).rows[0].data
  expect((await read()).albums[0]).toMatchObject({ rating: 9, review: 'Loved it' })

  await makeAdmin(db, USER_B)
  await asB((tx) => tx.query("select public.admin_set_hidden('review', $1, 'a1', null, true, 'rude')", [shareId]))
  expect((await read()).albums[0]).toMatchObject({ rating: null, review: null })
})

test('private, hidden and unknown links all return nothing', async () => {
  const shareId = await shareCollection({ visibility: 'private' })
  const read = async (slug) => (await anon((tx) => tx.query('select public.get_public_collection($1) as data', [slug]))).rows[0].data
  expect(await read('road-trip-abc12345')).toBeNull()

  await asA((tx) => tx.query("update collection_shares set visibility = 'public'"))
  expect(await read('road-trip-abc12345')).not.toBeNull()
  await db.query('update collection_shares set hidden_at = now() where id = $1', [shareId])
  expect(await read('road-trip-abc12345')).toBeNull()
  expect(await read('nope-12345678')).toBeNull()
})

test('owners can switch sharing but cannot un-hide, delete, or touch other shares', async () => {
  const shareId = await shareCollection()
  await db.query("update collection_shares set hidden_at = now(), hidden_reason = 'spam' where id = $1", [shareId])

  await expect(asA((tx) => tx.query('update collection_shares set hidden_at = null'))).rejects.toMatchObject({ code: '42501' })
  await expect(asA((tx) => tx.query('delete from collection_shares'))).rejects.toMatchObject({ code: '42501' })
  expect((await asB((tx) => tx.query('select * from collection_shares'))).rows).toEqual([])
  expect((await asB((tx) => tx.query("update collection_shares set visibility = 'private' returning id"))).rows).toEqual([])
  // A share for someone else's collection is refused (the collection is not B's)
  await expect(asB((tx) => tx.query("insert into collection_shares (user_id, collection_id, slug) values ($1, 'c1', 'x-abc12345')", [USER_A]))).rejects.toMatchObject({ code: '42501' })
})

test('deleting the collection deletes its share', async () => {
  await shareCollection()
  await asA((tx) => tx.query("delete from collections where id = 'c1'"))
  expect((await db.query('select count(*)::int as n from collection_shares')).rows[0].n).toBe(0)
})

// ---------- admins and moderation ----------

test('is_admin() is true only for granted users, and admin functions refuse everyone else', async () => {
  await makeAdmin(db, USER_B)
  expect((await asA((tx) => tx.query('select public.is_admin() as admin'))).rows[0].admin).toBe(false)
  expect((await asB((tx) => tx.query('select public.is_admin() as admin'))).rows[0].admin).toBe(true)

  await expect(asA((tx) => tx.query('select public.admin_list_reports(true)'))).rejects.toMatchObject({ code: '42501' })
  await expect(asA((tx) => tx.query("select public.admin_set_hidden('battle', null, null, gen_random_uuid(), true, null)"))).rejects.toMatchObject({ code: '42501' })
  await expect(anon((tx) => tx.query('select public.is_admin()'))).rejects.toMatchObject({ code: '42501' })
  await expect(asA((tx) => tx.query('select * from app_admins'))).rejects.toMatchObject({ code: '42501' })
})

test('reports: one per person per thing, own ones readable, others not', async () => {
  const shareId = await shareCollection()
  const report = (tx) => tx.query("insert into reports (target_type, share_id, reason) values ('collection', $1, 'spam')", [shareId])
  await asB(report)
  await expect(asB(report)).rejects.toMatchObject({ code: '23505' })
  await asA(report)

  expect((await asB((tx) => tx.query('select reporter_id from reports'))).rows).toEqual([{ reporter_id: USER_B }])
  await expect(asB((tx) => tx.query("update reports set resolution = 'dismissed', resolved_at = now()"))).rejects.toMatchObject({ code: '42501' })
  // A report must point at the right kind of thing
  await expect(asB((tx) => tx.query("insert into reports (target_type, reason) values ('battle', 'spam')"))).rejects.toMatchObject({ code: '23514' })
})

test('hiding resolves every open report about the thing, and restore undoes the hide', async () => {
  const shareId = await shareCollection()
  await asB((tx) => tx.query("insert into reports (target_type, share_id, reason) values ('collection', $1, 'spam')", [shareId]))
  await asA((tx) => tx.query("insert into reports (target_type, share_id, reason) values ('collection', $1, 'other')", [shareId]))
  await makeAdmin(db, USER_B)

  const [first] = (await asB((tx) => tx.query('select public.admin_list_reports(true) as r'))).rows[0].r
  expect(first).toMatchObject({ targetType: 'collection', collectionName: 'Road trip', hidden: false })
  await asB((tx) => tx.query("select public.admin_resolve_report($1, 'hide', 'Spam')", [first.id]))

  expect((await asB((tx) => tx.query('select public.admin_list_reports(true) as r'))).rows[0].r).toEqual([])
  const resolved = (await asB((tx) => tx.query('select public.admin_list_reports(false) as r'))).rows[0].r
  expect(resolved.map((row) => [row.resolution, row.hidden])).toEqual([
    ['hidden', true],
    ['hidden', true],
  ])

  await asB((tx) => tx.query("select public.admin_set_hidden('collection', $1, null, null, false, null)", [shareId]))
  const { rows } = await db.query('select hidden_at, hidden_reason from collection_shares')
  expect(rows).toEqual([{ hidden_at: null, hidden_reason: null }])
})

test('deleting an account removes its votes and reports; battles stay without a creator', async () => {
  const battleId = await makeBattle()
  await asA((tx) => tx.query("insert into battle_votes (battle_id, choice) values ($1, 'a')", [battleId]))
  await asA((tx) => tx.query("insert into reports (target_type, battle_id, reason) values ('battle', $1, 'spam')", [battleId]))

  await db.query('delete from auth.users where id = $1', [USER_A])
  const count = async (sql) => (await db.query(sql)).rows[0].n
  expect(await count('select count(*)::int as n from battle_votes')).toBe(0)
  expect(await count('select count(*)::int as n from reports')).toBe(0)
  expect((await db.query('select created_by from battles')).rows).toEqual([{ created_by: null }])
})
