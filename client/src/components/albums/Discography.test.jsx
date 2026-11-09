import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import Discography from './Discography.jsx'

// The explorer against a stubbed fetch that answers like the Albumly server.
// Queries use headings, links and buttons only, so changes inside AlbumCard do not break this.

const release = (id, name, group, releaseDate, totalTracks = 10) => ({
  id,
  name,
  group,
  albumType: 'album',
  inferredType: 'album',
  releaseDate,
  precision: 'day',
  year: Number(releaseDate.slice(0, 4)),
  totalTracks,
  artists: [{ id: group === 'appears_on' ? 'host' : 'neon', name: group === 'appears_on' ? 'Host Band' : 'Neon Harbor' }],
  coverUrl: null,
  spotifyUrl: `https://open.spotify.com/album/${id}`,
})

const groupInfo = (reported, retrieved = reported, complete = true) => ({
  reported,
  retrieved,
  duplicates: 0,
  complete,
  truncated: false,
  requests: 1,
  fetchedAt: '2026-11-10T10:00:00.000Z',
})

const ALBUMS = [
  release('night', 'Night Ferry', 'album', '2018-10-12', 11),
  release('deluxe', 'Glass Arcade (Deluxe Edition)', 'album', '2016-02-05', 17),
  release('glass', 'Glass Arcade', 'album', '2015-05-22', 12),
]
const GUESTS = [
  release('g3', 'Guest Three', 'appears_on', '2023-01-01'),
  release('g2', 'Guest Two', 'appears_on', '2022-01-01'),
  release('g1', 'Guest One', 'appears_on', '2021-01-01'),
]

const SUMMARY = {
  artistId: 'neon',
  releases: [...ALBUMS, GUESTS[0]],
  counts: { album: 3, single: 0, compilation: 0, appears_on: 1 },
  total: 4,
  report: {
    source: 'mock',
    requests: 0,
    fetchedAt: '2026-11-10T10:00:00.000Z',
    duplicatesRemoved: 0,
    truncated: [],
    pending: ['appears_on'],
    groups: { album: groupInfo(3), single: groupInfo(0), compilation: groupInfo(0), appears_on: groupInfo(3, 1, false) },
  },
}
const FULL_GUESTS = { artistId: 'neon', group: 'appears_on', releases: GUESTS, ...groupInfo(3) }

const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn(async (url) => {
    if (url.endsWith('/discography')) return json(SUMMARY)
    if (url.endsWith('/discography/appears_on')) {
      await new Promise((resolve) => setTimeout(resolve, 20)) // long enough to see the loading line
      return json(FULL_GUESTS)
    }
    return new Response('{}', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const groupRequests = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/discography/appears_on'))

function ShowSearch() {
  return <output data-testid="search">{useLocation().search}</output>
}

function renderExplorer(url = '/artist/neon') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <Discography artistId="neon" />
        <ShowSearch />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const tab = (name) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

test('tab counts use the reported total, and the All tab does not fetch the rest', async () => {
  renderExplorer()

  await screen.findByRole('heading', { name: 'Night Ferry' })
  expect(tab('Appears On')).toHaveTextContent('3')
  expect(tab('All')).toHaveTextContent('6')
  expect(screen.getByText(/Includes the first 1 of 3 guest appearances/)).toBeInTheDocument()
  expect(screen.getByText(/1 group not fully loaded/)).toBeInTheDocument()
  expect(groupRequests()).toHaveLength(0)
})

test('opening Appears On loads the rest of the group', async () => {
  renderExplorer()
  await screen.findByRole('heading', { name: 'Night Ferry' })

  fireEvent.click(tab('Appears On'))

  expect(await screen.findByText('Loading 2 more guest appearances…')).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'Guest One' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Guest Two' })).toBeInTheDocument()
  expect(groupRequests()).toHaveLength(1)

  // Back on All, the loaded group stays loaded and nothing is fetched again
  fireEvent.click(tab('All'))
  expect(screen.getByRole('heading', { name: 'Guest One' })).toBeInTheDocument()
  expect(screen.queryByText(/Includes the first/)).not.toBeInTheDocument()
  expect(groupRequests()).toHaveLength(1)
})

test('a shared link to the Appears On tab loads it straight away', async () => {
  renderExplorer('/artist/neon?tab=appears_on')

  expect(await screen.findByRole('heading', { name: 'Guest Two' })).toBeInTheDocument()
})

test('"Load all" on the All tab fetches the pending groups', async () => {
  renderExplorer()
  await screen.findByRole('heading', { name: 'Night Ferry' })

  fireEvent.click(screen.getByRole('button', { name: 'Load all' }))

  expect(await screen.findByRole('heading', { name: 'Guest Two' })).toBeInTheDocument()
  expect(screen.getByText(/About this discography · complete/)).toBeInTheDocument()
})

test('editions are stacked under the original and can be shown separately', async () => {
  renderExplorer()
  await screen.findByRole('heading', { name: 'Glass Arcade' })

  // Grouped by default: the deluxe edition hides behind a "+1 edition" button
  expect(screen.queryByRole('heading', { name: 'Glass Arcade (Deluxe Edition)' })).not.toBeInTheDocument()
  expect(screen.getByText(/1 alternate edition grouped/)).toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: /\+1 edition of Glass Arcade/ })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')

  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const list = document.getElementById(toggle.getAttribute('aria-controls'))
  expect(within(list).getByRole('link', { name: /Glass Arcade \(Deluxe Edition\)/ })).toHaveAttribute('href', '/album/deluxe')

  // Switching grouping off is stored in the URL
  fireEvent.click(screen.getByRole('button', { name: 'Group editions' }))
  expect(screen.getByTestId('search')).toHaveTextContent('?editions=separate')
  expect(screen.getByRole('heading', { name: 'Glass Arcade (Deluxe Edition)' })).toBeInTheDocument()
})

test('the completeness report lists each group and offers to load the rest', async () => {
  renderExplorer()
  await screen.findByRole('heading', { name: 'Night Ferry' })

  const table = screen.getByRole('table', { name: 'Releases loaded per group' })
  const guestRow = within(table).getByRole('row', { name: /Appears On/ })
  expect(guestRow).toHaveTextContent('13First page only')
  expect(screen.getByText(/1 alternate edition .* detected and grouped/)).toBeInTheDocument()
  expect(screen.getByText(/From the demo catalogue/)).toBeInTheDocument()

  fireEvent.click(within(guestRow).getByRole('button', { name: /Load the rest/ }))
  expect(await screen.findByRole('heading', { name: 'Guest Two' })).toBeInTheDocument()
})
