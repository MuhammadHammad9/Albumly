import { Link } from 'react-router'
import s from '../albums/explorer.module.css'
import { formatReleaseDate, pluralize, releaseTypeLabel } from '../../utils/format.js'
import { groupByYear, sortReleases } from '../../utils/releases.js'
import Editions from '../albums/Editions.jsx'
import Artwork from '../common/Artwork.jsx'

// An artist's releases in the order they came out, grouped under year markers.
// The artist's own studio albums are drawn larger: they are the landmarks of each era.
// `groups` come from groupEditions: a re-release sits under its original's year, not its own.
export default function Timeline({ groups }) {
  const editionsOf = new Map(groups.map((group) => [group.primary.id, group.editions]))
  const primaries = groups.map((group) => group.primary)
  const years = groupByYear(sortReleases(primaries, 'oldest'))

  return (
    <ol className={s.timeline}>
      {years.map(({ year, releases: yearReleases }) => (
        <li key={year} className={s.timelineYear}>
          <h3 className={s.timelineLabel}>{year}</h3>
          <ul className={s.timelineItems}>
            {yearReleases.map((release) => {
              const isLandmark = release.group === 'album'
              return (
                <li key={release.id}>
                  <Link to={`/album/${release.id}`} className={`${s.timelineItem} ${isLandmark ? s.landmark : ''}`}>
                    <span className={s.timelineCover}>
                      <Artwork src={release.coverUrl} name={release.name} alt="" />
                    </span>
                    <span className={s.rowText}>
                      <span className={s.rowName}>{release.name}</span>
                      <span className={s.rowSub}>
                        {formatReleaseDate(release.releaseDate, release.precision)} · {releaseTypeLabel(release.inferredType)} ·{' '}
                        {pluralize(release.totalTracks, 'track')}
                        {release.group === 'appears_on' && ` · ${release.artists.map((artist) => artist.name).join(', ')}`}
                      </span>
                    </span>
                  </Link>
                  <Editions primary={release} editions={editionsOf.get(release.id) ?? []} />
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ol>
  )
}
