// Vite settings for the Playwright end-to-end tests. Reuses vite.config.js and changes only
// what must differ, so the tests run the same app code as development.
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

const API_PORT = Number(process.env.E2E_API_PORT || 5066)
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT || 5288)

export default (env) => {
  const base = typeof baseConfig === 'function' ? baseConfig(env) : baseConfig
  const config = mergeConfig(base, {
    // An empty folder: client/.env.local (Supabase keys) is never loaded, so accounts stay off
    envDir: fileURLToPath(new URL('../e2e/env', import.meta.url)),
    // Its own cache, so it never clashes with a dev server already running from this folder
    cacheDir: 'node_modules/.vite-e2e',
    server: { port: CLIENT_PORT, strictPort: true, host: '127.0.0.1' },
  })
  // Replace (not merge) the proxy, so /api goes only to the e2e API
  config.server.proxy = { '/api': `http://127.0.0.1:${API_PORT}` }
  return config
}
