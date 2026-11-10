// Battles, Admin, SharePanel and report wiring with a fake community API (no network)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import SharePanel from '../components/community/SharePanel.jsx'
import { ApiError } from '../services/api.js'
import { initialSession, sessionStore } from '../stores/sessionStore.js'
import { resetLibrary } from '../test/libraryFixtures.js'
import Admin from './Admin.jsx'
import Battles from './Battles.jsx'
import PublicCollection from './PublicCollection.jsx'

const album = (id, name) => ({ id, name, artists: [{ id: 'x', name: 'Artist' }], year: 2001, coverUrl: null, spotifyUrl: `https://open.spotify.com/album/${id}` })
const battle = (id, overrides = {}) => ({ id, albumA: album(`${id}a`, `${id} Left`), albumB: album(`${id}b`, `${id} Right`), votesA: 2, votesB: 1, myVote: null, createdAt: '2026-11-10T12:00:00.000Z', ...overrides })

function renderWith(ui, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const signIn = () => sessionStore.setState({ status: 'signedIn', user: { id: 'u1', email: 'a@example.com' } })

beforeEach(() => {
  sessionStore.setState({ ...initialSession })
  resetLibrary()
})
afterEach(() => vi.unstubAllGlobals())

// ---------- Battles ----------

test('battles: vote, see the result, then move on to the next one', async () => {
  signIn()
  const api = {
    listBattles: vi.fn(async ({ view }) => ({ battles: view === 'vote' ? [battle('b1'), battle('b2')] : [] })),
    vote: vi.fn(async (id, choice) => ({ battle: battle(id, { myVote: choice, votesA: 3 }) })),
    getLeaderboard: vi.fn(),
    createBattle: vi.fn(),
  }
  renderWith(<Battles api={api} />, '/battles')

  fireEvent.click(await screen.findByRole('button', { name: /Pick left: b1 Left/ }))
  await waitFor(() => expect(api.vote).toHaveBeenCalledWith('b1', 'a'))
  expect(await screen.findByText('b1 Left is ahead')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Next battle' }))
  expect(await screen.findByRole('button', { name: /Pick left: b2 Left/ })).toBeInTheDocument()
  expect(api.listBattles).toHaveBeenCalledWith({ view: 'vote', limit: 20 })
})

test('battles: a second vote shows the already-voted message', async () => {
  signIn()
  const api = {
    listBattles: vi.fn(async () => ({ battles: [battle('b1')] })),
    vote: vi.fn(async () => Promise.reject(new ApiError(409, 'already_voted', 'x'))),
    getLeaderboard: vi.fn(),
  }
  renderWith(<Battles api={api} />, '/battles')
  fireEvent.click(await screen.findByRole('button', { name: /Pick right/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('You already voted in this battle.')
})

test('battles: signed-out visitors start on Recent with results and can open the leaderboard', async () => {
  sessionStore.setState({ status: 'signedOut' })
  const api = {
    listBattles: vi.fn(async () => ({ battles: [battle('b1')] })),
    getLeaderboard: vi.fn(async () => ({ albums: [{ rank: 1, album: album('a1', 'Discovery'), wins: 9, votes: 10, winRate: 0.9, score: 0.6 }], minVotes: 5 })),
  }
  renderWith(<Battles api={api} />, '/battles')

  expect(await screen.findByText('b1 Left is ahead')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pick/ })).not.toBeInTheDocument()
  expect(api.listBattles).toHaveBeenCalledWith({ view: 'recent', limit: 20 })

  fireEvent.click(screen.getByRole('tab', { name: 'Leaderboard' }))
  expect(await screen.findByText('Discovery')).toBeInTheDocument()
})

test('battles: without accounts the page explains why there is nothing', () => {
  renderWith(<Battles api={{}} />, '/battles')
  expect(screen.getByText('Battles need accounts')).toBeInTheDocument()
})

// ---------- Admin ----------

const report = {
  since: '2026-11-10T12:00:00.000Z',
  uptimeSeconds: 60,
  provider: 'mock',
  requests: { total: 10, byStatus: { '2xx': 10, '3xx': 0, '4xx': 0, '5xx': 0 }, rateLimited: 0, errors: 0, latency: { avgMs: 5, p50Ms: 5, p95Ms: 10, maxMs: 12 }, topRoutes: [{ route: '/api/battles', count: 10, errors: 0 }] },
  timeline: [{ t: '2026-11-10T12:00:00.000Z', requests: 10, errors: 0, rateLimited: 0 }],
  spotify: null,
  cache: null,
  topSearches: [],
  searches: { tracked: 0, total: 0, minCount: 3 },
}

test('admin: non-admins see "Admins only" and no data is requested', async () => {
  signIn()
  const api = { adminStatus: vi.fn(async () => ({ admin: false })), adminMetrics: vi.fn(), adminReports: vi.fn() }
  renderWith(<Admin api={api} />)
  expect(await screen.findByText('Admins only')).toBeInTheDocument()
  expect(api.adminMetrics).not.toHaveBeenCalled()
  expect(api.adminReports).not.toHaveBeenCalled()
})

test('admin: signed-out visitors are asked to sign in', () => {
  sessionStore.setState({ status: 'signedOut' })
  renderWith(<Admin api={{ adminStatus: vi.fn() }} />)
  expect(screen.getByText('Sign in as an admin')).toBeInTheDocument()
})

test('admin: dashboard and moderation queue work for admins', async () => {
  signIn()
  const open = [{ id: 'r1', targetType: 'collection', reason: 'spam', details: '', createdAt: '2026-11-10T12:00:00.000Z', resolvedAt: null, resolution: null, target: { label: 'Buy followers', excerpt: null, hidden: false, hideKey: 'buy-abc12345' } }]
  const api = {
    adminStatus: vi.fn(async () => ({ admin: true })),
    adminMetrics: vi.fn(async () => report),
    adminReports: vi.fn(async ({ status }) => ({ reports: status === 'open' ? open : [] })),
    resolveReport: vi.fn(async () => null),
    unhide: vi.fn(),
  }
  renderWith(<Admin api={api} />)

  expect(await screen.findByText('/api/battles')).toBeInTheDocument()
  const item = (await screen.findByText(/Buy followers/)).closest('li')
  fireEvent.click(within(item).getByRole('button', { name: 'Hide' }))
  await waitFor(() => expect(api.resolveReport).toHaveBeenCalledWith('r1', { action: 'hide', reason: undefined }))
  await waitFor(() => expect(api.adminReports).toHaveBeenCalledTimes(2)) // the queue reloads
})

// ---------- SharePanel ----------

test('share panel: hidden without accounts, sign-in prompt when signed out', () => {
  const { container, unmount } = renderWith(<SharePanel collectionId="c1" api={{}} />)
  expect(container).toBeEmptyDOMElement()
  unmount()
  sessionStore.setState({ status: 'signedOut' })
  renderWith(<SharePanel collectionId="c1" api={{}} />)
  expect(screen.getByText(/to share this collection/)).toBeInTheDocument()
})

test('share panel: turning on sharing saves and shows the link', async () => {
  signIn()
  const api = {
    getShare: vi.fn(async () => ({ share: null })),
    saveShare: vi.fn(async (id, settings) => ({ share: { slug: 'road-trip-abc12345', hidden: false, hiddenReason: null, ...settings } })),
  }
  renderWith(<SharePanel collectionId="c1" api={api} />)

  fireEvent.click(await screen.findByLabelText(/Anyone with the link/))
  await waitFor(() => expect(api.saveShare).toHaveBeenCalledWith('c1', { visibility: 'public', includeReviews: false }))
  expect(await screen.findByLabelText('Share link')).toHaveValue(`${window.location.origin}/shared/road-trip-abc12345`)
})

test('share panel: a collection that has not synced yet says so', async () => {
  signIn()
  const api = { getShare: vi.fn(async () => Promise.reject(new ApiError(404, 'not_found', 'Collection not found'))) }
  renderWith(<SharePanel collectionId="c1" api={api} />)
  expect(await screen.findByText(/hasn't reached your account yet/)).toBeInTheDocument()
})

// ---------- reporting from a shared collection ----------

test('a signed-in visitor can report a shared review', async () => {
  signIn()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          collection: { slug: 'road-trip-abc12345', name: 'Road trip', description: '', updatedAt: '2026-11-10T12:00:00.000Z', includeReviews: true },
          albums: [{ position: 0, album: album('a1', 'Discovery'), rating: 8, review: 'Nice' }],
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    ),
  )
  const api = { report: vi.fn(async () => ({ reported: true })) }
  renderWith(
    <Routes>
      <Route path="/shared/:slug" element={<PublicCollection api={api} />} />
    </Routes>,
    '/shared/road-trip-abc12345',
  )

  fireEvent.click(await screen.findByRole('button', { name: 'Report this review' }))
  fireEvent.click(screen.getByLabelText('Offensive or hateful'))
  fireEvent.click(screen.getByRole('button', { name: 'Send report' }))
  await waitFor(() => expect(api.report).toHaveBeenCalledWith({ targetType: 'review', slug: 'road-trip-abc12345', albumId: 'a1' }, { reason: 'offensive', details: '' }))
  expect(screen.getByRole('button', { name: 'Report this collection' })).toBeInTheDocument()
})
