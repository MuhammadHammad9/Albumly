import { leaderText, votePercentages } from '../../utils/battles.js'
import { pluralize } from '../../utils/format.js'
import s from './community.module.css'

// Two bars with the share of votes each album got. The numbers are always written out too,
// so nothing depends on seeing the bars.
export default function BattleResult({ albumA, albumB, votesA = 0, votesB = 0, myVote }) {
  const percent = votePercentages(votesA, votesB)
  const row = (choice, album, votes, share) => (
    <div className={s.resultRow}>
      <div className={s.resultLabel}>
        <span>
          {album.name}
          {myVote === choice && ' (your pick)'}
        </span>
        <span>
          {share}% · {pluralize(votes, 'vote')}
        </span>
      </div>
      <div className={s.bar} aria-hidden="true">
        <div className={`${s.barFill} ${myVote === choice ? s.barFillMine : ''}`} style={{ width: `${share}%` }} />
      </div>
    </div>
  )

  return (
    <div className={s.result}>
      <p className={s.note}>
        <strong>{leaderText({ votesA, votesB, albumA, albumB })}</strong> · {pluralize(percent.total, 'vote')} in total
      </p>
      {row('a', albumA, votesA, percent.a)}
      {row('b', albumB, votesB, percent.b)}
    </div>
  )
}
