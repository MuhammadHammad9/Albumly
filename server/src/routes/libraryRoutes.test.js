import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { USER_A, USER_B, createTestDatabase, resetTestDatabase } from '../test/testDb.js'
import { T1, T2, T3, collection, entry, startTestApp } from '../test/testApp.js'

let db
let app
let a // user A's token
let b // user B's token

beforeAll(async () => {
  db = await createTestDatabase()
  app = await startTestApp(db)
})
afterAll(async () => {
  await app.close()
  await db.close()
})
beforeEach(async () => {
  await resetTestDatabase(db)
  a = await app.sign(USER_A)
  b = await app.sign(USER_B)
})

const newCollection = (id, name = `Collection ${id}`, time = T1) => ({ id, name, createdAt: time, updatedAt: time })
const library = async (token) => (await app.request('GET', '/api/library', { token })).body

// Gives user A two saved albums and a collection holding them
async function seedA() {
  await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1') })
  await app.request('PUT', '/api/albums/x2/entry', { token: a, body: entry('x2') })
  await app.request('POST', '/api/collections', { token: a, body: newCollection('c1', 'Road trip') })
  await app.request('POST', '/api/collections/c1/albums', { token: a, body: { albumId: 'x1' } })
  await app.request('POST', '/api/collections/c1/albums', { token: a, body: { albumId: 'x2' } })
}

test('every route needs a signed-in user', async () => {
  const routes = [
    ['GET', '/api/library'],
    ['POST', '/api/library/import'],
    ['PUT', '/api/albums/x1/entry'],
    ['DELETE', '/api/albums/x1/entry'],
    ['GET', '/api/collections'],
    ['POST', '/api/collections'],
    ['GET', '/api/collections/c1'],
    ['PATCH', '/api/collections/c1'],
    ['DELETE', '/api/collections/c1'],
    ['POST', '/api/collections/c1/albums'],
    ['DELETE', '/api/collections/c1/albums/x1'],
    ['PATCH', '/api/collections/c1/order'],
    ['GET', '/api/me'],
    ['DELETE', '/api/me'],
  ]
  for (const [method, path] of routes) {
    const { status, body } = await app.request(method, path, { token: method === 'GET' ? undefined : 'not.a.token' })
    expect(status, `${method} ${path}`).toBe(401)
    expect(body.error.code).toBe('unauthorized')
  }
})

describe('entries', () => {
  test('saved albums come back in the same shape the browser keeps them', async () => {
    const saved = entry('x1', { status: 'listened', rating: 8, tags: ['late night'], review: 'Great', updatedAt: T2 })
    const put = await app.request('PUT', '/api/albums/x1/entry', { token: a, body: saved })

    expect(put.status).toBe(200)
    expect(put.body).toEqual({ entry: saved, applied: true })
    expect(await library(a)).toEqual({ version: 1, entries: { x1: saved }, collections: [] })
  })

  test('an older copy does not overwrite a newer one (newest updatedAt wins)', async () => {
    await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { rating: 9, updatedAt: T2 }) })
    const stale = await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { rating: 2, updatedAt: T1 }) })

    expect(stale.body.applied).toBe(false)
    expect(stale.body.entry.rating).toBe(9)
  })

  test('a time far in the future is pulled back to now', async () => {
    const { body } = await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { updatedAt: '2099-01-01T00:00:00.000Z' }) })
    expect(Date.parse(body.entry.updatedAt)).toBeLessThan(Date.now() + 60_000)
  })

  test('invalid data is refused with a reason', async () => {
    const bad = await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { rating: 11 }) })
    expect(bad.status).toBe(400)
    expect(bad.body.error.message).toBe('rating: Must be 1 to 10')

    const mismatch = await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x2') })
    expect(mismatch.status).toBe(400)

    const badId = await app.request('PUT', '/api/albums/bad%20id/entry', { token: a, body: entry('x1') })
    expect(badId.status).toBe(400)
  })

  test('deleting an album removes it from collections too, and can be repeated', async () => {
    await seedA()
    expect((await app.request('DELETE', '/api/albums/x1/entry', { token: a })).status).toBe(204)
    expect((await app.request('DELETE', '/api/albums/x1/entry', { token: a })).status).toBe(204)

    const lib = await library(a)
    expect(Object.keys(lib.entries)).toEqual(['x2'])
    expect(lib.collections[0].albumIds).toEqual(['x2'])
  })
})

