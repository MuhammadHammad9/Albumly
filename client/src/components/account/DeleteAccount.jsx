import { useState } from 'react'
import { accountErrorMessage } from '../../utils/accountErrors.js'
import s from './account.module.css'

// The danger zone: deleting the account needs the user to type their email first, so it cannot
// happen by a stray click. onDelete resolves when done and throws an ApiError on failure.
export default function DeleteAccount({ email, onDelete }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmed = Boolean(email) && typed.trim().toLowerCase() === email.toLowerCase()

  async function remove(event) {
    event.preventDefault()
    if (!confirmed) return
    setBusy(true)
    setError('')
    try {
      await onDelete()
    } catch (failure) {
      setError(accountErrorMessage(failure))
      setBusy(false)
    }
  }

  return (
    <section className={`${s.panel} ${s.danger}`} aria-labelledby="delete-account-title">
      <h2 id="delete-account-title" className={s.panelTitle}>
        Delete account
      </h2>
      <form className={s.form} onSubmit={remove}>
        <p className={s.hint}>
          This permanently deletes your account and everything saved in it: albums, ratings, reviews, notes, tags and collections. It cannot be undone.
          The library saved in this browser before you signed in is not affected.
        </p>
        <label className={s.field}>
          Type your email ({email}) to confirm
          <input className={s.input} type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className={s.dangerButton} disabled={!confirmed || busy}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </form>
    </section>
  )
}
