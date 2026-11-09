import { ChevronDown, Info } from 'lucide-react'
import s from '../albums/explorer.module.css'
import { GROUP_LABELS, RELEASE_GROUPS, describeAge } from '../../utils/discography.js'
import { pluralize } from '../../utils/format.js'

// A quiet, collapsed panel answering "is this everything?": per group, how many releases were
// loaded against how many the catalogue reports, plus duplicates removed, editions grouped and
// when the data was fetched. <details> opens with mouse or keyboard without any JavaScript.
export default function CompletenessReport({ report, alternateEditions, loadingGroups = [], onLoadGroup }) {
  const isDemo = report.source === 'mock'
  const rows = RELEASE_GROUPS.filter((group) => report.groups[group].reported > 0 || report.groups[group].retrieved > 0)
  const partial = rows.filter((group) => !report.groups[group].complete || report.groups[group].truncated)
  const age = describeAge(report.fetchedAt)

  return (
    <details className={s.report}>
      <summary className={s.reportSummary}>
        <Info size={16} aria-hidden="true" />
        <span>
          About this discography · {partial.length > 0 ? `${pluralize(partial.length, 'group')} not fully loaded` : 'complete'} · fetched{' '}
          {age}
        </span>
        <ChevronDown size={16} aria-hidden="true" className={s.reportChevron} />
      </summary>

      <table className={s.reportTable}>
        <caption className="sr-only">Releases loaded per group</caption>
        <thead>
          <tr>
            <th scope="col">Group</th>
            <th scope="col">Loaded</th>
            <th scope="col">{isDemo ? 'In catalogue' : 'On Spotify'}</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((group) => {
            const info = report.groups[group]
            return (
              <tr key={group}>
                <th scope="row">{GROUP_LABELS[group]}</th>
                <td>{info.retrieved}</td>
                <td>{info.reported}</td>
                <td>
                  {info.truncated ? (
                    'Stopped at the page limit'
                  ) : info.complete ? (
                    'Complete'
                  ) : loadingGroups.includes(group) ? (
                    'Loading…'
                  ) : (
                    <>
                      First page only ·{' '}
                      <button type="button" className={s.linkButton} onClick={() => onLoadGroup(group)}>
                        Load the rest <span className="sr-only">of {GROUP_LABELS[group]}</span>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ul className={s.reportFacts}>
        <li>
          {report.duplicatesRemoved === 0
            ? 'No duplicates found.'
            : `${pluralize(report.duplicatesRemoved, 'duplicate')} removed: a release listed in more than one group is shown once.`}
        </li>
        <li>
          {alternateEditions === 0
            ? 'No alternate editions detected.'
            : `${pluralize(alternateEditions, 'alternate edition')} (deluxe, remastered, anniversary…) detected and grouped.`}
        </li>
        <li>
          {isDemo ? 'From the demo catalogue, ' : 'Fetched from Spotify '}
          <time dateTime={report.fetchedAt} title={new Date(report.fetchedAt).toLocaleString()}>
            {age}
          </time>
          .
        </li>
      </ul>
    </details>
  )
}
