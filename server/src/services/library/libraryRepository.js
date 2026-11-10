// Every SQL query for the personal library. Each function receives `tx`, a transaction that is
// already running as the signed-in user (db.asUser), so RLS limits it to that user's rows.
// The queries still say `where user_id = $1` too: two locks on the same door.
import { ApiError, notFound } from '../../utils/errors.js'
import { LIBRARY_VERSION } from '../../schemas/library.js'
import { clampTime, mergeLibrary } from './merge.js'

// Postgres gives back Date objects; the client expects "2026-01-01T00:00:00.000Z" strings
const iso = (value) => (value instanceof Date ? value : new Date(value)).toISOString()

const toEntry = (row) => ({
  album: row.album,
  status: row.status,
  rating: row.rating,
  review: row.review,
  notes: row.notes,
  tags: row.tags,
  addedAt: iso(row.added_at),
  updatedAt: iso(row.updated_at),
})

const toCollection = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  albumIds: row.album_ids,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
})

const COLLECTION_COLUMNS = `c.id, c.name, c.description, c.created_at, c.updated_at,
  array(select ca.album_id from collection_albums ca
        where ca.user_id = c.user_id and ca.collection_id = c.id order by ca.position, ca.album_id) as album_ids`

// Turns database errors into the API's error envelope
export function toApiError(error) {
  if (error instanceof ApiError) return error
  switch (error.code) {
    case '23505':
      return new ApiError(409, 'duplicate_name', 'You already have a collection with that name.')
    case '23503':
      return new ApiError(400, 'not_saved', 'Save the album to your library first.')
    case '23514':
    case '22P02':
    case '22007':
      return new ApiError(400, 'bad_request', 'Some of the data is not valid.')
    case '42501':
      return notFound('Item')
  }
  // No SQL error code: the database could not be reached (paused project, network, ...)
  if (!error.code || /^(08|57P0|53)/.test(error.code) || /^E[A-Z]+$/.test(error.code)) {
    return new ApiError(503, 'database_unavailable', 'Your library is unavailable right now. Try again shortly.')
  }
  return error
}

// ---------- profile ----------

export async function ensureProfile(tx, userId) {
  await tx.query('insert into profiles (id) values ($1) on conflict (id) do nothing', [userId])
  const { rows } = await tx.query('select created_at from profiles where id = $1', [userId])
  return { createdAt: iso(rows[0].created_at) }
}

export async function countLibrary(tx, userId) {
  const { rows } = await tx.query(
    `select (select count(*) from library_entries where user_id = $1)::int as albums,
            (select count(*) from collections where user_id = $1)::int as collections`,
    [userId],
  )
  return rows[0]
}

// ---------- whole library ----------

export async function getLibrary(tx, userId) {
  const entries = await tx.query('select * from library_entries where user_id = $1 order by added_at, album_id', [userId])
  const collections = await tx.query(`select ${COLLECTION_COLUMNS} from collections c where c.user_id = $1 order by c.created_at, c.id`, [userId])
  return {
    version: LIBRARY_VERSION,
    entries: Object.fromEntries(entries.rows.map((row) => [row.album_id, toEntry(row)])),
    collections: collections.rows.map(toCollection),
  }
}

// Used before deleting the account, so no data depends on the cascade alone
export async function deleteAllUserData(tx, userId) {
  for (const table of ['collection_albums', 'collections', 'library_entries']) {
    await tx.query(`delete from ${table} where user_id = $1`, [userId])
  }
  await tx.query('delete from profiles where id = $1', [userId])
}

// ---------- entries ----------

const ENTRY_VALUES = `album = excluded.album, status = excluded.status, rating = excluded.rating,
  review = excluded.review, notes = excluded.notes, tags = excluded.tags, updated_at = excluded.updated_at`

