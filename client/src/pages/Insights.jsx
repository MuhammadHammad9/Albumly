import { ChartColumn } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import DataNote from '../components/intelligence/DataNote.jsx'
import InsightsCharts from '../components/intelligence/InsightsCharts.jsx'
import IntelligenceNav from '../components/intelligence/IntelligenceNav.jsx'
import MusicDnaCard from '../components/intelligence/MusicDnaCard.jsx'
import StatTiles from '../components/intelligence/StatTiles.jsx'
import { useKnownArtists } from '../hooks/useIntelligence.js'
import { useCollections, useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { computeInsights } from '../utils/insights.js'
import { libraryFacets } from '../utils/library.js'
import { buildMusicDna } from '../utils/musicDna.js'
import pages from './pages.module.css'

// Numbers about the user's Albumly library. Computed in the browser from the saved albums; the
// only server call reads cached artist genres (no Spotify requests). Never "listening stats".
export default function Insights() {
  usePageTitle('Insights')
  const entries = useEntries()
  const collections = useCollections()
  const artistIds = useMemo(() => libraryFacets(entries).artists.map((a) => a.id), [entries])
  const known = useKnownArtists(artistIds)

  const genresByArtist = useMemo(
    () => Object.fromEntries((known.data?.artists ?? []).filter((a) => a.artist?.genres?.length).map((a) => [a.id, a.artist.genres])),
    [known.data],
  )
  const insights = useMemo(() => computeInsights(entries, collections, { genresByArtist }), [entries, collections, genresByArtist])
  const dna = useMemo(() => buildMusicDna(insights), [insights])

  return (
    <>
      <h1 className={pages.pageTitle}>Your Albumly library</h1>
      <p className={pages.pageSubtitle}>What you have saved, rated and tagged in Albumly. These are not Spotify listening stats.</p>
      <IntelligenceNav />
      {entries.length === 0 ? (
        <EmptyState icon={ChartColumn} title="No albums saved yet" message="Insights appear once your library has a few albums.">
          <Link to="/" className={common.buttonAccent}>
            Find albums
          </Link>
        </EmptyState>
      ) : (
        <>
          <MusicDnaCard dna={dna} />
          <StatTiles insights={insights} />
          <InsightsCharts insights={insights} />
          {insights.genres.length === 0 && (
            <DataNote mode={known.data?.mode}>Spotify does not share genres with new apps, so the top genre is your most used tag. Tag your albums to make it more useful.</DataNote>
          )}
        </>
      )}
    </>
  )
}
