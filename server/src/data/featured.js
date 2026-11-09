// Spotify removed its "new releases" and "browse" endpoints, so the home page's featured
// artists are an editorial choice instead. These are Spotify artist IDs (the 22 characters at
// the end of an open.spotify.com/artist/... link). `npm run spike` checks that each still resolves.
export const FEATURED_ARTIST_IDS = [
  '1Xyo4u8uXC1ZmMpatF05PJ', // The Weeknd
  '06HL4z0CvFAxyc27GXpf02', // Taylor Swift
  '2YZyLoL8N0Wb9xBt1NhZWg', // Kendrick Lamar
  '7tYKF4w9nC0nq9CsPZTHyP', // SZA
  '4Z8W4fKeB5YxbusRsdQVPb', // Radiohead
  '5INjqkS1o8h1imAzPqGZBb', // Tame Impala
]
