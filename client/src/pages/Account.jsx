import { useQuery } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import AuthForm from '../components/account/AuthForm.jsx'
import DeleteAccount from '../components/account/DeleteAccount.jsx'
import NewPassword from '../components/account/NewPassword.jsx'
import s from '../components/account/account.module.css'
import { EmptyState } from '../components/common/Feedback.jsx'
import common from '../components/common/common.module.css'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { session as appSession } from '../services/session.js'
import { useSession } from '../stores/sessionStore.js'
import { accountErrorMessage } from '../utils/accountErrors.js'
import { pluralize } from '../utils/format.js'
import p from './pages.module.css'

const SYNC_LABELS = {
  idle: 'Up to date',
  syncing: 'Saving changes…',
  offline: 'Offline: changes will sync later',
  error: 'Some changes could not be saved',
  expired: 'Paused until you sign in again',
}

const UNAVAILABLE = "Accounts aren't set up on this server."

// Sign in / create an account, or (signed in) see the account, sign out and delete it.
// `session` is replaceable so tests can use a fake.
export default function Account({ session = appSession }) {
  usePageTitle('Account')
  const status = useSession((state) => state.status)
  const [searchParams] = useSearchParams()
  // Kept here (not in SignedIn), because SignedIn disappears the moment the account is gone
  const [deleted, setDeleted] = useState(false)

  return (
    <>
      <h1 className={p.pageTitle}>Account</h1>
      {status === 'disabled' && (
        <EmptyState icon={UserRound} title={UNAVAILABLE} message="Your library is kept in this browser and everything else works as usual." />
      )}
      {status === 'loading' && (
        <p className={p.pageSubtitle} role="status">
          Checking your account…
        </p>
      )}
      {(status === 'signedOut' || status === 'expired') && (
        <>
          <p className={p.pageSubtitle}>
            {status === 'expired' || searchParams.get('reason') === 'expired'
              ? 'Your session has ended. Sign in again to keep syncing; changes you made meanwhile are kept on this device.'
              : 'Sign in to keep your library in your account and see it on every device. Without an account, it stays in this browser.'}
          </p>
          <AuthForm session={session} />
        </>
      )}
      {deleted && status !== 'signedIn' && (
        <p className={s.success} role="status">
          Your account and all its data were deleted.
        </p>
      )}
      {status === 'signedIn' && <SignedIn session={session} onDeleted={() => setDeleted(true)} />}
    </>
  )
}

function SignedIn({ session, onDeleted }) {
  const user = useSession((state) => state.user)
  const sync = useSession((state) => state.sync)
  const pending = useSession((state) => state.pending)
  const recovery = useSession((state) => state.recovery)
  const importOffer = useSession((state) => state.importOffer)
  const [signingOut, setSigningOut] = useState(false)

  const me = useQuery({ queryKey: ['me', user.id], queryFn: () => session.request('GET', '/api/me'), retry: false, staleTime: 0 })

  async function signOut() {
    const waiting = session.pendingChanges()
    if (waiting > 0 && !window.confirm(`${pluralize(waiting, 'change')} not saved to your account yet will be lost on this device. Sign out anyway?`)) return
    setSigningOut(true)
    await session.signOut()
  }

  if (me.error?.code === 'accounts_unavailable') {
    return <EmptyState icon={UserRound} title={UNAVAILABLE} message="Your library is kept in this browser." />
  }

  const local = session.localLibrarySize()
  return (
    <>
      <p className={p.pageSubtitle}>Your library is saved in your account and syncs across your devices.</p>
      {recovery && <NewPassword onSave={(password) => session.updatePassword(password)} />}

      <section className={s.panel} aria-labelledby="account-details-title">
        <h2 id="account-details-title" className={s.panelTitle}>
          Signed in
        </h2>
        <dl className={s.details}>
          <dt>Email</dt>
          <dd>{user.email ?? me.data?.user.email ?? '…'}</dd>
          <dt>Library</dt>
          <dd>{me.data ? `${pluralize(me.data.counts.albums, 'album')} · ${pluralize(me.data.counts.collections, 'collection')}` : '…'}</dd>
          <dt>Sync</dt>
          <dd>
            {SYNC_LABELS[sync] ?? sync}
            {pending > 0 && ` (${pluralize(pending, 'change')} waiting)`}
          </dd>
        </dl>
        {me.error && (
          <p className={s.error} role="alert">
            {accountErrorMessage(me.error)}
          </p>
        )}
        <div className={s.row}>
          {!importOffer && local.albums + local.collections > 0 && <ImportButton session={session} local={local} />}
          <button type="button" className={common.buttonGhost} onClick={signOut} disabled={signingOut}>
            Sign out
          </button>
        </div>
      </section>

      <DeleteAccount
        email={user.email ?? me.data?.user.email}
        onDelete={async () => {
          await session.deleteAccount()
          onDeleted?.()
        }}
      />
    </>
  )
}

// The browser library can still be moved in later, after "Not now"
function ImportButton({ session, local }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      const summary = await session.importLocal()
      const { describeSummary } = await import('../services/library/transfer.js')
      setMessage(describeSummary(summary))
    } catch (error) {
      setMessage(accountErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (message) return <p role="status">{message}</p>
  return (
    <button type="button" className={common.buttonAccent} onClick={run} disabled={busy}>
      Import {pluralize(local.albums, 'album')} from this browser
    </button>
  )
}
