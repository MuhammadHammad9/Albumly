import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parse } from '../middleware/validate.js'
import * as battles from '../services/community/battleRepository.js'
import { runAs } from '../services/community/dbAccess.js'
import { createCommunityLimits } from '../services/community/rateLimits.js'
import * as reports from '../services/community/reportRepository.js'
import {
  battleCreateSchema,
  battleIdSchema,
  battlesQuerySchema,
  collectionIdSchema,
  leaderboardQuerySchema,
  reportSchema,
  shareSettingsSchema,
  voteSchema,
} from '../services/community/schemas.js'
import * as shares from '../services/community/shareRepository.js'
import { slugSchema } from '../services/community/slug.js'
import { ApiError } from '../utils/errors.js'

// Signed in is optional here: no Authorization header → a visitor. A header that is there but
// wrong is still a 401, so a broken session never silently turns into "logged out".
function optionalAuth(verify) {
  const auth = requireAuth(verify)
  return (req, res, next) => (req.get('authorization') ? auth(req, res, next) : next())
}

const alreadyVoted = new ApiError(409, 'already_voted', 'You already voted in this battle.')

// Shared collections, Album Battle and reports.
// rateLimits: false turns the extra community limits off (tests); an object overrides them.
export function createCommunityRoutes({ verify, db, rateLimits }) {
  const router = Router()
  const auth = requireAuth(verify)
  const maybeAuth = optionalAuth(verify)
  const limits = createCommunityLimits(rateLimits)

  router.param('slug', (req, res, next, value) => {
    // A malformed link cannot exist, so it gets the same answer as a missing one
    if (!slugSchema.safeParse(value).success) throw new ApiError(404, 'not_found', 'Collection not found')
    next()
  })
  router.param('collectionId', (req, res, next, value) => {
    parse(collectionIdSchema, value)
    next()
  })
  router.param('battleId', (req, res, next, value) => {
    if (!battleIdSchema.safeParse(value).success) throw new ApiError(404, 'not_found', 'Battle not found')
    next()
  })

  // ---------- shared collections ----------

  // Readable by anyone with the link, signed in or not
  router.get('/public/collections/:slug', async (req, res) => {
    const result = await runAs(db, null, (tx) => shares.getPublicCollection(tx, req.params.slug))
    // Short cache: making a collection private takes effect within 30 seconds everywhere
    res.set('Cache-Control', 'public, max-age=30')
    res.set('X-Robots-Tag', 'noindex')
    res.json(result)
  })

  router.get('/collections/:collectionId/share', auth, async (req, res) => {
    res.json({ share: await runAs(db, req.user, (tx, userId) => shares.getShare(tx, userId, req.params.collectionId)) })
  })

  router.put('/collections/:collectionId/share', auth, async (req, res) => {
    const settings = parse(shareSettingsSchema, req.body)
    res.json({ share: await runAs(db, req.user, (tx, userId) => shares.saveShare(tx, userId, req.params.collectionId, settings)) })
  })

  // ---------- Album Battle ----------

  router.get('/battles', maybeAuth, async (req, res) => {
    const query = parse(battlesQuerySchema, req.query)
    res.json({ battles: await runAs(db, req.user, (tx, userId) => battles.listBattles(tx, userId, query)) })
  })

  router.post('/battles', limits.battleCreate, auth, async (req, res) => {
    const { albumIds } = parse(battleCreateSchema, req.body)
    const { battle, created } = await runAs(db, req.user, (tx, userId) => battles.createBattle(tx, userId, albumIds))
    res.status(created ? 201 : 200).json({ battle })
  })

  router.get('/battles/:battleId', maybeAuth, async (req, res) => {
    res.json({ battle: await runAs(db, req.user, (tx, userId) => battles.getBattle(tx, userId, req.params.battleId)) })
  })

  router.post('/battles/:battleId/vote', limits.vote, auth, async (req, res) => {
    const { choice } = parse(voteSchema, req.body)
    const battle = await runAs(db, req.user, (tx, userId) => battles.vote(tx, userId, req.params.battleId, choice), { conflict: alreadyVoted })
    res.status(201).json({ battle })
  })

  router.get('/leaderboard', async (req, res) => {
    const { limit } = parse(leaderboardQuerySchema, req.query)
    res.json(await runAs(db, null, (tx) => battles.getLeaderboard(tx, { limit })))
  })

  // ---------- reports ----------

  router.post('/reports', limits.report, auth, async (req, res) => {
    const report = parse(reportSchema, req.body)
    const { created } = await runAs(db, req.user, (tx) => reports.createReport(tx, report))
    res.status(created ? 201 : 200).json({ reported: true })
  })

  return router
}
