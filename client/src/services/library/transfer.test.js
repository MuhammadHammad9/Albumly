import { describe, expect, test } from 'vitest'
import { collection, entry } from '../../test/libraryFixtures.js'
import { csvCell, describeSummary, exportCsv, exportJson, mergeLibrary, parseImport } from './transfer.js'

const library = () => ({
  version: 1,
  entries: {
    a: entry('a', { status: 'listened', rating: 9, tags: ['night', 'drive'], review: 'Great, "really" great\nSecond line' }, { name: 'Glass Arcade' }),
    b: entry('b', {}, { name: '=SUM(A1)' }),
  },
  collections: [collection('c1', ['a', 'b'], { name: 'Road trip' })],
})

describe('export', () => {
  test('JSON export can be imported again unchanged', () => {
    const text = exportJson(library(), new Date('2026-06-01T00:00:00Z'))
    const parsed = parseImport(text)

    expect(JSON.parse(text)).toMatchObject({ app: 'albumly', version: 1, exportedAt: '2026-06-01T00:00:00.000Z' })
    expect(parsed.ok).toBe(true)
    expect(parsed.library).toEqual(library())
    expect(parsed.counts).toEqual({ albums: 2, collections: 1 })
  })

  test('csvCell quotes, escapes, and defuses formulas', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell(null)).toBe('')
    expect(csvCell(9)).toBe('9')
  })

  test('CSV has a header and one row per album', () => {
    const lines = exportCsv(library()).split('\r\n')

    expect(lines[0]).toBe('album_id,title,artists,year,type,status,rating,tags,collections,review,notes,added_at,spotify_url')
    expect(lines[1]).toContain('a,Glass Arcade,Neon Harbor,2015,album,Listened,9,night; drive,Road trip,"Great, ""really"" great\nSecond line"')
    // The review's line break is inside quotes, so it does not start a new row
    expect(lines).toHaveLength(3)
    expect(lines[2]).toContain("b,'=SUM(A1)")
  })
})

describe('parseImport', () => {
  test('rejects text that is not JSON', () => {
    expect(parseImport('not json')).toEqual({
      ok: false,
      errors: [{ path: '(file)', message: 'This file is not valid JSON. Choose a file exported from Albumly.' }],
    })
  })

  test('rejects a file from a newer version with a clear message', () => {
    const result = parseImport(JSON.stringify({ version: 5, entries: {}, collections: [] }))
    expect(result.errors[0].message).toMatch(/newer version of Albumly/)
  })

  test('lists every problem with where it is', () => {
    const bad = library()
    bad.entries.a.rating = 0
    bad.collections[0].albumIds.push('ghost')

    const result = parseImport(JSON.stringify(bad))

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      { path: 'entries.a.rating', message: 'Must be 1 to 10' },
      { path: 'collections.0.albumIds.2', message: 'Album "ghost" is not in the library' },
    ])
  })
})

describe('mergeLibrary', () => {
  const later = '2026-09-01T00:00:00.000Z'

  test('adds new albums, keeps the newer copy of shared ones, and counts what happened', () => {
    const current = library()
    const incoming = {
      version: 1,
      entries: {
        a: entry('a', { rating: 3, updatedAt: later }, { name: 'Glass Arcade' }), // newer: wins
        b: entry('b', { rating: 1 }), // same age: current copy kept
        c: entry('c'),
      },
      collections: [],
    }

    const { library: merged, summary } = mergeLibrary(current, incoming)

    expect(merged.entries.a.rating).toBe(3)
    expect(merged.entries.b.rating).toBeNull()
    expect(Object.keys(merged.entries)).toEqual(['a', 'b', 'c'])
    expect(summary).toMatchObject({ added: 1, updated: 1, unchanged: 1 })
    expect(describeSummary(summary)).toBe('Added 1 album, updated 1 album.')
  })

  test('merges a same-named collection by appending its new albums', () => {
    const incoming = {
      version: 1,
      entries: { b: entry('b'), c: entry('c') },
      collections: [collection('other-id', ['c', 'b'], { name: 'ROAD TRIP' }), collection('c9', ['c'], { name: 'Fresh' })],
    }

    const { library: merged, summary } = mergeLibrary(library(), incoming)

    expect(merged.collections.map((c) => [c.name, c.albumIds])).toEqual([
      ['Road trip', ['a', 'b', 'c']],
      ['Fresh', ['c']],
    ])
    expect(summary).toMatchObject({ collectionsAdded: 1, collectionsMerged: 1 })
  })

  test('takes the newer version of a collection with the same id', () => {
    const incoming = { version: 1, entries: { a: entry('a') }, collections: [collection('c1', ['a'], { name: 'Renamed', updatedAt: later })] }

    const { library: merged } = mergeLibrary(library(), incoming)

    expect(merged.collections).toEqual([collection('c1', ['a'], { name: 'Renamed', updatedAt: later })])
  })

  test('importing the same file twice changes nothing the second time', () => {
    const file = { version: 1, entries: { z: entry('z') }, collections: [collection('cz', ['z'], { name: 'Z' })] }

    const once = mergeLibrary(library(), file).library
    const twice = mergeLibrary(once, file)

    expect(twice.library).toEqual(once)
    expect(describeSummary(twice.summary)).toBe('Nothing new: your library already had everything in this file.')
  })
})
