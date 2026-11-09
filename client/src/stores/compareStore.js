// Remembers a comparison that is waiting for its second album, so "Add to compare" on the next
// album page can complete it. Only a convenience for building links: the compare page itself
// always reads its albums from the URL. Kept in memory only; a refresh forgets it.
import { createStore } from 'zustand/vanilla'

export const compareStore = createStore((set) => ({
  waiting: null, // { id, name } or null
  setWaiting: (waiting) => set({ waiting }),
}))

// Where "Add to compare" on `album` should go
export function compareLink(album, waiting) {
  if (waiting && waiting.id !== album.id) return `/compare?a=${encodeURIComponent(waiting.id)}&b=${encodeURIComponent(album.id)}`
  return `/compare?a=${encodeURIComponent(album.id)}`
}
