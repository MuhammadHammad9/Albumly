import { useEffect } from 'react'

// Asks search engines not to list this page (shared links are for the people they are sent to).
// The tag is removed again when the page closes.
export function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
}
