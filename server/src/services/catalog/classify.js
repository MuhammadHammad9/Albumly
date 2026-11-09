// Spotify only knows album / single / compilation. An EP is our own guess:
// a "single" with 4 to 6 tracks. The UI labels it as inferred.
export function inferReleaseType({ albumType, totalTracks }) {
  if (albumType === 'single' && totalTracks >= 4 && totalTracks <= 6) return 'ep'
  return albumType
}
