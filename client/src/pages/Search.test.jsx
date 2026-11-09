import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { resetLibrary } from '../test/libraryFixtures.js'
import Search from './Search.jsx'

const release = (id, name, overrides = {}) => ({
  id,
  name,
  group: 'album',
  albumType: 'album',
  inferredType: 'album',
  releaseDate: '2015-05-22',
  precision: 'day',
  year: 2015,
  totalTracks: 12,
  artists: [{ id: 'neon-harbor', name: 'Neon Harbor' }],
  coverUrl: null,
  spotifyUrl: 'https://open.spotify.com/album/x',
  ...overrides,
})

// Answers /api/search like the server would, and records every request
function stubSearch(items) {
  const fetch = vi.fn(async (url) => {
    const params = new URL(url, 'http://localhost').searchParams
    return new Response(JSON.stringify({ type: params.get('type'), items, total: items.length, offset: 0, limit: 10 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function Location() {
  const location = useLocation()
  return <p data-testid="location">{decodeURIComponent(location.search)}</p>
}

function renderSearch(url) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Search />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => resetLibrary())
afterEach(() => vi.unstubAllGlobals())

test('a structured query picks the tab and sends year filters in one request', async () => {
  const fetch = stubSearch([release('ga', 'Glass Arcade'), release('h', 'Halogen', { inferredType: 'single', totalTracks: 1 })])
  renderSearch('/search?q=neon harbor 2015 album')

  expect(await screen.findByRole('heading', { name: 'Glass Arcade' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText(/Understood as:/)).toHaveTextContent('Text “neon harbor”Year 2015Type Albums only')

  expect(fetch).toHaveBeenCalledTimes(1)
  const params = new URL(fetch.mock.calls[0][0], 'http://localhost').searchParams
  expect(Object.fromEntries(params)).toEqual({ q: 'neon harbor', type: 'album', offset: '0', yearFrom: '2015', yearTo: '2015' })

  // "album" was understood as the release type, so the single is filtered out in the browser
  expect(screen.queryByRole('heading', { name: 'Halogen' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('1 of the 2 loaded match your filters')
})

test('changing a filter moves the parsed parts into the URL and refines without a new request', async () => {
  const fetch = stubSearch([release('ga', 'Glass Arcade'), release('h', 'Halogen', { inferredType: 'single', totalTracks: 1 })])
  renderSearch('/search?q=neon harbor 2015 album')
  await screen.findByRole('heading', { name: 'Glass Arcade' })

  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: '' } })

  expect(screen.getByTestId('location')).toHaveTextContent('?q=neon+harbor&tab=album&kind=&from=2015&to=2015')
  expect(await screen.findByRole('heading', { name: 'Halogen' })).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1) // same server query, served from the cache
})

test('the tracks tab lists tracks with their album', async () => {
  stubSearch([
    {
      id: 't1',
      name: 'Silver Avenue',
      discNumber: 1,
      trackNumber: 1,
      durationMs: 225_000,
      explicit: true,
      artists: [{ id: 'neon-harbor', name: 'Neon Harbor' }],
      spotifyUrl: 'https://open.spotify.com/track/t1',
      album: { id: 'ga', name: 'Glass Arcade', coverUrl: null, releaseDate: '2015-05-22', year: 2015 },
    },
  ])
  renderSearch('/search?q=silver&tab=track')

  expect(await screen.findByText('Silver Avenue')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Glass Arcade' })).toHaveAttribute('href', '/album/ga')
  expect(screen.getByText('3:45')).toBeInTheDocument()
})

test('too short a query shows examples instead of searching', () => {
  const fetch = stubSearch([])
  renderSearch('/search')

  expect(screen.getByRole('heading', { name: 'Search artists, albums and tracks' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'neon harbor 2015 album' })).toBeInTheDocument()
  expect(fetch).not.toHaveBeenCalled()
})
