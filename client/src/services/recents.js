// Recently explored artists and recent searches, remembered in this browser only (localStorage).
// Written as a tiny "store": components subscribe and re-render whenever the data changes.

const STORAGE_KEY = 'albumly:recents:v1' // bump the version if the saved shape ever changes
const MAX_ARTISTS = 12
const MAX_SEARCHES = 6
const EMPTY = { artists: [], searches: [] }

// localStorage can be unavailable (private mode, blocked storage) or hold junk, so never trust it
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return {
      artists: Array.isArray(saved?.artists) ? saved.artists.filter((artist) => artist?.id && artist?.name) : [],
      searches: Array.isArray(saved?.searches) ? saved.searches.filter((query) => typeof query === 'string') : [],
    }
  } catch {
    return EMPTY
  }
}

let state = load()
const listeners = new Set()

function setState(next) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Still works for this visit; it just will not be remembered
  }
  listeners.forEach((listener) => listener())
}

// Put `item` first, drop any older copy of it, and keep the list short
const addToFront = (list, item, isSame, max) => [item, ...list.filter((existing) => !isSame(existing))].slice(0, max)

export const recents = {
  // These two are the contract React's useSyncExternalStore expects
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,

  addArtist({ id, name, imageUrl, genres }) {
    if (state.artists[0]?.id === id) return // already the most recent: avoid a pointless re-render
    const artist = { id, name, imageUrl: imageUrl ?? null, genres: genres ?? [] }
    setState({ ...state, artists: addToFront(state.artists, artist, (existing) => existing.id === id, MAX_ARTISTS) })
  },

  addSearch(query) {
    const text = query.trim()
    if (!text || state.searches[0] === text) return
    const isSame = (existing) => existing.toLowerCase() === text.toLowerCase()
    setState({ ...state, searches: addToFront(state.searches, text, isSame, MAX_SEARCHES) })
  },

  clear() {
    setState(EMPTY)
  },
}

// Another tab changed the saved data: pick it up here too
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  state = load()
  listeners.forEach((listener) => listener())
})
