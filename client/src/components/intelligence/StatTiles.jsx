import { formatLongDuration, pluralize } from '../../utils/format.js'
import s from './intelligence.module.css'

// The headline numbers. Stat tiles, not charts: a single number reads best as a number.
export default function StatTiles({ insights }) {
  const { totals, topArtist, topGenre, averageRating } = insights
  const tiles = [
    { label: 'Albums saved', value: totals.albums },
    { label: 'Artists', value: totals.artists },
    { label: 'Collections', value: totals.collections },
    { label: 'Average rating', value: averageRating === null ? '–' : `${averageRating}/10`, detail: `${totals.rated} rated` },
    { label: 'Top artist', value: topArtist?.name ?? '–', detail: topArtist && pluralize(topArtist.albums, 'album') },
    { label: topGenre?.kind === 'tag' ? 'Top tag' : 'Top genre', value: topGenre?.name ?? '–', detail: topGenre && pluralize(topGenre.albums, 'album') },
    { label: 'Tracks', value: totals.tracks },
  ]
  if (totals.durationKnownFor > 0) {
    tiles.push({ label: 'Listening time', value: formatLongDuration(totals.durationMs), detail: `for ${totals.durationKnownFor} of ${pluralize(totals.albums, 'album')}` })
  }

  return (
    <ul className={s.tiles} aria-label="Library totals">
      {tiles.map((tile) => (
        <li key={tile.label} className={s.tile}>
          <span className={s.tileLabel}>{tile.label}</span>
          <span className={s.tileValue}>{tile.value}</span>
          {tile.detail && <span className={s.tileLabel}>{tile.detail}</span>}
        </li>
      ))}
    </ul>
  )
}
