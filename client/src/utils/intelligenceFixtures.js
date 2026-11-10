// A fixed little library and catalogue for the intelligence tests. The expected insights numbers
// are worked out by hand in insights.test.js, so change this file only together with that one.

const NH = { id: 'neon-harbor', name: 'Neon Harbor' }
const MV = { id: 'mara-voss', name: 'Mara Voss' }
const KE = { id: 'kite-and-ember', name: 'Kite & Ember' }
const PL = { id: 'the-paper-lanterns', name: 'The Paper Lanterns' }
const OL = { id: 'oda-lindqvist', name: 'Oda Lindqvist' }
export const ARTISTS = { NH, MV, KE, PL, OL }

export function release(id, name, date, artists, overrides = {}) {
  const year = Number(date.slice(0, 4))
  return {
    id,
    name,
    group: 'album',
    albumType: 'album',
    inferredType: 'album',
    releaseDate: date,
    precision: date.length === 10 ? 'day' : date.length === 7 ? 'month' : 'year',
    year,
    totalTracks: 10,
    artists,
    coverUrl: null,
    spotifyUrl: `https://open.spotify.com/album/${id}`,
    ...overrides,
  }
}

function libraryEntry(albumRelease, { status = null, rating = null, tags = [], totalTracks = 10, totalDurationMs = null } = {}) {
  // eslint-disable-next-line no-unused-vars
  const { group, ...album } = albumRelease
  return {
    album: { ...album, totalTracks, totalDurationMs },
    status,
    rating,
    review: '',
    notes: '',
    tags,
    addedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

// The 8 saved albums
export const ENTRIES = [
  libraryEntry(release('n1', 'Low Tide Signals', '2012-09-14', [NH]), { status: 'listened', rating: 8, tags: ['late night'], totalTracks: 10 }),
  libraryEntry(release('n2', 'Glass Arcade', '2015-05-22', [NH]), { status: 'favourite', rating: 10, tags: ['late night', 'driving'], totalTracks: 12, totalDurationMs: 2_700_000 }),
  libraryEntry(release('n3', 'Night Ferry', '2018-10-12', [NH]), { status: 'listened', rating: 6, totalTracks: 11 }),
  libraryEntry(release('m1', 'Paper Moons', '2016-04-08', [MV]), { status: 'listened', rating: 9, tags: ['late night'], totalTracks: 11, totalDurationMs: 2_400_000 }),
  libraryEntry(release('m2', 'Velvet Hours', '2019-09-27', [MV, NH]), { status: 'want', totalTracks: 14 }),
  libraryEntry(release('k1', 'Field Notes', '2010', [KE]), { status: 'listened', rating: 4, tags: ['acoustic'], totalTracks: 9 }),
  libraryEntry(release('k2', 'The Long Thaw', '2014-01-24', [KE]), { totalTracks: 10 }),
  libraryEntry(release('l1', 'Loud Rooms', '2008-06-03', [PL]), { status: 'listening', rating: 7, tags: ['driving'], totalTracks: 12 }),
]

export const COLLECTIONS = [{ id: 'c1', name: 'Night drives', description: '', albumIds: ['n1', 'n2'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }]

export const GENRES = { [NH.id]: ['synthwave', 'dream pop'], [MV.id]: ['alt r&b', 'neo soul'], [KE.id]: ['indie folk'] }

// What /api/intelligence/artists would answer for these artists
export const KNOWN_ARTISTS = [
  {
    id: NH.id,
    artist: { ...NH, imageUrl: null, genres: GENRES[NH.id] },
    source: 'full',
    releases: [
      release('n1', 'Low Tide Signals', '2012-09-14', [NH]),
      release('n2', 'Glass Arcade', '2015-05-22', [NH]),
      release('n2d', 'Glass Arcade (Deluxe Edition)', '2016-02-05', [NH]), // another edition of an owned album
      release('n3', 'Night Ferry', '2018-10-12', [NH]),
      release('n4', 'Afterimage', '2021-03-19', [NH]),
      release('n5', 'Halogen', '2015-03-06', [NH], { group: 'single', albumType: 'single', inferredType: 'single', totalTracks: 1 }),
      release('n6', 'Harbor Lines: 2012–2022', '2022', [NH], { group: 'compilation', albumType: 'compilation', inferredType: 'compilation' }),
      release('m2', 'Velvet Hours', '2019-09-27', [MV], { group: 'appears_on' }),
    ],
  },
  {
    id: MV.id,
    artist: { ...MV, imageUrl: null, genres: GENRES[MV.id] },
    source: 'full',
    releases: [
      release('m1', 'Paper Moons', '2016-04-08', [MV]),
      release('m2', 'Velvet Hours', '2019-09-27', [MV]),
      release('m3', 'Honeyglass', '2023-02-17', [MV]),
      release('m4', 'Small Hours', '2018-06', [MV], { group: 'single', albumType: 'single', inferredType: 'ep', totalTracks: 4 }),
    ],
  },
  {
    id: KE.id,
    artist: { ...KE, imageUrl: null, genres: GENRES[KE.id] },
    source: 'preview',
    releases: [release('k1', 'Field Notes', '2010', [KE]), release('k2', 'The Long Thaw', '2014-01-24', [KE]), release('k3', 'Wintering', '2017-11-10', [KE])],
  },
  {
    id: OL.id,
    artist: { ...OL, imageUrl: null, genres: [] },
    source: 'preview',
    // Oda guests on Kite & Ember's Wintering, which connects her to the library
    releases: [release('o1', 'Sleep Maps', '2015-12-04', [OL]), release('k3', 'Wintering', '2017-11-10', [KE], { group: 'appears_on' })],
  },
  { id: PL.id, artist: null, source: null, releases: null }, // not looked up yet
]
