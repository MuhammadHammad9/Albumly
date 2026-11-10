import { Link } from 'react-router'
import { useSession } from '../../stores/sessionStore.js'
import s from './account.module.css'

// One line above every page when something about the account needs attention.
// Nothing is shown in the normal case (or when accounts are not set up).
export default function SessionBanner() {
  const status = useSession((state) => state.status)
  const sync = useSession((state) => state.sync)
  const syncMessage = useSession((state) => state.syncMessage)

  let message = null
  let action = null
  if (status === 'expired') {
    message = 'Your session has ended. Sign in again to keep syncing; your changes are kept on this device.'
    action = <Link to="/account?reason=expired">Sign in</Link>
  } else if (status === 'signedIn' && sync === 'offline') {
    message = "Can't reach your account right now. Changes are kept on this device and will sync when the connection is back."
  } else if (status === 'signedIn' && sync === 'error') {
    message = syncMessage || 'Some changes could not be saved to your account.'
  }
  if (!message) return null

  return (
    <div className={s.banner} role="status">
      <p className={s.bannerText}>{message}</p>
      {action}
    </div>
  )
}
