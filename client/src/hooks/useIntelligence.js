import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '../services/api.js'
import { unknownNeighbours } from '../utils/artistGraph.js'

// The intelligence pages ask the server what it already knows about some artists.
// Reading costs no Spotify requests. Looking more up only happens through useArtistLookup,
// when the user presses a button, and the server caps it.

export const MAX_IDS = 40 // the server's limit per call
export const LOOKUP_SIZE = 3 // artists looked up per button press (at most 2 Spotify requests each)

const PATH = '/api/intelligence/artists'

// { mode, artists: [{ id, artist, releases, source }], budget, stopped } for up to 40 ids
export function useKnownArtists(ids) {
  const list = ids.slice(0, MAX_IDS)
  return useQuery({
    queryKey: ['intelligence', 'artists', list],
    queryFn: ({ signal }) => apiGet(PATH, { params: { ids: list.join(',') }, signal }),
    enabled: list.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData, // keep showing the last answer while the list of ids changes
  })
}

// The seed artists plus the artists credited alongside them (one step out), in two cache-only calls.
// Returns { artists, mode, budget, stopped, isPending, error, refetch }
export function useKnownNetwork(seedIds) {
  const seeds = useKnownArtists(seedIds)
  const seedArtists = useMemo(() => seeds.data?.artists ?? [], [seeds.data])
  const nextIds = useMemo(() => unknownNeighbours(seedArtists, MAX_IDS), [seedArtists])
  const neighbours = useKnownArtists(nextIds)

  const artists = useMemo(() => {
    const seen = new Set(seedArtists.map((a) => a.id))
    return [...seedArtists, ...(neighbours.data?.artists ?? []).filter((a) => !seen.has(a.id))]
  }, [seedArtists, neighbours.data])

  return {
    artists,
    mode: seeds.data?.mode,
    budget: neighbours.data?.budget ?? seeds.data?.budget,
    isPending: seedIds.length > 0 && seeds.isPending,
    error: seeds.error,
    refetch: seeds.refetch,
  }
}

// Looks up to 3 not-yet-known artists (in the order given). Afterwards every intelligence query
// is refreshed, which again costs no Spotify requests. data: { loaded, budget, stopped }
export function useArtistLookup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids) => apiGet(PATH, { params: { ids: ids.slice(0, MAX_IDS).join(','), load: String(LOOKUP_SIZE) } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['intelligence'] }),
  })
}
