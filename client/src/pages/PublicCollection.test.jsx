import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { initialSession, sessionStore } from '../stores/sessionStore.js'
import PublicCollection from './PublicCollection.jsx'

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch(handler) {
  const fetch = vi.fn(async (url) => handler(String(url)))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function renderAt(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/shared/:slug" element={<PublicCollection />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Accounts are on and the visitor is signed out (with accounts off the page makes no request at all)
beforeEach(() => sessionStore.setState({ ...initialSession, status: 'signedOut' }))
afterEach(() => {
  vi.unstubAllGlobals()
  sessionStore.setState({ ...initialSession })
})

const shared = {
  collection: { slug: 'road-trip-abc12345', name: 'Road trip', description: 'For long drives', updatedAt: '2026-11-10T12:00:00.000Z', includeReviews: false },
  albums: [
    {
      position: 0,
      album: { id: 'a1', name: 'Discovery', artists: [{ id: 'daft', name: 'Daft Punk' }], year: 2001, coverUrl: 'https://i.scdn.co/image/a1', spotifyUrl: 'https://open.spotify.com/album/a1' },
    },
  ],
}

test('a logged-out visitor sees the shared collection from one API call', async () => {
  const fetch = stubFetch(() => json(shared))
  renderAt('/shared/road-trip-abc12345')

  expect(await screen.findByRole('heading', { name: 'Road trip' })).toBeInTheDocument()
  expect(screen.getByText('For long drives')).toBeInTheDocument()
  expect(screen.getByText('Discovery')).toBeInTheDocument()
  expect(screen.getByText(/1 album · shared from Albumly/)).toBeInTheDocument()
  expect(document.title).toBe('Road trip · Albumly')
  expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

  // Only our own API, once, and no Authorization header (works signed out)
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('/api/public/collections/road-trip-abc12345')
  expect(fetch.mock.calls[0][1]?.headers).toBeUndefined()
})

test('a missing or private collection shows a friendly message', async () => {
  stubFetch(() => json({ error: { code: 'not_found', message: 'Collection not found' } }, 404))
  renderAt('/shared/gone-abc12345')
  expect(await screen.findByText("This collection isn't available")).toBeInTheDocument()
})

test('a malformed link does not even ask the server', () => {
  const fetch = stubFetch(() => json(shared))
  renderAt('/shared/Not_A_Slug!')
  expect(screen.getByText("This collection isn't available")).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})

test('a server without accounts explains that sharing is off', async () => {
  stubFetch(() => json({ error: { code: 'accounts_unavailable', message: "Accounts aren't set up on this server." } }, 503))
  renderAt('/shared/road-trip-abc12345')
  expect(await screen.findByText("Sharing isn't set up on this server")).toBeInTheDocument()
})
