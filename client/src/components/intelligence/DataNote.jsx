import { Info } from 'lucide-react'
import s from './intelligence.module.css'

// Says honestly where the numbers come from, and why genre matching is limited
export default function DataNote({ mode, children }) {
  if (mode === 'unsupported') {
    return (
      <p className={s.note} role="note">
        <Info size={18} aria-hidden="true" />
        <span>This server has not been updated for recommendations yet, so Albumly can only use what is in your library.</span>
      </p>
    )
  }
  return (
    <p className={s.note} role="note">
      <Info size={18} aria-hidden="true" />
      <span>
        {children ??
          'Albumly works this out itself from your library. Spotify does not share genres with new apps, so genre matching uses your own tags (and the demo catalogue’s genres). Tag your albums to improve it.'}
      </span>
    </p>
  )
}
