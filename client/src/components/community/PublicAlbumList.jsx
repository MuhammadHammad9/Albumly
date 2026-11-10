import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { artistNames } from '../../utils/battles.js'
import { safeImageUrl, safeSpotifyUrl } from '../../utils/safeUrl.js'
import Artwork from '../common/Artwork.jsx'
import s from './community.module.css'

// The albums of a shared collection, drawn only from the saved snapshots (no Spotify request).
// Everything is plain React text, and every link is checked again before it is used.
// renderReport(item) is an optional slot for a "Report this review" button.
export default function PublicAlbumList({ albums, includeReviews = false, renderReport }) {
  return (
    <ol className={s.albumList}>
      {albums.map((item) => {
        const { album } = item
        const artists = artistNames(album)
        const spotifyUrl = safeSpotifyUrl(album.spotifyUrl)
        const showReview = includeReviews && (item.rating != null || item.review)
        return (
          <li key={album.id} className={s.albumRow}>
            <span className={s.position} aria-hidden="true">
              {item.position + 1}
            </span>
            <Artwork src={safeImageUrl(album.coverUrl)} alt={`${album.name} by ${artists || 'unknown artist'} cover`} name={album.name} />
            <div className={s.albumInfo}>
              <span className={s.albumName}>{album.name}</span>
              <span className={s.albumMeta}>
                {[artists, album.year].filter(Boolean).join(' · ')}
              </span>
              <div className={s.links}>
                <Link className={s.link} to={`/album/${encodeURIComponent(album.id)}`}>
                  Album details
                </Link>
                {spotifyUrl && (
                  <a className={s.link} href={spotifyUrl} target="_blank" rel="noopener noreferrer">
                    Open in Spotify <ExternalLink size={12} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </div>
              {showReview && (
                <div>
                  {item.rating != null && (
                    <p className={s.note}>
                      Rating: <span className={s.rating}>{item.rating}/10</span>
                    </p>
                  )}
                  {item.review && <blockquote className={s.review}>{item.review}</blockquote>}
                  {item.review && renderReport?.(item)}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
