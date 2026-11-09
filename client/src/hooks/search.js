import { useInfiniteQuery } from '@tanstack/react-query'
import { apiGet } from '../services/api.js'

export const MIN_QUERY_LENGTH = 2

// The server keeps search results for 10 minutes; the browser keeps them as long, so going back
// to a search, or switching tabs and back, costs no request at all
export const SEARCH_STALE_MS = 10 * 60 * 1000

// Only the filters that change what the catalogue returns are sent (artist and years, for album and
// track searches). Undefined values are dropped so they never appear as "yearFrom=undefined".
export function searchFilters({ type, artist, yearFrom, yearTo }) {
  if (type === 'artist') return {}
  const filters = {}
  if (artist) filters.artist = artist
  if (Number.isInteger(yearFrom)) filters.yearFrom = yearFrom
  if (Number.isInteger(yearTo)) filters.yearTo = yearTo
  return filters
}

// One search, a page (10 results) at a time with "Load more". The query key holds everything that
// changes the results, so each distinct search is cached separately and repeats are free.
export function useCatalogSearch({ type, q, artist, yearFrom, yearTo }) {
  const filters = searchFilters({ type, artist, yearFrom, yearTo })
  return useInfiniteQuery({
    queryKey: ['search', type, q, filters],
    queryFn: ({ pageParam, signal }) => apiGet('/api/search', { params: { q, type, offset: pageParam, ...filters }, signal }),
    initialPageParam: 0,
    // The next page starts where this one ended; undefined tells the hook there is no more
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.offset + lastPage.items.length
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: q.length >= MIN_QUERY_LENGTH,
    staleTime: SEARCH_STALE_MS,
  })
}
