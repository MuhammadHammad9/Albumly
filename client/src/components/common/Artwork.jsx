import { useState } from 'react'
import { initials } from '../../utils/format.js'
import s from './common.module.css'

// A square (or round, for artists) image that always reserves its space, so the page never
// jumps while images load. Falls back to initials when there is no image or it fails to load.
// The image is shown whole and unmodified, as catalogue artwork must be.
export default function Artwork({ src, alt, name, round = false, eager = false }) {
  const [failed, setFailed] = useState(false)
  const className = `${s.artwork} ${round ? s.round : ''}`

  if (!src || failed) {
    return (
      <div className={`${className} ${s.artworkFallback}`} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
        <span aria-hidden="true">{initials(name)}</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
    </div>
  )
}
