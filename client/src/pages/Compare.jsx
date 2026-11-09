import { useQuery } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useStore } from 'zustand'
import Artwork from '../components/common/Artwork.jsx'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import CompareChart from '../components/compare/CompareChart.jsx'
import ComparePicker from '../components/compare/ComparePicker.jsx'
import CompareTable from '../components/compare/CompareTable.jsx'
import c from '../components/compare/compare.module.css'
import { useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { apiGet } from '../services/api.js'
import { compareStore } from '../stores/compareStore.js'
import { describeError } from '../utils/errorMessages.js'
import { pluralize, releaseTypeLabel } from '../utils/format.js'
import s from './pages.module.css'

// Same query key as useAlbum, so an album already opened is not fetched again. `enabled` lets an
// empty slot skip the request entirely.
function useOptionalAlbum(id) {
  return useQuery({
    queryKey: ['album', id],
    queryFn: ({ signal }) => apiGet(`/api/albums/${encodeURIComponent(id)}`, { signal }),
    enabled: Boolean(id),
  })
}

// The top of one side: cover, title and basic facts, or the state of loading it
function Side({ slot, id, query }) {
  if (!id) {
    return (
      <div className={c.head}>
        <p className={c.headMeta}>Album {slot.toUpperCase()}: not chosen yet</p>
      </div>
    )
  }
  if (query.isPending) {
    return (
      <div className={c.head} aria-hidden="true">
        <Skeleton className={c.headCover} style={{ aspectRatio: 1 }} />
        <Skeleton style={{ height: 18, width: '70%' }} />
      </div>
    )
  }
  if (query.isError) {
    const message = query.error.status === 404 ? 'This album is not in the catalogue.' : describeError(query.error).title
    return (
      <div className={c.head} role="alert">
        <p className={c.headMeta}>
          Album {slot.toUpperCase()}: {message}
        </p>
      </div>
    )
  }

  const album = query.data
  const artists = album.artists.map((artist) => artist.name).join(', ')
  return (
    <div className={c.head}>
      <div className={c.headCover}>
        <Artwork src={album.coverUrl} name={album.name} alt={`${album.name} by ${artists} cover`} />
      </div>
      <span className={s.eyebrow}>
        <span className={slot === 'a' ? c.swatchA : c.swatchB} aria-hidden="true" /> Album {slot.toUpperCase()}
      </span>
      <Link to={`/album/${album.id}`} className={c.headTitle}>
        {album.name}
      </Link>
      <span className={c.headMeta}>
        {artists} · {album.year} · {releaseTypeLabel(album.inferredType)} · {pluralize(album.totalTracks, 'track')}
      </span>
    </div>
  )
}

// Two albums side by side. Which two is stored only in the URL (/compare?a=...&b=...), so a
// comparison can be bookmarked or shared, and Back undoes a change of album.
export default function Compare() {
  const [searchParams, setSearchParams] = useSearchParams()
  const a = searchParams.get('a') || null
  const b = searchParams.get('b') || null
  const entries = useEntries()
  const albumA = useOptionalAlbum(a)
  const albumB = useOptionalAlbum(b)
  const setWaiting = useStore(compareStore, (state) => state.setWaiting)
  usePageTitle(albumA.data && albumB.data ? `${albumA.data.name} vs ${albumB.data.name}` : 'Compare')

  // With only one album chosen, remember it so "Add to compare" on the next album page completes the pair
  const single = a && !b ? albumA.data : !a && b ? albumB.data : null
  const complete = Boolean(a && b)
  useEffect(() => {
    if (single) setWaiting({ id: single.id, name: single.name })
    else if (complete) setWaiting(null)
  }, [single, complete, setWaiting])

  function choose(next) {
    const params = new URLSearchParams()
    if (next.a) params.set('a', next.a)
    if (next.b) params.set('b', next.b)
    setSearchParams(params)
  }

  const names = { [a]: albumA.data?.name, [b]: albumB.data?.name }
  const bothLoaded = albumA.isSuccess && albumB.isSuccess

  return (
    <div className={c.root}>
      <h1 className={s.pageTitle}>Compare albums</h1>
      <p className={s.pageSubtitle}>Pick two albums from your library, or press “Add to compare” on any album page.</p>

      <ComparePicker a={a} b={b} entries={entries} names={names} onChange={choose} />

      {!a && !b ? (
        <EmptyState
          icon={GitCompareArrows}
          title="Choose two albums"
          message={
            entries.length > 1
              ? 'Use the menus above to pick from your library.'
              : 'Save a few albums to pick them here, or open any album and press “Add to compare”.'
          }
        />
      ) : (
        <>
          <div className={c.heads}>
            <Side slot="a" id={a} query={albumA} />
            <span className={c.vs} aria-hidden="true">
              vs
            </span>
            <Side slot="b" id={b} query={albumB} />
          </div>

          {bothLoaded && (
            <>
              <CompareTable albumA={albumA.data} albumB={albumB.data} />
              <CompareChart albumA={albumA.data} albumB={albumB.data} />
            </>
          )}

          {complete && (albumA.isPending || albumB.isPending) && <LoadingRegion label="Loading both albums" />}

          {complete && albumA.isError && albumA.error.status !== 404 && <ErrorState error={albumA.error} onRetry={albumA.refetch} />}
          {complete && !albumA.isError && albumB.isError && albumB.error.status !== 404 && <ErrorState error={albumB.error} onRetry={albumB.refetch} />}

          {single && (
            <p className={c.hint}>
              Now pick a second album above, or open any other album and press “Compare with {single.name}”.
            </p>
          )}
        </>
      )}
    </div>
  )
}
