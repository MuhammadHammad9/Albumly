import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { apiNotFound, errorHandler } from './middleware/errorHandler.js'
import { createRateLimits } from './middleware/rateLimits.js'
import { getProvider } from './providers/index.js'
import { createAccountRoutes } from './routes/accountRoutes.js'
import { catalogRoutes } from './routes/catalogRoutes.js'
import { createIntelligenceRoutes } from './routes/intelligenceRoutes.js'
import { createLibraryRoutes } from './routes/libraryRoutes.js'
import { mockArtRoutes } from './routes/mockArtRoutes.js'
import { ApiError } from './utils/errors.js'

// Paths that need accounts. Without account settings they answer 503 instead of 404.
const ACCOUNT_PATHS = ['/api/me', '/api/library', '/api/library/{*rest}', '/api/albums/:id/entry', '/api/collections', '/api/collections/{*rest}']

// The app is built here and started in server.js, so tests can import it without opening the real port.
// accounts: { verify, db, authAdmin } when Supabase is configured, otherwise null (local-only mode).
// rateLimits: false turns limiting off; an object overrides the defaults.
export function createApp({ accounts = null, rateLimits, trustProxy } = {}) {
  const app = express()
  const limits = createRateLimits(rateLimits)

  // Behind a hosting proxy, this makes req.ip the visitor's address (needed for per-IP limits)
  if (trustProxy) app.set('trust proxy', trustProxy)

  // Security headers on every response
  app.use(helmet())
  const origins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim())
  app.use(cors({ origin: origins }))
  app.use('/api', limits.general)

  // Only the library upload may be large; everything else stays small
  app.use('/api/library/import', express.json({ limit: '5mb' }))
  app.use(express.json({ limit: '100kb' }))

  app.get('/api/health', (req, res) => {
    const provider = getProvider()
    // The Spotify provider also reports cache hits and Spotify request counts, handy for checking caching works
    res.json({ status: 'ok', provider: provider.name, ...provider.stats?.(), ...(accounts && { accounts: true }) })
  })

  // Demo covers are images the client may load from another host in production
  app.use('/api/mock/art', (req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin')
    next()
  }, mockArtRoutes)

  if (accounts) {
    app.use('/api', createAccountRoutes(accounts, limits))
    app.use('/api', createLibraryRoutes(accounts, limits))
  } else {
    app.all(ACCOUNT_PATHS, (req, res, next) => next(new ApiError(503, 'accounts_unavailable', "Accounts aren't set up on this server.")))
  }
  app.use('/api', createIntelligenceRoutes())
  app.use('/api', catalogRoutes)

  // Order matters: unmatched /api paths become a 404 error, then one handler formats every error
  app.use('/api', apiNotFound)
  app.use(errorHandler)

  return app
}
