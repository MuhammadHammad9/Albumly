import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
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
