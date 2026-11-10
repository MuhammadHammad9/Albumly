// Vite settings for the Playwright end-to-end tests. Reuses vite.config.js and changes only
// what must differ, so the tests run the same app code as development.
//
// E2E_VARIANT picks one of three test copies of the client (each started by playwright.config.js):
//   (unset)    dev server on 5288 → API 5066, accounts off
//   accounts   dev server on 5289 → API 5067; the Supabase settings come from the environment
//   prod       production build in e2e/.dist, served by `vite preview` on 5290 → API 5066, with the
//              same security headers as client/vercel.json, so the real CSP is tested
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

const VARIANTS = {
  default: { client: 5288, api: 5066, cache: 'node_modules/.vite-e2e' },
  accounts: { client: 5289, api: 5067, cache: 'node_modules/.vite-e2e-accounts' },
  prod: { client: 5290, api: 5066, cache: 'node_modules/.vite-e2e-prod' },
}
const variant = VARIANTS[process.env.E2E_VARIANT] ?? VARIANTS.default

// The headers Vercel would send, read from vercel.json. In the test the API is reached through
// the preview server's proxy (same address), so the placeholder API host is simply dropped.
function vercelHeaders() {
  const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'))
  const rule = vercel.headers.find((item) => item.source === '/(.*)')
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key, value.replaceAll(' https://REPLACE-WITH-API-HOST.onrender.com', '')]))
}

export default (env) => {
  const base = typeof baseConfig === 'function' ? baseConfig(env) : baseConfig
  const api = `http://127.0.0.1:${variant.api}`
  const config = mergeConfig(base, {
    // An empty folder: client/.env.local (real Supabase keys) is never loaded. The accounts copy
    // gets pretend values through environment variables instead.
    envDir: fileURLToPath(new URL('../e2e/env', import.meta.url)),
    // Its own cache, so it never clashes with another dev server running from this folder
    cacheDir: variant.cache,
    server: { port: variant.client, strictPort: true, host: '127.0.0.1' },
    preview: { port: variant.client, strictPort: true, host: '127.0.0.1' },
    build: { outDir: fileURLToPath(new URL('../e2e/.dist', import.meta.url)), emptyOutDir: true },
  })
  // Replace (not merge) the proxies, so /api goes only to the e2e API
  config.server.proxy = { '/api': api }
  config.preview.proxy = { '/api': api }
  if (process.env.E2E_VARIANT === 'prod') config.preview.headers = vercelHeaders()
  return config
}
