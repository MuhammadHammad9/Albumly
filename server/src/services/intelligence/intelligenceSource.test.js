import { beforeAll, expect, test } from 'vitest'
import { mockProvider } from '../../providers/mockProvider.js'
import { intelligenceSource } from './intelligenceSource.js'

beforeAll(() => {
  process.env.MOCK_DELAY_MS = '0'
})

test('the demo catalogue counts as fully known, genres included, and never loads', async () => {
  const source = intelligenceSource(mockProvider)
  expect(source.mode).toBe('mock')
  expect(source.loadPreview).toBeNull()
  expect(await source.peekArtist('neon-harbor')).toEqual({ id: 'neon-harbor', name: 'Neon Harbor', imageUrl: '/api/mock/art/neon-harbor.svg', genres: ['synthwave', 'dream pop'] })
  const known = await source.peekReleases('neon-harbor')
  expect(known.source).toBe('full')
  expect(known.releases.length).toBeGreaterThan(5)
})

test('an unknown artist is null, not an error', async () => {
  const source = intelligenceSource(mockProvider)
  expect(await source.peekArtist('nobody')).toBeNull()
  expect(await source.peekReleases('nobody')).toBeNull()
})

test('a provider with peek methods is used as it is', async () => {
  const provider = {
    name: 'spotify',
    peekArtist: () => ({ id: 'x', name: 'X', genres: undefined, extra: true }),
    peekReleases: () => ({ source: 'preview', releases: [] }),
    loadPreview: async () => ({ requests: 2 }),
    blockedFor: () => 5,
    previewCost: 2,
  }
  const source = intelligenceSource(provider)
  expect(source.mode).toBe('spotify')
  expect(await source.peekArtist('x')).toEqual({ id: 'x', name: 'X', imageUrl: null, genres: [] })
  expect(source.blockedFor()).toBe(5)
  expect(await source.loadPreview('x')).toEqual({ requests: 2 })
})

test('a provider without a cache to read is "unsupported" and never spends requests', async () => {
  const source = intelligenceSource({ name: 'spotify', getDiscography: () => { throw new Error('must not be called') } })
  expect(source.mode).toBe('unsupported')
  expect(await source.peekReleases('x')).toBeNull()
  expect(source.loadPreview).toBeNull()
})