// Saves one album. An older copy (smaller updatedAt) than the stored one is ignored, so the
// newest change wins. Returns { entry, applied }.
export async function upsertEntry(tx, userId, albumId, entry) {
  const updatedAt = clampTime(entry.updatedAt)
  const { rows } = await tx.query(
    `insert into library_entries (user_id, album_id, album, status, rating, review, notes, tags, added_at, updated_at)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
     on conflict (user_id, album_id) do update set ${ENTRY_VALUES}
     where library_entries.updated_at <= excluded.updated_at
     returning *`,
    [userId, albumId, JSON.stringify(entry.album), entry.status, entry.rating, entry.review, entry.notes, entry.tags, entry.addedAt, updatedAt],
  )
  if (rows.length > 0) return { entry: toEntry(rows[0]), applied: true }
  const current = await tx.query('select * from library_entries where user_id = $1 and album_id = $2', [userId, albumId])
  return { entry: toEntry(current.rows[0]), applied: false }
}

export async function deleteEntry(tx, userId, albumId) {
  await tx.query('delete from library_entries where user_id = $1 and album_id = $2', [userId, albumId])
}

// ---------- collections ----------

export async function getCollection(tx, userId, id) {
  const { rows } = await tx.query(`select ${COLLECTION_COLUMNS} from collections c where c.user_id = $1 and c.id = $2`, [userId, id])
  if (rows.length === 0) throw notFound('Collection')
  return toCollection(rows[0])
}

export async function listCollections(tx, userId) {
  const { rows } = await tx.query(`select ${COLLECTION_COLUMNS} from collections c where c.user_id = $1 order by c.created_at, c.id`, [userId])
  return rows.map(toCollection)
}

// Creating the same id twice is a no-op, so a retried request does no harm. Returns { collection, created }.
export async function createCollection(tx, userId, collection) {
  const { rowCount } = await tx.query(
    `insert into collections (user_id, id, name, description, created_at, updated_at) values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id, id) do nothing`,
    [userId, collection.id, collection.name, collection.description, collection.createdAt, clampTime(collection.updatedAt)],
  )
  return { collection: await getCollection(tx, userId, collection.id), created: rowCount > 0 }
}

// Rename / describe. Newest change wins, like entries. Returns { collection, applied }.
export async function updateCollection(tx, userId, id, { name, description, updatedAt }) {
  const { rowCount } = await tx.query(
    `update collections set name = coalesce($3, name), description = coalesce($4, description), updated_at = $5
     where user_id = $1 and id = $2 and updated_at <= $5`,
    [userId, id, name ?? null, description ?? null, clampTime(updatedAt)],
  )
  return { collection: await getCollection(tx, userId, id), applied: rowCount > 0 }
}

export async function deleteCollection(tx, userId, id) {
  await tx.query('delete from collections where user_id = $1 and id = $2', [userId, id])
}

// Appends an album to the end. Adding one that is already there changes nothing.
export async function addToCollection(tx, userId, id, albumId) {
  await getCollection(tx, userId, id) // 404 when it is not yours
  const saved = await tx.query('select 1 from library_entries where user_id = $1 and album_id = $2', [userId, albumId])
  if (saved.rows.length === 0) throw new ApiError(400, 'not_saved', 'Save the album to your library first.')
  await tx.query(
    `insert into collection_albums (user_id, collection_id, album_id, position)
     select $1, $2, $3, coalesce(max(position) + 1, 0) from collection_albums where user_id = $1 and collection_id = $2
     on conflict do nothing`,
    [userId, id, albumId],
  )
  return getCollection(tx, userId, id)
}

export async function removeFromCollection(tx, userId, id, albumId) {
  await getCollection(tx, userId, id)
  await tx.query('delete from collection_albums where user_id = $1 and collection_id = $2 and album_id = $3', [userId, id, albumId])
}

