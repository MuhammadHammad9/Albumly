import { useEffect } from 'react'
import { artworkColor } from '../utils/ambient.js'

// The glow is decoration, so it never competes with the page's own picture and text. Reading the
// colour means fetching the artwork and restyling the page once: while the app is still starting
// up that waits a couple of seconds; after that (moving between pages) it is almost immediate.
const STARTUP_MS = 3000
const DELAY_AT_STARTUP_MS = 2000
const DELAY_MS = 150

// While the calling page is open, the whole app glows in the colour of this artwork
// (the --ambient custom property; see global.css). Leaving the page fades back to green.
export function useAmbient(src) {
  useEffect(() => {
    if (!src) return undefined
    const root = document.documentElement
    let active = true
    const timer = setTimeout(
      () => {
        artworkColor(src).then((color) => {
          if (active && color) root.style.setProperty('--ambient', color)
        })
      },
      performance.now() < STARTUP_MS ? DELAY_AT_STARTUP_MS : DELAY_MS,
    )
    return () => {
      active = false
      clearTimeout(timer)
      root.style.removeProperty('--ambient')
    }
  }, [src])
}
