import { Disc3, LoaderCircle, RotateCw, SearchX } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useDiscography, useDiscographyGroups } from '../../hooks/catalog.js'
import { LAZY_GROUPS, buildDiscographyTabs, mergeDiscography, pendingGroups } from '../../utils/discography.js'
import { groupEditions, ungrouped } from '../../utils/editions.js'
import { describeError } from '../../utils/errorMessages.js'
import { pluralize } from '../../utils/format.js'
import { DEFAULT_SORT, SORT_OPTIONS, VIEW_KEYS, filterReleases, sortReleases, yearRange } from '../../utils/releases.js'
import CompletenessReport from '../artists/CompletenessReport.jsx'
import Timeline from '../artists/Timeline.jsx'
import { CardGridSkeleton } from '../common/CardGrid.jsx'
import { EmptyState, ErrorState, LoadingRegion } from '../common/Feedback.jsx'
import Tabs from '../common/Tabs.jsx'
import common from '../common/common.module.css'
import DiscographyToolbar from './DiscographyToolbar.jsx'
import ReleaseGrid from './ReleaseGrid.jsx'
import ReleaseList from './ReleaseList.jsx'
import s from './explorer.module.css'

// [singular, plural] for the notes below
const NOUNS = {
  album: ['album', 'albums'],
  single: ['single', 'singles'],
  compilation: ['compilation', 'compilations'],
  appears_on: ['guest appearance', 'guest appearances'],
}
const noun = (group, count) => NOUNS[group][count === 1 ? 0 : 1]

// Values that are not written to the URL, to keep links short
const DEFAULTS = { tab: 'all', sort: DEFAULT_SORT, view: 'grid', editions: 'grouped' }

const toYear = (value) => (value ? Number(value) : undefined)

