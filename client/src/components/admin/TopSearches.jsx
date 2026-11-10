import { formatCount } from '../../utils/metrics.js'
import s from './admin.module.css'

// Most common searches since the server started. Only the cleaned-up text and a count are kept,
// and a query only shows once it was searched at least `minCount` times.
export default function TopSearches({ searches, minCount = 3 }) {
  return (
    <section className={s.card} aria-labelledby="admin-searches-title">
      <h2 id="admin-searches-title" className={s.cardTitle}>
        Top searches
      </h2>
      {searches.length === 0 ? (
        <p className={s.note}>Nothing to show yet.</p>
      ) : (
        <ol className={s.tableWrap}>
          {searches.map((row) => (
            <li key={row.query}>
              {row.query} <span className={s.note}>({formatCount(row.count)})</span>
            </li>
          ))}
        </ol>
      )}
      <p className={s.note}>Shown only after {minCount} searches. No user, address or time is stored with a search.</p>
    </section>
  )
}
