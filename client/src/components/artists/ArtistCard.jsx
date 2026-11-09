import { Link } from 'react-router'
import Artwork from '../common/Artwork.jsx'
import s from '../common/cards.module.css'

export default function ArtistCard({ artist }) {
  return (
    <li>
      <Link to={`/artist/${artist.id}`} className={s.artistCard}>
        {/* Decorative: the name is right below, so an alt would only repeat it */}
        <Artwork src={artist.imageUrl} name={artist.name} alt="" round />
        <h3 className={s.title}>{artist.name}</h3>
        {/* Genres help tell apart artists with similar names; not every artist has them */}
        <p className={s.meta}>{artist.genres.slice(0, 2).join(', ') || 'Artist'}</p>
      </Link>
    </li>
  )
}
