import { useMemo } from 'react'
import { Link } from 'react-router'
import { buildEras } from '../../utils/eras.js'
import { formatReleaseDate, releaseTypeLabel } from '../../utils/format.js'
import s from './intelligence.module.css'

const ROLE_LABELS = { 'lead-up': 'lead-up', after: 'after the album', before: 'early' }

// An artist's career as chapters, each anchored on a studio album
export default function EraExplorer({ releases }) {
  const eras = useMemo(() => buildEras(releases), [releases])
  if (eras.length === 0) return <p className={s.muted}>No releases to group into eras yet.</p>

  return (
    <ol className={s.eras}>
      {eras.map((era) => (
        <li key={era.key} className={s.era}>
          <div className={s.eraHeader}>
            <h3 className={s.eraTitle}>
              {era.anchor ? (
                <Link className={s.inlineLink} to={`/album/${era.anchor.id}`}>
                  {era.title}
                </Link>
              ) : (
                era.title
              )}
            </h3>
            {era.anchor && <span className={s.muted}>{formatReleaseDate(era.anchor.releaseDate, era.anchor.precision)}</span>}
            {era.editions.length > 0 && <span className={s.muted}>+ {era.editions.length === 1 ? '1 other edition' : `${era.editions.length} other editions`}</span>}
          </div>
          {era.releases.length > 0 ? (
            <ul className={s.eraList}>
              {era.releases.map((release) => (
                <li key={release.id}>
                  <Link className={s.inlineLink} to={`/album/${release.id}`}>
                    {release.name}
                  </Link>{' '}
                  <span className={s.role}>
                    {release.group === 'appears_on' ? `guest on ${release.artists.map((a) => a.name).join(', ')}` : releaseTypeLabel(release.inferredType)} · {release.year} · {ROLE_LABELS[release.role]}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={s.muted}>No singles or features around this album.</p>
          )}
        </li>
      ))}
    </ol>
  )
}
