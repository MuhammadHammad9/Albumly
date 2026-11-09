import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Forward /api/* to the Express server so the browser only ever talks to one origin in dev
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  test: {
    // jsdom gives tests a fake browser (document, window) to render components into
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
})
