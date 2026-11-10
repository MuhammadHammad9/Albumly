import { Search } from 'lucide-react'
import { LOOKUP_SIZE, useArtistLookup } from '../../hooks/useIntelligence.js'
import { describeError, describeWait } from '../../utils/errorMessages.js'
import common from '../common/common.module.css'
import s from './intelligence.module.css'

// The only way the Discover pages spend Spotify requests: one press looks up at most 3 artists
// (at most 2 requests each), within the server's daily budget.
// ids: artists Albumly has no releases for yet, most useful first. budget: the last one the server sent.
export default function LookupButton({ ids, budget, mode }) {
  const lookup = useArtistLookup()
  if (mode === 'mock' || mode === 'unsupported') return null // demo data is complete; nothing to look up

  const latest = lookup.data?.budget ?? budget
  const stopped = lookup.data?.stopped
  const count = Math.min(ids.length, LOOKUP_SIZE)
  const outOfBudget = latest && latest.remaining < 2

  let status = null
  if (lookup.isError) status = describeError(lookup.error).message
  else if (stopped?.code === 'rate_limited') status = describeError({ code: 'rate_limited', retryAfter: stopped.retryAfter }).message
  else if (stopped?.code === 'budget_exhausted' || outOfBudget) status = `Today’s lookups are used up. More are available in ${describeWait(secondsUntil(latest?.resetsAt))}.`
  else if (lookup.data) status = lookup.data.loaded.length ? `Looked up ${lookup.data.loaded.length} more ${lookup.data.loaded.length === 1 ? 'artist' : 'artists'}.` : 'Nothing new was found.'

  return (
    <div className={s.row}>
      <button type="button" className={common.button} disabled={count === 0 || lookup.isPending || outOfBudget} onClick={() => lookup.mutate(ids)}>
        <Search size={16} aria-hidden="true" />
        {lookup.isPending ? 'Looking up…' : count === 0 ? 'Every artist is looked up' : `Look up ${count} more ${count === 1 ? 'artist' : 'artists'}`}
      </button>
      {latest && count > 0 && !outOfBudget && (
        <span className={s.status}>
          Uses up to {count * 2} of today’s {latest.remaining} remaining Spotify lookups.
        </span>
      )}
      <span className={`${s.status} ${stopped || lookup.isError ? s.statusWarning : ''}`} role="status">
        {status}
      </span>
    </div>
  )
}

function secondsUntil(iso) {
  if (!iso) return undefined
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000))
}
