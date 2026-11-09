import { beforeEach, expect, test, vi } from 'vitest'
import { recents } from './recents.js'

const STORAGE_KEY = 'albumly:recents:v1'
const artist = (id) => ({ id, name: `Artist ${id}`, imageUrl: null, genres: [] })

beforeEach(() => recents.clear())

test('newest artist comes first and revisiting moves it to the front without duplicating', () => {
  recents.addArtist(artist('a'))
  recents.addArtist(artist('b'))
  recents.addArtist(artist('a'))

  expect(recents.getSnapshot().artists.map((item) => item.id)).toEqual(['a', 'b'])
})

test('keeps at most 12 artists, dropping the oldest', () => {
  for (let i = 1; i <= 15; i++) recents.addArtist(artist(`a${i}`))
  const ids = recents.getSnapshot().artists.map((item) => item.id)

  expect(ids).toHaveLength(12)
  expect(ids[0]).toBe('a15')
  expect(ids).not.toContain('a1')
})

test('searches are trimmed, de-duplicated ignoring case, and blanks are ignored', () => {
  recents.addSearch('  Neon ')
  recents.addSearch('mara')
  recents.addSearch('NEON')
  recents.addSearch('   ')

  expect(recents.getSnapshot().searches).toEqual(['NEON', 'mara'])
})

test('saves to localStorage and notifies subscribers', () => {
  const listener = vi.fn()
  const unsubscribe = recents.subscribe(listener)

  recents.addSearch('neon')
  expect(listener).toHaveBeenCalledTimes(1)
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).searches).toEqual(['neon'])

  unsubscribe()
  recents.addSearch('mara')
  expect(listener).toHaveBeenCalledTimes(1)
})

test('adding the artist that is already most recent changes nothing', () => {
  recents.addArtist(artist('a'))
  const before = recents.getSnapshot()

  recents.addArtist(artist('a'))
  expect(recents.getSnapshot()).toBe(before) // same object: React will not re-render
})

test('picks up changes made in another tab, and survives corrupt data', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ artists: [artist('z'), { broken: true }], searches: ['ok', 42] }))
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  expect(recents.getSnapshot()).toEqual({ artists: [artist('z')], searches: ['ok'] })

  localStorage.setItem(STORAGE_KEY, 'not json')
  window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  expect(recents.getSnapshot()).toEqual({ artists: [], searches: [] })
})
