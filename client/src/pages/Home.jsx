import { Search, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import AlbumGrid from '../components/albums/AlbumGrid.jsx'
import ArtistCard from '../components/artists/ArtistCard.jsx'
import { CardGridSkeleton, CardRail } from '../components/common/CardGrid.jsx'
import { ErrorState, LoadingRegion } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import { useFeatured } from '../hooks/catalog.js'
import { useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRecents } from '../hooks/useRecents.js'
import { recents } from '../services/recents.js'
import { sortEntries } from '../utils/library.js'
import s from './pages.module.css'

export default function Home() {
  usePageTitle()
  const featured = useFeatured()
  const { artists: recentArtists } = useRecents()
  // Snapshots from the library: shown instantly, with no request
  const recentlySaved = sortEntries(useEntries(), 'added').slice(0, 6)

  return (
    <>
      <section className={s.hero}>
        {/* Decoration only: drifting lights and a turning record, both drawn in CSS */}
        <div className={s.heroAurora} aria-hidden="true" />
        <div className={s.vinyl} aria-hidden="true">
          <div className={s.vinylDisc} />
        </div>
        <p className={s.heroEyebrow}>
          <span className={s.eq} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          Your discography explorer
        </p>
        <h1 className={s.heroTitle}>
          Find every album. <span className={s.heroAccent}>Explore every era.</span>
        </h1>
        <p className={s.heroText}>
          Search for an artist to see everything they have released: albums, singles, EPs, compilations and guest appearances, all in
          one place.
        </p>
        <div className={s.heroActions}>
          <Link to="/search" className={common.buttonAccent}>
            <Search size={16} aria-hidden="true" /> Find an artist
          </Link>
          <Link to="/discover" className={common.buttonGhost}>
            <Sparkles size={16} aria-hidden="true" /> Get recommendations
          </Link>
        </div>
      </section>

      {recentArtists.length > 0 && (
        <section className={s.section} aria-labelledby="recently-explored">
          <div className={s.sectionHeader}>
            <h2 id="recently-explored" className={s.sectionTitle}>
              Recently explored
            </h2>
            <button type="button" className={s.textButton} onClick={() => recents.clear()}>
              Clear history
            </button>
          </div>
          <CardRail>
            {recentArtists.slice(0, 12).map((artist) => (
              <ArtistCard key={artist.id} artist={artist} />
            ))}
          </CardRail>
        </section>
      )}

      {recentlySaved.length > 0 && (
        <section className={s.section} aria-labelledby="recently-saved">
          <div className={s.sectionHeader}>
            <h2 id="recently-saved" className={s.sectionTitle}>
              Recently saved
            </h2>
            <Link to="/library" className={s.textButton}>
              Open library
            </Link>
          </div>
          <AlbumGrid releases={recentlySaved.map((entry) => entry.album)} showArtist />
        </section>
      )}

      {featured.isPending && (
        <LoadingRegion label="Loading featured music">
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Featured artists</h2>
            <CardGridSkeleton count={6} round rail />
          </section>
          <section className={s.section}>
            <h2 className={s.sectionTitle}>Latest albums</h2>
            <CardGridSkeleton count={12} />
          </section>
        </LoadingRegion>
      )}

      {featured.isError && <ErrorState error={featured.error} onRetry={featured.refetch} />}

      {featured.isSuccess && (
        <>
          <section className={s.section} aria-labelledby="featured-artists">
            <h2 id="featured-artists" className={s.sectionTitle}>
              Featured artists
            </h2>
            <CardRail>
              {featured.data.artists.map((artist) => (
                <ArtistCard key={artist.id} artist={artist} />
              ))}
            </CardRail>
          </section>

          {/* Empty when Spotify is limiting album lookups; hide it rather than show a bare heading */}
          {featured.data.albums.length > 0 && (
            <section className={s.section} aria-labelledby="latest-albums">
              <h2 id="latest-albums" className={s.sectionTitle}>
                Latest albums
              </h2>
              <AlbumGrid releases={featured.data.albums} showArtist />
            </section>
          )}
        </>
      )}
    </>
  )
}
