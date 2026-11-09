import { describe, expect, test } from 'vitest'
import { buildDiscographyTabs, describeAge, discographyTotal, mergeDiscography } from './discography.js'

const release = (id, group, inferredType = group) => ({ id, name: id, group, inferredType, releaseDate: '2020-01-01' })

// A report group entry as the server sends it
const info = (reported, retrieved = reported, extra = {}) => ({
  reported,
  retrieved,
  duplicates: 0,
  complete: true,
  truncated: false,
  requests: 1,
  fetchedAt: '2026-11-10T10:00:00.000Z',
  ...extra,
})

describe('buildDiscographyTabs', () => {
  test('sorts releases into tabs, moving inferred EPs out of Singles', () => {
    const tabs = buildDiscographyTabs([
      release('a', 'album'),
      release('s', 'single'),
      release('e', 'single', 'ep'),
      release('x', 'appears_on', 'album'),
    ])
    const ids = Object.fromEntries(tabs.map((tab) => [tab.key, tab.releases.map((r) => r.id)]))

    expect(ids).toEqual({ all: ['a', 's', 'e', 'x'], album: ['a'], single: ['s'], ep: ['e'], appears_on: ['x'] })
  })

  test('hides empty tabs but always keeps All', () => {
    expect(buildDiscographyTabs([release('a', 'album')]).map((tab) => tab.key)).toEqual(['all', 'album'])
    expect(buildDiscographyTabs([]).map((tab) => tab.key)).toEqual(['all'])
  })

  test('partly loaded groups show the reported total, and All adds them up', () => {
    const releases = [release('a', 'album'), release('c0', 'compilation'), release('c1', 'compilation')]
    const report = {
      groups: {
        album: info(1),
        single: info(0),
        compilation: info(57, 2, { complete: false }),
        appears_on: info(30, 0, { complete: false }),
      },
    }

    const counts = Object.fromEntries(buildDiscographyTabs(releases, report).map((tab) => [tab.key, [tab.count, tab.partial]]))

    // Appears On is listed even though none of it has arrived yet
    expect(counts).toEqual({ all: [88, false], album: [1, false], compilation: [57, true], appears_on: [30, true] })
    expect(discographyTotal({ releases, report })).toBe(88)
  })
})

describe('mergeDiscography', () => {
  // Summary: album a; compilation page one [c0] of 3; appears_on page one [x0] of 3.
  // The full groups overlap: c1 is also a guest appearance, a is also on a compilation.
  const summary = {
    artistId: 'artist',
    releases: [release('a', 'album'), release('c0', 'compilation'), release('x0', 'appears_on')],
    counts: { album: 1, single: 0, compilation: 1, appears_on: 1 },
    total: 3,
    report: {
      source: 'spotify',
      requests: 3,
      fetchedAt: '2026-11-10T10:00:00.000Z',
      duplicatesRemoved: 0,
      truncated: [],
      pending: ['compilation', 'appears_on'],
      groups: {
        album: info(1),
        single: info(0, 0, { requests: 1 }),
        compilation: info(3, 1, { complete: false }),
        appears_on: info(3, 1, { complete: false }),
      },
    },
  }
  const fullCompilation = { ...info(3, 3, { requests: 1, fetchedAt: '2026-11-11T10:00:00.000Z' }), releases: ['c0', 'c1', 'a'].map((id) => release(id, 'compilation')) }
  const fullAppearsOn = { ...info(3, 3, { requests: 1 }), releases: ['x0', 'x1', 'c1'].map((id) => release(id, 'appears_on')) }

  test('with nothing extra loaded, returns the summary itself', () => {
    expect(mergeDiscography(summary, {})).toBe(summary)
  })

  test('replaces page one with the whole group and removes duplicates by priority', () => {
    const merged = mergeDiscography(summary, { compilation: fullCompilation })

    expect(merged.counts).toEqual({ album: 1, single: 0, compilation: 2, appears_on: 1 })
    expect(merged.report.groups.compilation).toMatchObject({ retrieved: 3, duplicates: 1, complete: true })
    expect(merged.report.pending).toEqual(['appears_on'])
    expect(merged.report.duplicatesRemoved).toBe(1)
  })

  test('gives the same answer whichever group finished loading first', () => {
    const both = mergeDiscography(summary, { appears_on: fullAppearsOn, compilation: fullCompilation })
    const groupOf = Object.fromEntries(both.releases.map((r) => [r.id, r.group]))

    expect(groupOf).toEqual({ a: 'album', c0: 'compilation', c1: 'compilation', x0: 'appears_on', x1: 'appears_on' })
    expect(both.report.duplicatesRemoved).toBe(2) // a (album beats compilation), c1 (compilation beats appears_on)
    expect(both.report.pending).toEqual([])
    expect(both.report.fetchedAt).toBe('2026-11-10T10:00:00.000Z') // the oldest piece

    // Only appears_on loaded: c1 is a guest appearance for now
    const onlyGuests = mergeDiscography(summary, { appears_on: fullAppearsOn })
    expect(onlyGuests.releases.find((r) => r.id === 'c1').group).toBe('appears_on')
  })
})

test('describeAge gives a friendly relative time', () => {
  const now = Date.parse('2026-11-10T12:00:00.000Z')
  expect(describeAge('2026-11-10T11:59:30.000Z', now)).toBe('just now')
  expect(describeAge('2026-11-10T11:55:00.000Z', now)).toBe('5 minutes ago')
  expect(describeAge('2026-11-10T09:00:00.000Z', now)).toBe('3 hours ago')
  expect(describeAge('2026-11-09T12:00:00.000Z', now)).toBe('yesterday')
  expect(describeAge('not a date', now)).toBe('just now')
})
