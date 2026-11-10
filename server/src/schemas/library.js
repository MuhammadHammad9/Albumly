// What the library routes accept. Mirrors the client's schema (client/src/services/library/schema.js)
// and the database constraints (database/migrations/0001_library.sql): keep the three in step.
import { z } from 'zod'

export const LIBRARY_VERSION = 1
export const STATUS_KEYS = ['favourite', 'want', 'listening', 'listened']
export const LIMITS = {
  text: 5000,
  tag: 30,
  tagsPerAlbum: 20,
  collectionName: 60,
  collectionDescription: 500,
  collections: 500,
  albumsPerCollection: 5000,
  entries: 10000,
}

// Spotify ids are 22 letters and digits; the demo catalogue uses slugs like "glass-arcade"
const ID = /^[A-Za-z0-9_-]{1,100}$/
export const albumId = z.string().regex(ID, 'Must be an album id (letters, digits, - or _)')
export const collectionId = z.string().regex(ID, 'Must be a collection id (letters, digits, - or _)')

const webAddress = z
  .string()
  .max(2000)
  .refine((value) => value === '' || /^(https?:\/\/|\/)/i.test(value), 'Must be a web address')
const timestamp = z.iso.datetime({ error: 'Must be a date and time (ISO 8601, UTC)' })
const limited = (max) => z.string().max(max, `Must be at most ${max} characters`)
const collectionName = z
  .string()
  .transform((name) => name.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'A collection needs a name').max(LIMITS.collectionName, `Must be at most ${LIMITS.collectionName} characters`))

export const albumSnapshot = z.object({
  id: albumId,
  name: z.string().min(1).max(500),
  artists: z.array(z.object({ id: z.string().max(200), name: z.string().max(500) })).max(50),
  albumType: z.string().max(30),
  inferredType: z.string().max(30),
  releaseDate: z.string().max(10),
  precision: z.enum(['year', 'month', 'day']),
  year: z.number().int().nullable(),
  totalTracks: z.number().int().min(0),
  coverUrl: webAddress.nullable(),
  spotifyUrl: webAddress,
  totalDurationMs: z.number().int().min(0).nullable().default(null),
})

const tag = z
  .string()
  .min(1)
  .max(LIMITS.tag)
  .refine((value) => value === value.trim().toLowerCase(), 'Tags must be lowercase with no spaces at the ends')

export const entrySchema = z.object({
  album: albumSnapshot,
  status: z.enum(STATUS_KEYS).nullable(),
  rating: z.number().int().min(1, 'Must be 1 to 10').max(10, 'Must be 1 to 10').nullable(),
  review: limited(LIMITS.text).default(''),
  notes: limited(LIMITS.text).default(''),
  tags: z
    .array(tag)
    .max(LIMITS.tagsPerAlbum)
    .refine((tags) => new Set(tags).size === tags.length, 'Tags must not repeat')
    .default([]),
  addedAt: timestamp,
  updatedAt: timestamp,
})

const uniqueIds = (ids) => new Set(ids).size === ids.length

export const newCollectionSchema = z.object({
  id: collectionId,
  name: collectionName,
  description: limited(LIMITS.collectionDescription).default(''),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const collectionPatchSchema = z.object({
  name: collectionName.optional(),
  description: limited(LIMITS.collectionDescription).optional(),
  updatedAt: timestamp,
})

export const membershipSchema = z.object({ albumId })

export const orderSchema = z.object({
  albumIds: z.array(albumId).max(LIMITS.albumsPerCollection).refine(uniqueIds, 'An album appears twice'),
  updatedAt: timestamp,
})

// A whole library, as the client keeps it. Used by the import.
export const librarySchema = z
  .object({
    version: z.literal(LIBRARY_VERSION),
    entries: z.record(albumId, entrySchema).refine((entries) => Object.keys(entries).length <= LIMITS.entries, `At most ${LIMITS.entries} albums`),
    collections: z
      .array(newCollectionSchema.extend({ albumIds: z.array(albumId).max(LIMITS.albumsPerCollection).refine(uniqueIds, 'An album appears twice in this collection') }))
      .max(LIMITS.collections),
  })
  .superRefine((library, ctx) => {
    for (const [key, entry] of Object.entries(library.entries)) {
      if (entry.album.id !== key) ctx.addIssue({ code: 'custom', path: ['entries', key, 'album', 'id'], message: `Must match its key "${key}"` })
    }
    const ids = new Set()
    const names = new Set()
    library.collections.forEach((collection, index) => {
      if (ids.has(collection.id)) ctx.addIssue({ code: 'custom', path: ['collections', index, 'id'], message: 'Another collection has this id' })
      if (names.has(collection.name.toLowerCase())) ctx.addIssue({ code: 'custom', path: ['collections', index, 'name'], message: 'Another collection has this name' })
      ids.add(collection.id)
      names.add(collection.name.toLowerCase())
      collection.albumIds.forEach((id, position) => {
        if (!library.entries[id]) ctx.addIssue({ code: 'custom', path: ['collections', index, 'albumIds', position], message: `Album "${id}" is not in the library` })
      })
    })
  })

export const importSchema = z.object({ library: librarySchema })
