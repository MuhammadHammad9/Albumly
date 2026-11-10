import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The database tests start an embedded PostgreSQL (PGlite) in their setup. That takes a few
    // seconds, and much longer when the whole suite runs at once, so give setup more room.
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
})
