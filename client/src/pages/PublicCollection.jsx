import { useQuery } from '@tanstack/react-query'
import { Link2Off, ListMusic } from 'lucide-react'
import { useParams } from 'react-router'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import PublicAlbumList from '../components/community/PublicAlbumList.jsx'
import ReportButton from '../components/community/ReportButton.jsx'
import { communityApi } from '../hooks/useCommunity.js'
import { useNoIndex } from '../hooks/useNoIndex.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { apiGet } from '../services/api.js'
import { useSession } from '../stores/sessionStore.js'
import { pluralize } from '../utils/format.js'
import s from './pages.module.css'

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// A collection someone shared: /shared/:slug. Works without signing in. Everything shown comes
// from the album snapshots the owner saved, so opening this page never makes a Spotify request.
// With accounts on, each review and the collection get a "Report" button.
export default function PublicCollection({ api = communityApi }) {
  const { slug = '' } = useParams()
  const status = useSession((state) => state.status)
  const renderReport =
    status === 'disabled'
      ? undefined
      : (target) => (
          <ReportButton
            label={target.targetType === 'review' ? 'Report this review' : 'Report this collection'}
            signedIn={status === 'signedIn'}
            onSubmit={(report) => api.report(target, report)}
          />
        )
  const validSlug = SLUG.test(slug) && slug.length <= 60
  useNoIndex()

  const query = useQuery({
    queryKey: ['public-collection', slug],
    queryFn: ({ signal }) => apiGet(`/api/public/collections/${encodeURIComponent(slug)}`, { signal }),
    enabled: validSlug,
    // A missing or private collection will not appear by retrying
    retry: (count, error) => error?.status !== 404 && error?.status !== 503 && count < 2,
  })
  const collection = query.data?.collection
  usePageTitle(collection ? collection.name : 'Shared collection')

  if (!validSlug || query.error?.status === 404) {
    return (
      <EmptyState
        icon={Link2Off}
        title="This collection isn't available"
        message="The link may be wrong, or the owner stopped sharing it."
      />
    )
  }
  if (query.error?.code === 'accounts_unavailable') {
    return <EmptyState icon={Link2Off} title="Sharing isn't set up on this server" message="Shared collections need accounts, which this server doesn't have turned on." />
  }
  if (query.error) return <ErrorState error={query.error} onRetry={() => query.refetch()} />

  if (query.isPending) {
    return (
      <LoadingRegion label="Loading shared collection">
        <Skeleton style={{ height: 40, width: '40%', marginBottom: 16 }} />
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} style={{ height: 96, marginBottom: 12 }} />
        ))}
      </LoadingRegion>
    )
  }

  const { albums } = query.data
  return (
    <article>
      <header className={s.section}>
        <p className={s.eyebrow}>Shared collection</p>
        <h1 className={s.pageTitle}>{collection.name}</h1>
        {collection.description && <p className={s.pageSubtitle}>{collection.description}</p>}
        <p className={s.note}>
          {pluralize(albums.length, 'album')} · shared from Albumly
        </p>
        {renderReport?.({ targetType: 'collection', slug })}
      </header>
      {albums.length === 0 ? (
        <EmptyState icon={ListMusic} title="No albums yet" message="This collection is empty for now." />
      ) : (
        <PublicAlbumList
          albums={albums}
          includeReviews={collection.includeReviews}
          renderReport={renderReport && ((item) => renderReport({ targetType: 'review', slug, albumId: item.album.id }))}
        />
      )}
    </article>
  )
}