describe('collections', () => {
  test('create, add albums, reorder, remove, rename, delete', async () => {
    await seedA()
    let lib = await library(a)
    expect(lib.collections).toEqual([collection('c1', ['x1', 'x2'], { name: 'Road trip' })])

    const order = await app.request('PATCH', '/api/collections/c1/order', { token: a, body: { albumIds: ['x2', 'x1'], updatedAt: T2 } })
    expect(order.body.collection.albumIds).toEqual(['x2', 'x1'])
    expect(order.body.collection.updatedAt).toBe(T2)

    await app.request('DELETE', '/api/collections/c1/albums/x2', { token: a })
    const renamed = await app.request('PATCH', '/api/collections/c1', { token: a, body: { name: '  Summer   drive ', updatedAt: T3 } })
    expect(renamed.body).toMatchObject({ applied: true, collection: { name: 'Summer drive', albumIds: ['x1'] } })

    expect((await app.request('DELETE', '/api/collections/c1', { token: a })).status).toBe(204)
    lib = await library(a)
    expect(lib.collections).toEqual([])
    expect(Object.keys(lib.entries)).toEqual(['x1', 'x2'])
  })

  test('creating or adding the same thing twice is harmless (safe retries)', async () => {
    await seedA()
    const again = await app.request('POST', '/api/collections', { token: a, body: newCollection('c1', 'Road trip') })
    expect(again.status).toBe(200)
    const addAgain = await app.request('POST', '/api/collections/c1/albums', { token: a, body: { albumId: 'x1' } })
    expect(addAgain.body.collection.albumIds).toEqual(['x1', 'x2'])
  })

  test('names are unique regardless of case', async () => {
    await seedA()
    const { status, body } = await app.request('POST', '/api/collections', { token: a, body: newCollection('c2', 'ROAD TRIP') })
    expect(status).toBe(409)
    expect(body.error.code).toBe('duplicate_name')
  })

  test('an older rename does not overwrite a newer one', async () => {
    await seedA()
    await app.request('PATCH', '/api/collections/c1', { token: a, body: { name: 'New', updatedAt: T3 } })
    const stale = await app.request('PATCH', '/api/collections/c1', { token: a, body: { name: 'Old', updatedAt: T2 } })
    expect(stale.body).toMatchObject({ applied: false, collection: { name: 'New' } })
  })

  test('only saved albums can go into a collection', async () => {
    await seedA()
    const { status, body } = await app.request('POST', '/api/collections/c1/albums', { token: a, body: { albumId: 'unsaved' } })
    expect(status).toBe(400)
    expect(body.error.code).toBe('not_saved')
  })

  test('a new order must hold exactly the same albums', async () => {
    await seedA()
    const { status, body } = await app.request('PATCH', '/api/collections/c1/order', { token: a, body: { albumIds: ['x1'], updatedAt: T2 } })
    expect(status).toBe(400)
    expect(body.error.code).toBe('order_mismatch')
  })
})

