import { Link } from 'react-router'
import { communityApi, useSaveShare, useShare } from '../../hooks/useCommunity.js'
import { useSession } from '../../stores/sessionStore.js'
import s from './community.module.css'
import ShareSettings from './ShareSettings.jsx'

// "Share" box for the collection page. Collections only exist on the server once you are
// signed in and they have synced, so the panel explains each case instead of failing.
// Mount: <SharePanel collectionId={collection.id} /> on pages/Collection.jsx.
export default function SharePanel({ collectionId, api = communityApi }) {
  const status = useSession((state) => state.status)
  const signedIn = status === 'signedIn'
  const share = useShare(api, collectionId, signedIn)
  const save = useSaveShare(api, collectionId)

  // No accounts on this server: sharing does not exist, so show nothing at all
  if (status === 'disabled') return null

  if (!signedIn) {
    return (
      <section className={s.panel} aria-label="Share">
        <p className={s.note}>
          <Link to="/account" className={s.link}>
            Sign in
          </Link>{' '}
          to share this collection with a link.
        </p>
      </section>
    )
  }

  if (share.isPending) {
    return (
      <section className={s.panel} aria-label="Share">
        <p className={s.note} role="status">
          Loading sharing settings…
        </p>
      </section>
    )
  }

  if (share.error) {
    const message =
      share.error.status === 404 ? "This collection hasn't reached your account yet. Try again in a moment." : share.error.message || "Couldn't load the sharing settings."
    return (
      <section className={s.panel} aria-label="Share">
        <p className={s.note}>{message}</p>
        <div>
          <button type="button" className={s.textButton} onClick={() => share.refetch()}>
            Try again
          </button>
        </div>
      </section>
    )
  }

  return <ShareSettings share={share.data.share} saving={save.isPending} error={save.error?.message ?? ''} onChange={(settings) => save.mutate(settings)} />
}
