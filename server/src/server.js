import 'dotenv/config'
import { createApp } from './app.js'
import { getProvider } from './providers/index.js'

// Hosting platforms inject PORT, so it is honoured in production only. In development some
// tools set PORT for the client dev server, which would make the API collide with Vite.
const hostPort = process.env.NODE_ENV === 'production' ? process.env.PORT : undefined
const PORT = process.env.API_PORT || hostPort || 5000

// Fail at startup, with a clear message, if the catalogue is misconfigured (e.g. missing Spotify keys)
let provider
try {
  provider = getProvider()
} catch (error) {
  console.error(`Albumly API cannot start: ${error.message}`)
  process.exit(1)
}

createApp().listen(PORT, () => {
  console.log(`Albumly API listening on http://localhost:${PORT} (catalogue: ${provider.name})`)
})
