import { Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { artistNames } from '../../utils/battles.js'
import { formatPercent } from '../../utils/metrics.js'
import { safeImageUrl } from '../../utils/safeUrl.js'
import Artwork from '../common/Artwork.jsx'
import { EmptyState } from '../common/Feedback.jsx'
import s from './community.module.css'

// Albums ranked by how often they win battles. The order uses the Wilson score (see
// docs/phase-7-concepts.md), so an album needs real support, not one lucky vote, to rank high.
export default function Leaderboard({ albums, minVotes = 5 }) {
  if (albums.length === 0) {
    return <EmptyState icon={Trophy} title="No rankings yet" message={`Albums appear here once they have at least ${minVotes} battle votes.`} />
  }

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption className="sr-only">Album Battle leaderboard</caption>
        <thead>
          <tr>
            <th scope="col" className={s.num}>
              Rank
            </th>
            <th scope="col">Album</th>
            <th scope="col" className={s.num}>
              Wins
            </th>
            <th scope="col" className={s.num}>
              Votes
            </th>
            <th scope="col" className={s.num}>
              Win rate
            </th>
          </tr>
        </thead>
        <tbody>
          {albums.map((row) => {
            const artists = artistNames(row.album)
            return (
              <tr key={row.album.id}>
                <td className={s.num}>{row.rank}</td>
                <td>
                  <div className={s.leaderAlbum}>
                    <div className={s.thumb}>
                      <Artwork src={safeImageUrl(row.album.coverUrl)} alt={`${row.album.name} by ${artists || 'unknown artist'} cover`} name={row.album.name} />
                    </div>
                    <div className={s.albumInfo}>
                      <Link className={s.albumName} to={`/album/${encodeURIComponent(row.album.id)}`}>
                        {row.album.name}
                      </Link>
                      <span className={s.albumMeta}>{artists}</span>
                    </div>
                  </div>
                </td>
                <td className={s.num}>{row.wins}</td>
                <td className={s.num}>{row.votes}</td>
                <td className={s.num}>{formatPercent(row.winRate)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={s.note}>Only albums with at least {minVotes} votes are ranked.</p>
    </div>
  )
}
