import { PARTS, PART_LABELS } from '../../utils/recommender.js'
import s from './intelligence.module.css'

// The four parts of a score as small bars, with the numbers written out too
export default function ScoreBreakdown({ parts, weights }) {
  return (
    <ul className={s.breakdown}>
      {PARTS.map((part) => {
        const value = parts[part]
        return (
          <li key={part} className={s.breakdownRow}>
            <span>{PART_LABELS[part]}</span>
            <span className={s.track} aria-hidden="true">
              {value !== null && <span className={s.bar} style={{ display: 'block', width: `${Math.round(value * 100)}%` }} />}
            </span>
            <span className={s.score}>{value === null ? 'not counted' : `${Math.round(value * 100)}% · weight ${weights[part]}`}</span>
          </li>
        )
      })}
    </ul>
  )
}
