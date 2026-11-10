import { screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Connections from '../../pages/Connections.jsx'
import ReleaseCalendar from '../../pages/ReleaseCalendar.jsx'
import { resetLibrary } from '../../test/libraryFixtures.js'
import { bfs, buildArtistGraph } from '../../utils/artistGraph.js'
import { ENTRIES, KNOWN_ARTISTS, release } from '../../utils/intelligenceFixtures.js'
import ArtistGraph from './ArtistGraph.jsx'
import ConnectionList from './ConnectionList.jsx'
import EraExplorer from './EraExplorer.jsx'
import { fixtureLibrary, renderPage, stubIntelligence } from './testHelpers.jsx'

const slow = { timeout: 5000 }
afterEach(() => vi.unstubAllGlobals())

test('the era explorer groups releases under their album', () => {
  const A = [{ id: 'a', name: 'A' }]
  renderPage(
    <EraExplorer
      releases={[
        release('alb', 'Big Album', '2020-05-01', A),
        release('s', 'Lead Single', '2020-01-10', A, { group: 'single', albumType: 'single', inferredType: 'single', totalTracks: 1 }),
      ]}
    />,
  )
  const era = screen.getByRole('link', { name: 'Big Album' }).closest('li')
  expect(within(era).getByRole('link', { name: 'Lead Single' })).toBeInTheDocument()
  expect(within(era).getByText(/lead-up/)).toBeInTheDocument()
})

test('the graph picture and the list show the same artists', () => {
  const graph = buildArtistGraph(Object.fromEntries(KNOWN_ARTISTS.map((a) => [a.id, a.releases])))
  const search = bfs(graph, ['kite-and-ember'], { maxDepth: 2 })
  renderPage(
    <>
      <ArtistGraph graph={graph} search={search} focusId="kite-and-ember" />
      <ConnectionList graph={graph} search={search} rootId="kite-and-ember" />
    </>,
  )
  expect(screen.getByRole('group', { name: `Connection map of ${search.order.length} artists` })).toBeInTheDocument()
  expect(screen.getByText(/via Wintering/)).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: 'Oda Lindqvist' }).length).toBe(2) // in the SVG and in the list
})

test('the connections page starts from the library’s top artist, reading only the cache', async () => {
  resetLibrary(fixtureLibrary(ENTRIES))
  const fetch = stubIntelligence()
  renderPage(<Connections />, { path: '/discover/connections' })
  expect(await screen.findByText(/via Velvet Hours/, {}, slow)).toBeInTheDocument() // Neon Harbor -> Mara Voss
  expect(fetch.mock.calls.every(([url]) => !url.includes('load='))).toBe(true)
})

test('the release calendar shows the newest year by month', async () => {
  resetLibrary(fixtureLibrary(ENTRIES))
  stubIntelligence()
  renderPage(<ReleaseCalendar />, { path: '/discover/calendar' })
  const year = await screen.findByRole('list', { name: 'Releases in 2023' }, slow)
  const february = within(year).getByText('February').closest('li')
  expect(within(february).getByRole('link', { name: 'Honeyglass' })).toBeInTheDocument()
})
