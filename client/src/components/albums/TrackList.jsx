import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'
import { formatDuration } from '../../utils/format.js'
import common from '../common/common.module.css'
import s from './TrackList.module.css'

// Group tracks by disc number, keeping their order: { 1: [...], 2: [...] }
function groupByDisc(tracks) {
  const discs = new Map()
  for (const track of tracks) {
    if (!discs.has(track.discNumber)) discs.set(track.discNumber, [])
    discs.get(track.discNumber).push(track)
  }
  return [...discs.entries()]
}

function TrackRow({ track, albumArtistIds }) {
  // Anyone credited on the track who is not one of the album's own artists is a guest
  const guests = track.artists.filter((artist) => !albumArtistIds.has(artist.id))

  return (
    <li className={s.row}>
      <span className={s.numberCell}>
        <span className={s.number}>{track.trackNumber}</span>
        <span className={s.bars} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
      <div className={s.info}>
        <span className={s.name}>{track.name}</span>
        {(track.explicit || guests.length > 0) && (
          <span className={s.sub}>
            {track.explicit && (
              <span className={common.badgeExplicit} title="Explicit">
                E<span className="sr-only">xplicit</span>
              </span>
            )}
            {guests.length > 0 && (
              <span>
                feat.{' '}
                {guests.map((artist, index) => (
                  <span key={artist.id}>
                    {index > 0 && ', '}
                    <Link to={`/artist/${artist.id}`} className={s.guestLink}>
                      {artist.name}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </span>
        )}
      </div>
      <span className={s.duration}>{formatDuration(track.durationMs)}</span>
      <a href={track.spotifyUrl} target="_blank" rel="noreferrer" className={s.external} aria-label={`Open ${track.name} on Spotify`}>
        <ExternalLink size={16} aria-hidden="true" />
      </a>
    </li>
  )
}

export default function TrackList({ tracks, albumArtists }) {
  const albumArtistIds = new Set(albumArtists.map((artist) => artist.id))
  const discs = groupByDisc(tracks)
  const multiDisc = discs.length > 1

  return (
    <section aria-label="Tracklist" className={s.panel}>
      {discs.map(([discNumber, discTracks]) => (
        <div key={discNumber} className={s.disc}>
          {multiDisc && <h3 className={s.discTitle}>Disc {discNumber}</h3>}
          <ol className={s.list}>
            {discTracks.map((track) => (
              <TrackRow key={track.id} track={track} albumArtistIds={albumArtistIds} />
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}
