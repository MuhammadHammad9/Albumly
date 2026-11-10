import { useMemo } from 'react'
import { buildProfile, rankedArtistIds } from '../utils/preferences.js'
import { useKnownNetwork } from './useIntelligence.js'
import { useEntries } from './useLibrary.js'
import { usePreferences } from './usePreferences.js'

// Everything the intelligence pages share: the library (read through the library hooks, so it
// works with any repository), the quiz and weights, what the server knows, and the profile.
export function useLibraryProfile() {
  const entries = useEntries()
  const { quiz, weights } = usePreferences()

  // A first profile without genres decides which artists to ask about, most liked first
  const seedIds = useMemo(() => rankedArtistIds(buildProfile(entries, { quiz })), [entries, quiz])
  const network = useKnownNetwork(seedIds)

  const genresByArtist = useMemo(
    () => Object.fromEntries(network.artists.filter((a) => a.artist?.genres?.length).map((a) => [a.id, a.artist.genres])),
    [network.artists],
  )
  const profile = useMemo(() => buildProfile(entries, { genresByArtist, quiz }), [entries, genresByArtist, quiz])
  const ownedAlbums = useMemo(() => entries.map((entry) => entry.album), [entries])

  // Artists Albumly could look up next: seeds first, then their neighbours
  const unknownIds = useMemo(() => network.artists.filter((a) => !a.releases).map((a) => a.id), [network.artists])

  return { entries, quiz, weights, seedIds, network, genresByArtist, profile, ownedAlbums, unknownIds }
}
