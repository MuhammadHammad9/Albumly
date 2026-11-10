import { Link } from 'react-router'
import { releaseTypeLabel } from '../../utils/format.js'
import Artwork from '../common/Artwork.jsx'
import SaveToggle from '../library/SaveToggle.jsx'
import ScoreBreakdown from './ScoreBreakdown.jsx'
import s from './intelligence.module.css'

// One recommendation: the album, why it was picked, and how its score adds up
export default function RecommendationCard({ result, weights }) {
  const { release, score, parts, reasons, notes } = result
  return (
    <li className={s.result}>
      <Link to={`/album/${release.id}`} tabIndex={-1} aria-hidden="true">
        <Artwork src={release.coverUrl} name={release.name} alt="" />
      </Link>
      <div>
        <h3 className={s.resultTitle}>
          <Link to={`/album/${release.id}`}>{release.name}</Link>
        </h3>
        <p className={s.muted}>
          {release.artists.map((artist, index) => (
            <span key={artist.id}>
              {index > 0 && ', '}
              <Link className={s.inlineLink} to={`/artist/${artist.id}`}>
                {artist.name}
              </Link>
            </span>
          ))}
          {[release.year, releaseTypeLabel(release.inferredType)].filter(Boolean).map((part) => ` · ${part}`)}
        </p>
        <ul className={s.reasons} aria-label={`Why ${release.name} is recommended`}>
          {reasons.map((reason) => (
            <li key={reason.part}>{reason.text}</li>
          ))}
        </ul>
        <details className={s.why}>
          <summary>Why this? Match {Math.round(score * 100)}%</summary>
          <ScoreBreakdown parts={parts} weights={weights} />
          {notes.map((note) => (
            <p key={note} className={s.muted}>
              {note}
            </p>
          ))}
        </details>
      </div>
      <div className={s.resultSave}>
        <SaveToggle album={release} />
      </div>
    </li>
  )
}
