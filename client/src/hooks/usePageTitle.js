import { useEffect } from 'react'

// Keeps the browser tab title in step with the current page
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Albumly` : 'Albumly'
  }, [title])
}
