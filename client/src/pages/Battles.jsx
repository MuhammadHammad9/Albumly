import { Swords } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/common/Feedback.jsx'
import Tabs from '../components/common/Tabs.jsx'
import BattleCard from '../components/community/BattleCard.jsx'
import CreateBattle from '../components/community/CreateBattle.jsx'
import Leaderboard from '../components/community/Leaderboard.jsx'
import { communityApi, useBattles, useCreateBattle, useLeaderboard, useVote } from '../hooks/useCommunity.js'
import { useEntries } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { useSession } from '../stores/sessionStore.js'
import s from './pages.module.css'

const TABS = [
  { key: 'vote', label: 'Vote' },
  { key: 'recent', label: 'Recent' },
  { key: 'leaderboard', label: 'Leaderboard' },
]

function Loading() {
  return (
    <LoadingRegion label="Loading battles">
      <Skeleton style={{ height: 280 }} />
    </LoadingRegion>
  )
}

// Album Battle: pick the better of two albums. Results and the leaderboard are public; voting
// and starting battles need an account. Everything is drawn from saved snapshots, so this page
// never makes a Spotify request.
export default function Battles({ api = communityApi }) {
  usePageTitle('Album Battle')
  const [params, setParams] = useSearchParams()
  const status = useSession((state) => state.status)
  const userId = useSession((state) => state.user?.id ?? null)
  const signedIn = status === 'signedIn'
  const requested = params.get('tab')
  // Signed-out visitors cannot vote, so they start on Recent
  const tab = TABS.some((item) => item.key === requested) ? requested : signedIn ? 'vote' : 'recent'
  const setTab = (key) => setParams({ tab: key }, { replace: true })

  const battles = useBattles(api, { view: tab === 'leaderboard' ? 'recent' : tab, who: userId })
  const leaderboard = useLeaderboard(api, tab === 'leaderboard')
  const vote = useVote(api)
  const create = useCreateBattle(api)
  const entries = useEntries()
  const albums = useMemo(() => entries.map((entry) => entry.album), [entries])

  const castVote = useCallback((battleId, choice) => vote.mutate({ battleId, choice }), [vote])

  if (status === 'disabled') {
    return (
      <>
        <h1 className={s.pageTitle}>Album Battle</h1>
        <EmptyState icon={Swords} title="Battles need accounts" message="This server doesn't have accounts turned on, so there are no battles to vote on." />
      </>
    )
  }

  function panel() {
    if (tab === 'leaderboard') {
      if (leaderboard.isPending) return <Loading />
      if (leaderboard.error) return <ErrorState error={leaderboard.error} onRetry={() => leaderboard.refetch()} />
      return <Leaderboard albums={leaderboard.data.albums} minVotes={leaderboard.data.minVotes} />
    }
    if (tab === 'vote' && !signedIn) {
      return <EmptyState icon={Swords} title="Sign in to vote" message="You can still see results on the Recent tab and the leaderboard." />
    }
    if (battles.isPending) return <Loading />
    if (battles.error) return <ErrorState error={battles.error} onRetry={() => battles.refetch()} />
    const list = battles.data.battles

    if (tab === 'vote') {
      // One battle at a time. After voting, its result shows with a "Next" button.
      const justVoted = vote.data && list.find((battle) => battle.id === vote.data.battle.id)
      const current = justVoted ?? list.find((battle) => !battle.myVote)
      if (!current) return <EmptyState icon={Swords} title="You've voted on every battle" message="Start a new one below, or check the results." />
      return (
        <BattleCard
          key={current.id}
          battle={current}
          signedIn
          keyboard
          voting={vote.isPending}
          onVote={(choice) => castVote(current.id, choice)}
          footer={
            current.myVote && (
              <div>
                <button type="button" className={s.textButton} onClick={() => vote.reset()}>
                  Next battle
                </button>
              </div>
            )
          }
        />
      )
    }

    if (list.length === 0) return <EmptyState icon={Swords} title="No battles yet" message="Be the first to start one." />
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {list.map((battle) => (
          <BattleCard key={battle.id} battle={battle} signedIn={signedIn} showResult voting={vote.isPending} onVote={(choice) => castVote(battle.id, choice)} />
        ))}
      </div>
    )
  }

  return (
    <>
      <header className={s.section}>
        <h1 className={s.pageTitle}>Album Battle</h1>
        <p className={s.pageSubtitle}>Two albums, one vote. The community decides.</p>
      </header>
      <Tabs tabs={TABS} activeKey={tab} onChange={setTab} label="Album Battle" />
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={s.tabPanel}>
        {vote.error && (
          <p role="alert" className={s.note}>
            {vote.error.code === 'already_voted' ? 'You already voted in this battle.' : vote.error.message}
          </p>
        )}
        {panel()}
      </div>
      {signedIn && (
        <div className={s.section}>
          <CreateBattle
            albums={albums}
            creating={create.isPending}
            error={create.error?.message ?? ''}
            onCreate={(ids) => create.mutate(ids, { onSuccess: () => setTab('recent') })}
          />
        </div>
      )}
    </>
  )
}
