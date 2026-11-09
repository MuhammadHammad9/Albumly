// A small fictional catalogue used until the Spotify integration exists, and later as demo mode.
// Everything is built in the same normalized shape the real provider will return,
// so the client cannot tell the difference.
import { inferReleaseType } from '../services/catalog/classify.js'

// `featuring` lists artists who guest on some tracks; the release then shows up
// under "Appears On" in their discography.
const ARTISTS = [
  {
    id: 'neon-harbor',
    name: 'Neon Harbor',
    genres: ['synthwave', 'dream pop'],
    releases: [
      { name: 'Low Tide Signals', date: '2012-09-14', type: 'album', tracks: 10 },
      { name: 'Pier Lights', date: '2013-11', type: 'single', tracks: 5 },
      { name: 'Halogen', date: '2015-03-06', type: 'single', tracks: 1 },
      { name: 'Glass Arcade', date: '2015-05-22', type: 'album', tracks: 12, featuring: ['mara-voss'] },
      { name: 'Glass Arcade (Deluxe Edition)', date: '2016-02-05', type: 'album', tracks: 17, featuring: ['mara-voss'] },
      { name: 'Static Bloom', date: '2018-08-17', type: 'single', tracks: 2 },
      { name: 'Night Ferry', date: '2018-10-12', type: 'album', tracks: 11 },
      { name: 'Undertow', date: '2021-01-29', type: 'single', tracks: 1 },
      { name: 'Afterimage', date: '2021-03-19', type: 'album', tracks: 22, discs: 2, featuring: ['kite-and-ember'] },
      { name: 'Harbor Lines: 2012–2022', date: '2022', type: 'compilation', tracks: 18 },
      { name: 'Slow Lightning', date: '2024-06-07', type: 'album', tracks: 13, featuring: ['thea-okafor'] },
      { name: 'Slow Lightning (Remixes)', date: '2024-11-15', type: 'single', tracks: 6 },
    ],
  },
  {
    id: 'mara-voss',
    name: 'Mara Voss',
    genres: ['alt r&b', 'neo soul'],
    releases: [
      { name: 'Paper Moons', date: '2016-04-08', type: 'album', tracks: 11 },
      { name: 'Paper Moons (Remastered)', date: '2021-04-09', type: 'album', tracks: 11 },
      { name: 'Velvet Hours', date: '2019-09-27', type: 'album', tracks: 14, featuring: ['neon-harbor', 'ilse-marrow'] },
      { name: 'Honeyglass', date: '2023-02-17', type: 'album', tracks: 12 },
      { name: 'Small Hours', date: '2018-06-01', type: 'single', tracks: 4 },
      { name: 'Tangerine', date: '2022-11-04', type: 'single', tracks: 1 },
    ],
  },
  {
    id: 'kite-and-ember',
    name: 'Kite & Ember',
    genres: ['indie folk'],
    releases: [
      { name: 'Field Notes', date: '2010', type: 'album', tracks: 9 },
      { name: 'The Long Thaw', date: '2014-01-24', type: 'album', tracks: 10 },
      { name: 'Wintering', date: '2017-11-10', type: 'album', tracks: 12, featuring: ['oda-lindqvist'] },
      { name: 'Kindling', date: '2012-05', type: 'single', tracks: 5 },
      { name: 'Campfire Sessions', date: '2020-08-14', type: 'compilation', tracks: 15 },
    ],
  },
  {
    id: 'the-paper-lanterns',
    name: 'The Paper Lanterns',
    genres: ['indie rock', 'garage rock'],
    releases: [
      { name: 'Loud Rooms', date: '2011-06-03', type: 'album', tracks: 12 },
      { name: 'Second Floor', date: '2013-10-18', type: 'album', tracks: 11 },
      { name: 'Flicker', date: '2015-03-27', type: 'album', tracks: 10 },
      { name: 'Flicker (10th Anniversary Edition)', date: '2025-03-28', type: 'album', tracks: 16 },
      { name: 'Matchbook', date: '2012-02-14', type: 'single', tracks: 3 },
      { name: 'B-Sides & Rarities', date: '2019', type: 'compilation', tracks: 20 },
    ],
  },
  {
    // No genres and no image: exercises the "missing data" paths in the UI
    id: 'neon-harbour-tribute',
    name: 'Neon Harbour Tribute Band',
    genres: [],
    noImage: true,
    releases: [{ name: 'Covers from the Pier', date: '2023-07-21', type: 'album', tracks: 8 }],
  },
  {
    id: 'oda-lindqvist',
    name: 'Oda Lindqvist',
    genres: ['ambient', 'modern classical'],
    releases: [
      { name: 'Sleep Maps', date: '2015-12-04', type: 'album', tracks: 8 },
      { name: 'Tidal Rooms', date: '2019-02-22', type: 'album', tracks: 9 },
      { name: 'Hours Before Snow', date: '2022-12-02', type: 'album', tracks: 24, discs: 2 },
      { name: 'Prelude for Empty Stations', date: '2018-03', type: 'single', tracks: 1 },
    ],
  },
  {
    id: 'saffron-motel',
    name: 'Saffron Motel',
    genres: ['psychedelic rock'],
    releases: [
      { name: 'Vacancy', date: '2014-08-29', type: 'album', tracks: 10 },
      { name: 'Desert Rooms', date: '2018-05-11', type: 'album', tracks: 11 },
      { name: 'Checkout Time', date: '2022-09-09', type: 'album', tracks: 12, featuring: ['the-paper-lanterns'] },
      { name: 'Mirage', date: '2016-07-15', type: 'single', tracks: 2 },
    ],
  },
  {
    id: 'thea-okafor',
    name: 'Thea Okafor',
    genres: ['afro-fusion', 'pop'],
    releases: [
      { name: 'Golden Hour Radio', date: '2020-07-10', type: 'album', tracks: 13 },
      { name: 'Golden Hour Radio (Deluxe)', date: '2021-01-22', type: 'album', tracks: 18 },
      { name: 'Sunroom', date: '2023-05-26', type: 'album', tracks: 14, featuring: ['mara-voss'] },
      { name: 'Lagos to Lisbon', date: '2019-10-04', type: 'single', tracks: 5 },
      { name: 'Sweet Static', date: '2022-06-17', type: 'single', tracks: 1 },
    ],
  },
  {
    id: 'rivermouth',
    name: 'Rivermouth',
    genres: ['post-rock'],
    releases: [
      { name: 'Delta', date: '2013-04-19', type: 'album', tracks: 7 },
      { name: 'Estuary', date: '2017-09-08', type: 'album', tracks: 8 },
      { name: 'Silt', date: '2021-11-05', type: 'album', tracks: 9 },
    ],
  },
  {
    id: 'northern-static',
    name: 'Northern Static',
    genres: ['electronic', 'idm'],
    releases: [
      { name: 'Carrier Wave', date: '2016-10-21', type: 'album', tracks: 12 },
      { name: 'Shortwave', date: '2019-06-14', type: 'single', tracks: 6 },
      { name: 'Dead Air', date: '2022-03-25', type: 'album', tracks: 11, featuring: ['neon-harbor'] },
    ],
  },
  {
    id: 'cedar-and-the-wolves',
    name: 'Cedar & The Wolves',
    genres: ['americana', 'folk rock'],
    releases: [
      { name: 'Timberline', date: '2012-03-09', type: 'album', tracks: 11 },
      { name: 'Howl', date: '2015-10-30', type: 'album', tracks: 12, featuring: ['kite-and-ember'] },
      { name: 'Northbound', date: '2020-02-07', type: 'album', tracks: 10 },
      { name: 'Porch Songs', date: '2018', type: 'single', tracks: 4 },
    ],
  },
  {
    id: 'halcyon-drive',
    name: 'Halcyon Drive',
    genres: ['city pop', 'funk'],
    releases: [
      { name: 'Midnight Coastline', date: '2018-07-27', type: 'album', tracks: 10 },
      { name: 'Chrome Summer', date: '2021-06-18', type: 'album', tracks: 12, featuring: ['thea-okafor'] },
      { name: 'Overpass', date: '2023-09-01', type: 'single', tracks: 1 },
    ],
  },
  {
    id: 'the-velvet-antlers',
    name: 'The Velvet Antlers',
    genres: ['shoegaze'],
    releases: [
      { name: 'Soft Focus', date: '2014-11-14', type: 'album', tracks: 9 },
      { name: 'Bloomfield', date: '2019-04-05', type: 'album', tracks: 10 },
      { name: 'Haze', date: '2016-09', type: 'single', tracks: 5 },
    ],
  },
  {
    id: 'ilse-marrow',
    name: 'Ilse Marrow',
    genres: ['art pop', 'chamber pop'],
    releases: [
      { name: 'Cabinet of Weather', date: '2017-02-24', type: 'album', tracks: 11 },
      { name: 'Marginalia', date: '2020-10-16', type: 'album', tracks: 13 },
      { name: 'A Year in Glass', date: '2024-01-19', type: 'album', tracks: 12, featuring: ['oda-lindqvist'] },
      { name: 'Footnotes', date: '2022-04', type: 'single', tracks: 4 },
    ],
  },
  {
    // A session guitarist: more guest appearances (13) than fit on one 10-release page, so the
    // demo shows "Appears On" loading the rest when its tab is opened
    id: 'cass-marlowe',
    name: 'Cass Marlowe',
    genres: ['blues rock', 'session'],
    releases: [
      { name: 'Borrowed Strings', date: '2009-05-15', type: 'album', tracks: 10 },
      { name: 'Fretwork', date: '2011-09-23', type: 'album', tracks: 11 },
    ],
  },
  {
    // A label's yearly sampler: more compilations than fit on one page (lazy loading), numbered
    // volumes that must NOT be grouped as editions, and one expanded edition that must be
    id: 'driftwood-recordings',
    name: 'Driftwood Recordings',
    genres: ['various'],
    releases: [
      ...Array.from({ length: 12 }, (_, i) => ({
        name: `Driftwood Sampler Vol. ${i + 1}`,
        date: `${2014 + i}-04-18`,
        type: 'compilation',
        tracks: 14 + (i % 3),
        featuring: ['cass-marlowe'],
      })),
      { name: 'Driftwood Sampler Vol. 3 (Expanded Edition)', date: '2017-10-06', type: 'compilation', tracks: 20, featuring: ['cass-marlowe'] },
    ],
  },
]

