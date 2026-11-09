import { Check, ExternalLink, Link2, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import common from '../common/common.module.css'
import AddToCompare from '../compare/AddToCompare.jsx'
import s from '../../pages/pages.module.css'

// Open on Spotify, copy the Spotify link, add to a comparison, and (where the browser supports it) the native share sheet
export default function AlbumActions({ album, artistNames }) {
  const [copyStatus, setCopyStatus] = useState('idle') // 'idle' | 'copied' | 'failed'

  // Show "Copied" briefly, then return to normal
  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = setTimeout(() => setCopyStatus('idle'), 2000)
    return () => clearTimeout(timer)
  }, [copyStatus])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(album.spotifyUrl)
      setCopyStatus('copied')
    } catch {
      // Clipboard access can be denied by the browser or the user
      setCopyStatus('failed')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `${album.name} by ${artistNames}`, url: window.location.href })
    } catch {
      // The user closed the share sheet: nothing to do
    }
  }

  return (
    <div className={s.actions}>
      <a href={album.spotifyUrl} target="_blank" rel="noreferrer" className={common.buttonAccent}>
        Open on Spotify
        <ExternalLink size={16} aria-hidden="true" />
      </a>

      <button type="button" className={common.buttonGhost} onClick={copyLink}>
        {copyStatus === 'copied' ? <Check size={16} aria-hidden="true" /> : <Link2 size={16} aria-hidden="true" />}
        {/* aria-live makes screen readers announce the change from "Copy link" to "Copied" */}
        <span aria-live="polite">
          {copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy Spotify link'}
        </span>
      </button>

      <AddToCompare album={album} />

      {/* navigator.share exists mostly on phones; hide the button where it would do nothing */}
      {typeof navigator.share === 'function' && (
        <button type="button" className={common.buttonGhost} onClick={share}>
          <Share2 size={16} aria-hidden="true" />
          Share
        </button>
      )}
    </div>
  )
}
