import { Flag } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import c from '../common/common.module.css'
import s from './community.module.css'

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'offensive', label: 'Offensive or hateful' },
  { value: 'personal_info', label: "Shares someone's personal information" },
  { value: 'copyright', label: 'Copyright problem' },
  { value: 'other', label: 'Something else' },
]

// A small "Report" link that opens a form in place (no pop-up), so it works with keyboard and
// screen readers without any extra focus handling.
// onSubmit({ reason, details }) returns a promise; a rejection shows its message.
export default function ReportButton({ label, onSubmit, signedIn }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [state, setState] = useState({ status: 'idle', error: '' })
  const id = useId()

  if (state.status === 'sent') {
    return (
      <p className={s.note} role="status">
        Thanks. A moderator will take a look.
      </p>
    )
  }

  async function submit(event) {
    event.preventDefault()
    if (!reason) return setState({ status: 'idle', error: 'Choose a reason.' })
    setState({ status: 'sending', error: '' })
    try {
      await onSubmit({ reason, details: details.trim() })
      setState({ status: 'sent', error: '' })
    } catch (error) {
      setState({ status: 'idle', error: error?.message || "Couldn't send the report. Try again." })
    }
  }

  return (
    <div className={s.report}>
      <button type="button" className={s.textButton} aria-expanded={open} aria-controls={`${id}-form`} onClick={() => setOpen(!open)}>
        <Flag size={14} aria-hidden="true" />
        {label}
      </button>
      {open && !signedIn && (
        <p id={`${id}-form`} className={s.note}>
          <Link to="/account" className={s.link}>
            Sign in
          </Link>{' '}
          to report this.
        </p>
      )}
      {open && signedIn && (
        <form id={`${id}-form`} className={s.reportForm} onSubmit={submit}>
          <fieldset className={s.reasons}>
            <legend>Why are you reporting this?</legend>
            {REPORT_REASONS.map((option) => (
              <label key={option.value} className={s.check}>
                <input type="radio" name={`${id}-reason`} value={option.value} checked={reason === option.value} onChange={() => setReason(option.value)} />
                {option.label}
              </label>
            ))}
          </fieldset>
          <label className={s.label}>
            More details (optional)
            <textarea className={s.textarea} value={details} maxLength={500} onChange={(event) => setDetails(event.target.value)} />
          </label>
          {state.error && (
            <p className={s.error} role="alert">
              {state.error}
            </p>
          )}
          <div className={s.row}>
            <button type="submit" className={c.button} disabled={state.status === 'sending'}>
              {state.status === 'sending' ? 'Sending…' : 'Send report'}
            </button>
            <button type="button" className={c.buttonGhost} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
