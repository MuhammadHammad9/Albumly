import { useEffect } from 'react'

// A soft light that follows the pointer across any element marked data-spot (cards, panels).
// One listener for the whole app; the element's CSS draws the light from --mx / --my.
export function useSpotlight() {
  useEffect(() => {
    // Touch screens have no hovering pointer to follow
    if (!window.matchMedia?.('(hover: hover)').matches) return undefined
    function onMove(event) {
      const target = event.target instanceof Element ? event.target.closest('[data-spot]') : null
      if (!target) return
      const box = target.getBoundingClientRect()
      target.style.setProperty('--mx', `${event.clientX - box.left}px`)
      target.style.setProperty('--my', `${event.clientY - box.top}px`)
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => document.removeEventListener('pointermove', onMove)
  }, [])
}
