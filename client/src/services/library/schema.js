// The shape of a saved library, written once with zod and used to check data from localStorage
// and from imported files. Anything that does not match is rejected with a readable reason.
import { z } from 'zod'
import { LIMITS, STATUS_KEYS } from '../../utils/library.js'

// Bump when the saved shape changes, and add a step to MIGRATIONS that upgrades the old shape
export const LIBRARY_VERSION = 1

// MIGRATIONS[n] turns a version-n library into version n + 1. Empty for now: version 1 is the first.
// Example of a future step:  1: (data) => ({ ...data, collections: data.collections.map(addColour) })
export const MIGRATIONS = {}

export class LibraryFormatError extends Error {}

export const emptyLibrary = () => ({ version: LIBRARY_VERSION, entries: {}, collections: [] })

// Links only: an imported file must not be able to sneak in a "javascript:" address
const webAddress = z
  .string()
  .max(2000)
  .refine((value) => value === '' || /^(https?:\/\/|\/)/i.test(value), 'Must be a web address')

const timestamp = z.iso.datetime({ error: 'Must be a date and time (ISO 8601)' })
const limited = (max) => z.string().max(max, `Must be at most ${max} characters`)

const albumSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1, 'An album needs a title').max(500),
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
  .min(1, 'Tags cannot be empty')
  .max(LIMITS.tag, `Tags must be at most ${LIMITS.tag} characters`)
  .refine((value) => value === value.trim().toLowerCase(), 'Tags must be lowercase with no spaces at the ends')

export const entrySchema = z.object({
  album: albumSchema,
  status: z.enum(STATUS_KEYS, { error: `Must be one of ${STATUS_KEYS.join(', ')}` }).nullable(),
  rating: z.number().int('Must be a whole number').min(1, 'Must be 1 to 10').max(10, 'Must be 1 to 10').nullable(),
  review: limited(LIMITS.text).default(''),
  notes: limited(LIMITS.text).default(''),
  tags: z
    .array(tag)
    .max(LIMITS.tagsPerAlbum, `At most ${LIMITS.tagsPerAlbum} tags per album`)
    .refine((tags) => new Set(tags).size === tags.length, 'Tags must not repeat')
    .default([]),
  addedAt: timestamp,
  updatedAt: timestamp,
})

export const collectionSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().trim().min(1, 'A collection needs a name').max(LIMITS.collectionName),
  description: limited(LIMITS.collectionDescription).default(''),
  albumIds: z
    .array(z.string())
    .max(5000)
    .refine((ids) => new Set(ids).size === ids.length, 'An album appears twice in this collection'),
  createdAt: timestamp,
  updatedAt: timestamp,
})

// Rules that involve more than one item: keys match ids, collections only hold saved albums,
// and collection ids and names are unique
export const librarySchema = z
  .object({
    version: z.literal(LIBRARY_VERSION),
    entries: z.record(z.string(), entrySchema),
    collections: z.array(collectionSchema).max(500),
  })
  .superRefine((library, ctx) => {
    for (const [key, entry] of Object.entries(library.entries)) {
      if (entry.album.id !== key) ctx.addIssue({ code: 'custom', path: ['entries', key, 'album', 'id'], message: `Must match its key "${key}"` })
    }
    const ids = new Set()
    const names = new Set()
    library.collections.forEach((collection, index) => {
      if (ids.has(collection.id)) ctx.addIssue({ code: 'custom', path: ['collections', index, 'id'], message: 'Another collection has this id' })
      const name = collection.name.toLowerCase()
      if (names.has(name)) ctx.addIssue({ code: 'custom', path: ['collections', index, 'name'], message: 'Another collection has this name' })
      ids.add(collection.id)
      names.add(name)
      collection.albumIds.forEach((albumId, position) => {
        if (!library.entries[albumId]) {
          ctx.addIssue({ code: 'custom', path: ['collections', index, 'albumIds', position], message: `Album "${albumId}" is not in the library` })
        }
      })
    })
  })

// Upgrades older saved data step by step to LIBRARY_VERSION. Throws LibraryFormatError when that is impossible.
export function migrate(raw, migrations = MIGRATIONS, target = LIBRARY_VERSION) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new LibraryFormatError('This is not an Albumly library')
  let { version } = raw
  if (!Number.isInteger(version) || version < 1) throw new LibraryFormatError('This file has no Albumly library version')
  if (version > target) {
    throw new LibraryFormatError(`This library was saved by a newer version of Albumly (format ${version}). Update Albumly to open it.`)
  }

  let data = raw
  while (version < target) {
    const step = migrations[version]
    if (!step) throw new LibraryFormatError(`Albumly cannot upgrade a format ${version} library`)
    data = { ...step(data), version: version + 1 }
    version++
  }
  return data
}

// zod issues -> [{ path: 'entries.abc.rating', message: 'Must be 1 to 10' }]
export const describeIssues = (error) =>
  error.issues.map((issue) => ({ path: issue.path.join('.') || '(file)', message: issue.message }))
