import { Link } from 'react-router'
import { useCoverTransition } from '../../hooks/useCoverTransition.js'
import Artwork from '../common/Artwork.jsx'
import s from '../common/cards.module.css'

export default function ArtistCard({ artist }) {
  const cover = useCoverTransition()
  return (
    <li>
      <Link
        to={`/artist/${artist.id}`}
        className={s.artistCard}
        data-spot=""
        // The photo glides into the artist page's header (see AlbumCard)
        viewTransition
        state={{ preview: { name: artist.name, imageUrl: artist.imageUrl } }}
        onClick={cover.mark}
      >
        {/* Decorative: the name is right below, so an alt would only repeat it */}
        <Artwork src={artist.imageUrl} name={artist.name} alt="" round style={cover.style} />
        <h3 className={s.title}>{artist.name}</h3>
        {/* Genres help tell apart artists with similar names; not every artist has them */}
        <p className={s.meta}>{artist.genres.slice(0, 2).join(', ') || 'Artist'}</p>
      </Link>
    </li>
  )
}
