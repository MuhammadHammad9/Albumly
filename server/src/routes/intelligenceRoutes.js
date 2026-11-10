import { Router } from 'express'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { getProvider as defaultGetProvider } from '../providers/index.js'
import { createFileStorage } from '../services/cache/fileStorage.js'
import { intelligenceSource } from '../services/intelligence/intelligenceSource.js'
import { createRequestBudget, dailyLimitFromEnv } from '../services/intelligence/requestBudget.js'
import { badRequest } from '../utils/errors.js'

// GET /api/intelligence/artists?ids=a,b,c&load=0
// What the catalogue already knows about some artists: their details (genres) and releases.
// load=0 (the default) only reads the cache and never calls Spotify. load=1..3 also looks up that
// many uncached artists, in the order given, within a small daily budget.

export const MAX_IDS = 40
export const MAX_LOAD = 3
const MAX_RELEASES_PER_ARTIST = 80 // keeps the answer small for artists with huge discographies

const BUDGET_FILE = fileURLToPath(new URL('../../.cache/intelligence-budget.json', import.meta.url))

const querySchema = z.object({
  ids: z
    .string({ error: '"ids" is required' })
    .transform((value) => [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))])
    .pipe(
      z
        .array(z.string().regex(/^[A-Za-z0-9-]{1,64}$/, 'Each id must be letters, digits or dashes'))
        .min(1, '"ids" needs at least one artist id')
        .max(MAX_IDS, `"ids" can list at most ${MAX_IDS} artists`),
    ),
  load: z.coerce.number().int().min(0).max(MAX_LOAD, `"load" must be 0 to ${MAX_LOAD}`).default(0),
})

function parseQuery(query) {
  const result = querySchema.safeParse({ ids: query.ids, load: query.load })
  if (!result.success) throw badRequest(result.error.issues[0].message)
  return result.data
}

const newestFirst = (a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')

async function peek(source, id) {
  const [artist, known] = await Promise.all([source.peekArtist(id), source.peekReleases(id)])
  return {
    artist,
    releases: known ? [...known.releases].sort(newestFirst).slice(0, MAX_RELEASES_PER_ARTIST) : null,
    source: known?.source ?? null,
  }
}

export function createIntelligenceRoutes({ getProvider = defaultGetProvider, budget } = {}) {
  budget ??= createRequestBudget({
    limit: dailyLimitFromEnv(process.env.INTELLIGENCE_DAILY_REQUESTS),
    storage: createFileStorage(BUDGET_FILE, { delayMs: 0 }),
  })
  const router = Router()

  router.get('/intelligence/artists', async (req, res) => {
    const { ids, load } = parseQuery(req.query)
    const source = intelligenceSource(getProvider())

    const results = new Map(await Promise.all(ids.map(async (id) => [id, await peek(source, id)])))
    const loaded = []
    let stopped = null

    if (load > 0 && source.loadPreview) {
      const missing = ids.filter((id) => !results.get(id).releases).slice(0, load)
      for (const id of missing) {
        // Checked before every lookup: a block means a request would only be refused
        const blocked = source.blockedFor()
        if (blocked > 0) {
          stopped = { code: 'rate_limited', retryAfter: blocked }
          break
        }
        // Start only when even the worst case fits, so the daily cap is never overshot
        if (!budget.canSpend(source.previewCost)) {
          stopped = { code: 'budget_exhausted' }
          break
        }
        try {
          const { requests } = await source.loadPreview(id)
          budget.spend(requests)
          loaded.push(id)
          results.set(id, await peek(source, id))
        } catch (error) {
          budget.spend(error.requestsSpent ?? 0)
          if (error.status === 404 || error.code === 'bad_request') continue // this artist only
          stopped = error.code === 'rate_limited' ? { code: 'rate_limited', retryAfter: error.retryAfter ?? null } : { code: error.code ?? 'upstream_error' }
          break
        }
      }
    }

    res.json({
      mode: source.mode,
      artists: ids.map((id) => ({ id, ...results.get(id) })),
      loaded,
      budget: budget.snapshot(),
      stopped,
    })
  })

  return router
}
