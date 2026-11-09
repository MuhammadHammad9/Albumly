// Spotify feasibility spike: `npm run spike` (from server/)
//
// Checks, against the live Spotify Web API and your own app credentials, everything Albumly
// relies on, then writes the findings to docs/spotify-spike-results.md. It never prints the
// client secret or the access token.

import 'dotenv/config'
import { writeFile } from 'node:fs/promises'
import { FEATURED_ARTIST_IDS } from '../src/data/featured.js'
import { fetchDiscography } from '../src/services/catalog/discographyService.js'
import { createSpotifyClient } from '../src/services/spotify/spotifyClient.js'
import { createTokenService } from '../src/services/spotify/tokenService.js'

const REPORT_PATH = new URL('../../docs/spotify-spike-results.md', import.meta.url)

// A mix of small, large and guest-heavy discographies
const TEST_ARTISTS = ['Radiohead', 'Taylor Swift', 'Daft Punk', 'Arooj Aftab', 'Nusrat Fateh Ali Khan']

const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret, SPOTIFY_MARKET: market } = process.env
if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in server/.env first.')
  process.exit(1)
}

const results = [] // { check, ok, detail }
const record = (check, ok, detail) => {
  results.push({ check, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${check}${detail ? ` — ${detail}` : ''}`)
}

const tokenService = createTokenService({ clientId, clientSecret })
const client = createSpotifyClient({ tokenService })
const timed = async (fn) => {
  const started = performance.now()
  const value = await fn()
  return { value, ms: Math.round(performance.now() - started) }
}

// 1. Credentials
try {
  await tokenService.getToken()
  record('Client Credentials token', true, 'Spotify accepted the app credentials')
} catch (error) {
  record('Client Credentials token', false, error.message)
  await writeReport()
  process.exit(1)
}

// 2. Search, plus which fields Spotify still returns
const found = []
for (const name of TEST_ARTISTS) {
  try {
    const { value, ms } = await timed(() => client.get('/search', { params: { q: name, type: 'artist', limit: 5, market } }))
    const top = value.artists.items.find(Boolean)
    if (!top) {
      record(`Search "${name}"`, false, 'no results')
      continue
    }
    found.push({ id: top.id, name: top.name })
    record(`Search "${name}"`, true, `top hit "${top.name}" in ${ms} ms, ${value.artists.total} total`)
  } catch (error) {
    record(`Search "${name}"`, false, error.message)
  }
}

// 3. Artist fields
const fieldNotes = []
if (found[0]) {
  try {
    const artist = await client.get(`/artists/${found[0].id}`)
    fieldNotes.push(
      `- **genres**: ${artist.genres?.length ? `present (${artist.genres.slice(0, 3).join(', ')})` : 'empty or missing'}`,
      `- **images**: ${artist.images?.length ? `present (${artist.images.length} sizes)` : 'missing'}`,
      `- **popularity**: ${artist.popularity === undefined ? 'missing' : 'present'}`,
      `- **followers**: ${artist.followers === undefined ? 'missing' : 'present'}`,
    )
    record('Artist details', true, `fetched "${artist.name}"`)
  } catch (error) {
    record('Artist details', false, error.message)
  }
}

// 4. Full discographies: the expensive part
const discographyRows = []
let sampleAlbumId = null
for (const artist of found) {
  try {
    const { value, ms } = await timed(() => fetchDiscography(client, artist.id, { market }))
    const { counts, total, report } = value
    discographyRows.push(
      `| ${artist.name} | ${total} | ${counts.album} | ${counts.single} | ${counts.compilation} | ${counts.appears_on} | ${report.requests} | ${(ms / 1000).toFixed(1)} s | ${report.duplicatesRemoved} | ${report.truncated.join(', ') || '—'} |`,
    )
    sampleAlbumId ??= value.releases.find((release) => release.group === 'album')?.id
    // Every release Spotify says exists should have arrived, except in groups we deliberately capped
    const missing = Object.entries(report.groups)
      .filter(([group, { reported, retrieved }]) => retrieved < reported && !report.truncated.includes(group))
      .map(([group, { reported, retrieved }]) => `${group} ${retrieved}/${reported}`)
    const detail = `${total} releases, ${report.requests} requests, ${(ms / 1000).toFixed(1)} s`
    record(`Discography "${artist.name}"`, missing.length === 0, missing.length ? `${detail}; incomplete: ${missing.join(', ')}` : detail)
  } catch (error) {
    record(`Discography "${artist.name}"`, false, error.message)
  }
}

// 5. Whether album_group still exists (Albumly assumes it does not)
if (found[0]) {
  try {
    const page = await client.get(`/artists/${found[0].id}/albums`, { params: { limit: 1, market } })
    const item = page.items.find(Boolean)
    const hasGroup = item && 'album_group' in item
    fieldNotes.push(`- **album_group** on artist albums: ${hasGroup ? 'present (could simplify fetching later)' : 'missing (expected; Albumly fetches one group at a time)'}`)
    fieldNotes.push(`- **page size** for artist albums: Albumly asks for 10, Spotify returned limit=${page.limit}`)
  } catch (error) {
    fieldNotes.push(`- album_group check failed: ${error.message}`)
  }
}

// 6. Album with full tracklist
if (sampleAlbumId) {
  try {
    const { value, ms } = await timed(() => client.get(`/albums/${sampleAlbumId}`, { params: { market } }))
    record('Album with tracks', true, `"${value.name}": ${value.tracks.items.length} of ${value.total_tracks} tracks in the first response, ${ms} ms`)
  } catch (error) {
    record('Album with tracks', false, error.message)
  }
}

// 7. Featured artist IDs still resolve
let featuredOk = 0
for (const id of FEATURED_ARTIST_IDS) {
  try {
    await client.get(`/artists/${id}`)
    featuredOk++
  } catch (error) {
    record(`Featured artist ${id}`, false, error.message)
  }
}
record('Featured artist IDs', featuredOk === FEATURED_ARTIST_IDS.length, `${featuredOk} of ${FEATURED_ARTIST_IDS.length} resolve`)

// 8. Endpoints Spotify restricted for new apps; Albumly must not depend on them
const restricted = []
for (const [label, path] of [
  ['New releases (browse)', '/browse/new-releases?limit=1'],
  ['Artist top tracks', `/artists/${found[0]?.id}/top-tracks?market=US`],
  ['Related artists', `/artists/${found[0]?.id}/related-artists`],
]) {
  try {
    await client.get(path)
    restricted.push(`- ${label}: **available**`)
  } catch (error) {
    restricted.push(`- ${label}: unavailable (${error.code ?? error.message})`)
  }
}

await writeReport()

async function writeReport() {
  const stats = client.stats()
  const passed = results.filter((result) => result.ok).length
  const lines = [
    '# Spotify feasibility report',
    '',
    `Generated by \`npm run spike\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Market: ${market || 'all'}.`,
    '',
    `**${passed} of ${results.length} checks passed.**`,
    '',
    '## Checks',
    '',
    '| Result | Check | Detail |',
    '| --- | --- | --- |',
    ...results.map((result) => `| ${result.ok ? 'PASS' : 'FAIL'} | ${result.check} | ${String(result.detail ?? '').replaceAll('|', '/')} |`),
    '',
  ]
  if (discographyRows.length) {
    lines.push(
      '## Discography cost (uncached)',
      '',
      '| Artist | Releases | Albums | Singles | Compilations | Appears on | Requests | Time | Duplicates removed | Capped groups |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...discographyRows,
      '',
      'Results are cached for 24 hours, so a repeat visit costs no Spotify requests.',
      '',
    )
  }
  if (fieldNotes.length) lines.push('## Fields Spotify returns', '', ...fieldNotes, '')
  if (restricted.length) lines.push('## Restricted endpoints (Albumly does not use these)', '', ...restricted, '')
  lines.push(
    '## Totals',
    '',
    `- Spotify requests: ${stats.requests}`,
    `- Average latency: ${stats.averageLatencyMs} ms`,
    `- Rate-limited responses (429): ${stats.rateLimited}`,
    `- Retries: ${stats.retries}`,
    '',
  )
  await writeFile(REPORT_PATH, lines.join('\n'))
  console.log(`\nReport written to docs/spotify-spike-results.md (${stats.requests} Spotify requests)`)
}
