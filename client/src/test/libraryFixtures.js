// Small builders for library tests, so each test only spells out what it cares about
import { createLibraryStore, libraryStore } from '../stores/libraryStore.js'
import { emptyLibrary } from '../services/library/schema.js'

export const album = (id, overrides = {}) => ({
  id,
  name: `Album ${id}`,
  artists: [{ id: 'neon-harbor', name: 'Neon Harbor' }],
  albumType: 'album',
  inferredType: 'album',
  releaseDate: '2015-05-22',
  precision: 'day',
  year: 2015,
  totalTracks: 12,
  coverUrl: `/api/mock/art/${id}.svg`,
  spotifyUrl: `https://open.spotify.com/album/${id}`,
  ...overrides,
})

export const entry = (id, overrides = {}, albumOverrides = {}) => ({
  album: { ...album(id, albumOverrides), totalDurationMs: null },
  status: null,
  rating: null,
  review: '',
  notes: '',
  tags: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

export const collection = (id, albumIds = [], overrides = {}) => ({
  id,
  name: `Collection ${id}`,
  description: '',
  albumIds,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

// A repository that keeps everything in memory and records each save
export function memoryRepository(initial = emptyLibrary()) {
  const repository = {
    saved: [],
    listener: null,
    load: () => initial,
    save(library) {
      repository.saved.push(library)
      return repository.saveResult ?? true
    },
    subscribe(listener) {
      repository.listener = listener
      return () => {}
    },
  }
  return repository
}

// A store with a fake clock that ticks one second per call, and predictable collection ids
export function testStore(initial) {
  const repository = memoryRepository(initial)
  let tick = 0
  let ids = 0
  const store = createLibraryStore(repository, {
    now: () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++)).toISOString(),
    newId: () => `col-${++ids}`,
  })
  return { store, repository, actions: store.getState() }
}

// Component tests use the app's real store (saved in jsdom's localStorage): start each test empty
export function resetLibrary(library = emptyLibrary()) {
  localStorage.clear()
  libraryStore.getState().setLibrary(library)
}
