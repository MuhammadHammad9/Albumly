// Test helpers: a stand-in for `fetch` that answers like Spotify, so tests never touch the network.

export const json = (body, { status = 200, headers = {} } = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// `handler(url, init)` returns a Response (or throws to simulate a network failure).
// Every call is recorded in `fetch.calls` so tests can count requests.
export function fakeFetch(handler) {
  const fetch = async (url, init) => {
    fetch.calls.push(String(url))
    return handler(new URL(url), init)
  }
  fetch.calls = []
  return fetch
}

// A token service that never makes requests
export function fakeTokenService() {
  return {
    invalidations: 0,
    async getToken() {
      return `token-${this.invalidations}`
    },
    invalidate() {
      this.invalidations++
    },
  }
}

// Spotify-shaped objects, with only the fields Albumly reads
export const rawArtist = (id, name = `Artist ${id}`) => ({
  id,
  name,
  genres: ['indie'],
  images: [{ url: `https://i.scdn.co/image/${id}` }],
  external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
})

export const rawAlbum = (id, { name = `Album ${id}`, type = 'album', date = '2020-01-01', tracks = 10, artist = 'a' } = {}) => ({
  id,
  name,
  album_type: type,
  release_date: date,
  release_date_precision: date.length === 4 ? 'year' : 'day',
  total_tracks: tracks,
  artists: [{ id: artist, name: `Artist ${artist}` }],
  images: [{ url: `https://i.scdn.co/image/${id}` }],
  external_urls: { spotify: `https://open.spotify.com/album/${id}` },
})

export const rawTrack = (n, disc = 1) => ({
  id: `t${disc}-${n}`,
  name: `Track ${n}`,
  disc_number: disc,
  track_number: n,
  duration_ms: 200_000,
  explicit: false,
  artists: [{ id: 'a', name: 'Artist a' }],
  external_urls: { spotify: `https://open.spotify.com/track/t${n}` },
})
