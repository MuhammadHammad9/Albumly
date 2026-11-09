import { describe, expect, test } from 'vitest'
import { album, collection, entry, testStore } from '../test/libraryFixtures.js'

describe('saving albums', () => {
  test('saveAlbum stores a snapshot and persists it through the repository', () => {
    const { store, repository, actions } = testStore()

    actions.saveAlbum({ ...album('a'), tracks: [{ id: 't1' }], group: 'album' })

    const saved = store.getState().entries.a
    expect(saved).toMatchObject({ status: null, rating: null, tags: [], addedAt: '2026-06-01T00:00:00.000Z' })
    expect(saved.album.tracks).toBeUndefined()
    expect(repository.saved.at(-1)).toEqual({ version: 1, entries: { a: saved }, collections: [] })
  })

  test('saving twice keeps the original entry', () => {
    const { store, actions } = testStore()
    actions.saveAlbum(album('a'))
    actions.setRating('a', 7)
    actions.saveAlbum(album('a'))

    expect(store.getState().entries.a.rating).toBe(7)
  })

  test('removeAlbum also takes it out of every collection', () => {
    const { store, actions } = testStore({ version: 1, entries: { a: entry('a'), b: entry('b') }, collections: [collection('c1', ['a', 'b'])] })

    actions.removeAlbum('a')

    expect(Object.keys(store.getState().entries)).toEqual(['b'])
    expect(store.getState().collections[0].albumIds).toEqual(['b'])
  })

  test('refreshSnapshot updates details without counting as a user edit', () => {
    const { store, actions } = testStore({ version: 1, entries: { a: entry('a') }, collections: [] })

    actions.refreshSnapshot({ ...album('a', { name: 'New title' }), totalDurationMs: 1000 })

    expect(store.getState().entries.a.album).toMatchObject({ name: 'New title', totalDurationMs: 1000 })
    expect(store.getState().entries.a.updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  test('tells the UI when the browser refuses to save', () => {
    const { store, repository, actions } = testStore()
    repository.saveResult = false

    actions.saveAlbum(album('a'))

    expect(store.getState().storageOk).toBe(false)
  })

  test('applies changes from another tab without saving them again', () => {
    const { store, repository } = testStore()

    repository.listener({ version: 1, entries: { z: entry('z') }, collections: [] })

    expect(Object.keys(store.getState().entries)).toEqual(['z'])
    expect(repository.saved).toHaveLength(0)
  })
})

describe('entry details', () => {
  test('status, rating, review and notes update and stamp updatedAt', () => {
    const { store, actions } = testStore({ version: 1, entries: { a: entry('a') }, collections: [] })

    actions.setStatus('a', 'listening')
    actions.setRating('a', 9)
    actions.setReview('a', 'Lovely')
    actions.setNotes('a', 'x'.repeat(6000))

    const saved = store.getState().entries.a
    expect(saved).toMatchObject({ status: 'listening', rating: 9, review: 'Lovely' })
    expect(saved.notes).toHaveLength(5000)
    expect(saved.updatedAt).toBe('2026-06-01T00:00:03.000Z')
  })

  test('invalid status or rating clears the value', () => {
    const { store, actions } = testStore({ version: 1, entries: { a: entry('a', { status: 'want', rating: 4 }) }, collections: [] })

    actions.setStatus('a', 'loved')
    actions.setRating('a', 11)

    expect(store.getState().entries.a).toMatchObject({ status: null, rating: null })
  })

  test('tags are normalized and duplicates refused', () => {
    const { store, actions } = testStore({ version: 1, entries: { a: entry('a') }, collections: [] })

    expect(actions.addTag('a', '  Late Night ')).toEqual({ ok: true, tag: 'late night' })
    expect(actions.addTag('a', 'LATE NIGHT')).toMatchObject({ ok: false, error: 'exists' })
    expect(actions.addTag('a', '   ')).toMatchObject({ ok: false, error: 'empty' })
    expect(actions.addTag('a', 'x'.repeat(31))).toMatchObject({ ok: false, error: 'too_long' })
    actions.removeTag('a', 'late night')

    expect(store.getState().entries.a.tags).toEqual([])
  })
})

describe('collections', () => {
  test('create, rename and delete, refusing duplicate names', () => {
    const { store, actions } = testStore()

    expect(actions.createCollection('  Road   trip ')).toEqual({ ok: true, id: 'col-1' })
    expect(actions.createCollection('road trip')).toMatchObject({ ok: false, error: 'duplicate_name' })
    expect(actions.createCollection('')).toMatchObject({ ok: false, error: 'empty' })
    actions.createCollection('Rainy days')

    expect(actions.renameCollection('col-2', 'ROAD TRIP')).toMatchObject({ ok: false, error: 'duplicate_name' })
    expect(actions.renameCollection('col-1', 'Road Trip')).toEqual({ ok: true }) // its own name in new case is fine
    actions.deleteCollection('col-2')

    expect(store.getState().collections.map((c) => c.name)).toEqual(['Road Trip'])
  })

  test('adding saves the album, refuses repeats and warns about other editions', () => {
    const { store, actions } = testStore()
    actions.createCollection('Mix')

    expect(actions.addToCollection('col-1', album('a', { name: 'Glass Arcade' }))).toEqual({ ok: true, similar: null })
    expect(actions.addToCollection('col-1', album('a'))).toMatchObject({ ok: false, error: 'already_in_collection', message: 'Already in “Mix”.' })

    const result = actions.addToCollection('col-1', album('b', { name: 'Glass Arcade (Deluxe Edition)' }))

    expect(result.ok).toBe(true)
    expect(result.similar).toMatchObject({ id: 'a', name: 'Glass Arcade' })
    expect(Object.keys(store.getState().entries)).toEqual(['a', 'b'])
    expect(store.getState().collections[0].albumIds).toEqual(['a', 'b'])
  })

  test('moveInCollection reorders and removeFromCollection keeps the album saved', () => {
    const { store, actions } = testStore({
      version: 1,
      entries: { a: entry('a'), b: entry('b'), c: entry('c') },
      collections: [collection('c1', ['a', 'b', 'c'])],
    })

    actions.moveInCollection('c1', 2, 0)
    expect(store.getState().collections[0].albumIds).toEqual(['c', 'a', 'b'])

    actions.removeFromCollection('c1', 'a')
    expect(store.getState().collections[0].albumIds).toEqual(['c', 'b'])
    expect(store.getState().entries.a).toBeDefined()
  })
})

test('setLibrary replaces everything (used by import)', () => {
  const { store, actions } = testStore({ version: 1, entries: { a: entry('a') }, collections: [] })

  actions.setLibrary({ version: 1, entries: { z: entry('z') }, collections: [collection('c', ['z'])] })

  expect(Object.keys(store.getState().entries)).toEqual(['z'])
  expect(store.getState().collections).toHaveLength(1)
})
