import { useEffect, useState } from 'react'

// Returns `value`, but only after it has stopped changing for `delay` ms.
// Typing "weeknd" quickly therefore triggers one search instead of six.
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    // Runs before the next effect: a new keystroke cancels the previous timer
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
