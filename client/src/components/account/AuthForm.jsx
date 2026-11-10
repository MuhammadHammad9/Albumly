import { useId, useState } from 'react'
import { Link } from 'react-router'
import common from '../common/common.module.css'
import Tabs from '../common/Tabs.jsx'
import { MIN_PASSWORD_LENGTH } from '../../services/auth/config.js'
import s from './account.module.css'

const MODES = [
  { key: 'signIn', label: 'Sign in' },
  { key: 'signUp', label: 'Create account' },
]

const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

// Checks what we can before asking Supabase; returns an error message or ''
function validate(mode, email, password) {
  if (!looksLikeEmail(email)) return 'Enter a valid email address.'
  if (mode === 'reset') return ''
  if (!password) return 'Enter your password.'
  if (mode === 'signUp' && password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`
  return ''
}

// Sign in, create an account, or ask for a password-reset email.
// `session` provides signIn / signUp / resetPassword (each resolves to { ok, message? }).
export default function AuthForm({ session }) {
  const [mode, setMode] = useState('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function submit(event) {
    event.preventDefault()
    const problem = validate(mode, email.trim(), password)
    if (problem) return setError(problem)
    setError('')
    setBusy(true)
    try {
      const address = email.trim()
      if (mode === 'signIn') {
        const result = await session.signIn(address, password)
        if (!result.ok) setError(result.message)
      } else if (mode === 'signUp') {
        const result = await session.signUp(address, password)
        if (!result.ok) setError(result.message)
        else if (result.needsConfirmation) setNotice(`Check your email: we sent a link to ${address} to confirm your account.`)
      } else {
        const result = await session.resetPassword(address)
        if (!result.ok) setError(result.message)
        else setNotice(`If an account exists for ${address}, an email with a reset link is on its way.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const submitLabel = { signIn: 'Sign in', signUp: 'Create account', reset: 'Send reset link' }[mode]

  return (
    <section className={s.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.panelTitle}>
        {mode === 'reset' ? 'Reset your password' : 'Your Albumly account'}
      </h2>
      {mode !== 'reset' && <Tabs tabs={MODES} activeKey={mode} onChange={switchMode} label="Sign in or create an account" />}

      <form className={s.form} onSubmit={submit} noValidate>
        <label className={s.field}>
          Email
          <input className={s.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {mode !== 'reset' && (
          <div className={s.field}>
            <label htmlFor={`${id}-password`}>Password</label>
            <span className={s.passwordRow}>
              <input
                id={`${id}-password`}
                className={s.input}
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                aria-describedby={mode === 'signUp' ? `${id}-hint` : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="button" className={common.buttonGhost} onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label="Show password">
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
            {mode === 'signUp' && (
              <span id={`${id}-hint`} className={s.hint}>
                At least {MIN_PASSWORD_LENGTH} characters.
              </span>
            )}
          </div>
        )}

        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={s.success} role="status">
            {notice}
          </p>
        )}

        <div className={s.row}>
          <button type="submit" className={common.buttonAccent} disabled={busy}>
            {busy ? 'Please wait…' : submitLabel}
          </button>
          {mode === 'signIn' && (
            <button type="button" className={s.textLink} onClick={() => switchMode('reset')}>
              Forgot password?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className={s.textLink} onClick={() => switchMode('signIn')}>
              Back to sign in
            </button>
          )}
        </div>
        {mode === 'signUp' && (
          <p className={s.hint}>
            By creating an account you agree to how we handle your data, described in the <Link to="/privacy">privacy policy</Link>.
          </p>
        )}
      </form>
    </section>
  )
}
