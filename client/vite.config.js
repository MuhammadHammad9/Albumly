import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// Share previews need an absolute image address. VITE_SITE_URL (e.g. the Vercel address) is only
// known at deploy time, so the image link is completed here when it is set.
function absoluteShareImage(mode) {
  return {
    name: 'albumly-share-image',
    transformIndexHtml(html) {
      const site = (loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '').trim().replace(/\/+$/, '')
      return site ? html.replace('content="/og-image.png"', `content="${site}/og-image.png"`) : html
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), absoluteShareImage(mode)],
  server: {
    // Forward /api/* to the Express server so the browser only ever talks to one origin in dev.
    // `npm run dev:demo` uses mode "demo": a second API on port 5055 serving the demo catalogue.
    proxy: {
      '/api': mode === 'demo' ? 'http://localhost:5055' : 'http://localhost:5000',
    },
  },
  test: {
    // jsdom gives tests a fake browser (document, window) to render components into
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
}))
