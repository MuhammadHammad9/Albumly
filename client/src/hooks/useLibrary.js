import { useMemo } from 'react'
import { useStore } from 'zustand'
import { libraryStore } from '../stores/libraryStore.js'

// Components read the library through these hooks. Each one selects a small slice, so a
// component only re-renders when the part it shows changes.

// Any slice, e.g. useLibrary((state) => state.saveAlbum)
export const useLibrary = (selector) => useStore(libraryStore, selector)

// The saved entry for one album, or undefined when it is not saved
export const useEntry = (albumId) => useLibrary((state) => state.entries[albumId])

// All saved entries as an array. The selector returns the stored object itself (a new array
// returned from a selector would count as a change on every render), and useMemo builds the array.
export function useEntries() {
  const entries = useLibrary((state) => state.entries)
  return useMemo(() => Object.values(entries), [entries])
}

export const useCollections = () => useLibrary((state) => state.collections)

// Every action at once; actions never change, so this never causes a re-render
export const libraryActions = () => libraryStore.getState()
