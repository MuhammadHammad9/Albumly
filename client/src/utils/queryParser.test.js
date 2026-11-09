import { describe, expect, test } from 'vitest'
import { explode, parseQuery, parseYears, refineResults, toSearchRequest, tokenize } from './queryParser.js'

describe('tokenize', () => {
  test('splits words, keeps quoted phrases together and reads field syntax', () => {
    expect(tokenize('artist:"the weeknd" year:2020 "after hours" deluxe')).toEqual([
      { kind: 'field', field: 'artist', value: 'the weeknd' },
      { kind: 'field', field: 'year', value: '2020' },
      { kind: 'phrase', value: 'after hours' },
      { kind: 'word', value: 'deluxe' },
    ])
  })

  test('copes with an unclosed quote and extra spaces', () => {
    expect(tokenize('  "after hours  ')).toEqual([{ kind: 'phrase', value: 'after hours' }])
    expect(tokenize('')).toEqual([])
  })
})

test.each([
  ['2020', { from: 2020, to: 2020 }],
  ['2015-2020', { from: 2015, to: 2020 }],
  ['2020–2015', { from: 2015, to: 2020 }],
  ['2015..2020', { from: 2015, to: 2020 }],
  ['1850', null],
  ['20201', null],
  ['abcd', null],
])('parseYears(%s)', (text, expected) => {
  expect(parseYears(text)).toEqual(expected)
})

describe('parseQuery', () => {
  const base = { text: '', artist: '', yearFrom: undefined, yearTo: undefined, tab: undefined, albumType: undefined }

  test('the PRD example: artist text, a year and a type', () => {
    expect(parseQuery('the weeknd 2020 album')).toEqual({ ...base, text: 'the weeknd', yearFrom: 2020, yearTo: 2020, tab: 'album', albumType: 'album' })
  })

  test.each([
    ['neon harbor singles', { text: 'neon harbor', tab: 'album', albumType: 'single' }],
    ['neon harbor EPs 2010-2015', { text: 'neon harbor', tab: 'album', albumType: 'ep', yearFrom: 2010, yearTo: 2015 }],
    ['glass arcade songs', { text: 'glass arcade', tab: 'track' }],
    ['neon artists', { text: 'neon', tab: 'artist' }],
    ['starboy by the weeknd', { text: 'starboy', artist: 'the weeknd' }],
    ['blinding lights by the weeknd 2019 track', { text: 'blinding lights', artist: 'the weeknd', yearFrom: 2019, yearTo: 2019, tab: 'track' }],
    ['dawn artist:"The Weeknd" year:2022 type:album', { text: 'dawn', artist: 'The Weeknd', yearFrom: 2022, yearTo: 2022, tab: 'album', albumType: 'album' }],
  ])('%s', (input, expected) => {
    expect(parseQuery(input)).toEqual({ ...base, ...expected })
  })

  test('a year or type word on its own stays as text (it may be a title)', () => {
    expect(parseQuery('1989')).toEqual({ ...base, text: '1989' })
    expect(parseQuery('Singles')).toEqual({ ...base, text: 'Singles' })
    expect(parseQuery('album 2020')).toEqual({ ...base, text: 'album 2020' })
  })

  test('quotes keep a year as part of the title', () => {
    expect(parseQuery('taylor swift "1989"')).toEqual({ ...base, text: 'taylor swift 1989' })
  })

  test('only the first year and type count; later ones stay as text', () => {
    expect(parseQuery('songs album 2001 2002 mix')).toMatchObject({ tab: 'track', yearFrom: 2001, text: 'album 2002 mix' })
  })

  test('"by" at the start or end is just a word, and unknown fields are kept as typed', () => {
    expect(parseQuery('stand by')).toEqual({ ...base, text: 'stand by' })
    expect(parseQuery('mood:happy neon')).toEqual({ ...base, text: 'mood:happy neon' })
  })
})

describe('toSearchRequest', () => {
  test('free text is the query, with artist and years as filters', () => {
    expect(toSearchRequest(parseQuery('starboy by the weeknd 2016'), 'album')).toEqual({ type: 'album', q: 'starboy', artist: 'the weeknd', yearFrom: 2016, yearTo: 2016 })
  })

  test('with only an artist, the artist becomes the query', () => {
    expect(toSearchRequest(parseQuery('artist:"neon harbor" album'), 'album')).toEqual({ type: 'album', q: 'neon harbor', yearFrom: undefined, yearTo: undefined })
  })

  test('artist searches only send text', () => {
    expect(toSearchRequest(parseQuery('neon 2020 album'), 'artist')).toEqual({ type: 'artist', q: 'neon' })
  })
})

test('explode moves what was understood into separate URL values', () => {
  expect(explode('the weeknd 2015-2020 singles')).toEqual({ q: 'the weeknd', tab: 'album', kind: 'single', from: '2015', to: '2020' })
  expect(explode('plain words')).toEqual({ q: 'plain words' })
})

describe('refineResults', () => {
  const albums = [
    { id: '1', name: 'Night Ferry', inferredType: 'album', totalTracks: 11, year: 2018, releaseDate: '2018-10-12' },
    { id: '2', name: 'Pier Lights', inferredType: 'ep', totalTracks: 5, year: 2013, releaseDate: '2013-11' },
    { id: '3', name: 'Afterimage', inferredType: 'album', totalTracks: 22, year: 2021, releaseDate: '2021-03-19' },
  ]
  const ids = (list) => list.map((item) => item.id)

  test('keeps catalogue order by default, and filters by type, track count and years', () => {
    expect(ids(refineResults(albums, 'album'))).toEqual(['1', '2', '3'])
    expect(ids(refineResults(albums, 'album', { kind: 'album' }))).toEqual(['1', '3'])
    expect(ids(refineResults(albums, 'album', { minTracks: 12 }))).toEqual(['3'])
    expect(ids(refineResults(albums, 'album', { yearFrom: 2014, yearTo: 2019 }))).toEqual(['1'])
  })

  test('sorts albums and tracks, ignoring sorts that do not apply', () => {
    expect(ids(refineResults(albums, 'album', { sort: 'oldest' }))).toEqual(['2', '1', '3'])
    expect(ids(refineResults(albums, 'album', { sort: 'tracks' }))).toEqual(['3', '1', '2'])
    expect(ids(refineResults(albums, 'album', { sort: 'longest' }))).toEqual(['1', '2', '3'])

    const tracks = [
      { id: 'a', name: 'B side', durationMs: 100, album: { year: 2020 } },
      { id: 'b', name: 'A side', durationMs: 300, album: { year: 2010 } },
    ]
    expect(ids(refineResults(tracks, 'track', { sort: 'longest' }))).toEqual(['b', 'a'])
    expect(ids(refineResults(tracks, 'track', { yearFrom: 2015 }))).toEqual(['a'])
  })

  test('artist results pass through untouched', () => {
    const artists = [{ id: 'x' }]
    expect(refineResults(artists, 'artist', { kind: 'ep' })).toBe(artists)
  })
})
