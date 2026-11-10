// Link checks for content other people made (shared collections, battles). The server already
// cleans these; checking again here means a server bug can never turn into a dangerous link.
// - images: only Spotify's image servers or our own demo artwork (no tracking pixels)
// - external links: only open.spotify.com
// Anything else (javascript:, data:, "//other-site", plain http) gives null.

const MOCK_ART = /^\/api\/mock\/art\/[A-Za-z0-9_-]{1,100}\.svg$/
const IMAGE_HOSTS = /(^|\.)(scdn\.co|spotifycdn\.com)$/

function parse(value) {
  if (typeof value !== 'string' || value.length > 2000) return null
  try {
    // Only absolute addresses parse without a base; "//host" and "/path" fail here on purpose
    return new URL(value)
  } catch {
    return null
  }
}

export function safeImageUrl(value) {
  if (typeof value === 'string' && MOCK_ART.test(value)) return value
  const url = parse(value)
  return url && url.protocol === 'https:' && IMAGE_HOSTS.test(url.hostname) && !url.username ? url.href : null
}

export function safeSpotifyUrl(value) {
  const url = parse(value)
  return url && url.protocol === 'https:' && url.hostname === 'open.spotify.com' && !url.username ? url.href : null
}
