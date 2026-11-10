import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fixtureLibrary, renderPage, stubIntelligence } from '../components/intelligence/testHelpers.jsx'
import { preferences } from '../hooks/usePreferences.js'
import { resetLibrary } from '../test/libraryFixtures.js'
import { ENTRIES } from '../utils/intelligenceFixtures.js'
import Discover from './Discover.jsx'

const slow = { timeout: 5000 }

beforeEach(() => {
  resetLibrary(fixtureLibrary(ENTRIES))
  preferences.reset()
})
afterEach(() => vi.unstubAllGlobals())

const recommendations = async () => {
  const heading = await screen.findByRole('heading', { name: 'Recommended for you' }, slow)
  return within(heading.parentElement)
}

test('exit criterion: recommendations exclude owned albums and every one shows a reason', async () => {
  stubIntelligence()
  renderPage(<Discover />)
  const list = await recommendations()
  await list.findByRole('link', { name: 'Afterimage' }, slow)

  const owned = ENTRIES.map((entry) => entry.album.name)
  const items = list.getAllByRole('listitem').filter((item) => item.parentElement.tagName === 'UL' && item.querySelector('h3'))
  expect(items.length).toBeGreaterThan(0)
  for (const item of items) {
    const title = item.querySelector('h3').textContent
    expect(owned).not.toContain(title)
    expect(title).not.toBe('Glass Arcade (Deluxe Edition)')
    expect(within(item).getByRole('list', { name: `Why ${title} is recommended` }).children.length).toBeGreaterThan(0)
  }
  // Demo mode knows everything already: no lookup button
  expect(screen.queryByRole('button', { name: /Look up/ })).toBeNull()
})

test('changing a weight re-ranks without asking the server again', async () => {
  const fetch = stubIntelligence()
  renderPage(<Discover />)
  const list = await recommendations()
  await list.findByRole('link', { name: 'Afterimage' }, slow)
  const calls = fetch.mock.calls.length

  fireEvent.change(screen.getByLabelText(/^Connection/), { target: { value: '10' } })
  expect(preferences.getSnapshot().weights.connection).toBe(10)
  expect(fetch.mock.calls.length).toBe(calls)
})

test('on Spotify, the lookup button asks for 3 uncached artists and shows the budget', async () => {
  const fetch = stubIntelligence({ mode: 'spotify', budget: { limit: 30, spent: 6, remaining: 24, resetsAt: '2026-11-11T00:00:00.000Z' } })
  renderPage(<Discover />)
  const button = await screen.findByRole('button', { name: 'Look up 1 more artist' }, slow) // The Paper Lanterns
  expect(screen.getByText(/Uses up to 2 of today’s 24 remaining Spotify lookups/)).toBeInTheDocument()

  fireEvent.click(button)
  await vi.waitFor(() => expect(fetch.mock.calls.some(([url]) => url.includes('load=3'))).toBe(true), slow)
  const url = fetch.mock.calls.find(([u]) => u.includes('load=3'))[0]
  expect(new URL(url, 'http://localhost').searchParams.get('ids')).toBe('the-paper-lanterns')
})

test('a rate-limited lookup shows the existing message', async () => {
  stubIntelligence({ mode: 'spotify', stopped: { code: 'rate_limited', retryAfter: 79_000 } })
  renderPage(<Discover />)
  fireEvent.click(await screen.findByRole('button', { name: /Look up/ }, slow))
  expect(await screen.findByText(/Try again in about 22 hours/, {}, slow)).toBeInTheDocument()
})

test('an empty library opens the quiz, and a quiz pick is enough to start', async () => {
  resetLibrary()
  stubIntelligence()
  renderPage(<Discover />)
  expect(screen.getByRole('heading', { name: 'Tell Albumly what you like' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '2010s' }))
  expect(preferences.getSnapshot().quiz.decades).toEqual([2010])
  expect(screen.queryByRole('heading', { name: 'Tell Albumly what you like' })).toBeNull()
})
