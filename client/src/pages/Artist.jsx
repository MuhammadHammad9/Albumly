import { ExternalLink } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation, useParams } from 'react-router'
import Discography from '../components/albums/Discography.jsx'
import Artwork from '../components/common/Artwork.jsx'
import { ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import { useArtist, useDiscography } from '../hooks/catalog.js'
import { useAmbient } from '../hooks/useAmbient.js'
import { useCoverTarget } from '../hooks/useCoverTransition.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { recents } from '../services/recents.js'
import { discographyTotal } from '../utils/discography.js'
import { pluralize } from '../utils/format.js'
import ArtistIntelligence from '../components/intelligence/ArtistIntelligence.jsx'
import NotFound from './NotFound.jsx'
import s from './pages.module.css'

function ArtistHeader({ artist, releaseCount, coverTarget }) {
  return (
    <header className={s.detailHeader}>
      <div className={s.artistImage} style={coverTarget}>
        <Artwork src={artist.imageUrl} name={artist.name} alt="" round eager />
      </div>
      <div className={s.detailInfo}>
        <p className={s.eyebrow}>Artist</p>
        <h1 className={s.detailTitle}>{artist.name}</h1>
        {artist.genres.length > 0 && (
          <ul className={s.badgeRow} aria-label="Genres">
            {artist.genres.map((genre) => (
              <li key={genre} className={common.badge}>
                {genre}
              </li>
            ))}
          </ul>
        )}
        {releaseCount !== undefined && <p className={s.detailMeta}>{pluralize(releaseCount, 'release')}</p>}
        <a href={artist.spotifyUrl} target="_blank" rel="noreferrer" className={common.buttonAccent}>
          Open on Spotify
          <ExternalLink size={16} aria-hidden="true" />
        </a>
      </div>
    </header>
  )
}

export default function Artist() {
  const { id } = useParams()
  const artist = useArtist(id)
  const discography = useDiscography(id) // same query key as inside <Discography>, so this is one request
  // The photo and name of the card that was clicked, shown until the artist's own data arrives
  const preview = useLocation().state?.preview
  const coverTarget = useCoverTarget()
  usePageTitle(artist.data?.name)
  useAmbient(artist.data?.imageUrl ?? preview?.imageUrl)

  // Remember this artist for the "Recently explored" row on the home page
  useEffect(() => {
    if (artist.data) recents.addArtist(artist.data)
  }, [artist.data])

  if (artist.error?.status === 404) {
    return <NotFound title="Artist not found" message="This artist is not in the catalogue. It may have been removed." />
  }
  if (artist.isError) return <ErrorState error={artist.error} onRetry={artist.refetch} />

  return (
    <>
      {artist.isPending ? (
        <LoadingRegion label="Loading artist">
          <div className={s.detailHeader}>
            {preview?.imageUrl ? (
              <div className={s.artistImage} style={coverTarget}>
                <Artwork src={preview.imageUrl} name={preview.name} alt="" round eager />
              </div>
            ) : (
              <Skeleton className={s.artistImage} style={{ aspectRatio: 1, borderRadius: '50%', ...coverTarget }} />
            )}
            <div className={s.detailInfo}>
              <Skeleton style={{ height: 14, width: 60 }} />
              {preview?.name ? (
                <p className={s.previewTitle} aria-hidden="true">
                  {preview.name}
                </p>
              ) : (
                <Skeleton style={{ height: 44, width: 'min(320px, 70vw)' }} />
              )}
              <Skeleton style={{ height: 22, width: 180 }} />
            </div>
          </div>
        </LoadingRegion>
      ) : (
        <ArtistHeader artist={artist.data} releaseCount={discography.data && discographyTotal(discography.data)} coverTarget={coverTarget} />
      )}

      <section className={s.section} aria-labelledby="discography">
        <h2 id="discography" className={s.sectionTitle}>
          Discography
        </h2>
        {/* key: a different artist gets a fresh explorer rather than inheriting the last one's state */}
        <Discography key={id} artistId={id} />
      </section>

      {/* Eras, connections and recommendations for this artist (Phase 6) */}
      <ArtistIntelligence key={id} artistId={id} />
    </>
  )
}
