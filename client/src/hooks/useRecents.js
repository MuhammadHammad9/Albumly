import { useSyncExternalStore } from 'react'
import { recents } from '../services/recents.js'

// { artists, searches }, re-rendering the component whenever either list changes
export function useRecents() {
  return useSyncExternalStore(recents.subscribe, recents.getSnapshot)
}
