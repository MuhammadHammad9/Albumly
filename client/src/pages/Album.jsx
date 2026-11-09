import { Search, SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import AlbumActions from '../components/albums/AlbumActions.jsx'
import TrackList from '../components/albums/TrackList.jsx'
import Artwork from '../components/common/Artwork.jsx'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import LibraryPanel from '../components/library/LibraryPanel.jsx'
import { useAlbum } from '../hooks/catalog.js'
import { libraryActions, useEntry } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { formatLongDuration, formatReleaseDate, pluralize, releaseTypeLabel } from '../utils/format.js'
import { filterTracks } from '../utils/releases.js'
import NotFound from './NotFound.jsx'
import s from './pages.module.css'

// Short tracklists are easy to scan; the filter only earns its space on longer ones
const MIN_TRACKS_FOR_FILTER = 8

function AlbumSkeleton() {
  return (
    <LoadingRegion label="Loading album">
      <div className={s.detailHeader}>
        <Skeleton className={s.albumCover} style={{ aspectRatio: 1 }} />
        <div className={s.detailInfo}>
          <Skeleton style={{ height: 14, width: 60 }} />
          <Skeleton style={{ height: 44, width: 'min(360px, 70vw)' }} />
          <Skeleton style={{ height: 18, width: 220 }} />
        </div>
      </div>
      <div className={s.section}>
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} style={{ height: 48, marginBottom: 8 }} />
        ))}
      </div>
    </LoadingRegion>
  )
}

function Tracks({ album }) {
  const [trackQuery, setTrackQuery] = useState('')
  const tracks = filterTracks(album.tracks, trackQuery)

  return (
    <div className={s.section}>
      {album.tracks.length >= MIN_TRACKS_FOR_FILTER && (
        <div className={s.trackTools}>
          <label className={s.trackFilter}>
            <span className="sr-only">Filter tracks by title or artist</span>
            <Search size={16} aria-hidden="true" />
            <input type="search" placeholder="Find a track" value={trackQuery} onChange={(event) => setTrackQuery(event.target.value)} />
          </label>
          {trackQuery.trim() && (
            <span role="status">
              {tracks.length} of {pluralize(album.tracks.length, 'track')}
            </span>
          )}
        </div>
      )}

      {tracks.length === 0 ? (
        <EmptyState icon={SearchX} title={`No tracks match “${trackQuery.trim()}”`} message="Try part of the title or a guest artist's name." />
      ) : (
        <TrackList tracks={tracks} albumArtists={album.artists} />
      )}
    </div>
  )
}

// A saved album that the catalogue no longer has: show what the library kept, so it can still be
// rated or removed instead of vanishing behind a "not found" page
function UnavailableAlbum({ snapshot }) {
  const artistNames = snapshot.artists.map((artist) => artist.name).join(', ')
  return (
    <>
      <header className={s.detailHeader}>
        <div className={s.albumCover}>
          <Artwork src={snapshot.coverUrl} name={snapshot.name} alt={`${snapshot.name} by ${artistNames} cover`} eager />
        </div>
        <div className={s.detailInfo}>
          <p className={s.eyebrow}>{releaseTypeLabel(snapshot.inferredType)}</p>
          <h1 className={s.detailTitle}>{snapshot.name}</h1>
          <p className={s.detailArtists}>{artistNames}</p>
          <p className={s.badgeRow}>
            <span className={common.badge}>Unavailable in the catalogue</span>
          </p>
          <p className={s.detailMeta}>This album can no longer be found. Your library still keeps the details saved here.</p>
        </div>
      </header>
      <LibraryPanel key={snapshot.id} album={snapshot} />
    </>
  )
}

export default function Album() {
  const { id } = useParams()
  const { data: album, isPending, isError, error, refetch } = useAlbum(id)
  const saved = useEntry(id)
  usePageTitle(album?.name ?? saved?.album.name)

  // Viewing a saved album keeps its stored details current, at no extra cost
  useEffect(() => {
    if (album) libraryActions().refreshSnapshot(album)
  }, [album])

  if (isPending) return <AlbumSkeleton />
  if (error?.status === 404) {
    if (saved) return <UnavailableAlbum snapshot={saved.album} />
    return <NotFound title="Album not found" message="This release is not in the catalogue. It may have been removed." />
  }
  if (isError) return <ErrorState error={error} onRetry={refetch} />

  const artistNames = album.artists.map((artist) => artist.name).join(', ')
  const isInferredEp = album.inferredType === 'ep'
  const hasExplicitTracks = album.tracks.some((track) => track.explicit)

  return (
    <>
      <header className={s.detailHeader}>
        <div className={s.albumCover}>
          <Artwork src={album.coverUrl} name={album.name} alt={`${album.name} by ${artistNames} cover`} eager />
        </div>
        <div className={s.detailInfo}>
          <p className={s.eyebrow}>
            {releaseTypeLabel(album.inferredType)}
            {isInferredEp && <span title="Spotify lists this as a single; Albumly infers EP from its track count"> (inferred)</span>}
          </p>
          <h1 className={s.detailTitle}>{album.name}</h1>
          <p className={s.detailArtists}>
            {album.artists.map((artist, index) => (
              <span key={artist.id}>
                {index > 0 && ', '}
                <Link to={`/artist/${artist.id}`} className={s.inlineLink}>
                  {artist.name}
                </Link>
              </span>
            ))}
          </p>
          <p className={s.detailMeta}>
            {formatReleaseDate(album.releaseDate, album.precision)} · {pluralize(album.totalTracks, 'track')} ·{' '}
            {formatLongDuration(album.totalDurationMs)}
            {hasExplicitTracks && (
              <>
                {' · '}
                <span className={common.badgeExplicit} title="Contains explicit tracks">
                  E<span className="sr-only">xplicit</span>
                </span>
              </>
            )}
          </p>
          <AlbumActions album={album} artistNames={artistNames} />
        </div>
      </header>

      {/* key: moving to another album starts fresh instead of carrying over the last one's text */}
      <LibraryPanel key={`library-${album.id}`} album={album} />
      <Tracks key={album.id} album={album} />
    </>
  )
}
