import { beforeAll, expect, test } from 'vitest'
import { mockProvider } from './mockProvider.js'

beforeAll(() => {
  process.env.MOCK_DELAY_MS = '0'
})

test('the demo discography carries a completeness report in the Spotify provider’s shape', async () => {
  const { report, counts } = await mockProvider.getDiscography('neon-harbor')

  expect(counts).toEqual({ album: 6, single: 5, compilation: 1, appears_on: 2 })
  expect(report).toMatchObject({ source: 'mock', requests: 0, duplicatesRemoved: 0, truncated: [], pending: [] })
  expect(report.groups.album).toMatchObject({ reported: 6, retrieved: 6, duplicates: 0, complete: true, truncated: false })
  expect(typeof report.fetchedAt).toBe('string')
})

test('large lazy groups arrive one page at a time, like Spotify', async () => {
  const label = await mockProvider.getDiscography('driftwood-recordings')
  const guitarist = await mockProvider.getDiscography('cass-marlowe')

  expect(label.report.groups.compilation).toMatchObject({ reported: 13, retrieved: 10, complete: false })
  expect(label.report.pending).toEqual(['compilation'])
  expect(guitarist.report.groups.appears_on).toMatchObject({ reported: 13, retrieved: 10, complete: false })
  expect(guitarist.counts.album).toBe(2)
})

test('getDiscographyGroup returns the whole group', async () => {
  const group = await mockProvider.getDiscographyGroup('cass-marlowe', 'appears_on')

  expect(group).toMatchObject({ artistId: 'cass-marlowe', group: 'appears_on', reported: 13, retrieved: 13, complete: true })
  expect(group.releases.every((release) => release.group === 'appears_on' && release.tracks === undefined)).toBe(true)
})

test('unknown groups and artists are rejected', async () => {
  await expect(mockProvider.getDiscographyGroup('cass-marlowe', 'bootlegs')).rejects.toMatchObject({ status: 400 })
  await expect(mockProvider.getDiscographyGroup('nobody', 'compilation')).rejects.toMatchObject({ status: 404 })
})
