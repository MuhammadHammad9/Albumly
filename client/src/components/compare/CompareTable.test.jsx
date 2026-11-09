import { render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import CompareTable from './CompareTable.jsx'

const owner = { id: 'nh', name: 'Neon Harbor' }
const track = (n, ms, extra = {}) => ({ id: `t${n}`, name: `T${n}`, discNumber: 1, trackNumber: n, durationMs: ms, explicit: false, artists: [owner], ...extra })

const a = { id: 'a', name: 'Glass Arcade', year: 2015, artists: [owner], totalTracks: 2, totalDurationMs: 400_000, tracks: [track(1, 200_000), track(2, 200_000)] }
const b = {
  id: 'b',
  name: 'Afterimage',
  year: 2021,
  artists: [owner],
  totalTracks: 3,
  totalDurationMs: 700_000,
  tracks: [track(1, 300_000, { explicit: true }), track(2, 200_000), track(3, 200_000, { artists: [owner, { id: 'k', name: 'Kite' }] })],
}

test('shows each measure for both albums with the difference', () => {
  render(<CompareTable albumA={a} albumB={b} />)

  expect(screen.getByRole('columnheader', { name: 'Glass Arcade' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Afterimage' })).toBeInTheDocument()

  const row = (label) => within(screen.getByRole('rowheader', { name: label }).closest('tr')).getAllByRole('cell').map((cell) => cell.textContent)
  expect(row('Release year')).toEqual(['2015', '2021', '6 years later'])
  expect(row('Tracks')).toEqual(['2', '3', '+1'])
  expect(row('Total length')).toEqual(['7 min', '12 min', '+5 min'])
  expect(row('Explicit tracks')).toEqual(['0', '1', '+1'])
  expect(row('Featured artists')).toEqual(['0', '1', '+1'])
})
