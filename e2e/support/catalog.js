// Names and ids from the demo catalogue (server/src/data/mockCatalog.js). Album ids are
// "<artist id>--<slugified title>".
export const ARTISTS = {
  neonHarbor: { id: 'neon-harbor', name: 'Neon Harbor' },
  tribute: { id: 'neon-harbour-tribute', name: 'Neon Harbour Tribute Band' },
  maraVoss: { id: 'mara-voss', name: 'Mara Voss' },
  cassMarlowe: { id: 'cass-marlowe', name: 'Cass Marlowe' },
  driftwood: { id: 'driftwood-recordings', name: 'Driftwood Recordings' },
}

export const ALBUMS = {
  glassArcade: { id: 'neon-harbor--glass-arcade', name: 'Glass Arcade', tracks: 12 },
  glassArcadeDeluxe: { id: 'neon-harbor--glass-arcade-deluxe-edition', name: 'Glass Arcade (Deluxe Edition)', tracks: 17 },
  afterimage: { id: 'neon-harbor--afterimage', name: 'Afterimage', tracks: 22 },
  nightFerry: { id: 'neon-harbor--night-ferry', name: 'Night Ferry', tracks: 11 },
  paperMoons: { id: 'mara-voss--paper-moons', name: 'Paper Moons', tracks: 11 },
}

export const SEARCH_LABEL = 'Search artists, albums and tracks'
