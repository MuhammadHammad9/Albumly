import { FEATURED_ARTIST_IDS } from '../data/featured.js'
import { fileURLToPath } from 'node:url'
import { createFileStorage } from '../services/cache/fileStorage.js'
import { createCache } from '../services/cache/lruCache.js'
import { createSpotifyClient } from '../services/spotify/spotifyClient.js'
import { createTokenService } from '../services/spotify/tokenService.js'
import { upstreamBudget } from '../services/spotify/upstreamBudget.js'
import { mockProvider } from './mockProvider.js'
import { createSpotifyProvider } from './spotifyProvider.js'

// Every catalogue source implements the same methods (searchArtists, getArtist, getDiscography, ...),
// so routes never care where the data comes from. CATALOG_PROVIDER in server/.env picks one.

// server/.cache/spotify-cache.json (git-ignored)
const CACHE_FILE = fileURLToPath(new URL('../../.cache/spotify-cache.json', import.meta.url))
const BLOCKS_FILE = fileURLToPath(new URL('../../.cache/spotify-blocks.json', import.meta.url))

let spotifyProvider // created once on first use, so the cache and token are shared by every request

function createSpotifyFromEnv() {
  const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret, SPOTIFY_MARKET: market } = process.env
  if (!clientId || !clientSecret) {
    throw new Error('CATALOG_PROVIDER=spotify needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in server/.env')
  }

  return createSpotifyProvider({
    client: createSpotifyClient({
      tokenService: createTokenService({ clientId, clientSecret }),
      // Written immediately (no batching): a block must be on disk before the next restart
      blockStorage: createFileStorage(BLOCKS_FILE, { delayMs: 0 }),
      gate: upstreamBudget.gate,
    }),
    cache: createCache({ maxEntries: 500, storage: createFileStorage(CACHE_FILE) }),
    market: market || undefined,
    featuredArtistIds: FEATURED_ARTIST_IDS,
  })
}

const providers = {
  mock: () => mockProvider,
  spotify: () => (spotifyProvider ??= createSpotifyFromEnv()),
}

export function getProvider() {
  const name = process.env.CATALOG_PROVIDER || 'mock'
  const create = providers[name]
  if (!create) throw new Error(`Unknown CATALOG_PROVIDER "${name}" (use "mock" or "spotify")`)
  return create()
}
