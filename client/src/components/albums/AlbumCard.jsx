import { Link } from 'react-router'
import { useCoverTransition } from '../../hooks/useCoverTransition.js'
import { releaseTypeLabel } from '../../utils/format.js'
import Artwork from '../common/Artwork.jsx'
import s from '../common/cards.module.css'
import SaveToggle from '../library/SaveToggle.jsx'
import lib from '../library/library.module.css'

// `showArtist` is for mixed lists (home page); on an artist's own page the name would be noise.
// `note` is an extra line, such as "Listened · 8/10" in the library.
// The save button sits beside the link, not inside it: a button inside a link is invalid HTML
// and confusing to keyboard and screen-reader users. It also never covers the artwork.
export default function AlbumCard({ release, showArtist = false, note }) {
  const artistNames = release.artists.map((artist) => artist.name).join(', ')
  const details = [release.year, releaseTypeLabel(release.inferredType)]
  if (showArtist) details.push(artistNames)
  const cover = useCoverTransition()

  return (
    <li className={lib.cardItem}>
      <Link
        to={`/album/${release.id}`}
        className={s.card}
        data-spot=""
        // The page cross-fades and this cover glides into the album header. `preview` lets the
        // album page show the cover and title at once, before its own data has arrived.
        viewTransition
        state={{ preview: { name: release.name, coverUrl: release.coverUrl } }}
        onClick={cover.mark}
      >
        <Artwork src={release.coverUrl} name={release.name} alt="" style={cover.style} />
        <div className={lib.cardText}>
          <h3 className={s.title}>{release.name}</h3>
          <p className={s.meta}>{details.filter(Boolean).join(' · ')}</p>
          {note && <p className={lib.cardNote}>{note}</p>}
        </div>
      </Link>
      <SaveToggle album={release} className={lib.cardToggle} />
    </li>
  )
}
