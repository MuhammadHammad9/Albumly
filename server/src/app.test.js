import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createApp } from './app.js'

let server
let baseUrl

const get = async (path) => {
  const res = await fetch(`${baseUrl}${path}`)
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  process.env.MOCK_DELAY_MS = '0'
  // Port 0 asks the OS for any free port
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
})

afterAll(() => server.close())

test('GET /api/health reports ok and the catalog provider', async () => {
  const { status, body } = await get('/api/health')

  expect(status).toBe(200)
  expect(body).toEqual({ status: 'ok', provider: 'mock' })
})

describe('GET /api/search', () => {
  test('finds artists by name, case-insensitively, best match first', async () => {
    const { status, body } = await get('/api/search?q=NEON')

    expect(status).toBe(200)
    expect(body.items.map((artist) => artist.name)).toEqual(['Neon Harbor', 'Neon Harbour Tribute Band'])
    expect(body.total).toBe(2)
  })

  test('pages through results with offset and limit', async () => {
    const first = await get('/api/search?q=a&limit=3')
    const second = await get('/api/search?q=a&limit=3&offset=3')

    expect(first.body.items).toHaveLength(3)
    expect(first.body.total).toBeGreaterThan(3)
    expect(second.body.offset).toBe(3)
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id)
  })

  test('searches albums when type=album', async () => {
    const { body } = await get('/api/search?q=glass%20arcade&type=album')

    expect(body.items.map((album) => album.name)).toEqual(['Glass Arcade', 'Glass Arcade (Deluxe Edition)'])
    expect(body.items[0].tracks).toBeUndefined()
  })

  test('album search also matches artist names and narrows by year', async () => {
    const all = await get('/api/search?q=neon%20harbor&type=album&limit=10')
    const in2015 = await get('/api/search?q=neon%20harbor&type=album&yearFrom=2015&yearTo=2015')

    expect(all.body.total).toBeGreaterThan(10)
    expect(in2015.body.items.map((album) => album.name)).toEqual(['Glass Arcade', 'Halogen'])
    expect(in2015.body.filters).toEqual({ yearFrom: 2015, yearTo: 2015 })
  })

  test('swaps a reversed year range and filters by artist', async () => {
    const { body } = await get('/api/search?q=glass&type=album&artist=mara&yearFrom=2020&yearTo=2010')

    expect(body.filters).toEqual({ artist: 'mara', yearFrom: 2010, yearTo: 2020 })
    expect(body.items).toEqual([])
  })

  test('searches tracks when type=track, each with its album', async () => {
    const { status, body } = await get('/api/search?q=neon%20harbor&type=track&yearFrom=2024')

    expect(status).toBe(200)
    expect(body.total).toBeGreaterThan(0)
    expect(body.items[0]).toMatchObject({ durationMs: expect.any(Number), album: { year: 2024 } })
    expect(body.items.every((track) => track.album.year >= 2024)).toBe(true)
  })

  test('artist search ignores album-only filters', async () => {
    const { body } = await get('/api/search?q=neon&yearFrom=2015')

    expect(body.filters).toEqual({})
    expect(body.total).toBe(2)
  })

  test.each(['/api/search?q=x&type=album&yearFrom=1800', '/api/search?q=x&type=track&yearTo=abc', `/api/search?q=x&type=album&artist=${'a'.repeat(101)}`])(
    'rejects invalid filters: %s',
    async (path) => {
      expect((await get(path)).status).toBe(400)
    },
  )

  test.each(['/api/search', '/api/search?q=x&type=playlist', '/api/search?q=x&limit=50', '/api/search?q=x&offset=-1'])(
    'rejects invalid input: %s',
    async (path) => {
      const { status, body } = await get(path)

      expect(status).toBe(400)
      expect(body.error.code).toBe('bad_request')
    },
  )

  test('surfaces an upstream failure in the standard error shape', async () => {
    const { status, body } = await get('/api/search?q=!error')

    expect(status).toBe(502)
    expect(body.error.code).toBe('upstream_error')
  })
})

describe('artists and discographies', () => {
  test('returns an artist, with null image and empty genres when unknown', async () => {
    const { body } = await get('/api/artists/neon-harbour-tribute')

    expect(body).toMatchObject({ name: 'Neon Harbour Tribute Band', imageUrl: null, genres: [] })
  })

  test('discography is newest first, with counts per group and guest spots as appears_on', async () => {
    const { body } = await get('/api/artists/neon-harbor/discography')
    const dates = body.releases.map((release) => release.releaseDate)

    expect(dates).toEqual([...dates].sort().reverse())
    expect(body.counts).toEqual({ album: 6, single: 5, compilation: 1, appears_on: 2 })
    expect(body.total).toBe(14)
    expect(body.releases.find((release) => release.name === 'Velvet Hours').group).toBe('appears_on')
  })

  test('labels a 4-6 track single as an inferred EP', async () => {
    const { body } = await get('/api/artists/neon-harbor/discography')
    const byName = Object.fromEntries(body.releases.map((release) => [release.name, release]))

    expect(byName['Pier Lights']).toMatchObject({ albumType: 'single', inferredType: 'ep' })
    expect(byName['Halogen']).toMatchObject({ albumType: 'single', inferredType: 'single' })
  })

  test('unknown artist is a 404', async () => {
    const { status, body } = await get('/api/artists/nobody/discography')

    expect(status).toBe(404)
    expect(body.error.code).toBe('not_found')
  })
})

describe('GET /api/albums/:id', () => {
  test('returns tracks split across discs and a total duration that matches them', async () => {
    const { body } = await get('/api/albums/neon-harbor--afterimage')

    expect(body.tracks).toHaveLength(body.totalTracks)
    expect(new Set(body.tracks.map((track) => track.discNumber))).toEqual(new Set([1, 2]))
    expect(body.totalDurationMs).toBe(body.tracks.reduce((sum, track) => sum + track.durationMs, 0))
    expect(body.tracks.some((track) => track.artists.some((artist) => artist.id === 'kite-and-ember'))).toBe(true)
  })

  test('unknown album is a 404', async () => {
    expect((await get('/api/albums/nope')).status).toBe(404)
  })
})

test('GET /api/featured returns artists and studio albums', async () => {
  const { body } = await get('/api/featured')

  expect(body.artists.length).toBeGreaterThan(0)
  expect(body.albums.every((album) => album.albumType === 'album')).toBe(true)
})

test('unknown /api path returns the standard 404 error shape', async () => {
  const { status, body } = await get('/api/nothing-here')

  expect(status).toBe(404)
  expect(body.error.code).toBe('not_found')
})
