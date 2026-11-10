import { CalendarDays } from 'lucide-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import CalendarView from '../components/intelligence/CalendarView.jsx'
import DataNote from '../components/intelligence/DataNote.jsx'
import IntelligenceNav from '../components/intelligence/IntelligenceNav.jsx'
import LookupButton from '../components/intelligence/LookupButton.jsx'
import s from '../components/intelligence/intelligence.module.css'
import { useKnownArtists } from '../hooks/useIntelligence.js'
import { useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useRecents } from '../hooks/useRecents.js'
import { MONTH_NAMES, buildCalendar, collectReleases, releaseYears } from '../utils/calendar.js'
import { libraryFacets } from '../utils/library.js'
import pages from './pages.module.css'

// Releases by saved and recently explored artists, by year and month. Reads only what the server
// has cached; the Look up button fetches more within the daily budget. Year and month live in the URL.
export default function ReleaseCalendar() {
  usePageTitle('Release calendar')
  const entries = useEntries()
  const recents = useRecents()
  const [params, setParams] = useSearchParams()

  const artistIds = useMemo(() => {
    const saved = libraryFacets(entries).artists.map((a) => a.id)
    return [...new Set([...recents.artists.map((a) => a.id), ...saved])]
  }, [entries, recents.artists])
  const known = useKnownArtists(artistIds)

  const releases = useMemo(() => collectReleases(known.data?.artists ?? []), [known.data])
  const years = useMemo(() => releaseYears(releases), [releases])
  const requested = Number(params.get('year'))
  const year = years.includes(requested) ? requested : years[0]
  const monthParam = Number(params.get('month'))
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : null
  const calendar = useMemo(() => (year ? buildCalendar(releases, year) : null), [releases, year])
  const unknownIds = (known.data?.artists ?? []).filter((a) => !a.releases).map((a) => a.id)

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  return (
    <>
      <h1 className={pages.pageTitle}>Release calendar</h1>
      <p className={pages.pageSubtitle}>Releases by artists you saved or explored recently.</p>
      <IntelligenceNav />
      <DataNote mode={known.data?.mode}>Built from discographies Albumly has already looked up, so artists you have not opened yet may be missing.</DataNote>

      {artistIds.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No artists to follow yet" message="Save albums or open artist pages, and their releases appear here." />
      ) : known.isError ? (
        <ErrorState error={known.error} onRetry={known.refetch} />
      ) : known.isPending ? (
        <LoadingRegion label="Loading releases">
          <Skeleton style={{ height: 200 }} />
        </LoadingRegion>
      ) : !calendar ? (
        <EmptyState icon={CalendarDays} title="No releases known yet" message="Open an artist’s page, or look a few artists up below." />
      ) : (
        <>
          <div className={s.row} style={{ marginBottom: 16 }}>
            <label>
              Year{' '}
              <select className={s.select} value={year} onChange={(event) => update({ year: event.target.value })}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Month{' '}
              <select className={s.select} value={month ?? ''} onChange={(event) => update({ month: event.target.value })}>
                <option value="">Whole year</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <span className={s.status}>
              {calendar.total} {calendar.total === 1 ? 'release' : 'releases'} in {year}
            </span>
          </div>
          <CalendarView calendar={calendar} month={month} />
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <LookupButton ids={unknownIds} budget={known.data?.budget} mode={known.data?.mode} />
      </div>
    </>
  )
}
