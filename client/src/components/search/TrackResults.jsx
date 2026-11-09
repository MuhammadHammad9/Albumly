import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { formatDuration } from '../../utils/format.js'
import Artwork from '../common/Artwork.jsx'
import common from '../common/common.module.css'
import s from './search.module.css'

// Tracks found by search: cover, title, artists, the album it is on, length, and a Spotify link
export default function TrackResults({ tracks }) {
  return (
    <ol className={s.tracks} aria-label="Tracks">
      {tracks.map((track) => (
        <li key={`${track.id}-${track.album?.id}`} className={s.track}>
          <Artwork src={track.album?.coverUrl} name={track.album?.name ?? track.name} alt="" />
          <div className={s.trackInfo}>
            <span className={s.trackName}>
              <span>{track.name}</span>
              {track.explicit && (
                <span className={common.badgeExplicit} title="Explicit">
                  E<span className="sr-only">xplicit</span>
                </span>
              )}
            </span>
            <span className={s.trackMeta}>
              {track.artists.map((artist, index) => (
                <span key={artist.id}>
                  {index > 0 && ', '}
                  <Link to={`/artist/${artist.id}`}>{artist.name}</Link>
                </span>
              ))}
              {track.album && (
                <>
                  {' · '}
                  <Link to={`/album/${track.album.id}`}>{track.album.name}</Link>
                  {track.album.year ? ` (${track.album.year})` : ''}
                </>
              )}
            </span>
          </div>
          <span className={s.duration}>{formatDuration(track.durationMs)}</span>
          <a href={track.spotifyUrl} target="_blank" rel="noreferrer" className={s.external} aria-label={`Open ${track.name} on Spotify`}>
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ol>
  )
}
