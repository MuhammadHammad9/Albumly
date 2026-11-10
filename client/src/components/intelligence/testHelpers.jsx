// Test helpers for the Discover pages: a fake /api/intelligence/artists and a render wrapper
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { KNOWN_ARTISTS } from '../../utils/intelligenceFixtures.js'

// Answers like the server: each requested id gets its known data, or nulls. Records every URL.
export function stubIntelligence({ mode = 'mock', known = KNOWN_ARTISTS, budget = { limit: 30, spent: 0, remaining: 30, resetsAt: '2026-11-11T00:00:00.000Z' }, stopped = null } = {}) {
  const byId = new Map(known.map((a) => [a.id, a]))
  const fetch = vi.fn(async (url) => {
    const params = new URL(url, 'http://localhost').searchParams
    const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
    const body = {
      mode,
      artists: ids.map((id) => byId.get(id) ?? { id, artist: null, releases: null, source: null }),
      loaded: [],
      budget,
      stopped,
    }
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export function renderPage(element, { path = '/' } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  )
}

// The fixture library as the store expects it
export function fixtureLibrary(entries, collections = []) {
  return { version: 1, entries: Object.fromEntries(entries.map((entry) => [entry.album.id, entry])), collections }
}
