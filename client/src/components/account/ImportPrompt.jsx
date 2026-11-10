import { useState } from 'react'
import common from '../common/common.module.css'
import { session as appSession } from '../../services/session.js'
import { useSession } from '../../stores/sessionStore.js'
import { accountErrorMessage } from '../../utils/accountErrors.js'
import { pluralize } from '../../utils/format.js'
import s from './account.module.css'

// After signing in: "You have 12 albums saved on this device. Add them to your account?"
export default function ImportPrompt({ session = appSession }) {
  const offer = useSession((state) => state.importOffer)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok, text }

  if (result) {
    return (
      <div className={s.banner} role={result.ok ? 'status' : 'alert'}>
        <p className={s.bannerText}>{result.text}</p>
        <button type="button" className={common.buttonGhost} onClick={() => setResult(null)}>
          {result.ok ? 'OK' : 'Close'}
        </button>
      </div>
    )
  }
  if (!offer) return null

  async function addToAccount() {
    setBusy(true)
    try {
      const summary = await session.importLocal()
      // transfer.js is only needed here, so it is downloaded on demand
      const { describeSummary } = await import('../../services/library/transfer.js')
      setResult({ ok: true, text: `Moved into your account. ${describeSummary(summary)}` })
    } catch (error) {
      setResult({ ok: false, text: `Could not move your library: ${accountErrorMessage(error)}` })
    } finally {
      setBusy(false)
    }
  }

  const parts = [offer.albums && pluralize(offer.albums, 'album'), offer.collections && pluralize(offer.collections, 'collection')].filter(Boolean)
  return (
    <div className={s.banner} role="region" aria-label="Library on this device">
      <p className={s.bannerText}>
        You have {parts.join(' and ')} saved in this browser from before you signed in. Add them to your account?
      </p>
      <button type="button" className={common.buttonAccent} onClick={addToAccount} disabled={busy}>
        {busy ? 'Adding…' : 'Add to account'}
      </button>
      <button type="button" className={common.buttonGhost} onClick={() => session.dismissImport()} disabled={busy}>
        Not now
      </button>
    </div>
  )
}
