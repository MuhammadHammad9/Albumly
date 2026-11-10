// Puts a saved library into localStorage before the page loads, so a test can start from
// "these albums are already saved" without clicking through the UI first.
// The shape is written out by hand on purpose: if the stored format ever changes without a
// migration, the tests that use this will notice.
const now = '2026-11-01T12:00:00.000Z'

export function snapshot({ id, name, tracks }, artist = { id: 'neon-harbor', name: 'Neon Harbor' }, year = 2015) {
  return {
    id,
    name,
    artists: [artist],
    albumType: 'album',
    inferredType: 'album',
    releaseDate: `${year}-01-01`,
    precision: 'day',
    year,
    totalTracks: tracks,
    coverUrl: `/api/mock/art/${id}.svg`,
    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
  }
}

export function libraryWith(albums, collections = []) {
  const entries = {}
  for (const album of albums) {
    entries[album.id] = { album, status: null, rating: null, review: '', notes: '', tags: [], addedAt: now, updatedAt: now }
  }
  return { version: 1, entries, collections: collections.map((c) => ({ description: '', createdAt: now, updatedAt: now, ...c })) }
}

export async function seedLibrary(page, library) {
  await page.addInitScript((data) => {
    // Only on the first load of this test, so a reload keeps whatever the test changed
    if (!sessionStorage.getItem('e2e:seeded')) {
      localStorage.setItem('albumly:library', JSON.stringify(data))
      sessionStorage.setItem('e2e:seeded', '1')
    }
  }, library)
}
