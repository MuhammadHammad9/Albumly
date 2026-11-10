// What the community and admin routes accept. The database checks the same rules again
// (database/migrations/0003_community.sql), so bad data cannot get in by another way.
import { z } from 'zod'
import { slugSchema } from './slug.js'

// Same id rules as the library (Spotify's 22-character ids and the demo catalogue's slugs)
export const albumIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Must be an album id (letters, digits, - or _)')
export const collectionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/, 'Must be a collection id (letters, digits, - or _)')
export const battleIdSchema = z.uuid('Must be a battle id')

export const shareSettingsSchema = z.strictObject({
  visibility: z.enum(['private', 'public']),
  includeReviews: z.boolean().default(false),
})

export const battleCreateSchema = z.strictObject({
  albumIds: z
    .array(albumIdSchema)
    .length(2, 'Pick exactly two albums')
    .refine(([a, b]) => a !== b, 'Pick two different albums'),
})

export const voteSchema = z.strictObject({ choice: z.enum(['a', 'b']) })

export const battlesQuerySchema = z.object({
  view: z.enum(['recent', 'vote']).default('recent'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.iso.datetime().optional(),
})

export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const REPORT_REASONS = ['spam', 'offensive', 'personal_info', 'copyright', 'other']
const reportBase = {
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500, 'Must be at most 500 characters').default(''),
}

// One shape per kind of thing that can be reported
export const reportSchema = z.discriminatedUnion('targetType', [
  z.strictObject({ targetType: z.literal('collection'), slug: slugSchema, ...reportBase }),
  z.strictObject({ targetType: z.literal('review'), slug: slugSchema, albumId: albumIdSchema, ...reportBase }),
  z.strictObject({ targetType: z.literal('battle'), battleId: battleIdSchema, ...reportBase }),
])

export const reportsQuerySchema = z.object({ status: z.enum(['open', 'resolved']).default('open') })

export const resolveSchema = z.strictObject({
  action: z.enum(['hide', 'dismiss']),
  reason: z.string().trim().max(200, 'Must be at most 200 characters').optional(),
})

// DELETE /api/admin/hides/:type/:key. A review's key is "<slug>:<albumId>".
export const hideTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('collection'), key: slugSchema }),
  z.object({ type: z.literal('battle'), key: battleIdSchema }),
  z.object({
    type: z.literal('review'),
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*:[A-Za-z0-9_-]{1,100}$/, 'Must be "<share link id>:<album id>"').max(170),
  }),
])