// A new order for the same albums. Anything else (missing or extra albums) is refused.
export async function setCollectionOrder(tx, userId, id, albumIds, updatedAt) {
  const collection = await getCollection(tx, userId, id)
  const sameSet = albumIds.length === collection.albumIds.length && albumIds.every((albumId) => collection.albumIds.includes(albumId))
  if (!sameSet) throw new ApiError(400, 'order_mismatch', 'The new order must contain exactly the albums in the collection.')
  await tx.query(
    `update collection_albums ca set position = o.ord - 1
     from unnest($3::text[]) with ordinality as o(album_id, ord)
     where ca.user_id = $1 and ca.collection_id = $2 and ca.album_id = o.album_id`,
    [userId, id, albumIds],
  )
  await tx.query('update collections set updated_at = greatest(updated_at, $3) where user_id = $1 and id = $2', [userId, id, clampTime(updatedAt)])
  return getCollection(tx, userId, id)
}

// ---------- import (browser library -> account) ----------

// Merges an uploaded library into the account in one transaction. Returns { library, summary }.
export async function importLibrary(tx, userId, incoming) {
  // Lock this user's profile row: two imports for the same account run one after the other
  await ensureProfile(tx, userId)
  await tx.query('select id from profiles where id = $1 for update', [userId])

  const current = await getLibrary(tx, userId)
  const { library, summary, changedEntryIds, changedCollectionIds } = mergeLibrary(current, incoming)

  const entryRows = [...changedEntryIds].map((id) => {
    const entry = library.entries[id]
    return { album_id: id, album: entry.album, status: entry.status, rating: entry.rating, review: entry.review, notes: entry.notes, tags: entry.tags, added_at: entry.addedAt, updated_at: clampTime(entry.updatedAt) }
  })
  if (entryRows.length > 0) {
    // One statement for all rows: the rows travel as one JSON parameter and are unpacked in SQL
    await tx.query(
      `insert into library_entries (user_id, album_id, album, status, rating, review, notes, tags, added_at, updated_at)
       select $1, r.album_id, r.album, r.status, r.rating, r.review, r.notes,
              array(select jsonb_array_elements_text(r.tags)), r.added_at, r.updated_at
       from jsonb_to_recordset($2::jsonb) as r(album_id text, album jsonb, status text, rating smallint, review text,
                                               notes text, tags jsonb, added_at timestamptz, updated_at timestamptz)
       on conflict (user_id, album_id) do update set ${ENTRY_VALUES}`,
      [userId, JSON.stringify(entryRows)],
    )
  }

  const changed = library.collections.filter((collection) => changedCollectionIds.has(collection.id))
  if (changed.length > 0) {
    const collectionRows = changed.map((c) => ({ id: c.id, name: c.name, description: c.description, created_at: c.createdAt, updated_at: clampTime(c.updatedAt) }))
    await tx.query(
      `insert into collections (user_id, id, name, description, created_at, updated_at)
       select $1, r.id, r.name, r.description, r.created_at, r.updated_at
       from jsonb_to_recordset($2::jsonb) as r(id text, name text, description text, created_at timestamptz, updated_at timestamptz)
       on conflict (user_id, id) do update set name = excluded.name, description = excluded.description, updated_at = excluded.updated_at`,
      [userId, JSON.stringify(collectionRows)],
    )
    // Rewrite the album lists of the changed collections
    const ids = changed.map((c) => c.id)
    await tx.query('delete from collection_albums where user_id = $1 and collection_id = any($2::text[])', [userId, ids])
    const memberRows = changed.flatMap((c) => c.albumIds.map((albumId, position) => ({ collection_id: c.id, album_id: albumId, position })))
    if (memberRows.length > 0) {
      await tx.query(
        `insert into collection_albums (user_id, collection_id, album_id, position)
         select $1, r.collection_id, r.album_id, r.position
         from jsonb_to_recordset($2::jsonb) as r(collection_id text, album_id text, position int)`,
        [userId, JSON.stringify(memberRows)],
      )
    }
  }

  return { library: await getLibrary(tx, userId), summary }
}
