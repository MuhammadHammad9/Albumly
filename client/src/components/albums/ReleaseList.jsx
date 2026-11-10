import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { formatReleaseDate, pluralize, releaseTypeLabel } from '../../utils/format.js'
import Artwork from '../common/Artwork.jsx'
import SaveToggle from '../library/SaveToggle.jsx'
import Editions from './Editions.jsx'
import s from './explorer.module.css'

// The dense alternative to the grid: one row per release, with more detail visible at once.
// `groups` come from groupEditions; other editions are listed under their original's row.
export default function ReleaseList({ groups, showArtist = false }) {
  return (
    <ul className={s.list}>
      {groups.map(({ key, primary: release, editions }) => (
        <li key={key}>
          <div className={s.row}>
            <Link to={`/album/${release.id}`} className={s.rowMain}>
              <span className={s.rowCover}>
                <Artwork src={release.coverUrl} name={release.name} alt="" />
              </span>
              <span className={s.rowText}>
                <span className={s.rowName}>{release.name}</span>
                <span className={s.rowSub}>
                  {releaseTypeLabel(release.inferredType)}
                  {showArtist && ` · ${release.artists.map((artist) => artist.name).join(', ')}`}
                </span>
              </span>
              <span className={s.rowDate}>{formatReleaseDate(release.releaseDate, release.precision)}</span>
              <span className={s.rowTracks}>{pluralize(release.totalTracks, 'track')}</span>
            </Link>
            {/* Outside the link, so saving never opens the album */}
            <SaveToggle album={release} />
            <a href={release.spotifyUrl} target="_blank" rel="noreferrer" className={s.rowExternal} aria-label={`Open ${release.name} on Spotify`}>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          </div>
          {editions.length > 0 && (
            <div className={s.rowEditions}>
              <Editions primary={release} editions={editions} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
