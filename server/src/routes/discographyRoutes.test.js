import { afterAll, beforeAll, expect, test } from 'vitest'
import { createApp } from '../app.js'

// The discography routes over real HTTP, on the demo catalogue (never live Spotify)

let server
let baseUrl

const get = async (path) => {
  const res = await fetch(`${baseUrl}${path}`)
  return { status: res.status, body: await res.json() }
}

beforeAll(async () => {
  process.env.MOCK_DELAY_MS = '0'
  process.env.CATALOG_PROVIDER = 'mock'
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${server.address().port}`
})

afterAll(() => server.close())

test('the summary sends only page one of a large lazy group, with Spotify-style totals', async () => {
  const { status, body } = await get('/api/artists/cass-marlowe/discography')

  expect(status).toBe(200)
  expect(body.counts.appears_on).toBe(10)
  expect(body.report.groups.appears_on).toMatchObject({ reported: 13, complete: false })
  expect(body.report.pending).toEqual(['appears_on'])
})

test('GET /discography/:group returns the whole group', async () => {
  const { status, body } = await get('/api/artists/cass-marlowe/discography/appears_on')

  expect(status).toBe(200)
  expect(body.releases).toHaveLength(13)
  expect(body).toMatchObject({ group: 'appears_on', reported: 13, complete: true })
})

test('an unknown group is a 400 and an unknown artist a 404', async () => {
  const badGroup = await get('/api/artists/cass-marlowe/discography/bootlegs')
  const noArtist = await get('/api/artists/nobody/discography/compilation')

  expect(badGroup.status).toBe(400)
  expect(badGroup.body.error.code).toBe('bad_request')
  expect(noArtist.status).toBe(404)
})
