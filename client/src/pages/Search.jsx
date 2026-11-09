import { Search as SearchIcon, SearchX } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import AlbumGrid from '../components/albums/AlbumGrid.jsx'
import ArtistCard from '../components/artists/ArtistCard.jsx'
import { CardGrid, CardGridSkeleton } from '../components/common/CardGrid.jsx'
import { EmptyState, ErrorState, LoadingRegion } from '../components/common/Feedback.jsx'
import Tabs from '../components/common/Tabs.jsx'
import common from '../components/common/common.module.css'
import ParsedQuery from '../components/search/ParsedQuery.jsx'
import SearchFilters from '../components/search/SearchFilters.jsx'
import TrackResults from '../components/search/TrackResults.jsx'
import ss from '../components/search/search.module.css'
import { MIN_QUERY_LENGTH, useCatalogSearch } from '../hooks/search.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { recents } from '../services/recents.js'
import { pluralize } from '../utils/format.js'
import { ALBUM_TYPES, SEARCH_TABS, explode, parseQuery, refineResults, toSearchRequest } from '../utils/queryParser.js'
import s from './pages.module.css'

const TABS = [
  { key: 'artist', label: 'Artists', noun: 'artist' },
  { key: 'album', label: 'Albums', noun: 'release' },
  { key: 'track', label: 'Tracks', noun: 'track' },
]
const EXAMPLES = ['neon harbor 2015 album', 'mara voss singles', 'glass arcade songs', 'paper moons by mara voss']
const FILTER_KEYS = ['tab', 'from', 'to', 'artist', 'kind', 'min', 'sort']

const toYear = (value) => (/^\d{4}$/.test(value ?? '') ? Number(value) : undefined)
const toCount = (value) => (/^\d{1,3}$/.test(value ?? '') && Number(value) > 0 ? Number(value) : undefined)

// Everything about the search is in the URL: ?q=the weeknd 2020 album&tab=album&kind=single...
// Values set with the filter controls win; otherwise the parser's reading of the text is used.
function readSearch(searchParams) {
  const raw = (searchParams.get('q') ?? '').trim()
  const parsed = parseQuery(raw)
  const param = (key) => searchParams.get(key) ?? undefined
  const tab = SEARCH_TABS.includes(param('tab')) ? param('tab') : (parsed.tab ?? 'artist')
  const yearFrom = searchParams.has('from') ? toYear(param('from')) : parsed.yearFrom
  const yearTo = searchParams.has('to') ? toYear(param('to')) : parsed.yearTo
  const artist = searchParams.has('artist') ? param('artist') : parsed.artist
  const kind = searchParams.has('kind') ? (ALBUM_TYPES.includes(param('kind')) ? param('kind') : undefined) : parsed.albumType
  const minTracks = toCount(param('min'))
  const sort = param('sort') ?? 'relevance'

  return {
    raw,
    parsed,
    tab,
    refine: { kind, minTracks, yearFrom, yearTo, sort },
    request: toSearchRequest({ text: parsed.text, artist, yearFrom, yearTo }, tab),
    // What the filter controls show
    values: { from: yearFrom ? String(yearFrom) : '', to: yearTo ? String(yearTo) : '', artist, kind: kind ?? '', min: minTracks ? String(minTracks) : '', sort },
  }
}

