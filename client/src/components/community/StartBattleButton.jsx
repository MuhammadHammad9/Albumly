import { Swords } from 'lucide-react'
import { useNavigate } from 'react-router'
import { communityApi, useCreateBattle } from '../../hooks/useCommunity.js'
import { useSession } from '../../stores/sessionStore.js'
import c from '../common/common.module.css'
import s from './community.module.css'

// Optional extra for the Compare page: turn the two compared albums into a battle.
// Shown only when signed in; both albums must be in your library (the server checks).
export default function StartBattleButton({ albumIds, api = communityApi }) {
  const signedIn = useSession((state) => state.status === 'signedIn')
  const create = useCreateBattle(api)
  const navigate = useNavigate()

  if (!signedIn || albumIds.length !== 2 || albumIds[0] === albumIds[1]) return null

  return (
    <div className={s.report}>
      <button type="button" className={c.buttonGhost} disabled={create.isPending} onClick={() => create.mutate(albumIds, { onSuccess: () => navigate('/battles?tab=recent') })}>
        <Swords size={16} aria-hidden="true" />
        {create.isPending ? 'Starting…' : 'Start a battle'}
      </button>
      {create.error && (
        <p className={s.error} role="alert">
          {create.error.code === 'not_saved' ? 'Save both albums to your library first.' : create.error.message}
        </p>
      )}
    </div>
  )
}
