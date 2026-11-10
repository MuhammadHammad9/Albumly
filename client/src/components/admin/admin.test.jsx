import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import MetricTiles from './MetricTiles.jsx'
import ReportsQueue from './ReportsQueue.jsx'
import RequestsChart from './RequestsChart.jsx'
import RouteTable from './RouteTable.jsx'
import SpotifyPanel from './SpotifyPanel.jsx'
import TopSearches from './TopSearches.jsx'

const timeline = Array.from({ length: 60 }, (_, i) => ({
  t: new Date(Date.UTC(2026, 10, 10, 12, i)).toISOString(),
  requests: i === 30 ? 50 : 2,
  errors: i === 30 ? 1 : 0,
  rateLimited: 0,
}))

const report = {
  since: '2026-11-10T12:00:00.000Z',
  uptimeSeconds: 3725,
  provider: 'spotify',
  requests: { total: 200, byStatus: { '2xx': 190, '3xx': 0, '4xx': 5, '5xx': 5 }, rateLimited: 3, errors: 5, latency: { avgMs: 40, p50Ms: 25, p95Ms: 250, maxMs: 900 }, topRoutes: [] },
  timeline,
  spotify: { requests: 12, retries: 1, rateLimited: 1, failures: 0, shortCircuited: 2, averageLatencyMs: 180, blocked: { '/artists/:id/albums': 79200 } },
  cache: { hits: 80, shared: 5, misses: 15, size: 42, hitRate: 0.85 },
  topSearches: [],
}

const tileValue = (label) => within(screen.getByText(label).closest('div')).getByRole('definition')

test('tiles show the headline numbers', () => {
  render(<MetricTiles report={report} />)
  expect(tileValue('Requests')).toHaveTextContent('200')
  expect(tileValue('Server errors')).toHaveTextContent('2.5%')
  expect(tileValue('Rate-limited (429)')).toHaveTextContent('3')
  expect(tileValue('Response time p95')).toHaveTextContent('250 ms')
  expect(tileValue('Cache hit ratio')).toHaveTextContent('85%')
  expect(tileValue('Spotify latency')).toHaveTextContent('180 ms')
})

test('in demo mode the Spotify tiles say there is nothing to measure', () => {
  render(<MetricTiles report={{ ...report, provider: 'mock', spotify: null, cache: null }} />)
  expect(tileValue('Cache hit ratio')).toHaveTextContent('not used in demo mode')
  expect(tileValue('Spotify latency')).toHaveTextContent('demo catalogue')
})

test('the chart has a text summary for screen readers', () => {
  render(<RequestsChart timeline={timeline} />)
  expect(screen.getByText(/168 requests, 1 server errors\. Busiest minute: .* with 50\./)).toBeInTheDocument()
})

test('Spotify panel lists counters and blocked endpoints', () => {
  render(<SpotifyPanel provider="spotify" spotify={report.spotify} cache={report.cache} />)
  expect(screen.getByText('Spotify calls').nextElementSibling).toHaveTextContent('12')
  expect(screen.getByText('/artists/:id/albums').closest('li')).toHaveTextContent('about 22 hours left')
})

test('Spotify panel in demo mode', () => {
  render(<SpotifyPanel provider="mock" spotify={null} cache={null} />)
  expect(screen.getByText(/demo catalogue/)).toBeInTheDocument()
})

test('route table and top searches', () => {
  render(
    <>
      <RouteTable routes={[{ route: '/api/artists/:id', count: 12, errors: 1 }]} />
      <TopSearches searches={[{ query: 'daft punk', count: 7 }]} minCount={3} />
    </>,
  )
  expect(screen.getByText('/api/artists/:id').closest('tr')).toHaveTextContent('121')
  expect(screen.getByText('daft punk').closest('li')).toHaveTextContent('(7)')
  expect(screen.getByText(/Shown only after 3 searches/)).toBeInTheDocument()
})

const reports = [
  { id: 'r1', targetType: 'review', reason: 'offensive', details: 'rude', createdAt: '2026-11-10T12:00:00.000Z', resolvedAt: null, resolution: null, target: { label: 'Discovery in “Road trip”', excerpt: 'a rude review', hidden: false } },
  { id: 'r2', targetType: 'collection', reason: 'spam', details: '', createdAt: '2026-11-10T11:00:00.000Z', resolvedAt: '2026-11-10T12:30:00.000Z', resolution: 'hidden', target: { label: 'Buy followers', hidden: true } },
]

test('the reports queue can hide (with a reason), dismiss and restore', () => {
  const onResolve = vi.fn()
  const onRestore = vi.fn()
  render(<ReportsQueue reports={reports} onResolve={onResolve} onRestore={onRestore} />)

  const [open, resolved] = screen.getAllByRole('listitem')
  expect(within(open).getByText('a rude review')).toBeInTheDocument()
  fireEvent.change(within(open).getByLabelText(/Reason shown to the owner/), { target: { value: ' Insults ' } })
  fireEvent.click(within(open).getByRole('button', { name: 'Hide' }))
  expect(onResolve).toHaveBeenCalledWith(reports[0], 'hide', 'Insults')
  fireEvent.click(within(open).getByRole('button', { name: 'Dismiss' }))
  expect(onResolve).toHaveBeenLastCalledWith(reports[0], 'dismiss')

  fireEvent.click(within(resolved).getByRole('button', { name: 'Restore' }))
  expect(onRestore).toHaveBeenCalledWith(reports[1])
})

test('an empty queue says so', () => {
  render(<ReportsQueue reports={[]} status="open" onResolve={vi.fn()} onRestore={vi.fn()} />)
  expect(screen.getByText(/No open reports/)).toBeInTheDocument()
})
