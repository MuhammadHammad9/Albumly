import { describe, expect, test } from 'vitest'
import { collection, entry } from '../../test/libraryFixtures.js'
import { LIBRARY_VERSION, LibraryFormatError, describeIssues, emptyLibrary, librarySchema, migrate } from './schema.js'

const library = (overrides = {}) => ({ version: LIBRARY_VERSION, entries: { a: entry('a'), b: entry('b') }, collections: [collection('c1', ['a'])], ...overrides })
const issues = (data) => describeIssues(librarySchema.safeParse(data).error)

describe('librarySchema', () => {
  test('accepts a valid library and an empty one', () => {
    expect(librarySchema.safeParse(library()).success).toBe(true)
    expect(librarySchema.safeParse(emptyLibrary()).success).toBe(true)
  })

  test('fills defaults for optional text fields', () => {
    const { review, notes, ...partial } = entry('a') // eslint-disable-line no-unused-vars
    const result = librarySchema.parse(library({ entries: { a: partial }, collections: [] }))

    expect(result.entries.a).toMatchObject({ review: '', notes: '' })
  })

  test('reports each problem with its path', () => {
    const bad = library({
      entries: { a: entry('a', { rating: 11, status: 'loved' }), b: entry('b') },
      collections: [collection('c1', ['a', 'zzz'])],
    })

    expect(issues(bad)).toEqual(
      expect.arrayContaining([
        { path: 'entries.a.rating', message: 'Must be 1 to 10' },
        expect.objectContaining({ path: 'entries.a.status' }),
      ]),
    )
  })

  test('checks rules across items: keys, collection references, duplicate names', () => {
    const bad = library({
      entries: { a: entry('a'), wrong: entry('b') },
      collections: [collection('c1', ['a', 'zzz'], { name: 'Mix' }), collection('c2', [], { name: 'mix' })],
    })

    expect(issues(bad)).toEqual([
      { path: 'entries.wrong.album.id', message: 'Must match its key "wrong"' },
      { path: 'collections.0.albumIds.1', message: 'Album "zzz" is not in the library' },
      { path: 'collections.1.name', message: 'Another collection has this name' },
    ])
  })

  test('rejects links that are not web addresses', () => {
    const bad = library({ entries: { a: entry('a', {}, { spotifyUrl: 'javascript:alert(1)' }) }, collections: [] })

    expect(issues(bad)).toEqual([{ path: 'entries.a.album.spotifyUrl', message: 'Must be a web address' }])
  })

  test('rejects repeated or badly formatted tags', () => {
    expect(issues(library({ entries: { a: entry('a', { tags: ['x', 'x'] }) }, collections: [] }))[0].message).toBe('Tags must not repeat')
    expect(issues(library({ entries: { a: entry('a', { tags: ['Loud'] }) }, collections: [] }))[0].path).toBe('entries.a.tags.0')
  })
})

describe('migrate', () => {
  // Sample steps standing in for real future migrations
  const migrations = {
    1: (data) => ({ ...data, collections: data.collections.map((c) => ({ ...c, colour: 'green' })) }),
    2: (data) => ({ ...data, entries: {}, renamed: true }),
  }

  test('returns current-version data unchanged', () => {
    const data = library()
    expect(migrate(data)).toBe(data)
  })

  test('runs every step in order up to the target version', () => {
    const result = migrate({ version: 1, entries: { a: 1 }, collections: [{ id: 'x' }] }, migrations, 3)

    expect(result).toEqual({ version: 3, entries: {}, collections: [{ id: 'x', colour: 'green' }], renamed: true })
  })

  test.each([
    [null, 'This is not an Albumly library'],
    [[], 'This is not an Albumly library'],
    [{ entries: {} }, 'This file has no Albumly library version'],
    [{ version: 99 }, 'This library was saved by a newer version of Albumly (format 99). Update Albumly to open it.'],
  ])('refuses %j', (data, message) => {
    expect(() => migrate(data)).toThrow(new LibraryFormatError(message))
  })

  test('refuses when a step is missing', () => {
    expect(() => migrate({ version: 1 }, { 2: (d) => d }, 3)).toThrow('Albumly cannot upgrade a format 1 library')
  })
})
