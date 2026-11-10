// SQL for shared collections. Owner functions get a `tx` running as the owner (RLS on);
// getPublicCollection may run as a visitor and only goes through get_public_collection().
import { notFound } from '../../utils/errors.js'
import { iso } from './dbAccess.js'
import { toPublicAlbum } from './publicAlbum.js'
import { makeSlug } from './slug.js'

const SLUG_ATTEMPTS = 5

const toShare = (row) =>
  row && {
    slug: row.slug,
    visibility: row.visibility,
    includeReviews: row.include_reviews,
    hidden: row.hidden_at != null,
    hiddenReason: row.hidden_at != null ? (row.hidden_reason ?? null) : null,
  }

async function findCollection(tx, userId, collectionId) {
  const { rows } = await tx.query('select name from collections where user_id = $1 and id = $2', [userId, collectionId])
  // Not saved to the account yet (still syncing) looks the same as someone else's: not found
  if (rows.length === 0) throw notFound('Collection')
  return rows[0]
}

const SHARE_COLUMNS = 'slug, visibility, include_reviews, hidden_at, hidden_reason'

export async function getShare(tx, userId, collectionId) {
  await findCollection(tx, userId, collectionId)
  const { rows } = await tx.query(`select ${SHARE_COLUMNS} from collection_shares where user_id = $1 and collection_id = $2`, [userId, collectionId])
  return toShare(rows[0]) ?? null
}

// Turns sharing on or off. The first time, a share row with a new slug is made.
export async function saveShare(tx, userId, collectionId, { visibility, includeReviews }, { slugFor = makeSlug } = {}) {
  const { name } = await findCollection(tx, userId, collectionId)
  const update = () =>
    tx.query(
      `update collection_shares set visibility = $3, include_reviews = $4, updated_at = now()
       where user_id = $1 and collection_id = $2 returning ${SHARE_COLUMNS}`,
      [userId, collectionId, visibility, includeReviews],
    )

  let { rows } = await update()
  for (let attempt = 0; rows.length === 0 && attempt < SLUG_ATTEMPTS; attempt++) {
    // "do nothing" on any clash: either the slug is taken (try another) or another request made
    // the share a moment ago (then the update below applies the settings)
    ;({ rows } = await tx.query(
      `insert into collection_shares (user_id, collection_id, slug, visibility, include_reviews)
       values ($1, $2, $3, $4, $5) on conflict do nothing returning ${SHARE_COLUMNS}`,
      [userId, collectionId, slugFor(name), visibility, includeReviews],
    ))
    if (rows.length === 0) ({ rows } = await update())
  }
  if (rows.length === 0) throw new Error('Could not create a unique share link')
  return toShare(rows[0])
}

// The public page data, or a 404. Albums are cleaned again and renumbered from 0.
export async function getPublicCollection(tx, slug) {
  const { rows } = await tx.query('select public.get_public_collection($1) as data', [slug])
  const data = rows[0]?.data
  if (!data) throw notFound('Collection')

  const albums = []
  for (const item of data.albums) {
    const album = toPublicAlbum(item.album)
    if (!album) continue
    const entry = { position: albums.length, album }
    if (data.includeReviews) {
      entry.rating = Number.isInteger(item.rating) ? item.rating : null
      entry.review = typeof item.review === 'string' && item.review.trim() ? item.review : null
    }
    albums.push(entry)
  }

  return {
    collection: { slug: data.slug, name: data.name, description: data.description, updatedAt: iso(data.updatedAt), includeReviews: data.includeReviews },
    albums,
  }
}