// The release explorer on an artist page. Every control (tab, filter, sort, view, edition
// grouping) is stored in the URL's query string, so a filtered view survives refresh, Back and
// being shared as a link.
//
// Compilations and guest appearances arrive one page at a time (they are the costly part of a
// discography on Spotify). The rest of a group is fetched when its tab is opened, or when the
// user asks with a "Load" button. The All tab never fetches on its own: it is the default tab,
// so doing that would make every visit pay the full price again.
export default function Discography({ artistId }) {
  const summary = useDiscography(artistId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [requested, setRequested] = useState([]) // groups asked for with a Load button

  // Which groups to fetch in full: pending ones whose tab is open or that were asked for
  const tabParam = searchParams.get('tab')
  const wanted = pendingGroups(summary.data).filter((group) => group === tabParam || requested.includes(group))
  const groupQueries = useDiscographyGroups(artistId, LAZY_GROUPS, wanted)

  if (summary.isPending) {
    return (
      <LoadingRegion label="Loading discography">
        <CardGridSkeleton count={12} />
      </LoadingRegion>
    )
  }
  if (summary.isError) return <ErrorState error={summary.error} onRetry={summary.refetch} />

  // The summary plus any whole groups that have arrived since
  const loadedGroups = Object.fromEntries(LAZY_GROUPS.filter((group) => groupQueries[group].data).map((group) => [group, groupQueries[group].data]))
  const { releases: allReleases, report } = mergeDiscography(summary.data, loadedGroups)
  const pending = report.pending
  // Ask for whole groups; one that already failed is retried instead
  function loadGroups(groups) {
    for (const group of groups) if (groupQueries[group].isError) groupQueries[group].refetch()
    setRequested((current) => [...new Set([...current, ...groups])])
  }

  // Read the controls from the URL, ignoring values that are not valid options
  const tabs = buildDiscographyTabs(allReleases, report)
  if (tabs.length === 1) {
    return <EmptyState icon={Disc3} title="No releases found" message="The catalogue has no releases for this artist yet." />
  }
  const activeTab = tabs.find((tab) => tab.key === tabParam) ?? tabs[0]
  const sort = SORT_OPTIONS.some((option) => option.key === searchParams.get('sort')) ? searchParams.get('sort') : DEFAULTS.sort
  const view = VIEW_KEYS.includes(searchParams.get('view')) ? searchParams.get('view') : DEFAULTS.view
  const groupingOn = searchParams.get('editions') !== 'separate'
  const text = searchParams.get('q') ?? ''
  const yearFrom = toYear(searchParams.get('from'))
  const yearTo = toYear(searchParams.get('to'))
  const hasFilters = Boolean(text || yearFrom || yearTo)

  // Write changes back: empty or default values are removed instead of stored
  function update(changes) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (!value || value === DEFAULTS[key]) next.delete(key)
      else next.set(key, value)
    }
    // replace: typing in the filter should not add a history entry per keystroke
    setSearchParams(next, { replace: true })
  }

  // tab -> filter -> sort -> group editions. All in memory: no request is made for any of this.
  // Filtering first means a filter matching only the deluxe edition still shows it.
  const visible = sortReleases(filterReleases(activeTab.releases, { text, yearFrom, yearTo }), sort)
  const groups = groupingOn ? groupEditions(visible) : ungrouped(visible)
  const groupedAway = visible.length - groups.length
  const showArtist = activeTab.key === 'appears_on' || activeTab.key === 'all'

  // The lazy groups this tab is about: its own group, or every pending one on the All tab
  const tabGroups = activeTab.key === 'all' ? LAZY_GROUPS : LAZY_GROUPS.filter((group) => group === activeTab.key)
  const loadingGroups = LAZY_GROUPS.filter((group) => pending.includes(group) && groupQueries[group].isFetching)
  const failedGroups = tabGroups.filter((group) => pending.includes(group) && groupQueries[group].isError && !groupQueries[group].isFetching)
  const truncated = report.truncated

  return (
    <>
      <Tabs
        label="Release type"
        tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label, count: tab.count }))}
        activeKey={activeTab.key}
        onChange={(key) => update({ tab: key })}
      />

      <DiscographyToolbar
        text={text}
        sort={sort}
        view={view}
        yearFrom={yearFrom}
        yearTo={yearTo}
        years={yearRange(allReleases)}
        groupEditions={groupingOn}
        onChange={update}
      />

      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${activeTab.key}`}>
        <p className={s.resultCount} role="status">
          {hasFilters
            ? `Showing ${visible.length} of ${pluralize(activeTab.releases.length, 'release')}`
            : pluralize(visible.length, 'release')}
          {groupedAway > 0 && ` · ${pluralize(groupedAway, 'alternate edition')} grouped`}
        </p>

        {/* Lazy groups: say what is still missing, show progress, and offer a retry on failure */}
        {tabGroups.some((group) => loadingGroups.includes(group)) && (
          <p className={s.note} role="status">
            <LoaderCircle size={14} aria-hidden="true" className={s.spin} />
            {tabGroups
              .filter((group) => loadingGroups.includes(group))
              .map((group) => {
                const missing = report.groups[group].reported - report.groups[group].retrieved
                return `Loading ${missing} more ${noun(group, missing)}…`
              })
              .join(' ')}
          </p>
        )}

        {failedGroups.map((group) => {
          const { title, message, canRetry } = describeError(groupQueries[group].error)
          return (
            <div key={group} className={s.inlineError} role="alert">
              <p>
                Could not load the rest of the {noun(group, 2)}. {title}. {message}
              </p>
              {canRetry && (
                <button type="button" className={s.linkButton} onClick={() => groupQueries[group].refetch()}>
                  <RotateCw size={14} aria-hidden="true" />
                  Try again
                </button>
              )}
            </div>
          )
        })}

        {activeTab.key === 'all' && pending.length > 0 && loadingGroups.length === 0 && failedGroups.length === 0 && (
          <p className={s.note}>
            Includes the first{' '}
            {pending
              .map((group) => `${report.groups[group].retrieved} of ${report.groups[group].reported} ${noun(group, report.groups[group].reported)}`)
              .join(' and ')}
            .{hasFilters && ' Matching releases among the rest are not shown yet.'}{' '}
            <button type="button" className={s.linkButton} onClick={() => loadGroups(pending)}>
              Load all
            </button>
          </p>
        )}

        {/* For artists on hundreds of compilations the server stops early to stay within Spotify's limits */}
        {truncated.length > 0 && (activeTab.key === 'all' || truncated.includes(activeTab.key)) && (
          <p className={s.note}>
            This artist has more {truncated.map((group) => noun(group, 2)).join(' and ')} than Albumly can load. The most recent ones
            are shown.
          </p>
        )}

        {activeTab.key === 'ep' && (
          <p className={s.note}>Spotify does not label EPs. These are singles with 4 to 6 tracks, which Albumly treats as EPs.</p>
        )}

        {visible.length === 0 ? (
          // Nothing has arrived for this tab yet (its group is still loading, or failed above)
          activeTab.releases.length === 0 ? (
            loadingGroups.length > 0 && <CardGridSkeleton count={6} />
          ) : (
            <EmptyState icon={SearchX} title="No releases match these filters" message="Try a different title or a wider range of years.">
              <button type="button" className={common.button} onClick={() => update({ q: '', from: '', to: '' })}>
                Clear filters
              </button>
            </EmptyState>
          )
        ) : view === 'timeline' ? (
          <Timeline groups={groups} />
        ) : view === 'list' ? (
          <ReleaseList groups={groups} showArtist={showArtist} />
        ) : (
          <ReleaseGrid groups={groups} showArtist={activeTab.key === 'appears_on'} />
        )}
      </div>

      <CompletenessReport
        report={report}
        alternateEditions={allReleases.length - groupEditions(allReleases).length}
        loadingGroups={loadingGroups}
        onLoadGroup={(group) => loadGroups([group])}
      />
    </>
  )
}
