// SQL for Album Battle. Reads run as the user or as a visitor; RLS hides hidden battles and
// everyone else's votes. Totals come from battle_tallies(), which returns numbers only.
import { ApiError, badRequest, notFound } from '../../utils/errors.js'
import { iso } from './dbAccess.js'
import { toPublicAlbum } from './publicAlbum.js'
import { MIN_VOTES, rankLeaderboard } from './ranking.js'

const BATTLE_COLUMNS = 'b.id, b.album_a, b.album_b, b.created_at'

// Rows + totals + "my vote" → what the client gets
async function decorate(tx, rows, userId) {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const tallies = new Map((await tx.query('select * from public.battle_tallies($1::uuid[])', [ids])).rows.map((row) => [row.battle_id, row]))
  const mine = new Map()
  if (userId) {
    const { rows: votes } = await tx.query('select battle_id, choice from battle_votes where user_id = $1 and battle_id = any($2::uuid[])', [userId, ids])
    for (const vote of votes) mine.set(vote.battle_id, vote.choice)
  }

  return rows.flatMap((row) => {
    const albumA = toPublicAlbum(row.album_a)
    const albumB = toPublicAlbum(row.album_b)
    if (!albumA || !albumB) return []
    const tally = tallies.get(row.id)
    return [{ id: row.id, albumA, albumB, createdAt: iso(row.created_at), votesA: tally?.votes_a ?? 0, votesB: tally?.votes_b ?? 0, myVote: mine.get(row.id) ?? null }]
  })
}

// view 'recent': newest first, for everyone. view 'vote': newest battles you have not voted on.
export async function listBattles(tx, userId, { view, limit, before }) {
  if (view === 'vote' && !userId) throw new ApiError(401, 'unauthorized', 'Sign in to vote.')
  const params = [before ?? null, limit]
  let unvoted = ''
  if (view === 'vote') {
    params.push(userId)
    unvoted = 'and not exists (select 1 from battle_votes v where v.battle_id = b.id and v.user_id = $3)'
  }
  const { rows } = await tx.query(
    `select ${BATTLE_COLUMNS} from battles b
     where b.hidden_at is null and ($1::timestamptz is null or b.created_at < $1) ${unvoted}
     order by b.created_at desc, b.id limit $2`,
    params,
  )
  return decorate(tx, rows, userId)
}

export async function getBattle(tx, userId, battleId) {
  const { rows } = await tx.query(`select ${BATTLE_COLUMNS} from battles b where b.id = $1`, [battleId])
  const [battle] = await decorate(tx, rows, userId)
  if (!battle) throw notFound('Battle')
  return battle
}

// Both albums must be in the creator's library; their snapshots are copied into the battle.
// Returns { battle, created }. An existing pair is returned as is (created: false).
export async function createBattle(tx, userId, albumIds) {
  const [first, second] = [...albumIds].sort((x, y) => (x < y ? -1 : 1)) // same order as the "C" collation
  const { rows } = await tx.query('select album_id, album from library_entries where user_id = $1 and album_id = any($2::text[])', [userId, [first, second]])
  if (rows.length < 2) throw new ApiError(400, 'not_saved', 'Save both albums to your library first.')

  const byId = new Map(rows.map((row) => [row.album_id, toPublicAlbum(row.album)]))
  const albumA = byId.get(first)
  const albumB = byId.get(second)
  if (!albumA || !albumB) throw badRequest("One of these albums can't be used in a battle.")

  const inserted = await tx.query(
    `insert into battles (album_a_id, album_b_id, album_a, album_b) values ($1, $2, $3, $4)
     on conflict do nothing returning id`,
    [first, second, albumA, albumB],
  )
  if (inserted.rows.length > 0) return { battle: await getBattle(tx, userId, inserted.rows[0].id), created: true }

  // The pair already exists. If moderators hid it, RLS hides it from us too: 404.
  const existing = await tx.query('select id from battles where album_a_id = $1 and album_b_id = $2', [first, second])
  if (existing.rows.length === 0) throw notFound('Battle')
  return { battle: await getBattle(tx, userId, existing.rows[0].id), created: false }
}

// The database refuses a second vote (primary key) and votes on hidden battles (RLS)
export async function vote(tx, userId, battleId, choice) {
  await tx.query('insert into battle_votes (battle_id, choice) values ($1, $2)', [battleId, choice])
  return getBattle(tx, userId, battleId)
}

export async function getLeaderboard(tx, { limit, minVotes = MIN_VOTES }) {
  const { rows } = await tx.query('select * from public.album_leaderboard($1, $2)', [minVotes, limit])
  const albums = rankLeaderboard(
    rows.map((row) => ({ albumId: row.album_id, album: toPublicAlbum(row.album), wins: row.wins, votes: row.votes })),
    { minVotes, limit },
  )
  return { albums, minVotes }
}
