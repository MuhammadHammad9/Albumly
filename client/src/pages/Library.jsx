import { Library as LibraryIcon, SearchX } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import AlbumGrid from '../components/albums/AlbumGrid.jsx'
import { EmptyState } from '../components/common/Feedback.jsx'
import Tabs from '../components/common/Tabs.jsx'
import common from '../components/common/common.module.css'
import CollectionList from '../components/library/CollectionList.jsx'
import ImportExport from '../components/library/ImportExport.jsx'
import LibraryFilters from '../components/library/LibraryFilters.jsx'
import lib from '../components/library/library.module.css'
import { useCollections, useEntries, useLibrary } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useSession } from '../stores/sessionStore.js'
import { pluralize } from '../utils/format.js'
import { DEFAULT_LIBRARY_SORT, LIBRARY_SORTS, STATUS_KEYS, entrySummary, filterEntries, libraryFacets, sortEntries } from '../utils/library.js'
import s from './pages.module.css'

const FILTER_KEYS = ['q', 'artist', 'from', 'to', 'status', 'tag']
const toYear = (value) => (value ? Number(value) : undefined)

// The personal library: saved albums (filtered and sorted from snapshots, so no network is needed)
// and collections. Like the explorer, every control lives in the URL.
export default function Library() {
  usePageTitle('Library')
  const entries = useEntries()
  const collections = useCollections()
  const storageOk = useLibrary((state) => state.storageOk)
  const inAccount = useSession((state) => state.status === 'signedIn' || state.status === 'expired')
  const loadingAccount = useSession((state) => state.loadingLibrary)
  const [searchParams, setSearchParams] = useSearchParams()

  const view = searchParams.get('view') === 'collections' ? 'collections' : 'albums'
  const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) ?? '']))
  values.sort = LIBRARY_SORTS.some((option) => option.key === searchParams.get('sort')) ? searchParams.get('sort') : DEFAULT_LIBRARY_SORT
  if (!STATUS_KEYS.includes(values.status)) values.status = ''
  const hasFilters = FILTER_KEYS.some((key) => values[key])

  function update(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (!value || (key === 'sort' && value === DEFAULT_LIBRARY_SORT) || (key === 'view' && value === 'albums')) next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next, { replace: true })
  }

  const facets = libraryFacets(entries)
  const filters = { text: values.q, artist: values.artist, yearFrom: toYear(values.from), yearTo: toYear(values.to), status: values.status, tag: values.tag }
  const visible = sortEntries(filterEntries(entries, filters), values.sort)
  const summaries = new Map(entries.map((entry) => [entry.album.id, entrySummary(entry)]))

  return (
    <>
      <h1 className={s.pageTitle}>Your library</h1>
      <p className={s.pageSubtitle}>
        {pluralize(entries.length, 'album')} · {pluralize(collections.length, 'collection')} · {inAccount ? 'saved in your account' : 'kept in this browser'}
      </p>
      {!storageOk && (
        <p className={lib.warning} role="alert">
          Your browser is not saving changes (storage is full or blocked). Export a backup before closing this tab.
        </p>
      )}

      <Tabs
        label="Library sections"
        tabs={[
          { key: 'albums', label: 'Albums', count: entries.length },
          { key: 'collections', label: 'Collections', count: collections.length },
        ]}
        activeKey={view}
        onChange={(key) => update({ view: key })}
      />

      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${view}`} className={s.tabPanel}>
        {view === 'collections' ? (
          <CollectionList collections={collections} />
        ) : entries.length === 0 && loadingAccount ? (
          <p role="status">Loading your library…</p>
        ) : entries.length === 0 ? (
          <EmptyState icon={LibraryIcon} title="Your library is empty" message="Use the bookmark on any album card, or the Save button on an album page, to keep it here.">
            <Link to="/search" className={common.button}>
              Find music
            </Link>
          </EmptyState>
        ) : (
          <>
            <LibraryFilters values={values} facets={facets} onChange={update} />
            <div className={lib.resultLine}>
              <span role="status">
                {hasFilters ? `${visible.length} of ${pluralize(entries.length, 'album')}` : pluralize(entries.length, 'album')}
              </span>
              {hasFilters && (
                <button type="button" className={s.textButton} onClick={() => update(Object.fromEntries(FILTER_KEYS.map((key) => [key, ''])))}>
                  Clear filters
                </button>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={SearchX} title="No saved albums match" message="Try fewer filters." />
            ) : (
              <AlbumGrid releases={visible.map((entry) => entry.album)} showArtist getNote={(album) => summaries.get(album.id)} />
            )}
          </>
        )}
      </div>

      <ImportExport />
    </>
  )
}
