import { useQueries, useQuery } from '@tanstack/react-query'
import { apiGet } from '../services/api.js'
import { useCatalogSearch } from './search.js'

// Each hook wraps one backend endpoint. TanStack Query caches by `queryKey`, de-duplicates
// identical requests, and hands every queryFn an AbortSignal so stale requests are cancelled.

// Search hooks live in hooks/search.js; these two names are kept here for existing imports
export { MIN_QUERY_LENGTH } from './search.js'

// Same cache entry as the Search page's artist tab, so pressing Enter after the suggestions
// appeared costs no second request
export function useArtistSearch(query) {
  return useCatalogSearch({ type: 'artist', q: query })
}

export function useArtist(id) {
  return useQuery({
    queryKey: ['artist', id],
    queryFn: ({ signal }) => apiGet(`/api/artists/${encodeURIComponent(id)}`, { signal }),
  })
}

export function useDiscography(artistId) {
  return useQuery({
    queryKey: ['discography', artistId],
    queryFn: ({ signal }) => apiGet(`/api/artists/${encodeURIComponent(artistId)}/discography`, { signal }),
  })
}

// Whole release groups (say, every compilation), each fetched only once `enabled` lists it.
// Returns { [group]: query }. A query stays subscribed while disabled, so a group loaded once
// stays loaded when the user moves to another tab.
export function useDiscographyGroups(artistId, groups, enabled) {
  const results = useQueries({
    queries: groups.map((group) => ({
      queryKey: ['discography', artistId, group],
      queryFn: ({ signal }) =>
        apiGet(`/api/artists/${encodeURIComponent(artistId)}/discography/${encodeURIComponent(group)}`, { signal }),
      enabled: enabled.includes(group),
      // A whole group does not change during a visit; never refetch it on its own
      staleTime: Infinity,
    })),
  })
  return Object.fromEntries(groups.map((group, index) => [group, results[index]]))
}

export function useAlbum(id) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: ({ signal }) => apiGet(`/api/albums/${encodeURIComponent(id)}`, { signal }),
  })
}

export function useFeatured() {
  return useQuery({
    queryKey: ['featured'],
    queryFn: ({ signal }) => apiGet('/api/featured', { signal }),
  })
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet('/api/health', { signal }),
    staleTime: Infinity,
    retry: false,
  })
}
