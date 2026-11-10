import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { parse } from '../middleware/validate.js'
import { runAs } from '../services/community/dbAccess.js'
import * as reports from '../services/community/reportRepository.js'
import { battleIdSchema, hideTargetSchema, reportsQuerySchema, resolveSchema } from '../services/community/schemas.js'
import { buildMetricsReport } from '../services/metrics/dashboard.js'
import { ApiError } from '../utils/errors.js'

const forbidden = () => new ApiError(403, 'forbidden', 'Only admins can do that.')

// The ops dashboard and the moderation queue. Admins are listed in the app_admins table
// (see docs/phase-7-concepts.md). Signed-in non-admins get 403: the dashboard is no secret.
// metrics: from createRequestMetrics(); getProvider: the catalogue provider (for its stats).
export function createAdminRoutes({ verify, db, metrics, getProvider }) {
  const router = Router()
  const auth = requireAuth(verify)
  // Everything inside runs as the admin; the database functions check is_admin() again
  const asAdmin = (req, fn) => runAs(db, req.user, fn, { forbidden: forbidden() })

  async function requireAdmin(req, res, next) {
    if (!(await asAdmin(req, reports.isAdmin))) throw forbidden()
    next()
  }

  router.get('/admin/status', auth, async (req, res) => {
    res.json({ admin: await asAdmin(req, reports.isAdmin) })
  })

  router.use('/admin', auth, requireAdmin)

  // Reads counters kept in memory; makes no database or Spotify request
  router.get('/admin/metrics', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(buildMetricsReport({ metrics, provider: getProvider() }))
  })

  router.get('/admin/reports', async (req, res) => {
    const { status } = parse(reportsQuerySchema, req.query)
    res.json({ reports: await asAdmin(req, (tx) => reports.listReports(tx, { status })) })
  })

  router.post('/admin/reports/:reportId/resolve', async (req, res) => {
    if (!battleIdSchema.safeParse(req.params.reportId).success) throw new ApiError(404, 'not_found', 'Report not found')
    const resolution = parse(resolveSchema, req.body)
    await asAdmin(req, (tx) => reports.resolveReport(tx, req.params.reportId, resolution))
    res.status(204).end()
  })

  router.delete('/admin/hides/:type/:key', async (req, res) => {
    const target = parse(hideTargetSchema, { type: req.params.type, key: req.params.key })
    await asAdmin(req, (tx) => reports.unhide(tx, target))
    res.status(204).end()
  })

  return router
}
