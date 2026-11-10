import { useEffect, useState } from 'react'
import { initials } from '../../utils/format.js'
import s from './common.module.css'

// After a failed load the image is tried again after these waits (a dropped connection often
// recovers), and only then are initials shown
const RETRY_DELAYS_MS = [1500, 5000]

// Marks an image as arrived, which fades it in (see .artwork img in common.module.css)
const markLoaded = (image) => {
  if (image) image.dataset.loaded = 'true'
}

// A square (or round, for artists) image that always reserves its space, so the page never
// jumps while images load. Falls back to initials when there is no image or it keeps failing.
// The image is shown whole and unmodified, as catalogue artwork must be.
// `style` goes on the frame (used to name it for the cover-to-header page transition).
export default function Artwork({ src, alt, name, round = false, eager = false, style }) {
  // Failures are counted per address, so a new src always starts fresh
  const [state, setState] = useState({ src, count: 0, waiting: false })
  const { count, waiting } = state.src === src ? state : { count: 0, waiting: false }
  const className = `${s.artwork} ${round ? s.round : ''}`

  // Between a failure and the next try
  useEffect(() => {
    if (!waiting || count > RETRY_DELAYS_MS.length) return undefined
    const timer = setTimeout(() => setState({ src, count, waiting: false }), RETRY_DELAYS_MS[count - 1])
    return () => clearTimeout(timer)
  }, [src, count, waiting])

  if (!src || count > RETRY_DELAYS_MS.length) {
    return (
      <div className={`${className} ${s.artworkFallback}`} style={style} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
        <span aria-hidden="true">{initials(name)}</span>
      </div>
    )
  }

  return (
    <div className={className} style={style}>
      {/* eager images are the big header picture, usually the largest thing on screen: fetch it first.
          The key makes the browser request the image again on each retry. */}
      {!waiting && (
        <img
          key={`${src}#${count}`}
          // An image already in the browser's cache is complete before its load event can be heard
          ref={(image) => {
            if (image?.complete && image.naturalWidth > 0) markLoaded(image)
          }}
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          onLoad={(event) => markLoaded(event.currentTarget)}
          onError={() => setState({ src, count: count + 1, waiting: true })}
        />
      )}
    </div>
  )
}
