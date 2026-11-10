import { Network } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import ArtistGraph from '../components/intelligence/ArtistGraph.jsx'
import ConnectionList from '../components/intelligence/ConnectionList.jsx'
import DataNote from '../components/intelligence/DataNote.jsx'
import IntelligenceNav from '../components/intelligence/IntelligenceNav.jsx'
import LookupButton from '../components/intelligence/LookupButton.jsx'
import s from '../components/intelligence/intelligence.module.css'
import { useKnownArtists } from '../hooks/useIntelligence.js'
import { useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { bfs, buildArtistGraph, unknownNeighbours } from '../utils/artistGraph.js'
import { buildProfile, rankedArtistIds } from '../utils/preferences.js'
import pages from './pages.module.css'

const MAX_GRAPH_NODES = 40

// The artist connection graph around one artist (?artist=id, default: the library's top artist).
// Depth 1 needs that artist's releases; depth 2 also needs their neighbours'. Both are read from
// the server cache; missing ones can be looked up with the capped button.
export default function Connections() {
  usePageTitle('Connections')
  const entries = useEntries()
  const [params, setParams] = useSearchParams()
  const topArtist = useMemo(() => rankedArtistIds(buildProfile(entries))[0], [entries])
  const rootId = params.get('artist') || topArtist
  const depth = params.get('depth') === '1' ? 1 : 2

  const root = useKnownArtists(rootId ? [rootId] : [])
  const rootArtists = useMemo(() => root.data?.artists ?? [], [root.data])
  const neighbourIds = useMemo(() => (depth === 2 ? unknownNeighbours(rootArtists, MAX_GRAPH_NODES - 1) : []), [rootArtists, depth])
  const neighbours = useKnownArtists(neighbourIds)

  const known = useMemo(() => [...rootArtists, ...(neighbours.data?.artists ?? [])], [rootArtists, neighbours.data])
  const { graph, search } = useMemo(() => {
    const names = Object.fromEntries(known.filter((a) => a.artist).map((a) => [a.id, a.artist.name]))
    const built = buildArtistGraph(Object.fromEntries(known.map((a) => [a.id, a.releases])), names)
    return { graph: built, search: bfs(built, rootId ? [rootId] : [], { maxDepth: depth, maxNodes: MAX_GRAPH_NODES }) }
  }, [known, rootId, depth])

  // Root first (its releases decide depth 1), then neighbours
  const unknownIds = known.filter((a) => !a.releases).map((a) => a.id)
  const mode = root.data?.mode

  return (
    <>
      <h1 className={pages.pageTitle}>Connections</h1>
      <p className={pages.pageSubtitle}>Artists linked by the releases they share, up to two steps away.</p>
      <IntelligenceNav />
      <DataNote mode={mode}>Links come from releases credited to more than one artist, including guest appearances, in the discographies Albumly has already looked up.</DataNote>

      {!rootId ? (
        <EmptyState icon={Network} title="Pick an artist" message="Save an album, or open Connections from an artist’s page." />
      ) : root.isError ? (
        <ErrorState error={root.error} onRetry={root.refetch} />
      ) : root.isPending ? (
        <LoadingRegion label="Loading connections">
          <Skeleton style={{ height: 320 }} />
        </LoadingRegion>
      ) : (
        <>
          <div className={s.row} style={{ marginBottom: 16 }} role="group" aria-label="Steps away">
            {[1, 2].map((d) => (
              <button key={d} type="button" className={s.pill} aria-pressed={depth === d} onClick={() => setParams({ artist: rootId, depth: String(d) }, { replace: true })}>
                {d === 1 ? '1 step' : '2 steps'}
              </button>
            ))}
            <span className={s.status}>
              {search.order.length - 1} connected {search.order.length - 1 === 1 ? 'artist' : 'artists'}
              {search.truncated && ` (showing the first ${MAX_GRAPH_NODES})`}
            </span>
          </div>
          <div className={s.graphLayout}>
            <ArtistGraph graph={graph} search={search} focusId={rootId} />
            <ConnectionList graph={graph} search={search} rootId={rootId} />
          </div>
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <LookupButton ids={unknownIds} budget={neighbours.data?.budget ?? root.data?.budget} mode={mode} />
      </div>
    </>
  )
}