describe("user B cannot read or change user A's data", () => {
  test("A's albums and collections are invisible to B", async () => {
    await seedA()
    expect(await library(b)).toEqual({ version: 1, entries: {}, collections: [] })
    expect((await app.request('GET', '/api/collections', { token: b })).body).toEqual({ collections: [] })
    expect((await app.request('GET', '/api/collections/c1', { token: b })).status).toBe(404)
  })

  test("every change B tries on A's collection is a 404 or a no-op, and A's data stays the same", async () => {
    await seedA()
    const before = await library(a)

    const attempts = [
      ['PATCH', '/api/collections/c1', { name: 'Hacked', updatedAt: T3 }],
      ['POST', '/api/collections/c1/albums', { albumId: 'x1' }],
      ['DELETE', '/api/collections/c1/albums/x1'],
      ['PATCH', '/api/collections/c1/order', { albumIds: ['x2', 'x1'], updatedAt: T3 }],
    ]
    for (const [method, path, body] of attempts) {
      const res = await app.request(method, path, { token: b, body })
      expect(res.status, `${method} ${path}`).toBe(404)
    }
    // Deleting "your own" c1 or x1 as B succeeds as a no-op: B has none, and A keeps theirs
    expect((await app.request('DELETE', '/api/collections/c1', { token: b })).status).toBe(204)
    expect((await app.request('DELETE', '/api/albums/x1/entry', { token: b })).status).toBe(204)

    expect(await library(a)).toEqual(before)
  })

  test('the same album id saved by both users stays two separate entries', async () => {
    await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { rating: 9 }) })
    await app.request('PUT', '/api/albums/x1/entry', { token: b, body: entry('x1', { rating: 1, updatedAt: T3 }) })

    expect((await library(a)).entries.x1.rating).toBe(9)
    expect((await library(b)).entries.x1.rating).toBe(1)
  })
})

describe('POST /api/library/import', () => {
  const local = (entries, collections = []) => ({ library: { version: 1, entries, collections } })

  test('uploads a browser library into an empty account', async () => {
    const body = local({ x1: entry('x1', { rating: 7 }), x2: entry('x2') }, [collection('c9', ['x2', 'x1'], { name: 'Mix' })])
    const { status, body: result } = await app.request('POST', '/api/library/import', { token: a, body })

    expect(status).toBe(200)
    expect(result.summary).toMatchObject({ added: 2, collectionsAdded: 1 })
    expect(result.library).toEqual(body.library)
    expect(await library(a)).toEqual(body.library)
  })

  test('merges with what the account has: newest wins, same-name collections combine', async () => {
    await seedA() // x1, x2 at T1; collection c1 "Road trip" [x1, x2]
    const body = local(
      { x1: entry('x1', { rating: 10, updatedAt: T2 }), x3: entry('x3') },
      [collection('other-id', ['x3'], { name: 'road trip' })],
    )
    const { body: result } = await app.request('POST', '/api/library/import', { token: a, body })

    expect(result.summary).toMatchObject({ added: 1, updated: 1, unchanged: 0, collectionsAdded: 0, collectionsMerged: 1 })
    expect(result.library.entries.x1.rating).toBe(10)
    expect(result.library.collections).toHaveLength(1)
    expect(result.library.collections[0]).toMatchObject({ id: 'c1', name: 'Road trip', albumIds: ['x1', 'x2', 'x3'] })
  })

  test('the account copy stays when it is newer', async () => {
    await app.request('PUT', '/api/albums/x1/entry', { token: a, body: entry('x1', { rating: 9, updatedAt: T3 }) })
    const { body } = await app.request('POST', '/api/library/import', { token: a, body: local({ x1: entry('x1', { rating: 1, updatedAt: T2 }) }) })
    expect(body.library.entries.x1.rating).toBe(9)
    expect(body.summary.unchanged).toBe(1)
  })

  test('importing the same library twice changes nothing the second time', async () => {
    const body = local({ x1: entry('x1') }, [collection('c9', ['x1'])])
    await app.request('POST', '/api/library/import', { token: a, body })
    const second = await app.request('POST', '/api/library/import', { token: a, body })
    expect(second.body.summary).toMatchObject({ added: 0, updated: 0, collectionsAdded: 0, collectionsMerged: 0 })
  })

  test('refuses an invalid library and changes nothing', async () => {
    const { status, body } = await app.request('POST', '/api/library/import', {
      token: a,
      body: local({ x1: entry('x1') }, [collection('c9', ['missing'])]),
    })
    expect(status).toBe(400)
    expect(body.error.message).toMatch(/collections\.0\.albumIds\.0/)
    expect(await library(a)).toEqual({ version: 1, entries: {}, collections: [] })
  })
})
