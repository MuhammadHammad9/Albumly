import { Copy } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import c from '../common/common.module.css'
import s from './community.module.css'

// The share link in a read-only field with a Copy button. If the clipboard is not available
// (older browsers, insecure pages), the text is selected so the user can copy it by hand.
export default function ShareLink({ url }) {
  const [status, setStatus] = useState('')
  const input = useRef(null)
  const id = useId()

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('Link copied')
    } catch {
      input.current?.select()
      setStatus('Press Ctrl+C (or ⌘C) to copy the selected link')
    }
  }

  return (
    <div className={s.row}>
      <label htmlFor={id} className="sr-only">
        Share link
      </label>
      <input id={id} ref={input} className={s.input} value={url} readOnly onFocus={(event) => event.target.select()} />
      <button type="button" className={c.buttonGhost} onClick={copy}>
        <Copy size={16} aria-hidden="true" />
        Copy link
      </button>
      <span className={s.note} role="status">
        {status}
      </span>
    </div>
  )
}
