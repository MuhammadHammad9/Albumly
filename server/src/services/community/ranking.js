// Leaderboard ranking for Album Battle.
//
// Sorting by plain win rate would put an album that won 1 vote out of 1 (100 %) above one that
// won 90 out of 100 (90 %). The Wilson score lower bound fixes that: it asks "given these votes,
// what is the lowest win rate we can be 95 % sure of?". Few votes → wide uncertainty → low score.
// 1/1 scores about 0.21, 90/100 about 0.83.

export const MIN_VOTES = 5

export function wilsonLowerBound(wins, total, z = 1.96) {
  if (total <= 0) return 0
  const p = wins / total
  const z2 = z * z
  const centre = p + z2 / (2 * total)
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)
  return Math.max(0, (centre - margin) / (1 + z2 / total))
}

// rows: [{ albumId, album, wins, votes }] → ranked, with winRate and score rounded for display.
// Albums with fewer than minVotes are left out until they have enough data.
export function rankLeaderboard(rows, { minVotes = MIN_VOTES, limit = 50 } = {}) {
  return rows
    .filter((row) => row.votes >= minVotes && row.album)
    .map((row) => ({ ...row, rawScore: wilsonLowerBound(row.wins, row.votes) }))
    .sort((a, b) => b.rawScore - a.rawScore || b.votes - a.votes || a.album.name.localeCompare(b.album.name))
    .slice(0, limit)
    .map(({ rawScore, ...row }, index) => ({
      rank: index + 1,
      ...row,
      winRate: Number((row.wins / row.votes).toFixed(3)),
      score: Number(rawScore.toFixed(3)),
    }))
}