function Results({ tab, items }) {
  if (tab === 'artist') {
    return (
      <CardGrid>
        {items.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} />
        ))}
      </CardGrid>
    )
  }
  if (tab === 'album') return <AlbumGrid releases={items} showArtist />
  return <TrackResults tracks={items} />
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { raw, parsed, tab, refine, request, values } = readSearch(searchParams)
  usePageTitle(raw ? `“${raw}”` : 'Search')
  const search = useCatalogSearch(request)
  const tabInfo = TABS.find((item) => item.key === tab)

  // Remember searches that actually found something, for the search box's "Recent searches"
  const foundResults = search.data?.pages[0].total > 0
  useEffect(() => {
    if (foundResults && raw) recents.addSearch(raw)
  }, [foundResults, raw])

  // The first time a filter or tab is changed, what the parser read moves out of the text into
  // separate URL values, so the controls and the text never disagree
  function update(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(explode(raw))) {
      if (key === 'q') next.set('q', value)
      else if (!next.has(key)) next.set(key, value)
    }
    for (const [key, value] of Object.entries(changes)) {
      // An empty value is kept as "key=" (meaning "any"), so the parser's reading cannot come back
      if (FILTER_KEYS.includes(key)) next.set(key, value ?? '')
    }
    if (changes.tab) next.delete('sort') // each tab has its own orders
    setSearchParams(next, { replace: true })
  }

  const header = (
    <>
      <h1 className={s.pageTitle}>{raw ? `Results for “${raw}”` : 'Search'}</h1>
      <ParsedQuery parsed={parsed} />
      <div className={s.tabPanel}>
        <Tabs label="Result type" tabs={TABS} activeKey={tab} onChange={(key) => update({ tab: key })} />
      </div>
      {tab !== 'artist' && <SearchFilters tab={tab} values={values} onChange={update} />}
    </>
  )

  if (request.q.length < MIN_QUERY_LENGTH) {
    return (
      <>
        {raw && header}
        <EmptyState
          icon={SearchIcon}
          title="Search artists, albums and tracks"
          message={`Type at least ${MIN_QUERY_LENGTH} characters in the search box above. You can add a year, a range like 2015-2020, a type (album, single, EP, song), or “by” and an artist.`}
        >
          <div className={ss.examples}>
            {EXAMPLES.map((example) => (
              <Link key={example} to={`/search?q=${encodeURIComponent(example)}`} className={ss.example}>
                {example}
              </Link>
            ))}
          </div>
        </EmptyState>
      </>
    )
  }

  let body
  if (search.isPending) {
    body = (
      <LoadingRegion label={`Searching for ${raw}`}>
        <p className={s.pageSubtitle}>Searching…</p>
        <CardGridSkeleton count={10} round={tab === 'artist'} />
      </LoadingRegion>
    )
  } else if (search.isError) {
    body = <ErrorState error={search.error} onRetry={search.refetch} />
  } else {
    // Pages arrive one at a time ("Load more"); flatten them, then apply the in-browser filters
    const loaded = search.data.pages.flatMap((page) => page.items)
    const total = search.data.pages[0].total
    const items = refineResults(loaded, tab, refine)
    const refined = items.length !== loaded.length || (refine.sort && refine.sort !== 'relevance')

    if (total === 0) {
      body = <EmptyState icon={SearchX} title={`No ${tabInfo.noun}s found`} message="Check the spelling, try fewer words, or widen the filters." />
    } else {
      body = (
        <>
          <p className={s.pageSubtitle} role="status">
            {items.length === loaded.length
              ? `Showing ${loaded.length} of ${pluralize(total, tabInfo.noun)}`
              : `${items.length} of the ${loaded.length} loaded match your filters (${pluralize(total, tabInfo.noun)} in all)`}
          </p>
          {refined && search.hasNextPage && (
            <p className={ss.note}>Type, track count and order apply to the results loaded so far. Load more to look further.</p>
          )}
          {items.length === 0 ? (
            <EmptyState icon={SearchX} title="Nothing loaded matches your filters" message="Load more results, or loosen the filters." />
          ) : (
            <Results tab={tab} items={items} />
          )}
          {search.hasNextPage && (
            <div className={s.loadMore}>
              <button type="button" className={common.button} onClick={() => search.fetchNextPage()} disabled={search.isFetchingNextPage}>
                {search.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )
    }
  }

  return (
    <>
      {header}
      <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`} className={s.tabPanel}>
        {body}
      </div>
    </>
  )
}
