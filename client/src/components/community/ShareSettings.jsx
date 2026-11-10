import { Share2 } from 'lucide-react'
import { useId } from 'react'
import { shareUrl } from '../../utils/communityApi.js'
import s from './community.module.css'
import ShareLink from './ShareLink.jsx'

// The controls of the share panel, without any data loading (SharePanel adds that).
// share: { slug, visibility, includeReviews, hidden, hiddenReason } or null when never shared.
// onChange({ visibility, includeReviews }) saves the new settings.
export default function ShareSettings({ share, onChange, saving = false, error = '', origin }) {
  const id = useId()
  const isPublic = share?.visibility === 'public'
  const includeReviews = share?.includeReviews ?? false

  return (
    <section className={s.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.panelTitle}>
        <Share2 size={16} aria-hidden="true" /> Share
      </h2>
      {share?.hidden && (
        <p className={s.warning} role="alert">
          Moderators hid this collection, so its link doesn't work.
          {share.hiddenReason ? ` Reason: ${share.hiddenReason}` : ''}
        </p>
      )}
      <label className={s.check}>
        <input type="checkbox" checked={isPublic} disabled={saving} onChange={(event) => onChange({ visibility: event.target.checked ? 'public' : 'private', includeReviews })} />
        Anyone with the link can view this collection
      </label>
      <label className={s.check}>
        <input
          type="checkbox"
          checked={includeReviews}
          disabled={saving || !isPublic}
          onChange={(event) => onChange({ visibility: share?.visibility ?? 'private', includeReviews: event.target.checked })}
        />
        Show my ratings and reviews
      </label>
      <p className={s.note}>Your private notes, tags and statuses are never shared.</p>
      {isPublic && share?.slug && !share.hidden && <ShareLink url={shareUrl(share.slug, origin)} />}
      {!isPublic && share?.slug && <p className={s.note}>The link is turned off. Turning sharing back on brings back the same link.</p>}
      {saving && (
        <p className={s.note} role="status">
          Saving…
        </p>
      )}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
