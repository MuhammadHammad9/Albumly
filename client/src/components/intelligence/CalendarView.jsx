import { Link } from 'react-router'
import s from './intelligence.module.css'

function ReleaseLine({ release, day }) {
  return (
    <li>
      <span className={s.day}>{day}</span>
      <Link className={s.inlineLink} to={`/album/${release.id}`}>
        {release.name}
      </Link>{' '}
      <span className={s.role}>{release.artists.map((a) => a.name).join(', ')}</span>
    </li>
  )
}

// A year as 12 month cards. month (1-12) shows only that month.
export default function CalendarView({ calendar, month }) {
  const months = month ? calendar.months.filter((m) => m.month === month) : calendar.months
  return (
    <>
      <ol className={s.months} aria-label={`Releases in ${calendar.year}`}>
        {months.map((m) => (
          <li key={m.month} className={`${s.month} ${m.releases.length === 0 ? s.monthEmpty : ''}`}>
            <h3 className={s.monthTitle}>
              <span>{m.label}</span>
              <span className={s.score}>{m.releases.length}</span>
            </h3>
            {m.releases.length > 0 && (
              <ul className={s.dayList}>
                {m.releases.map((release) => (
                  <ReleaseLine key={release.id} release={release} day={release.day ?? '–'} />
                ))}
              </ul>
            )}
            {m.releases.some((r) => r.day === null) && <p className={s.role}>– day not known</p>}
          </li>
        ))}
      </ol>
      {!month && calendar.yearOnly.length > 0 && (
        <section className={s.panel} style={{ marginTop: 16 }} aria-labelledby="year-only">
          <h3 id="year-only" className={s.panelTitle}>
            Sometime in {calendar.year}
          </h3>
          <ul className={s.dayList}>
            {calendar.yearOnly.map((release) => (
              <ReleaseLine key={release.id} release={release} day="" />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
