import cors from 'cors'
import express from 'express'
import { apiNotFound, errorHandler } from './middleware/errorHandler.js'
import { getProvider } from './providers/index.js'
import { catalogRoutes } from './routes/catalogRoutes.js'
import { mockArtRoutes } from './routes/mockArtRoutes.js'

// The app is built here and started in server.js, so tests can import it without opening the real port
export function createApp() {
  const app = express()

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    const provider = getProvider()
    // The Spotify provider also reports cache hits and Spotify request counts, handy for checking caching works
    res.json({ status: 'ok', provider: provider.name, ...provider.stats?.() })
  })

  app.use('/api/mock/art', mockArtRoutes)
  app.use('/api', catalogRoutes)

  // Order matters: unmatched /api paths become a 404 error, then one handler formats every error
  app.use('/api', apiNotFound)
  app.use(errorHandler)

  return app
}