const FEATURED_ARTIST_IDS = ['neon-harbor', 'mara-voss', 'thea-okafor', 'kite-and-ember', 'oda-lindqvist', 'the-paper-lanterns']

const TITLE_FIRST = ['Silver', 'Quiet', 'Paper', 'Electric', 'Hollow', 'Golden', 'Distant', 'Violet', 'Slow', 'Broken', 'Midnight', 'Amber', 'Northern', 'Glass', 'Tender', 'Restless', 'Neon', 'Salt', 'Winter', 'Borrowed']
const TITLE_SECOND = ['Avenue', 'Weather', 'Signal', 'Garden', 'Engine', 'Harbor', 'Letters', 'Motion', 'Rooms', 'Tide', 'Wires', 'Satellite', 'Orchard', 'Echo', 'Lanterns', 'Horizon', 'Static', 'Rivers', 'Mirrors', 'Daylight']

// Small deterministic string hash (FNV-1a), so the "random" data is identical on every run
export function hash(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const spotifySearchUrl = (text) => `https://open.spotify.com/search/${encodeURIComponent(text)}`

const PRECISION_BY_LENGTH = { 4: 'year', 7: 'month', 10: 'day' }

function buildTracks(albumId, def, owner, artistsById) {
  const guests = (def.featuring ?? []).map((id) => ({ id, name: artistsById.get(id).name }))
  const perDisc = Math.ceil(def.tracks / (def.discs ?? 1))
  const used = new Set()
  const tracks = []

  for (let i = 0; i < def.tracks; i++) {
    let h = hash(`${albumId}:${i}`)
    let name
    do {
      name = `${TITLE_FIRST[h % TITLE_FIRST.length]} ${TITLE_SECOND[(h >>> 8) % TITLE_SECOND.length]}`
      h = hash(`${h}`)
    } while (used.has(name))
    used.add(name)

    // Every third track gets a guest, so each `featuring` artist really appears on the release
    const guest = guests.length && i % 3 === 1 ? guests[Math.floor(i / 3) % guests.length] : null
    const seed = hash(`${albumId}:${i}:meta`)

    tracks.push({
      id: `${albumId}--t${i + 1}`,
      name,
      discNumber: Math.floor(i / perDisc) + 1,
      trackNumber: (i % perDisc) + 1,
      durationMs: (120 + (seed % 210)) * 1000,
      explicit: seed % 6 === 0,
      artists: guest ? [owner, guest] : [owner],
      spotifyUrl: spotifySearchUrl(`${name} ${owner.name}`),
    })
  }
  return tracks
}

function buildCatalog() {
  const artistsById = new Map()
  const albumsById = new Map()
  const discographies = new Map() // artistId -> [{ albumId, group }]

  for (const def of ARTISTS) {
    artistsById.set(def.id, {
      id: def.id,
      name: def.name,
      imageUrl: def.noImage ? null : `/api/mock/art/${def.id}.svg`,
      genres: def.genres,
      spotifyUrl: spotifySearchUrl(def.name),
    })
    discographies.set(def.id, [])
  }

  for (const artistDef of ARTISTS) {
    const owner = { id: artistDef.id, name: artistDef.name }

    for (const def of artistDef.releases) {
      const id = `${artistDef.id}--${slug(def.name)}`
      const tracks = buildTracks(id, def, owner, artistsById)

      albumsById.set(id, {
        id,
        name: def.name,
        albumType: def.type,
        inferredType: inferReleaseType({ albumType: def.type, totalTracks: def.tracks }),
        releaseDate: def.date,
        precision: PRECISION_BY_LENGTH[def.date.length],
        year: Number(def.date.slice(0, 4)),
        totalTracks: def.tracks,
        artists: [owner],
        coverUrl: `/api/mock/art/${id}.svg`,
        spotifyUrl: spotifySearchUrl(`${def.name} ${artistDef.name}`),
        tracks,
        totalDurationMs: tracks.reduce((sum, track) => sum + track.durationMs, 0),
      })

      discographies.get(artistDef.id).push({ albumId: id, group: def.type })
      for (const guestId of def.featuring ?? []) {
        discographies.get(guestId).push({ albumId: id, group: 'appears_on' })
      }
    }
  }

  return { artistsById, albumsById, discographies, featuredArtistIds: FEATURED_ARTIST_IDS }
}

export const catalog = buildCatalog()
