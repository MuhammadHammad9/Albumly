import { useState } from 'react'
import common from '../common/common.module.css'
import { MIN_PASSWORD_LENGTH } from '../../services/auth/config.js'
import s from './account.module.css'

// Shown after the user opens a password-reset email link
export default function NewPassword({ onSave }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  async function save(event) {
    event.preventDefault()
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    setBusy(true)
    const result = await onSave(password)
    setBusy(false)
    if (result.ok) setDone(true)
    else setError(result.message)
  }

  if (done) return <p className={s.success} role="status">Your new password is saved.</p>

  return (
    <section className={s.panel} aria-labelledby="new-password-title">
      <h2 id="new-password-title" className={s.panelTitle}>
        Choose a new password
      </h2>
      <form className={s.form} onSubmit={save} noValidate>
        <label className={s.field}>
          New password
          <input className={s.input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className={common.buttonAccent} disabled={busy}>
            Save password
          </button>
        </div>
      </form>
    </section>
  )
}
