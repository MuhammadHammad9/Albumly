import { Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import DataNote from '../components/intelligence/DataNote.jsx'
import IntelligenceNav from '../components/intelligence/IntelligenceNav.jsx'
import LookupButton from '../components/intelligence/LookupButton.jsx'
import PreferenceQuiz from '../components/intelligence/PreferenceQuiz.jsx'
import RecommendationCard from '../components/intelligence/RecommendationCard.jsx'
import WeightsPanel from '../components/intelligence/WeightsPanel.jsx'
import s from '../components/intelligence/intelligence.module.css'
import { useLibraryProfile } from '../hooks/useLibraryProfile.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRecents } from '../hooks/useRecents.js'
import { libraryFacets } from '../utils/library.js'
import { recommend } from '../utils/recommender.js'
import pages from './pages.module.css'

// Recommendations computed by Albumly from the library and the quiz. Opening the page asks the
// server only for what it already has cached; Spotify is used only through the Look up button.
export default function Discover() {
  usePageTitle('Discover')
  const { entries, quiz, weights, network, genresByArtist, profile, ownedAlbums, unknownIds } = useLibraryProfile()
  const recents = useRecents()
  const hasTaste = entries.length > 0 || quiz.genres.length + quiz.decades.length + quiz.artists.length > 0

  const { results, candidateCount } = useMemo(
    () => recommend({ knownArtists: network.artists, profile, ownedAlbums, weights }),
    [network.artists, profile, ownedAlbums, weights],
  )

  const facets = useMemo(() => libraryFacets(entries), [entries])
  const genreOptions = useMemo(() => [...facets.tags, ...Object.values(genresByArtist).flat()], [facets.tags, genresByArtist])
  const artistOptions = useMemo(() => [...facets.artists, ...recents.artists.map(({ id, name }) => ({ id, name }))], [facets.artists, recents.artists])

  return (
    <>
      <h1 className={pages.pageTitle}>Discover</h1>
      <p className={pages.pageSubtitle}>Albums picked for you from your Albumly library, with the reason for each.</p>
      <IntelligenceNav />
      <DataNote mode={network.mode} />

      <details className={s.panel} open={!hasTaste}>
        <summary>Discovery quiz</summary>
        <PreferenceQuiz quiz={quiz} genreOptions={genreOptions} artistOptions={artistOptions} />
      </details>

      <details className={s.panel}>
        <summary>Tune recommendations</summary>
        <WeightsPanel weights={weights} />
      </details>

      <section className={pages.section} aria-labelledby="recommended">
        <h2 id="recommended" className={pages.sectionTitle}>
          Recommended for you
        </h2>
        {!hasTaste ? (
          <EmptyState icon={Sparkles} title="Tell Albumly what you like" message="Save a few albums, or answer the quiz above, and recommendations appear here." />
        ) : network.error ? (
          <ErrorState error={network.error} onRetry={network.refetch} />
        ) : network.isPending ? (
          <LoadingRegion label="Loading recommendations">
            <Skeleton style={{ height: 120, marginBottom: 12 }} />
            <Skeleton style={{ height: 120 }} />
          </LoadingRegion>
        ) : results.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing to recommend yet"
            message={
              candidateCount === 0
                ? 'Albumly has not seen the discographies of your artists yet. Open an artist’s page, or look a few up below.'
                : 'Everything Albumly knows about is already in your library. Look up more artists below.'
            }
          />
        ) : (
          <ul className={s.results}>
            {results.map((result) => (
              <RecommendationCard key={result.release.id} result={result} weights={weights} />
            ))}
          </ul>
        )}
        <div style={{ marginTop: 16 }}>
          <LookupButton ids={unknownIds} budget={network.budget} mode={network.mode} />
        </div>
      </section>
    </>
  )
}
