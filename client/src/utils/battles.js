// Small pure helpers for Album Battle

// Vote shares as whole percentages that always add up to 100 (or both 0 with no votes)
export function votePercentages(votesA = 0, votesB = 0) {
  const total = votesA + votesB
  if (total === 0) return { a: 0, b: 0, total }
  const a = Math.round((votesA / total) * 100)
  return { a, b: 100 - a, total }
}

// "Discovery is ahead", "It's a tie" or "No votes yet"
export function leaderText({ votesA = 0, votesB = 0, albumA, albumB }) {
  if (votesA + votesB === 0) return 'No votes yet'
  if (votesA === votesB) return "It's a tie"
  return `${(votesA > votesB ? albumA : albumB)?.name ?? 'One album'} is ahead`
}

// ← votes for the left album, → for the right one
export function choiceFromKey(key) {
  if (key === 'ArrowLeft') return 'a'
  if (key === 'ArrowRight') return 'b'
  return null
}

// Two different ids picked at random, or null with fewer than two
export function pickRandomPair(ids, random = Math.random) {
  if (ids.length < 2) return null
  const first = Math.floor(random() * ids.length)
  let second = Math.floor(random() * (ids.length - 1))
  if (second >= first) second++ // skip over the first pick
  return [ids[first], ids[second]]
}

export const artistNames = (album) => (album?.artists ?? []).map((artist) => artist.name).join(', ')
