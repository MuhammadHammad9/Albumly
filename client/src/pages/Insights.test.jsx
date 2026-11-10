import { screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { fixtureLibrary, renderPage, stubIntelligence } from '../components/intelligence/testHelpers.jsx'
import { resetLibrary } from '../test/libraryFixtures.js'
import { COLLECTIONS, ENTRIES } from '../utils/intelligenceFixtures.js'
import Insights from './Insights.jsx'

const slow = { timeout: 5000 }

beforeAll(() => {
  // Recharts measures its container; jsdom has no ResizeObserver
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})
beforeEach(() => resetLibrary(fixtureLibrary(ENTRIES, COLLECTIONS)))
afterEach(() => vi.unstubAllGlobals())

const tile = (label) => within(screen.getByRole('list', { name: 'Library totals' })).getByText(label).parentElement

test('shows the hand-computed numbers for the fixture library, labelled as the Albumly library', async () => {
  stubIntelligence()
  renderPage(<Insights />)

  expect(screen.getByRole('heading', { level: 1, name: 'Your Albumly library' })).toBeInTheDocument()
  expect(tile('Albums saved')).toHaveTextContent('8')
  expect(tile('Artists')).toHaveTextContent('4')
  expect(tile('Average rating')).toHaveTextContent('7.3/10')
  expect(tile('Average rating')).toHaveTextContent('6 rated')
  expect(tile('Top artist')).toHaveTextContent('Neon Harbor')
  expect(tile('Tracks')).toHaveTextContent('89')

  // Genres arrive from the server's cache (demo catalogue)
  expect(await screen.findByText('Top genre', {}, slow)).toBeInTheDocument()
  expect(tile('Top genre')).toHaveTextContent('dream pop')

  const decades = screen.getByRole('region', { name: 'Albums by decade' })
  expect(within(decades).getByRole('link', { name: '2010s' })).toHaveAttribute('href', '/library?from=2010&to=2019')
  expect(screen.getByText('Your Music DNA')).toBeInTheDocument()
  expect(screen.getByText('Generous Balanced')).toBeInTheDocument()
})

test('without genres the top tag is shown and called a tag', async () => {
  const fetch = stubIntelligence({ mode: 'spotify', known: [] })
  renderPage(<Insights />)
  expect(tile('Top tag')).toHaveTextContent('late night')
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled(), slow)
  expect(fetch.mock.calls[0][0]).not.toContain('load=')
})

test('an empty library gets a friendly empty state', () => {
  resetLibrary()
  stubIntelligence()
  renderPage(<Insights />)
  expect(screen.getByRole('heading', { name: 'No albums saved yet' })).toBeInTheDocument()
})
